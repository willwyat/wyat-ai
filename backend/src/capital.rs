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

use axum::{
    Json,
    extract::{Query, State},
};
use mongodb::bson;
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

// ------------------------- Ledger -------------------------

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum LegDirection {
    Debit,
    Credit,
}

/// Snapshot used to value a leg in a chosen reporting currency (e.g., USD or BTC).
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct FxSnapshot {
    pub to: Currency,  // currency to value in (e.g., USD or BTC)
    pub rate: Decimal, // price per 1 unit of the leg's native unit in `to`
}

/// Amount carried by a leg: either fiat (Money) or a crypto asset quantity.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data")]
pub enum LegAmount {
    /// Fiat amount in a defined Currency (USD/HKD/BTC if you later model BTC as fiat-like)
    Fiat(Money),
    /// Crypto asset with symbol and quantity (e.g., { asset: "ETH", qty: 1.25 })
    Crypto { asset: String, qty: Decimal },
}

impl LegAmount {
    /// Return a valuation of this amount in `fx.to` using the provided snapshot.
    /// - Fiat: if fiat.ccy == fx.to, returns the same amount; otherwise multiplies by fx.rate
    /// - Crypto: requires fx to be provided (price of 1 unit in fx.to)
    pub fn valued_in(&self, fx: Option<FxSnapshot>) -> Option<Money> {
        match self {
            LegAmount::Fiat(m) => match fx {
                Some(snap) if m.ccy != snap.to => Some(Money::new(m.amount * snap.rate, snap.to)),
                _ => Some(*m),
            },
            LegAmount::Crypto { qty, .. } => {
                let snap = fx?; // need a price to value crypto
                Some(Money::new(*qty * snap.rate, snap.to))
            }
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Leg {
    pub account_id: String,          // e.g., "acct.chase_credit" or "acct.binance"
    pub direction: LegDirection,     // Debit or Credit
    pub amount: LegAmount,           // Fiat or Crypto amount
    pub fx: Option<FxSnapshot>,      // Optional valuation snapshot
    pub category_id: Option<String>, // Optional envelope/category link (e.g., "env_transport")
    pub fee_of_leg_idx: Option<u32>, // If this is a fee tied to another leg (index within `legs`)
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,             // stable UUID/String
    pub ts: i64,                // when it happened (unix seconds)
    pub posted_ts: Option<i64>, // when institution posted it
    pub source: String,         // e.g., "chase_csv", "chase_pdf", "etherscan_csv", "manual"
    pub payee: Option<String>,  // e.g., "Uber", "Binance Offramp"
    pub memo: Option<String>,
    pub status: Option<String>, // "pending" | "posted" | "void"
    pub reconciled: bool,       // checked off against a statement line
    pub external_refs: Vec<(String, String)>, // pairs of (kind, value) like ("tx_hash", "0x...")
    pub legs: Vec<Leg>,
}

impl Transaction {
    /// Check zero-sum integrity by valuing each leg in the requested reporting currency.
    /// Returns (is_balanced, net_amount) — where net_amount should be 0 when balanced.
    pub fn is_balanced_in(&self, report_ccy: Currency) -> (bool, Money) {
        let mut net = Decimal::ZERO;
        for leg in &self.legs {
            // Try to value leg in report_ccy; if not possible, skip valuation (treat as 0)
            let valued = match (&leg.amount, leg.fx) {
                (LegAmount::Fiat(m), fx) => {
                    if m.ccy == report_ccy {
                        Some(*m)
                    } else if let Some(snap) = fx {
                        if snap.to == report_ccy {
                            Some(Money::new(m.amount * snap.rate, report_ccy))
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                }
                (LegAmount::Crypto { .. }, fx) => fx.and_then(|snap| {
                    if snap.to == report_ccy {
                        leg.amount.valued_in(Some(snap))
                    } else {
                        None
                    }
                }),
            };

            if let Some(v) = valued {
                let signed = match leg.direction {
                    LegDirection::Debit => v.amount,
                    LegDirection::Credit => -v.amount,
                };
                net += signed;
            }
        }
        (net.is_zero(), Money::new(net, report_ccy))
    }
}

/// Bank/credit statement header for reconciliation.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Statement {
    pub id: String,
    pub account_id: String,
    pub period_start: i64,
    pub period_end: i64,
    pub opening_balance: Money,
    pub closing_balance: Money,
    pub raw_ref: Option<String>, // e.g., filename or source range
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

// ------------------------- Query Parameters -------------------------

#[derive(Debug, Deserialize)]
pub struct TransactionQuery {
    pub account_id: Option<String>,
    pub from: Option<i64>, // Unix timestamp
    pub to: Option<i64>,   // Unix timestamp
}

#[derive(Debug, Deserialize)]
pub struct ReclassifyTransactionRequest {
    pub transaction_id: String,
    pub leg_index: usize,
    pub category_id: Option<String>, // envelope ID or category
}

/// GET /capital/transactions - Fetch transactions with optional filtering
///
/// Query parameters:
/// - account_id: Filter by account ID (searches in legs.account_id)
/// - from: Unix timestamp for start of time range (inclusive)
/// - to: Unix timestamp for end of time range (inclusive)
///
/// Examples:
/// - GET /capital/transactions
/// - GET /capital/transactions?account_id=acct.chase_credit
/// - GET /capital/transactions?from=1696000000&to=1698591999
/// - GET /capital/transactions?account_id=acct.chase_credit&from=1696000000&to=1698591999
pub async fn get_transactions(
    State(state): State<Arc<AppState>>,
    Query(params): Query<TransactionQuery>,
) -> Json<Vec<Transaction>> {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Transaction>("capital_ledger");

    use futures::stream::TryStreamExt;
    use mongodb::bson::doc;

    // Build MongoDB query filter
    let mut filter = doc! {};

    // Filter by account_id if provided
    if let Some(account_id) = &params.account_id {
        filter.insert("legs.account_id", account_id);
    }

    // Filter by time range if provided
    let mut time_filter = doc! {};
    if let Some(from) = params.from {
        time_filter.insert("$gte", from);
    }
    if let Some(to) = params.to {
        time_filter.insert("$lte", to);
    }

    if !time_filter.is_empty() {
        filter.insert("ts", time_filter);
    }

    match collection.find(Some(filter), None).await {
        Ok(cursor) => match cursor.try_collect::<Vec<Transaction>>().await {
            Ok(transactions) => Json(transactions),
            Err(e) => {
                eprintln!("Error collecting transactions: {}", e);
                Json(Vec::new())
            }
        },
        Err(e) => {
            eprintln!("Error fetching transactions: {}", e);
            Json(Vec::new())
        }
    }
}

/// PUT /capital/transactions/reclassify - Update transaction leg category
///
/// Body: ReclassifyTransactionRequest
/// - transaction_id: ID of the transaction to update
/// - leg_index: Index of the leg to update (usually 0)
/// - category_id: New envelope/category ID (or null to clear)
///
/// Example:
/// PUT /capital/transactions/reclassify
/// {
///   "transaction_id": "123e4567-e89b-12d3-a456-426614174000",
///   "leg_index": 0,
///   "category_id": "env_groceries"
/// }
pub async fn reclassify_transaction(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ReclassifyTransactionRequest>,
) -> Result<Json<serde_json::Value>, String> {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Transaction>("capital_ledger");

    use mongodb::bson::doc;

    // First, find the transaction
    let filter = doc! { "id": &request.transaction_id };

    match collection.find_one(Some(filter.clone()), None).await {
        Ok(Some(mut transaction)) => {
            // Validate leg_index
            if request.leg_index >= transaction.legs.len() {
                return Err(format!(
                    "Invalid leg_index: {} (transaction has {} legs)",
                    request.leg_index,
                    transaction.legs.len()
                ));
            }

            // Clone category_id before moving it
            let new_category_id = request.category_id.clone();

            // Update the leg's category_id
            transaction.legs[request.leg_index].category_id = request.category_id;

            // Update the transaction in the database
            let update = doc! {
                "$set": {
                    "legs": bson::to_bson(&transaction.legs)
                        .map_err(|e| format!("Failed to serialize legs: {}", e))?
                }
            };

            match collection.update_one(filter, update, None).await {
                Ok(result) => {
                    if result.modified_count == 1 {
                        Ok(Json(serde_json::json!({
                            "success": true,
                            "message": "Transaction reclassified successfully",
                            "transaction_id": request.transaction_id,
                            "leg_index": request.leg_index,
                            "category_id": new_category_id
                        })))
                    } else {
                        Err("Transaction not found or not modified".to_string())
                    }
                }
                Err(e) => Err(format!("Database update error: {}", e)),
            }
        }
        Ok(None) => Err(format!("Transaction not found: {}", request.transaction_id)),
        Err(e) => Err(format!("Database query error: {}", e)),
    }
}
