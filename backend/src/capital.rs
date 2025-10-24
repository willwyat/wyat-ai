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
use bytes::Bytes;
use mongodb::bson::{doc, oid::ObjectId};
use mongodb::{Database, bson};
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use thiserror::Error;

// Import storage functions and types
// TODO: Re-enable when implementing bank statement import
// use crate::services::openai::extract_bank_statement;
use crate::services::storage::{Document, create_document, get_blob_bytes_by_id, insert_blob};

/// Virtual ledger account used to offset spending/income legs into P&L.
pub const PNL_ACCOUNT_ID: &str = "__pnl__";
/// Default envelope used when we cannot determine a more specific category.
pub const DEFAULT_ENVELOPE_ID: &str = "env_uncategorized";

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
        color: Option<String>,
        txid_prefix: Option<String>,
    },
    Savings {
        bank_name: String,  // e.g. "Chase"
        owner_name: String, // e.g. "John Doe"
        account_number: String,
        routing_number: Option<String>,
        color: Option<String>,
        txid_prefix: Option<String>,
    },
    Credit {
        credit_card_name: String, // e.g. "Chase Sapphire"
        owner_name: String,       // e.g. "John Doe"
        account_number: String,
        routing_number: Option<String>,
        color: Option<String>,
        txid_prefix: Option<String>,
    },
    CryptoWallet {
        address: String,
        network: AccountNetwork,
        is_ledger: bool,
        color: Option<String>,
        txid_prefix: Option<String>,
    },
    Cex {
        cex_name: String, // e.g. "Binance"
        account_id: String,
        color: Option<String>,
        txid_prefix: Option<String>,
    },
    Trust {
        trustee: String,
        jurisdiction: String,
        color: Option<String>,
        txid_prefix: Option<String>,
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

impl LegDirection {
    pub fn opposite(self) -> Self {
        match self {
            LegDirection::Debit => LegDirection::Credit,
            LegDirection::Credit => LegDirection::Debit,
        }
    }
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

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BalanceState {
    Balanced,
    NeedsEnvelopeOffset,
    AwaitingTransferMatch,
    Unknown,
}

impl Default for BalanceState {
    fn default() -> Self {
        BalanceState::Unknown
    }
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
    pub tx_type: Option<String>,
    #[serde(default)]
    pub balance_state: BalanceState,
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

    fn apply_spending_autobalance(&mut self) {
        if self.legs.len() != 1 {
            return;
        }
        if self.is_transfer_type() {
            return;
        }

        let primary_leg = self.legs.first_mut().expect("checked len");
        let amount = match &primary_leg.amount {
            LegAmount::Fiat(m) => *m,
            _ => return,
        };

        let category_for_pnl = primary_leg
            .category_id
            .take()
            .unwrap_or_else(|| DEFAULT_ENVELOPE_ID.to_string());

        let balancing_leg = Leg {
            account_id: PNL_ACCOUNT_ID.to_string(),
            direction: primary_leg.direction.opposite(),
            amount: LegAmount::Fiat(amount),
            fx: primary_leg.fx,
            category_id: Some(category_for_pnl),
            fee_of_leg_idx: None,
            notes: Some("auto-balance:pnl".to_string()),
        };
        self.legs.push(balancing_leg);
    }

    fn is_transfer_type(&self) -> bool {
        if let Some(tx_type) = &self.tx_type {
            if tx_type.eq_ignore_ascii_case("transfer")
                || tx_type.eq_ignore_ascii_case("transfer_fx")
            {
                return true;
            }
        }

        self.external_refs.iter().any(|(kind, _)| {
            kind.eq_ignore_ascii_case("transfer_group")
                || kind.eq_ignore_ascii_case("transfer_id")
                || kind.eq_ignore_ascii_case("transfer_match")
        })
    }

    pub fn recompute_balance_state(&mut self) -> BalanceState {
        let state = self.infer_balance_state();
        self.balance_state = state;
        state
    }

    fn infer_balance_state(&self) -> BalanceState {
        if self.legs.is_empty() {
            return BalanceState::Unknown;
        }

        let (balanced, _) = self.is_balanced_in(Currency::USD);
        if balanced {
            return BalanceState::Balanced;
        }

        if self.legs.len() == 1 && !self.is_transfer_type() {
            return BalanceState::NeedsEnvelopeOffset;
        }

        BalanceState::AwaitingTransferMatch
    }

    pub fn normalize(&mut self) {
        self.apply_spending_autobalance();
        self.recompute_balance_state();
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
    #[serde(rename = "_id")]
    pub id: mongodb::bson::oid::ObjectId,
    pub name: String,
    pub symbol: String,
    pub assets: Vec<String>,
    pub purpose: String,
    pub horizon_years: i32,
    pub discretionary_sales: bool,
    #[serde(default)]
    pub acquisition_policy: Option<String>,
    #[serde(default)]
    pub yield_policy: Option<String>,
    pub denominated_in: Currency,
    #[serde(default)]
    pub balancing_policy: Option<mongodb::bson::Document>,
    #[serde(default)]
    pub multiplier_rules: Option<Vec<String>>,
    pub max_pct_networth: f64,
    pub max_pct_liquid: f64,
    pub liquid: bool,
    pub review_cadence: String,
    pub status: String,
    #[serde(default)]
    pub created_at: Option<mongodb::bson::DateTime>,
    #[serde(default)]
    pub updated_at: Option<mongodb::bson::DateTime>,
    pub fund_id: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct PublicFund {
    pub id: String,
    pub fund_id: String,
    pub name: String,
    pub symbol: String,
    pub assets: Vec<String>,
    pub purpose: String,
    pub horizon_years: i32,
    pub discretionary_sales: bool,
    pub acquisition_policy: Option<String>,
    pub yield_policy: Option<String>,
    pub denominated_in: Currency,
    pub balancing_policy: Option<mongodb::bson::Document>,
    pub multiplier_rules: Option<Vec<String>>,
    pub max_pct_networth: f64,
    pub max_pct_liquid: f64,
    pub liquid: bool,
    pub review_cadence: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
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
use crate::AppState;

// ------------------------- Helper Functions -------------------------

/// Calculate the active budget cycle window (10th of month → 9th of next month) in UTC.
/// Returns (start_timestamp, end_timestamp, label) where label is "YYYY-MM" format.
/// Cycle convention: Settlement window uses UTC. Active cycle = 10th 00:00:00 UTC of month → 9th 23:59:59 UTC of next month. Filtering uses posted_ts if present, otherwise ts.
fn active_cycle_bounds(now_utc: i64) -> (i64, i64, String) {
    use chrono::{Datelike, NaiveDateTime, TimeZone, Utc};

    let dt = match Utc.timestamp_opt(now_utc, 0) {
        chrono::LocalResult::Single(d) => d,
        _ => {
            eprintln!("Invalid timestamp: {}", now_utc);
            // Fallback to current time
            Utc::now()
        }
    };
    let (y, m, d) = (dt.year(), dt.month(), dt.day());

    // Determine cycle start month
    let (start_y, start_m) = if d >= 10 {
        (y, m)
    } else {
        if m == 1 { (y - 1, 12) } else { (y, m - 1) }
    };

    // Start: 10th at 00:00:00
    let start = match (
        chrono::NaiveDate::from_ymd_opt(start_y, start_m, 10),
        chrono::NaiveTime::from_hms_opt(0, 0, 0),
    ) {
        (Some(date), Some(time)) => Utc
            .from_utc_datetime(&NaiveDateTime::new(date, time))
            .timestamp(),
        _ => {
            eprintln!(
                "Failed to create start date for cycle: {}-{}",
                start_y, start_m
            );
            now_utc
        }
    };

    // End: 9th at 23:59:59 of next month
    let (end_y, end_m) = if start_m == 12 {
        (start_y + 1, 1)
    } else {
        (start_y, start_m + 1)
    };
    let end = match (
        chrono::NaiveDate::from_ymd_opt(end_y, end_m, 9),
        chrono::NaiveTime::from_hms_opt(23, 59, 59),
    ) {
        (Some(date), Some(time)) => Utc
            .from_utc_datetime(&NaiveDateTime::new(date, time))
            .timestamp(),
        _ => {
            eprintln!("Failed to create end date for cycle: {}-{}", end_y, end_m);
            now_utc + 2_592_000 // fallback: ~30 days later
        }
    };

    (start, end, format!("{start_y:04}-{start_m:02}"))
}

// ------------------------- Response Types -------------------------

#[derive(Serialize)]
pub struct EnvelopeUsage {
    pub envelope_id: String,
    pub label: String, // cycle label, e.g., "2025-10"
    pub budget: Money, // from capital_envelopes.funding.amount
    pub spent: Money,  // sum of P&L legs in window
    pub remaining: Money,
    pub percent: f64,
}

// ------------------------- Envelope Endpoints -------------------------

/// GET /capital/envelopes - Fetch all envelopes from MongoDB
///

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

#[derive(Debug, Deserialize)]
pub struct UsageQuery {
    pub label: Option<String>,
}

/// GET /capital/envelopes/{envelope_id}/usage - Get envelope usage for a cycle
///
/// Returns budget, spent, remaining, and percent for a single envelope ID.
/// The active cycle runs from the 10th of one month to the 9th of the next month (UTC).
///
/// Query parameters:
/// - label: Optional cycle label (e.g., "2025-10") to query historical usage.
///          If omitted, returns usage for the active cycle.
///
/// Examples:
/// - GET /capital/envelopes/env_groceries/usage (active cycle)
/// - GET /capital/envelopes/env_groceries/usage?label=2025-10 (specific cycle)
pub async fn get_envelope_usage(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(envelope_id): axum::extract::Path<String>,
    Query(q): Query<UsageQuery>,
) -> Result<Json<EnvelopeUsage>, String> {
    use futures::stream::TryStreamExt;
    use mongodb::bson::{Bson, doc};

    // Determine cycle bounds based on optional label query parameter
    let (start_ts, end_ts, label) = match q.label.as_deref() {
        Some(l) => {
            let (s, e) =
                cycle_bounds_for_label(l).ok_or_else(|| format!("Invalid cycle label: {}", l))?;
            (s, e, l.to_string())
        }
        None => {
            let now = chrono::Utc::now().timestamp();
            active_cycle_bounds(now)
        }
    };

    let db = state.mongo_client.database("wyat");
    let envs = db.collection::<Envelope>("capital_envelopes");
    let ledger = db.collection::<mongodb::bson::Document>("capital_ledger");

    // Fetch envelope (for budget + currency)
    let env = match envs.find_one(doc! {"id": &envelope_id}, None).await {
        Ok(Some(e)) => e,
        Ok(None) => {
            eprintln!("Envelope not found: {}", envelope_id);
            return Err(format!("Envelope not found: {}", envelope_id));
        }
        Err(e) => {
            eprintln!("Database error fetching envelope {}: {}", envelope_id, e);
            return Err(format!("Database error: {}", e));
        }
    };

    let budget_money = env
        .funding
        .as_ref()
        .map(|f| f.amount)
        .unwrap_or_else(|| Money::zero(env.balance.ccy));

    // Aggregate spent from P&L legs (legs with category_id == envelope_id)
    // - Uses posted_ts when available, falls back to ts
    // - Applies proper sign: Debit = positive spend, Credit = negative (refund)

    // Currency string representation for MongoDB (e.g., "USD")
    let ccy_str = match budget_money.ccy {
        Currency::USD => "USD",
        Currency::HKD => "HKD",
        Currency::BTC => "BTC",
    };

    let pipeline = vec![
        doc! {
            "$match": {
                "$expr": {
                    "$and": [
                        { "$gte": [ { "$ifNull": [ "$posted_ts", "$ts" ] }, start_ts ] },
                        { "$lte": [ { "$ifNull": [ "$posted_ts", "$ts" ] }, end_ts ] }
                    ]
                },
                "legs.category_id": &envelope_id
            }
        },
        doc! { "$unwind": "$legs" },
        doc! {
            "$match": {
                "legs.category_id": &envelope_id,
                "legs.amount.kind": "Fiat",
                "legs.amount.data.ccy": ccy_str
            }
        },
        doc! {
            "$project": {
                "signed": {
                    "$cond": [
                        { "$eq": [ "$legs.direction", "Debit" ] },
                        { "$toDecimal": "$legs.amount.data.amount" },
                        { "$multiply": [ { "$toDecimal": "$legs.amount.data.amount" }, -1 ] }
                    ]
                }
            }
        },
        doc! {
            "$group": {
                "_id": null,
                "sum": { "$sum": "$signed" }
            }
        },
    ];

    let mut spent_amount = Decimal::ZERO;
    match ledger.aggregate(pipeline, None).await {
        Ok(mut cursor) => {
            if let Ok(Some(doc)) = cursor.try_next().await {
                if let Some(sum_val) = doc.get("sum") {
                    match sum_val {
                        Bson::Decimal128(d) => {
                            spent_amount =
                                Decimal::from_str_exact(&d.to_string()).unwrap_or_else(|e| {
                                    eprintln!(
                                        "Failed to parse Decimal128 for envelope {} in cycle {}: {}",
                                        envelope_id, label, e
                                    );
                                    Decimal::ZERO
                                });
                        }
                        Bson::Double(f) => {
                            spent_amount = Decimal::try_from(*f).unwrap_or_else(|_| {
                                eprintln!(
                                    "Failed to convert Double to Decimal for envelope {} in cycle {}",
                                    envelope_id, label
                                );
                                Decimal::ZERO
                            });
                        }
                        Bson::Int32(i) => {
                            spent_amount = Decimal::from(*i);
                        }
                        Bson::Int64(i) => {
                            spent_amount = Decimal::from(*i);
                        }
                        _ => {
                            eprintln!(
                                "Unexpected BSON type for sum in envelope {} cycle {}: {:?}",
                                envelope_id, label, sum_val
                            );
                        }
                    }
                }
            }
        }
        Err(e) => {
            eprintln!(
                "Error aggregating spent for envelope {} in cycle {}: {}",
                envelope_id, label, e
            );
            // Continue with zero spent rather than failing
        }
    }

    let spent = Money {
        amount: spent_amount,
        ccy: budget_money.ccy,
    };
    let remaining = Money {
        amount: budget_money.amount - spent.amount,
        ccy: budget_money.ccy,
    };
    let percent = if budget_money.amount.is_zero() {
        0.0
    } else {
        (spent.amount / budget_money.amount)
            .to_f64()
            .unwrap_or(0.0)
            .max(0.0)
    };

    Ok(Json(EnvelopeUsage {
        envelope_id,
        label,
        budget: budget_money,
        spent,
        remaining,
        percent,
    }))
}

// Put near other helpers/constants
const FIRST_CYCLE_START_UTC: i64 = 1_754_784_000;
// = 2025-08-10 00:00:00 UTC  (update if your first cycle is a different year)

// Given a cycle label "YYYY-MM", return (start_ts,end_ts)
fn cycle_bounds_for_label(label: &str) -> Option<(i64, i64)> {
    use chrono::{NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Utc};
    let (yyyy, mm) = label.split_once('-')?;
    let y: i32 = yyyy.parse().ok()?;
    let m: u32 = mm.parse().ok()?;

    let start_date = NaiveDate::from_ymd_opt(y, m, 10)?;
    let start = Utc
        .from_utc_datetime(&NaiveDateTime::new(
            start_date,
            NaiveTime::from_hms_opt(0, 0, 0)?,
        ))
        .timestamp();

    let (ey, em) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
    let end_date = NaiveDate::from_ymd_opt(ey, em, 9)?;
    let end = Utc
        .from_utc_datetime(&NaiveDateTime::new(
            end_date,
            NaiveTime::from_hms_opt(23, 59, 59)?,
        ))
        .timestamp();

    Some((start, end))
}

// Return all cycle labels from FIRST_CYCLE_START_UTC to "now" inclusive.
// Labels are "YYYY-MM" for the month that STARTS on the 10th.
fn list_cycle_labels(now_utc: i64) -> Vec<String> {
    use chrono::{Datelike, TimeZone, Utc};
    let mut out = Vec::new();

    // first cycle label
    let start_dt = Utc
        .timestamp_opt(FIRST_CYCLE_START_UTC, 0)
        .single()
        .unwrap();
    let mut y = start_dt.year();
    let mut m = start_dt.month();

    // compute active cycle's label (same rule as active_cycle_bounds)
    let active = Utc.timestamp_opt(now_utc, 0).single().unwrap();
    let (ay, am) = if active.day() >= 10 {
        (active.year(), active.month())
    } else {
        if active.month() == 1 {
            (active.year() - 1, 12)
        } else {
            (active.year(), active.month() - 1)
        }
    };

    while y < ay || (y == ay && m <= am) {
        out.push(format!("{y:04}-{m:02}"));
        if m == 12 {
            y += 1;
            m = 1;
        } else {
            m += 1;
        }
    }
    out
}

#[derive(Serialize)]
pub struct CycleList {
    pub labels: Vec<String>,
    pub active: String,
}

/// GET /capital/cycles  → { labels: [...], active: "YYYY-MM" }
pub async fn get_cycles(State(_state): State<Arc<AppState>>) -> Json<CycleList> {
    let now = chrono::Utc::now().timestamp();
    let labels = list_cycle_labels(now);
    let (_, _, active) = active_cycle_bounds(now);
    Json(CycleList { labels, active })
}

/// GET /capital/funds - Fetch all funds from MongoDB (capital_funds collection)
pub async fn get_all_funds(State(state): State<Arc<AppState>>) -> Json<Vec<PublicFund>> {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Fund>("capital_funds");

    use futures::stream::TryStreamExt;

    match collection.find(None, None).await {
        Ok(cursor) => match cursor.try_collect::<Vec<Fund>>().await {
            Ok(funds) => Json(
                funds
                    .into_iter()
                    .map(|f| PublicFund {
                        id: f.id.to_hex(),
                        fund_id: f.fund_id,
                        name: f.name,
                        symbol: f.symbol,
                        assets: f.assets,
                        purpose: f.purpose,
                        horizon_years: f.horizon_years,
                        discretionary_sales: f.discretionary_sales,
                        acquisition_policy: f.acquisition_policy,
                        yield_policy: f.yield_policy,
                        denominated_in: f.denominated_in,
                        balancing_policy: f.balancing_policy,
                        multiplier_rules: f.multiplier_rules,
                        max_pct_networth: f.max_pct_networth,
                        max_pct_liquid: f.max_pct_liquid,
                        liquid: f.liquid,
                        review_cadence: f.review_cadence,
                        status: f.status,
                        created_at: f
                            .created_at
                            .map(|d| d.timestamp_millis() / 1000)
                            .unwrap_or(0),
                        updated_at: f
                            .updated_at
                            .map(|d| d.timestamp_millis() / 1000)
                            .unwrap_or(0),
                    })
                    .collect(),
            ),
            Err(e) => {
                eprintln!("Error collecting funds: {}", e);
                Json(Vec::new())
            }
        },
        Err(e) => {
            eprintln!("Error fetching funds: {}", e);
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
    pub envelope_id: Option<String>,
    pub from: Option<i64>, // Unix timestamp
    pub to: Option<i64>,   // Unix timestamp
    pub label: Option<String>,
    pub tx_type: Option<String>,
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
/// - envelope_id: Filter by envelope/category ID (searches in legs.category_id)
/// - label: Filter by cycle label (e.g., "2025-10"). Takes precedence over from/to.
/// - from: Unix timestamp for start of time range (inclusive, ignored if label is provided)
/// - to: Unix timestamp for end of time range (inclusive, ignored if label is provided)
/// - tx_type: Filter by transaction type (spending, income, fee_only, transfer, transfer_fx, trade, adjustment, refund)
///
/// Uses posted_ts when available, falls back to ts for time filtering.
///
/// Examples:
/// - GET /capital/transactions
/// - GET /capital/transactions?account_id=acct.chase_credit
/// - GET /capital/transactions?envelope_id=env.groceries
/// - GET /capital/transactions?label=2025-10
/// - GET /capital/transactions?from=1696000000&to=1698591999
/// - GET /capital/transactions?tx_type=spending
/// - GET /capital/transactions?account_id=acct.chase_credit&label=2025-10&envelope_id=env.groceries&tx_type=transfer_fx
pub async fn get_transactions(
    State(state): State<Arc<AppState>>,
    Query(params): Query<TransactionQuery>,
) -> Result<Json<Vec<Transaction>>, String> {
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

    // Filter by envelope_id/category_id if provided
    if let Some(envelope_id) = &params.envelope_id {
        filter.insert("legs.category_id", envelope_id);
    }

    // Filter by tx_type if provided
    if let Some(tx_type) = &params.tx_type {
        filter.insert("tx_type", tx_type);
    }

    // Determine time range: prefer cycle label, fall back to from/to params
    let (from, to) = if let Some(label) = &params.label {
        cycle_bounds_for_label(label).ok_or_else(|| format!("Invalid cycle label: {}", label))?
    } else if params.from.is_some() || params.to.is_some() {
        (
            params.from.unwrap_or(i64::MIN),
            params.to.unwrap_or(i64::MAX),
        )
    } else {
        // No time filter
        (i64::MIN, i64::MAX)
    };

    // Apply time filter using posted_ts with fallback to ts
    if from != i64::MIN || to != i64::MAX {
        filter.insert(
            "$expr",
            doc! {
                "$and": [
                    { "$gte": [ { "$ifNull": [ "$posted_ts", "$ts" ] }, from ] },
                    { "$lte": [ { "$ifNull": [ "$posted_ts", "$ts" ] }, to ] }
                ]
            },
        );
    }

    match collection.find(filter, None).await {
        Ok(cursor) => match cursor.try_collect::<Vec<Transaction>>().await {
            Ok(transactions) => Ok(Json(transactions)),
            Err(e) => {
                eprintln!("Error collecting transactions: {}", e);
                Err(format!("Error collecting transactions: {}", e))
            }
        },
        Err(e) => {
            eprintln!("Error fetching transactions: {}", e);
            Err(format!("Error fetching transactions: {}", e))
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

/// PATCH /capital/transactions/{transaction_id}/type - Update transaction type
///
/// Updates the tx_type field of a transaction.
///
/// Body: { "tx_type": "spending" | "income" | "fee_only" | "transfer" | "transfer_fx" | "trade" | "adjustment" | null }
///
/// Example:
/// PATCH /capital/transactions/123e4567-e89b-12d3-a456-426614174000/type
/// { "tx_type": "spending" }
#[derive(Debug, Deserialize)]
pub struct UpdateTransactionTypeRequest {
    pub tx_type: Option<String>,
}

pub async fn update_transaction_type(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(transaction_id): axum::extract::Path<String>,
    Json(request): Json<UpdateTransactionTypeRequest>,
) -> Result<Json<serde_json::Value>, String> {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Transaction>("capital_ledger");

    use mongodb::bson::doc;

    // Validate tx_type value if provided
    if let Some(ref tx_type) = request.tx_type {
        let valid_types = vec![
            "spending",
            "income",
            "fee_only",
            "transfer",
            "transfer_fx",
            "trade",
            "adjustment",
            "refund",
        ];
        if !valid_types.contains(&tx_type.as_str()) {
            return Err(format!(
                "Invalid tx_type: {}. Must be one of: {}",
                tx_type,
                valid_types.join(", ")
            ));
        }
    }

    let filter = doc! { "id": &transaction_id };
    let update = doc! {
        "$set": {
            "tx_type": match &request.tx_type {
                Some(t) => mongodb::bson::Bson::String(t.clone()),
                None => mongodb::bson::Bson::Null,
            }
        }
    };

    match collection.update_one(filter, update, None).await {
        Ok(result) => {
            if result.modified_count == 1 || result.matched_count == 1 {
                Ok(Json(serde_json::json!({
                    "success": true,
                    "message": "Transaction type updated successfully",
                    "transaction_id": transaction_id,
                    "tx_type": request.tx_type
                })))
            } else {
                Err(format!("Transaction not found: {}", transaction_id))
            }
        }
        Err(e) => Err(format!("Database update error: {}", e)),
    }
}

/// DELETE /capital/transactions/{transaction_id} - Delete a transaction
///
/// Deletes a transaction from the database by its ID.
///
/// Example:
/// DELETE /capital/transactions/123e4567-e89b-12d3-a456-426614174000
pub async fn delete_transaction(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(transaction_id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, String> {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Transaction>("capital_ledger");

    use mongodb::bson::doc;

    // Delete the transaction by ID
    let filter = doc! { "id": &transaction_id };

    match collection.delete_one(filter, None).await {
        Ok(result) => {
            if result.deleted_count == 1 {
                Ok(Json(serde_json::json!({
                    "success": true,
                    "message": "Transaction deleted successfully",
                    "transaction_id": transaction_id
                })))
            } else {
                Err(format!("Transaction not found: {}", transaction_id))
            }
        }
        Err(e) => Err(format!("Database delete error: {}", e)),
    }
}

// POST /capital/transactions
fn default_reconciled() -> bool {
    false
}

#[derive(Debug, serde::Deserialize)]
pub struct NewTransaction {
    pub id: String,
    pub ts: i64,
    #[serde(default)]
    pub posted_ts: Option<i64>,
    pub source: String,
    #[serde(default)]
    pub payee: Option<String>,
    #[serde(default)]
    pub memo: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default = "default_reconciled")]
    pub reconciled: bool,
    #[serde(default)]
    pub external_refs: Vec<(String, String)>,
    #[serde(default)]
    pub legs: Vec<Leg>,
    #[serde(default)]
    pub tx_type: Option<String>,
}

impl NewTransaction {
    pub fn into_transaction(self) -> Result<Transaction, String> {
        if self.id.trim().is_empty() {
            return Err("transaction id cannot be empty".to_string());
        }
        if self.legs.is_empty() {
            return Err(format!(
                "transaction '{}' must include at least one leg",
                self.id
            ));
        }

        let mut tx = Transaction {
            id: self.id,
            ts: self.ts,
            posted_ts: self.posted_ts,
            source: self.source,
            payee: self.payee,
            memo: self.memo,
            status: self.status,
            reconciled: self.reconciled,
            external_refs: self.external_refs,
            legs: self.legs,
            tx_type: self.tx_type,
            balance_state: BalanceState::Unknown,
        };
        tx.normalize();
        Ok(tx)
    }
}

#[derive(Debug, serde::Serialize)]
pub struct CreateTransactionResp {
    pub success: bool,
    pub transaction_id: String,
    pub message: String,
    pub balance_state: BalanceState,
}

pub async fn create_transaction(
    State(state): State<Arc<AppState>>,
    Json(req): Json<NewTransaction>,
) -> Result<Json<CreateTransactionResp>, String> {
    println!("=== create_transaction START ===");
    println!("Request: {:?}", req);

    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Transaction>("capital_ledger");

    let tx_id = req.id.clone();

    // Check if transaction already exists
    let existing = collection
        .find_one(doc! { "id": &tx_id }, None)
        .await
        .map_err(|e| format!("Database error: {}", e))?;
    if existing.is_some() {
        return Err(format!("Transaction with ID '{}' already exists", tx_id));
    }

    // Build the normalized transaction
    let transaction = req
        .into_transaction()
        .map_err(|err| format!("Validation error for '{}': {}", tx_id, err))?;

    if transaction.balance_state != BalanceState::Balanced {
        println!(
            "Warning: Transaction '{}' stored with balance_state={:?}",
            transaction.id, transaction.balance_state
        );
    }

    let tx_balance_state = transaction.balance_state;
    let stored_id = transaction.id.clone();

    // Insert into database
    match collection.insert_one(&transaction, None).await {
        Ok(_) => {
            println!("Transaction created successfully: {}", stored_id);
            Ok(Json(CreateTransactionResp {
                success: true,
                transaction_id: stored_id,
                message: "Transaction created successfully".to_string(),
                balance_state: tx_balance_state,
            }))
        }
        Err(e) => {
            println!("Failed to create transaction: {}", e);
            Err(format!("Database error: {}", e))
        }
    }
}

// ------------------------- Batch Import -------------------------

fn default_source() -> String {
    "assistant_extraction".to_string()
}

fn default_status() -> Option<String> {
    Some("imported".to_string())
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct FlatTransaction {
    pub txid: String,
    pub date: String,
    #[serde(default)]
    pub posted_ts: Option<i64>,
    #[serde(default = "default_source")]
    pub source: String,
    #[serde(default)]
    pub payee: Option<String>,
    #[serde(default)]
    pub memo: Option<String>,
    pub account_id: String,
    pub direction: String,
    pub kind: String,
    pub ccy_or_asset: String,
    pub amount_or_qty: f64,
    #[serde(default)]
    pub price: Option<f64>,
    #[serde(default)]
    pub price_ccy: Option<String>,
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default = "default_status")]
    pub status: Option<String>,
    #[serde(default)]
    pub tx_type: Option<String>,
    #[serde(default)]
    pub ext1_kind: Option<String>,
    #[serde(default)]
    pub ext1_val: Option<String>,
}

impl FlatTransaction {
    pub fn ensure_defaults(&mut self, debit_tx_type: Option<&str>, credit_tx_type: Option<&str>) {
        if self.source.trim().is_empty() {
            self.source = default_source();
        }

        if self.status.as_ref().is_some_and(|s| s.trim().is_empty()) {
            self.status = default_status();
        }

        if self.tx_type.as_ref().is_some_and(|s| s.trim().is_empty()) {
            self.tx_type = None;
        }

        if self.tx_type.is_none() {
            let fallback = match self.direction.to_ascii_lowercase().as_str() {
                "debit" => debit_tx_type,
                "credit" => credit_tx_type,
                _ => None,
            };
            if let Some(value) = fallback {
                self.tx_type = Some(value.to_string());
            }
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct BatchImportRequest {
    pub transactions: Vec<FlatTransaction>,
}

#[derive(Clone, Debug, Serialize)]
pub struct BatchImportResponse {
    imported: usize,
    skipped: usize,
    errors: Vec<String>,
}

pub async fn process_batch_import(
    db: &Database,
    transactions: Vec<FlatTransaction>,
) -> Result<BatchImportResponse, String> {
    use mongodb::bson::doc;
    use rust_decimal::Decimal;
    use rust_decimal::prelude::FromPrimitive;

    let collection = db.collection::<Transaction>("capital_ledger");

    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for itx in transactions {
        let txid = itx.txid.clone();
        // Skip if already exists
        if let Ok(Some(_existing)) = collection.find_one(doc! { "id": &txid }, None).await {
            skipped += 1;
            continue;
        }

        // Parse date (YYYY-MM-DD) -> unix ts (00:00:00 UTC)
        let ts = match chrono::NaiveDate::parse_from_str(&itx.date, "%Y-%m-%d") {
            Ok(d) => chrono::DateTime::<chrono::Utc>::from_utc(
                chrono::NaiveDateTime::new(d, chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap()),
                chrono::Utc,
            )
            .timestamp(),
            Err(e) => {
                errors.push(format!("{}: invalid date '{}': {}", txid, itx.date, e));
                skipped += 1;
                continue;
            }
        };

        // Build leg amount
        let amount_dec = match Decimal::from_f64(itx.amount_or_qty) {
            Some(v) => v,
            None => {
                errors.push(format!("{}: invalid amount {}", txid, itx.amount_or_qty));
                skipped += 1;
                continue;
            }
        };

        let leg_amount = if itx.kind.eq_ignore_ascii_case("fiat") {
            let ccy = match itx.ccy_or_asset.as_str() {
                "USD" => Currency::USD,
                "HKD" => Currency::HKD,
                "BTC" => Currency::BTC,
                other => {
                    errors.push(format!("{}: unsupported fiat ccy '{}'", txid, other));
                    skipped += 1;
                    continue;
                }
            };
            LegAmount::Fiat(Money::new(amount_dec, ccy))
        } else {
            // Minimal crypto support: qty = amount_or_qty, price ignored for now
            LegAmount::Crypto {
                asset: itx.ccy_or_asset.clone(),
                qty: amount_dec,
            }
        };

        let direction = match itx.direction.as_str() {
            "Debit" => LegDirection::Debit,
            "Credit" => LegDirection::Credit,
            other => {
                errors.push(format!("{}: invalid direction '{}'", txid, other));
                skipped += 1;
                continue;
            }
        };

        let leg = Leg {
            account_id: itx.account_id.clone(),
            direction,
            amount: leg_amount,
            fx: None,
            category_id: itx.category_id.clone(),
            fee_of_leg_idx: None,
            notes: None,
        };

        let mut external_refs: Vec<(String, String)> = Vec::new();
        if let (Some(k), Some(v)) = (itx.ext1_kind.clone(), itx.ext1_val.clone()) {
            external_refs.push((k, v));
        }

        let source = if itx.source.trim().is_empty() {
            default_source()
        } else {
            itx.source.clone()
        };

        let new_tx = NewTransaction {
            id: txid.clone(),
            ts,
            posted_ts: itx.posted_ts,
            source,
            payee: itx.payee.clone(),
            memo: itx.memo.clone(),
            status: itx.status.clone(),
            reconciled: false,
            external_refs,
            legs: vec![leg],
            tx_type: itx.tx_type.clone(),
        };

        let tx = match new_tx.into_transaction() {
            Ok(tx) => tx,
            Err(err) => {
                errors.push(format!("{}: {}", txid, err));
                skipped += 1;
                continue;
            }
        };

        if tx.balance_state != BalanceState::Balanced {
            println!(
                "Batch import: '{}' stored with balance_state={:?}",
                tx.id, tx.balance_state
            );
        }

        match collection.insert_one(&tx, None).await {
            Ok(_) => imported += 1,
            Err(e) => {
                errors.push(format!("{}: insert error: {}", txid, e));
                skipped += 1;
            }
        }
    }

    Ok(BatchImportResponse {
        imported,
        skipped,
        errors,
    })
}

/// POST /capital/transactions/batch-import
/// Accepts extracted flat transactions and inserts Transaction rows with a single P&L leg.
pub async fn batch_import_transactions(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BatchImportRequest>,
) -> Result<Json<BatchImportResponse>, String> {
    let db = state.mongo_client.database("wyat");
    let summary = process_batch_import(&db, req.transactions).await?;
    Ok(Json(summary))
}
