use anyhow::Result;
use dotenvy::dotenv;
use mongodb::{Client, bson::to_document};
use wyat_ai_backend::capital::{
    // adjust crate path if your lib name differs
    Account,
    AccountMetadata,
    AccountNetwork,
    Currency,
};

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    let uri = std::env::var("MONGODB_URI").expect("MONGODB_URI must be set");
    let client = Client::with_uri_str(&uri).await?;
    let db = client.database("wyat");
    let col = db.collection("capital_accounts");

    // -------- BANKING --------
    let docs = vec![
        Account {
            id: "acct.hsbc_joint_checking".into(),
            name: "HSBC Joint Checking".into(),
            currency: Currency::HKD,
            metadata: AccountMetadata::Checking {
                bank_name: "HSBC".into(),
                owner_name: "Wong Yiu Sang William & Wong Tsz Yan".into(),
                account_number: "TBC".into(),
                routing_number: Some("004".into()),
                color: None,
            },
        },
        Account {
            id: "acct.hsbc_joint_savings".into(),
            name: "HSBC Joint Savings".into(),
            currency: Currency::HKD,
            metadata: AccountMetadata::Savings {
                bank_name: "HSBC".into(),
                owner_name: "Wong Yiu Sang William & Wong Tsz Yan".into(),
                account_number: "TBC".into(),
                routing_number: Some("004".into()),
                color: None,
            },
        },
        Account {
            id: "acct.mox_aurora_checking".into(),
            name: "Mox A Checking".into(),
            currency: Currency::HKD,
            metadata: AccountMetadata::Checking {
                bank_name: "Mox Bank".into(),
                owner_name: "Wong Tsz Yan".into(),
                account_number: "TBC".into(),
                routing_number: Some("389".into()),
                color: None,
            },
        },
        Account {
            id: "acct.chase_william_checking".into(),
            name: "Chase W Checking".into(),
            currency: Currency::USD,
            metadata: AccountMetadata::Checking {
                bank_name: "Chase Bank".into(),
                owner_name: "William Wong".into(),
                account_number: "576725306".into(),
                routing_number: Some("021000021".into()),
                color: None,
            },
        },
        Account {
            id: "acct.chase_william_savings".into(),
            name: "Chase W Savings".into(),
            currency: Currency::USD,
            metadata: AccountMetadata::Savings {
                bank_name: "Chase Bank".into(),
                owner_name: "William Wong".into(),
                account_number: "5023553326".into(),
                routing_number: Some("021000021".into()),
                color: None,
            },
        },
        Account {
            id: "acct.za_william_checking".into(),
            name: "ZA W Checking".into(),
            currency: Currency::HKD,
            metadata: AccountMetadata::Checking {
                bank_name: "ZA Bank".into(),
                owner_name: "Yiu Sang William Wong".into(),
                account_number: "8820 0096 6156".into(),
                routing_number: Some("387".into()),
                color: None,
            },
        },
        Account {
            id: "acct.td_william_checking".into(),
            name: "TD W Checking".into(),
            currency: Currency::USD,
            metadata: AccountMetadata::Checking {
                bank_name: "TD Bank".into(),
                owner_name: "Yiu Sang Wong".into(),
                account_number: "4454844987".into(),
                routing_number: Some("026013673".into()),
                color: None,
            },
        },
        Account {
            id: "acct.sofi_william_checking".into(),
            name: "SoFi W Checking".into(),
            currency: Currency::USD,
            metadata: AccountMetadata::Checking {
                bank_name: "SoFi Bank".into(),
                owner_name: "Yiu Sang William Wong".into(),
                account_number: "411051504154".into(),
                routing_number: Some("031101334".into()),
                color: None,
            },
        },
        Account {
            id: "acct.sofi_william_savings".into(),
            name: "SoFi W Savings".into(),
            currency: Currency::USD,
            metadata: AccountMetadata::Savings {
                bank_name: "SoFi Bank".into(),
                owner_name: "Yiu Sang William Wong".into(),
                account_number: "310064557809".into(),
                routing_number: Some("031101334".into()),
                color: None,
            },
        },
        Account {
            id: "acct.chase_freedom_unlimited".into(),
            name: "Chase Freedom Unlimited".into(),
            currency: Currency::USD,
            metadata: AccountMetadata::Credit {
                credit_card_name: "Chase Freedom Unlimited".into(),
                owner_name: "William Wong".into(),
                account_number: "TBC".into(),
                routing_number: None,
                color: None,
            },
        },
        // -------- CRYPTO (choose BTC as reporting currency) --------
        Account {
            id: "acct.binance_aurora".into(),
            name: "Binance A".into(),
            currency: Currency::BTC, // reporting denom
            metadata: AccountMetadata::Cex {
                cex_name: "Binance".into(),
                account_id: "aurora".into(),
                color: None,
            },
        },
        Account {
            id: "acct.binance_william".into(),
            name: "Binance W".into(),
            currency: Currency::BTC,
            metadata: AccountMetadata::Cex {
                cex_name: "Binance".into(),
                account_id: "william".into(),
                color: None,
            },
        },
        Account {
            id: "acct.wallet_payroll_eth".into(),
            name: "Payroll Ethereum".into(),
            currency: Currency::BTC,
            metadata: AccountMetadata::CryptoWallet {
                address: "0xf1934f8Ef105BA91a34Fb805097AF6170897d34E".into(),
                network: AccountNetwork::EVM {
                    chain_name: "Ethereum".into(),
                    chain_id: 1,
                },
                is_ledger: false,
                color: None,
            },
        },
        Account {
            id: "acct.wallet_bali_arbitrum".into(),
            name: "Bali Arbitrum".into(),
            currency: Currency::BTC,
            metadata: AccountMetadata::CryptoWallet {
                address: "0x6CecD8cF60C5BEE22Cb12Cf5E59F29845533d1b".into(),
                network: AccountNetwork::EVM {
                    chain_name: "Arbitrum".into(),
                    chain_id: 42161,
                },
                is_ledger: false,
                color: None,
            },
        },
        Account {
            id: "acct.wallet_rosewood_solana".into(),
            name: "Rosewood Solana".into(),
            currency: Currency::BTC,
            metadata: AccountMetadata::CryptoWallet {
                address: "74mx9c7ryGxkUvZyA5VpKhB9qpxXYapzB4yAEynRMooQ".into(),
                network: AccountNetwork::Solana,
                is_ledger: false,
                color: None,
            },
        },
    ];

    let mut inserted = 0usize;
    for a in docs {
        let doc = to_document(&a)?;
        match col.insert_one(doc, None).await {
            Ok(_) => {
                inserted += 1;
                println!("✅ inserted {}", a.name);
            }
            Err(e) if e.to_string().contains("E11000") => {
                println!("⚠️  {} already exists, skipped", a.id);
            }
            Err(e) => return Err(e.into()),
        }
    }
    println!("✅ Seed complete. Inserted {inserted} accounts.");
    Ok(())
}
