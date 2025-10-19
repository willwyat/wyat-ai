use anyhow::Result;
use clap::Parser;
use dotenvy::dotenv;
use futures::stream::TryStreamExt;
use mongodb::{Client, Collection, bson};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

// Import types from capital.rs
use wyat_ai_backend::capital::{Currency, Leg, LegAmount, LegDirection, Money};

// Wrapper type to implement Hash for Currency
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct CurrencyWrapper(Currency);

impl std::hash::Hash for CurrencyWrapper {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        match self.0 {
            Currency::USD => 0u8.hash(state),
            Currency::HKD => 1u8.hash(state),
            Currency::BTC => 2u8.hash(state),
        }
    }
}

impl From<Currency> for CurrencyWrapper {
    fn from(c: Currency) -> Self {
        CurrencyWrapper(c)
    }
}

impl From<CurrencyWrapper> for Currency {
    fn from(cw: CurrencyWrapper) -> Self {
        cw.0
    }
}

#[derive(Parser)]
#[command(name = "backfill_tx_type")]
#[command(about = "Backfill transaction types in MongoDB")]
struct Args {
    /// Dry run mode - log changes without writing to database
    #[arg(long)]
    dry_run: bool,

    /// Limit number of transactions to process
    #[arg(long)]
    limit: Option<usize>,

    /// Filter by source
    #[arg(long)]
    filter_source: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TxType {
    Spending,
    Income,
    FeeOnly,
    Transfer,
    TransferFx,
    Trade,
    Adjustment,
}

impl std::fmt::Display for TxType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TxType::Spending => write!(f, "spending"),
            TxType::Income => write!(f, "income"),
            TxType::FeeOnly => write!(f, "fee_only"),
            TxType::Transfer => write!(f, "transfer"),
            TxType::TransferFx => write!(f, "transfer_fx"),
            TxType::Trade => write!(f, "trade"),
            TxType::Adjustment => write!(f, "adjustment"),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub ts: i64,
    pub posted_ts: Option<i64>,
    pub source: String,
    pub payee: Option<String>,
    pub memo: Option<String>,
    pub status: Option<String>,
    pub reconciled: bool,
    pub external_refs: Vec<(String, String)>,
    pub legs: Vec<Leg>,
    #[serde(default)]
    pub tx_type: Option<TxType>,
}

const PNL_ID: &str = "__pnl__";

fn classify(tx: &Transaction) -> TxType {
    // Check if there's a P&L leg
    if let Some(pnl_leg) = tx.legs.iter().find(|leg| leg.account_id == PNL_ID) {
        match pnl_leg.direction {
            LegDirection::Debit => {
                // Check if it's a small fee (absolute amount < 15 in fiat units)
                if tx.legs.len() == 2 {
                    match &pnl_leg.amount {
                        LegAmount::Fiat(Money { amount, .. }) => {
                            if amount.abs() < rust_decimal::Decimal::from(15) {
                                return TxType::FeeOnly;
                            }
                        }
                        _ => {} // Not fiat, so not a fee
                    }
                }
                TxType::Spending
            }
            LegDirection::Credit => TxType::Income,
        }
    } else {
        // No P&L leg - asset-only move
        if tx.legs.len() < 2 {
            return TxType::Adjustment;
        }

        // Check for FX transfers (different fiat currencies)
        let fiat_currencies: HashSet<CurrencyWrapper> = tx
            .legs
            .iter()
            .filter_map(|leg| match &leg.amount {
                LegAmount::Fiat(Money { ccy, .. }) => Some(CurrencyWrapper(*ccy)),
                _ => None,
            })
            .collect();

        if fiat_currencies.len() > 1 {
            return TxType::TransferFx;
        }

        // Check for crypto trades or crypto↔fiat swaps
        let has_crypto = tx
            .legs
            .iter()
            .any(|leg| matches!(leg.amount, LegAmount::Crypto { .. }));
        let has_fiat = tx
            .legs
            .iter()
            .any(|leg| matches!(leg.amount, LegAmount::Fiat(_)));

        if has_crypto && (has_fiat || tx.legs.len() > 2) {
            return TxType::Trade;
        }

        // Check for same-currency transfers
        if tx.legs.len() >= 2 {
            // All fiat legs share same currency, or crypto-only of same asset
            if fiat_currencies.len() == 1 || (!has_fiat && has_crypto) {
                return TxType::Transfer;
            }
        }

        TxType::Adjustment
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    let args = Args::parse();

    let uri = std::env::var("MONGODB_URI").expect("MONGODB_URI must be set");
    let client = Client::with_uri_str(&uri).await?;
    let db = client.database("wyat");
    let collection: Collection<Transaction> = db.collection("capital_ledger");

    println!("Starting transaction type backfill...");
    println!("Dry run: {}", args.dry_run);
    if let Some(limit) = args.limit {
        println!("Limit: {}", limit);
    }
    if let Some(source) = &args.filter_source {
        println!("Filter source: {}", source);
    }
    println!();

    // Build filter
    let mut filter = bson::doc! {};
    if let Some(source) = &args.filter_source {
        filter.insert("source", source);
    }

    let mut cursor = collection.find(filter, None).await?;
    let mut scanned = 0;
    let mut updated = 0;
    let mut unchanged = 0;
    let mut errors = 0;

    while let Some(result) = cursor.try_next().await? {
        scanned += 1;

        if let Some(limit) = args.limit {
            if scanned > limit {
                break;
            }
        }

        let tx = result;
        let old_type = tx.tx_type;
        let new_type = classify(&tx);

        if old_type != Some(new_type) {
            println!(
                "ID: {} | {} → {}",
                tx.id,
                old_type
                    .map(|t| t.to_string())
                    .unwrap_or_else(|| "None".to_string()),
                new_type
            );

            if !args.dry_run {
                match collection
                    .update_one(
                        bson::doc! { "id": &tx.id },
                        bson::doc! { "$set": { "tx_type": new_type.to_string() } },
                        None,
                    )
                    .await
                {
                    Ok(_) => updated += 1,
                    Err(e) => {
                        println!("Error updating {}: {}", tx.id, e);
                        errors += 1;
                    }
                }
            } else {
                updated += 1;
            }
        } else {
            unchanged += 1;
        }

        // Progress indicator
        if scanned % 1000 == 0 {
            println!("Processed {} transactions...", scanned);
        }
    }

    println!();
    println!("=== Summary ===");
    println!("Scanned: {}", scanned);
    println!("Updated: {}", updated);
    println!("Unchanged: {}", unchanged);
    println!("Errors: {}", errors);

    if args.dry_run {
        println!();
        println!("This was a dry run. No changes were written to the database.");
    }

    Ok(())
}
