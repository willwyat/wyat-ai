//! Wyat AI – Capital module
//!
//! Core model for the Family bucket:
//! - Money/Currency
//! - Envelope policies (ResetToZero, CarryOver, SinkingFund, Decay)
//! - **Deficit support**: optional controlled negative balances per envelope
//! - Envelope + month-open behavior
//! - Bucket with envelope map and helpers
//! - A `family_bucket_example()` encoding Will's current rules
//!
//! Add-on modules (ledger, accounts, FX, MCP tool adapters) can build on top.
//!
//! Crate deps (Cargo.toml):
//!   chrono = { version = "0.4", default-features = false, features = ["clock"] }
//!   rust_decimal = "1"
//!   serde = { version = "1", features = ["derive"] }
//!   thiserror = "1"

use axum::{Json, extract::State};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;

// ------------------------- Money -------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Currency {
    USD,
    HKD,
    BTC,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Money {
    pub amount: Decimal,
    pub ccy: Currency,
}

impl Money {
    pub fn zero(ccy: Currency) -> Self {
        Self {
            amount: Decimal::ZERO,
            ccy,
        }
    }
    pub fn new(amount: Decimal, ccy: Currency) -> Self {
        Self { amount, ccy }
    }
    pub fn same_ccy_as(&self, other: &Money) -> bool {
        self.ccy == other.ccy
    }
}

#[macro_export]
macro_rules! usd {
    ($x:expr) => {
        Money {
            amount: Decimal::from($x),
            ccy: Currency::USD,
        }
    };
}
#[macro_export]
macro_rules! hkd {
    ($x:expr) => {
        Money {
            amount: Decimal::from($x),
            ccy: Currency::HKD,
        }
    };
}

// ------------------------- Errors -------------------------

#[derive(Debug, Error)]
pub enum CapitalError {
    #[error("currency mismatch: {0:?} vs {1:?}")]
    CurrencyMismatch(Currency, Currency),

    #[error("insufficient funds in envelope {0}")]
    InsufficientFunds(String),

    #[error("envelope not found: {0}")]
    EnvelopeNotFound(String),

    #[error("inactive envelope: {0}")]
    InactiveEnvelope(String),

    #[error("min balance would be exceeded in envelope {0}")]
    MinBalanceExceeded(String),
}

// ------------------------- Envelopes -------------------------

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum EnvelopeStatus {
    Active,
    Inactive,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum EnvelopeKind {
    Fixed,
    Variable,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum FundingFreq {
    Monthly,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct FundingRule {
    pub amount: Money,
    pub freq: FundingFreq,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum DeficitPolicy {
    /// Next funding auto-nets the deficit first, then adds any remainder.
    AutoNet,
    /// Deficit persists until an explicit transfer/fund() occurs.
    RequireTransfer,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum RolloverPolicy {
    /// On new month: if balance is positive -> reset to 0; if negative and deficits allowed -> carry the negative.
    ResetToZero,
    /// Keep remaining balance; add funding; optionally cap final balance.
    CarryOver { cap: Option<Money> },
    /// Classic sinking fund: always carry over; cap optional.
    SinkingFund { cap: Option<Money> },
    /// Carry over but apply exponential decay to prior balance before funding.
    Decay {
        keep_ratio: Decimal,
        cap: Option<Money>,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Envelope {
    pub id: String,
    pub name: String,
    pub kind: EnvelopeKind,
    pub status: EnvelopeStatus,
    pub funding: Option<FundingRule>, // None for event-based/manual
    pub rollover: RolloverPolicy,
    pub balance: Money,
    /// Optional soft limit for monthly spend (for UI/alerts).
    pub period_limit: Option<Money>,
    /// Last processed period in "YYYY-MM".
    pub last_period: Option<String>,
    /// Allow controlled negative balances (deficits).
    pub allow_negative: bool,
    /// The most negative this envelope may go (in envelope currency). None => no special floor (defaults to 0 if allow_negative is false).
    pub min_balance: Option<Decimal>,
    /// How deficits are treated at month open (only relevant when allow_negative == true).
    pub deficit_policy: Option<DeficitPolicy>,
}

impl Envelope {
    fn clip_to_cap(current: Decimal, ccy: Currency, cap: &Option<Money>) -> Decimal {
        if let Some(m) = cap {
            if m.ccy == ccy && current > m.amount {
                return m.amount;
            }
        }
        current
    }

    /// Transition the envelope to a new month period and apply rollover + funding.
    pub fn start_new_period(&mut self, year: i32, month: u32) {
        let period = format!("{year}-{month:02}");
        if self.last_period.as_deref() == Some(&period) {
            return;
        }
        if matches!(self.status, EnvelopeStatus::Inactive) {
            self.last_period = Some(period);
            return;
        }

        // 1) Apply rollover rule to prior balance
        let mut new_bal_amt = match &self.rollover {
            RolloverPolicy::ResetToZero => {
                // If negative and deficits are allowed, carry the negative; otherwise zero.
                if self.allow_negative && self.balance.amount.is_sign_negative() {
                    self.balance.amount
                } else {
                    Decimal::ZERO
                }
            }
            RolloverPolicy::CarryOver { cap } | RolloverPolicy::SinkingFund { cap } => {
                Self::clip_to_cap(self.balance.amount, self.balance.ccy, cap)
            }
            RolloverPolicy::Decay { keep_ratio, cap } => {
                let kept = self.balance.amount * *keep_ratio;
                Self::clip_to_cap(kept, self.balance.ccy, cap)
            }
        };

        // 2) Apply funding (Monthly), with deficit handling
        if let Some(rule) = &self.funding {
            match rule.freq {
                FundingFreq::Monthly => {
                    assert_eq!(
                        self.balance.ccy, rule.amount.ccy,
                        "funding currency must match envelope"
                    );

                    if self.allow_negative && new_bal_amt.is_sign_negative() {
                        match self.deficit_policy {
                            Some(DeficitPolicy::AutoNet) => {
                                // Funding first pays off the deficit, then any remainder increases the balance.
                                let after_netted = new_bal_amt + rule.amount.amount;
                                new_bal_amt = after_netted;
                            }
                            Some(DeficitPolicy::RequireTransfer) | None => {
                                // Do not auto-net; only explicit fund() should fix it.
                                // Still add the funding if rule exists (policy choice); here we add it.
                                new_bal_amt += rule.amount.amount;
                            }
                        }
                    } else {
                        // No deficit present: normal funding
                        new_bal_amt += rule.amount.amount;
                    }
                }
            }
        }

        self.balance.amount = new_bal_amt;
        self.last_period = Some(period);
    }

    /// Increase balance (e.g., manual top-up or refund).
    pub fn credit(&mut self, amt: Money) -> Result<(), CapitalError> {
        if self.balance.ccy != amt.ccy {
            return Err(CapitalError::CurrencyMismatch(self.balance.ccy, amt.ccy));
        }
        self.balance.amount += amt.amount;
        Ok(())
    }

    /// Spend/debit from envelope. Supports controlled deficits.
    pub fn debit(&mut self, amt: Money) -> Result<(), CapitalError> {
        if self.balance.ccy != amt.ccy {
            return Err(CapitalError::CurrencyMismatch(self.balance.ccy, amt.ccy));
        }

        let prospective = self.balance.amount - amt.amount;
        if self.allow_negative {
            if let Some(floor) = self.min_balance {
                if prospective < floor {
                    return Err(CapitalError::MinBalanceExceeded(self.id.clone()));
                }
            }
            // Allowed to go negative within the floor.
            self.balance.amount = prospective;
            Ok(())
        } else {
            if prospective.is_sign_negative() {
                return Err(CapitalError::InsufficientFunds(self.id.clone()));
            }
            self.balance.amount = prospective;
            Ok(())
        }
    }
}

// ------------------------- Accounts (minimal) -------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub currency: Currency,
    pub metadata: AccountMetadata,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum AccountNetwork {
    EVM { chain_name: String, chain_id: u64 },
    Solana,
    Bitcoin,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum AccountMetadata {
    Checking {
        bank_name: String,  // e.g. "Chase"
        owner_name: String, // e.g. "John Doe"
        account_number: String,
        routing_number: Option<String>,
    },
    Savings {
        bank_name: String,  // e.g. "Chase"
        owner_name: String, // e.g. "John Doe"
        account_number: String,
        routing_number: Option<String>,
    },
    Credit {
        credit_card_name: String, // e.g. "Chase Sapphire"
        owner_name: String,       // e.g. "John Doe"
        account_number: String,
        routing_number: Option<String>,
    },
    CryptoWallet {
        address: String,
        network: AccountNetwork,
        is_ledger: bool,
    },
    Cex {
        cex_name: String, // e.g. "Binance"
        account_id: String,
    },
    Trust {
        trustee: String,
        jurisdiction: String,
    },
}

impl Account {
    #[allow(dead_code)]
    pub fn kind(&self) -> &'static str {
        match &self.metadata {
            AccountMetadata::Checking { .. } => "Checking",
            AccountMetadata::Savings { .. } => "Savings",
            AccountMetadata::Credit { .. } => "Credit",
            AccountMetadata::CryptoWallet { .. } => "CryptoWallet",
            AccountMetadata::Cex { .. } => "Cex",
            AccountMetadata::Trust { .. } => "Trust",
        }
    }
}

// ------------------------- Funds -------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Fund {
    pub id: String,
    pub name: String,       // e.g. "Altcoin Fund"
    pub base_ccy: Currency, // BTC
    pub charter: String,    // e.g. "High-beta meme coin exposure."
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Position {
    pub fund_id: String,
    pub asset: String, // "BONK", "DOGE"
    pub qty: Decimal,
    pub price_in_base_ccy: Decimal,
    pub last_updated: i64, // Unix timestamp
}

// ------------------------- Family Example -------------------------

/// Constructs the Family bucket using the decisions we've locked in.
/// Currency for all envelopes here is USD unless noted otherwise.
///
/// - W Pocket Money (SoFi / ZA) – CarryOver
/// - A Pocket Money (TD / Mox) – CarryOver
/// - Groceries (Chase Credit) – ResetToZero, $1,000/mo, allow deficits to -$150 (AutoNet)
/// - Transport (Chase Credit) – ResetToZero, $500/mo, allow deficits to -$150 (AutoNet)
/// - Flights (HSBC Joint, HKD) – SinkingFund cap HKD 10,000 *example*, adjust later
/// - Family (HSBC Joint, HKD) – SinkingFund cap HKD 12,000 *example*, adjust later
/// - Extras (Chase) – CarryOver cap USD 3,000
/// - Rent (Chase) – Fixed 4,500/mo but modeled as envelope for forecast; Inactive until lease resumes

// ------------------------- API Handlers -------------------------

/// GET /capital/envelopes - Fetch all envelopes from MongoDB
///
use crate::AppState;

pub async fn get_all_envelopes(State(state): State<Arc<AppState>>) -> Json<Vec<Envelope>> {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Envelope>("capital_envelopes");

    use futures::stream::TryStreamExt;

    match collection.find(None, None).await {
        Ok(cursor) => match cursor.try_collect::<Vec<Envelope>>().await {
            Ok(envelopes) => Json(envelopes),
            Err(e) => {
                eprintln!("Error collecting envelopes: {}", e);
                Json(Vec::new())
            }
        },
        Err(e) => {
            eprintln!("Error fetching envelopes: {}", e);
            Json(Vec::new())
        }
    }
}

/// GET /capital/accounts - Fetch all accounts from MongoDB
pub async fn get_all_accounts(State(state): State<Arc<AppState>>) -> Json<Vec<Account>> {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Account>("capital_accounts");

    use futures::stream::TryStreamExt;

    match collection.find(None, None).await {
        Ok(cursor) => match cursor.try_collect::<Vec<Account>>().await {
            Ok(accounts) => Json(accounts),
            Err(e) => {
                eprintln!("Error collecting accounts: {}", e);
                Json(Vec::new())
            }
        },
        Err(e) => {
            eprintln!("Error fetching accounts: {}", e);
            Json(Vec::new())
        }
    }
}
