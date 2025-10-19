use anyhow::Result;
use chrono::NaiveDate;
use csv::ReaderBuilder;
use dotenvy::dotenv;
use mongodb::Client;
use rust_decimal::Decimal;
use std::fs::File;
use std::io::Read;
use std::str::FromStr;
use uuid::Uuid;
use wyat_ai_backend::capital::{Currency, Leg, LegAmount, LegDirection, Money, Transaction};

const PNL_ACCOUNT_ID: &str = "__pnl__"; // virtual ledger account for expense/income balancing
const ENV_UNCATEGORIZED: &str = "env_uncategorized";
const ENV_CARD_PAYMENT: &str = "env_card_payment";

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    let mongo_uri = std::env::var("MONGODB_URI").expect("MONGODB_URI must be set");
    let client = Client::with_uri_str(&mongo_uri).await?;
    let db = client.database("wyat");
    let collection = db.collection::<Transaction>("capital_ledger");

    let mut file = File::open("data/Chase6886_Activity20250908_20251007_20251009.CSV")?;
    let mut data = String::new();
    file.read_to_string(&mut data)?;

    let mut rdr = ReaderBuilder::new()
        .has_headers(true)
        .from_reader(data.as_bytes());

    let mut count = 0;
    for result in rdr.records() {
        let record = result?;
        // Chase CSV format: Transaction Date, Post Date, Description, Category, Type, Amount, Memo
        let date_str = record.get(0).unwrap_or("").trim();
        let desc = record.get(2).unwrap_or("").trim().to_string();
        let amt_str = record.get(5).unwrap_or("0").replace(",", "");
        let amount = Decimal::from_str(&amt_str).unwrap_or(Decimal::ZERO);

        // Skip empty rows
        if date_str.is_empty() || amount == Decimal::ZERO {
            continue;
        }

        // Parse Chase date format: MM/DD/YYYY
        let date = NaiveDate::parse_from_str(date_str, "%m/%d/%Y")?;
        let ts = date.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp();

        let direction = if amount.is_sign_negative() {
            LegDirection::Credit
        } else {
            LegDirection::Debit
        };

        let is_charge = amount.is_sign_negative();
        let abs = amount.abs();

        let account_leg = Leg {
            account_id: "acct.chase_william_credit".into(),
            direction,
            amount: LegAmount::Fiat(Money::new(abs, Currency::USD)),
            fx: None,
            category_id: None,
            fee_of_leg_idx: None,
            notes: None,
        };

        let pnl_leg = Leg {
            account_id: PNL_ACCOUNT_ID.into(),
            direction: match direction {
                LegDirection::Debit => LegDirection::Credit,
                LegDirection::Credit => LegDirection::Debit,
            },
            amount: LegAmount::Fiat(Money::new(abs, Currency::USD)),
            fx: None,
            category_id: Some(
                (if is_charge {
                    ENV_UNCATEGORIZED
                } else {
                    ENV_CARD_PAYMENT
                })
                .to_string(),
            ),
            fee_of_leg_idx: None,
            notes: Some("seed:auto-balance".into()),
        };

        let txn = Transaction {
            id: Uuid::new_v4().to_string(),
            ts,
            posted_ts: Some(ts),
            source: "chase_csv".into(),
            payee: Some(desc),
            memo: None,
            status: Some("posted".into()),
            reconciled: false,
            tx_type: None,
            external_refs: vec![("statement".into(), "Chase6886_20250908_20251007".into())],
            legs: vec![account_leg, pnl_leg],
        };

        collection.insert_one(txn, None).await?;
        count += 1;
    }

    println!(
        "✅ Chase CSV seed completed. Inserted {} transactions.",
        count
    );
    Ok(())
}
