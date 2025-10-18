use anyhow::{Context, Result};
use clap::Parser;
use futures::stream::TryStreamExt;
use mongodb::{
    Client,
    bson::{Bson, doc},
    options::ClientOptions,
};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::{env, str::FromStr};

/// Default HKD peg (USD per 1 HKD) = 1/7.8 ≈ 0.128205128205...
const DEFAULT_HKD_TO_USD: &str = "0.1282051282051282";

#[derive(Parser, Debug)]
#[command(name = "patch_hkd_pnl_to_usd")]
#[command(about = "Convert HKD P&L legs (from za_bank_csv) to USD amounts in capital_ledger.")]
struct Args {
    /// MongoDB URI. Falls back to env MONGODB_URI
    #[arg(long)]
    uri: Option<String>,
    /// Database name
    #[arg(long, default_value = "wyat")]
    db: String,
    /// Collection name
    #[arg(long, default_value = "capital_ledger")]
    coll: String,
    /// Source filter (default: za_bank_csv)
    #[arg(long, default_value = "za_bank_csv")]
    source: String,
    /// Peg rate (USD per HKD) as Decimal string. Default: 1/7.8
    #[arg(long, default_value = DEFAULT_HKD_TO_USD)]
    peg: String,
    /// Max docs to patch (0 = no limit)
    #[arg(long, default_value_t = 0)]
    limit: u64,
    /// Only log what would change
    #[arg(long, default_value_t = false)]
    dry_run: bool,
    /// Also attach fx snapshot to the custody leg (HKD -> USD) for audit
    #[arg(long, default_value_t = true)]
    add_fx_on_custody: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct MoneyDoc {
    amount: String,
    ccy: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data")]
enum LegAmountDoc {
    Fiat(MoneyDoc),
    // Crypto { asset: String, qty: String } // not needed for this patch
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct FxSnapshotDoc {
    to: String,   // "USD"
    rate: String, // decimal string
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct LegDoc {
    account_id: String,
    direction: String,
    amount: LegAmountDoc,
    #[serde(default)]
    fx: Option<FxSnapshotDoc>,
    #[serde(default)]
    category_id: Option<String>,
    #[serde(default)]
    notes: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct TxDoc {
    #[serde(default)]
    id: Option<String>,
    #[serde(rename = "_id")]
    mongo_id: mongodb::bson::oid::ObjectId,
    source: String,
    legs: Vec<LegDoc>,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok(); // Load .env file
    let args = Args::parse();

    // Parse and validate peg rate
    let peg =
        Decimal::from_str(&args.peg).with_context(|| format!("Invalid peg rate: {}", args.peg))?;

    if peg <= Decimal::ZERO {
        anyhow::bail!("Peg rate must be positive, got: {}", peg);
    }

    println!("🔧 HKD→USD P&L Migration");
    println!("   Source: {}", args.source);
    println!("   Peg: {} USD per HKD (1 HKD = {} USD)", peg, peg);
    println!("   Dry run: {}", args.dry_run);
    println!(
        "   Limit: {}",
        if args.limit > 0 {
            args.limit.to_string()
        } else {
            "unlimited".to_string()
        }
    );
    println!("   Add FX to custody: {}", args.add_fx_on_custody);
    println!();

    // Connect to MongoDB
    let uri = args
        .uri
        .or_else(|| env::var("MONGODB_URI").ok())
        .context("Provide --uri or set MONGODB_URI")?;

    let mut client_opts = ClientOptions::parse(&uri)
        .await
        .context("Failed to parse MongoDB URI")?;
    client_opts.app_name = Some("wyat_patch_hkd_pnl_to_usd".into());
    let client = Client::with_options(client_opts).context("Failed to create MongoDB client")?;

    let coll = client.database(&args.db).collection::<TxDoc>(&args.coll);

    println!("✅ Connected to MongoDB: {}/{}", args.db, args.coll);

    // Query: only source match, and ensure an HKD Fiat P&L leg exists
    // IDEMPOTENT: This filter won't match already-patched docs (USD P&L legs)
    let filter = doc! {
        "source": &args.source,
        "legs": {
            "$elemMatch": {
                "account_id": "__pnl__",
                "amount.kind": "Fiat",
                "amount.data.ccy": "HKD"
            }
        }
    };

    let find_opts = mongodb::options::FindOptions::builder()
        .limit(if args.limit > 0 {
            Some(args.limit as i64)
        } else {
            None
        })
        .build();

    let mut cursor = coll
        .find(filter.clone(), find_opts)
        .await
        .context("Failed to execute find query")?;

    println!("📋 Scanning for matching transactions...\n");

    let mut patched = 0usize;
    let mut skipped = 0usize;

    while let Some(tx) = cursor.try_next().await? {
        let tx_key = tx.id.clone().unwrap_or_else(|| tx.mongo_id.to_hex());

        // Find P&L leg (account_id == "__pnl__")
        let Some((pnl_idx, pnl_leg)) = tx
            .legs
            .iter()
            .enumerate()
            .find(|(_, l)| l.account_id == "__pnl__")
        else {
            eprintln!("[skip {tx_key}] no __pnl__ leg");
            skipped += 1;
            continue;
        };

        // Find custody leg (anything that's not the pnl index; usually 2 legs)
        let custody_idx = (0..tx.legs.len()).find(|i| *i != pnl_idx);
        if custody_idx.is_none() {
            eprintln!("[skip {tx_key}] no custody leg");
            skipped += 1;
            continue;
        }
        let custody_idx = custody_idx.unwrap();

        // Safety: Check if already patched (extra idempotency guard)
        if let Some(notes) = &pnl_leg.notes {
            if notes.contains("patched_hkd_to_usd") {
                eprintln!(
                    "⚠️  [skip {}] already patched (notes contain patched_hkd_to_usd)",
                    tx_key
                );
                skipped += 1;
                continue;
            }
        }

        // Must be Fiat/HKD (should always be true due to filter, but double-check)
        let hkd_str = match &pnl_leg.amount {
            LegAmountDoc::Fiat(m) if m.ccy == "HKD" => m.amount.clone(),
            LegAmountDoc::Fiat(m) => {
                eprintln!(
                    "⚠️  [skip {}] P&L leg is {} not HKD (unexpected)",
                    tx_key, m.ccy
                );
                skipped += 1;
                continue;
            }
        };

        // Parse HKD -> USD
        let hkd_clean = hkd_str.replace([',', ' '], "");
        let hkd = match Decimal::from_str(&hkd_clean) {
            Ok(d) if d.is_zero() => {
                eprintln!("⚠️  [skip {}] zero HKD amount: {}", tx_key, hkd_str);
                skipped += 1;
                continue;
            }
            Ok(d) => d,
            Err(e) => {
                eprintln!(
                    "❌ [skip {}] failed to parse HKD amount '{}': {}",
                    tx_key, hkd_str, e
                );
                skipped += 1;
                continue;
            }
        };

        // USD = HKD * peg; round to 2dp for consistency
        let usd = (hkd * peg).round_dp(2);

        // Build $set update doc
        let mut set_doc = mongodb::bson::Document::new();
        set_doc.insert(
            format!("legs.{pnl_idx}.amount.data.amount"),
            Bson::String(usd.to_string()),
        );
        set_doc.insert(
            format!("legs.{pnl_idx}.amount.data.ccy"),
            Bson::String("USD".into()),
        );

        // Append a provenance note
        let notes_path = format!("legs.{pnl_idx}.notes");
        let existing_notes = pnl_leg.notes.clone().unwrap_or_default();
        let patched_note = if existing_notes.is_empty() {
            format!("patched_hkd_to_usd@{}", peg)
        } else {
            format!("{existing_notes} | patched_hkd_to_usd@{peg}")
        };
        set_doc.insert(notes_path, Bson::String(patched_note));

        // Optionally add FX snapshot on custody leg for audit
        if args.add_fx_on_custody {
            let fx_path = format!("legs.{custody_idx}.fx");
            set_doc.insert(
                fx_path,
                Bson::Document(doc! {
                    "to": "USD",
                    "rate": peg.to_string(),
                }),
            );
        }

        if args.dry_run {
            println!(
                "🔍 [dry-run {}] {} HKD → {} USD (peg: {})",
                tx_key, hkd, usd, peg
            );
            println!(
                "   Would update: legs[{}].amount = {} USD, legs[{}].notes += provenance",
                pnl_idx, usd, pnl_idx
            );
            if args.add_fx_on_custody {
                println!(
                    "   Would add: legs[{}].fx = {{to: USD, rate: {}}}",
                    custody_idx, peg
                );
            }
            patched += 1;
        } else {
            match coll
                .update_one(doc! { "_id": &tx.mongo_id }, doc! {"$set": set_doc}, None)
                .await
            {
                Ok(res) => {
                    if res.modified_count == 1 {
                        patched += 1;
                        println!("✅ [ok   {}] {} HKD → {} USD", tx_key, hkd, usd);
                    } else {
                        skipped += 1;
                        eprintln!("⚠️  [skip {}] not modified (already up-to-date?)", tx_key);
                    }
                }
                Err(e) => {
                    eprintln!("❌ [error {}] update failed: {}", tx_key, e);
                    skipped += 1;
                }
            }
        }
    }

    println!("\n{}", "=".repeat(60));
    println!("📊 Migration Summary:");
    println!("   Patched: {}", patched);
    println!("   Skipped: {}", skipped);
    if args.dry_run {
        println!("\n⚠️  DRY RUN - No changes were made to the database");
        println!("   Run without --dry-run to apply changes");
    }
    println!("{}", "=".repeat(60));

    Ok(())
}
