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
const TARGET_ACCOUNT: &str = "acct.za_william_checking";

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    let mongo_uri = std::env::var("MONGODB_URI").expect("MONGODB_URI must be set");
    let client = Client::with_uri_str(&mongo_uri).await?;
    let db = client.database("wyat");
    let collection = db.collection::<Transaction>("capital_ledger");

    let mut file = File::open("data/ZA-Bank_manually-formatted-csv.csv")?;
    let mut data = String::new();
    file.read_to_string(&mut data)?;

    let mut rdr = ReaderBuilder::new()
        .has_headers(true)
        .from_reader(data.as_bytes());

    let mut count = 0;
    for result in rdr.records() {
        let record = result?;

        // ZA Bank CSV format: Transaction Date, Post Date, Description, Amount, Memo
        let txn_date_str = record.get(0).unwrap_or("").trim();
        let post_date_str = record.get(1).unwrap_or("").trim();
        let description = record.get(2).unwrap_or("").trim().to_string();
        let amt_str = record.get(3).unwrap_or("0").replace(",", "");
        let memo = record.get(4).unwrap_or("").trim();

        let amount = Decimal::from_str(&amt_str).unwrap_or(Decimal::ZERO);

        // Skip empty rows or zero amounts
        if txn_date_str.is_empty() || amount.is_zero() {
            continue;
        }

        // Parse date format: MM/DD/YYYY
        let txn_date = NaiveDate::parse_from_str(txn_date_str, "%m/%d/%Y")?;
        let post_date = NaiveDate::parse_from_str(post_date_str, "%m/%d/%Y")?;

        let ts = txn_date.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp();
        let posted_ts = post_date
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp();

        // Determine direction based on sign
        // Positive = money coming in (Debit to account, Credit from PNL)
        // Negative = money going out (Credit to account, Debit from PNL)
        let is_income = amount.is_sign_positive();
        let abs_amount = amount.abs();

        let account_direction = if is_income {
            LegDirection::Debit
        } else {
            LegDirection::Credit
        };

        let account_leg = Leg {
            account_id: TARGET_ACCOUNT.into(),
            direction: account_direction,
            amount: LegAmount::Fiat(Money::new(abs_amount, Currency::HKD)),
            fx: None,
            category_id: None,
            fee_of_leg_idx: None,
            notes: None,
        };

        // PNL leg has opposite direction
        let pnl_leg = Leg {
            account_id: PNL_ACCOUNT_ID.into(),
            direction: match account_direction {
                LegDirection::Debit => LegDirection::Credit,
                LegDirection::Credit => LegDirection::Debit,
            },
            amount: LegAmount::Fiat(Money::new(abs_amount, Currency::HKD)),
            fx: None,
            category_id: Some(ENV_UNCATEGORIZED.to_string()),
            fee_of_leg_idx: None,
            notes: Some("seed:za-bank-csv".into()),
        };

        // Build memo from description + optional memo field
        let full_memo = if memo.is_empty() {
            None
        } else {
            Some(memo.to_string())
        };

        let txn = Transaction {
            id: Uuid::new_v4().to_string(),
            ts,
            posted_ts: Some(posted_ts),
            source: "za_bank_csv".into(),
            payee: Some(description),
            memo: full_memo,
            status: Some("posted".into()),
            reconciled: false,
            external_refs: vec![("statement".into(), "ZA_Bank_Sep_2025".into())],
            legs: vec![account_leg, pnl_leg],
        };

        collection.insert_one(txn, None).await?;
        count += 1;
    }

    println!(
        "✅ ZA Bank CSV seed completed. Inserted {} transactions.",
        count
    );
    Ok(())
}
