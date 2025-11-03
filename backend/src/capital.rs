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

use axum::http::StatusCode;
use axum::{
    Json,
    extract::{Path, Query, State},
};
use chrono::{DateTime, Utc};
use futures::stream::TryStreamExt;
use mongodb::bson::{Bson, Document as BsonDocument, doc, oid::ObjectId};
use mongodb::options::{FindOptions, UpdateOptions};
use mongodb::{Database, bson};
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use thiserror::Error;
use utoipa::ToSchema;

use crate::services::data_feeds::{DataFeed, DataFeedProvider, DataFeedService, DataSnapshot};

// Import storage functions and types
// TODO: Re-enable when implementing bank statement import
// use crate::services::openai::extract_bank_statement;

/// Virtual ledger account used to offset spending/income legs into P&L.
pub const PNL_ACCOUNT_ID: &str = "__pnl__";
/// Default envelope used when we cannot determine a more specific category.
pub const DEFAULT_ENVELOPE_ID: &str = "env_uncategorized";

// ------------------------- Money -------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub enum Currency {
    USD,
    HKD,
    BTC,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Money {
    #[schema(value_type = String)]
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

// ========================== //
// * * * * ENVELOPES. * * * * //
// ========================== //

#[derive(Clone, Copy, Debug, Serialize, Deserialize, ToSchema)]
pub enum EnvelopeStatus {
    Active,
    Inactive,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, ToSchema)]
pub enum EnvelopeKind {
    Fixed,
    Variable,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, ToSchema)]
pub enum FundingFreq {
    Monthly,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, ToSchema)]
pub struct FundingRule {
    pub amount: Money,
    pub freq: FundingFreq,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, ToSchema)]
pub enum DeficitPolicy {
    /// Next funding auto-nets the deficit first, then adds any remainder.
    AutoNet,
    /// Deficit persists until an explicit transfer/fund() occurs.
    RequireTransfer,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
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

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
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

// ========================= //
// * * * * ACCOUNTS. * * * * //
// ========================= //

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub currency: Currency,
    pub metadata: AccountMetadata,
    pub group_id: Option<String>,
    pub group_order: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub enum AccountNetwork {
    EVM { chain_name: String, chain_id: u64 },
    Solana,
    Bitcoin,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum AccountMetadata {
    // New format with explicit type/data structure
    Tagged {
        #[serde(rename = "type")]
        account_type: String,
        #[serde(default)]
        color: String,
        data: serde_json::Value,
    },
    // Legacy flat formats for backward compatibility
    Checking {
        bank_name: String,
        owner_name: String,
        account_number: String,
        #[serde(default)]
        routing_number: Option<String>,
        #[serde(default)]
        color: Option<String>,
        #[serde(default)]
        txid_prefix: Option<String>,
    },
    Savings {
        bank_name: String,
        owner_name: String,
        account_number: String,
        #[serde(default)]
        routing_number: Option<String>,
        #[serde(default)]
        color: Option<String>,
        #[serde(default)]
        txid_prefix: Option<String>,
    },
    Credit {
        credit_card_name: String,
        owner_name: String,
        account_number: String,
        #[serde(default)]
        routing_number: Option<String>,
        #[serde(default)]
        color: Option<String>,
        #[serde(default)]
        txid_prefix: Option<String>,
    },
    CryptoWallet {
        address: String,
        network: AccountNetwork,
        is_ledger: bool,
        #[serde(default)]
        color: Option<String>,
        #[serde(default)]
        txid_prefix: Option<String>,
    },
    Cex {
        cex_name: String,
        account_id: String,
        #[serde(default)]
        color: Option<String>,
        #[serde(default)]
        txid_prefix: Option<String>,
    },
    Trust {
        trustee: String,
        jurisdiction: String,
        #[serde(default)]
        color: Option<String>,
        #[serde(default)]
        txid_prefix: Option<String>,
    },
    BrokerageAccount {
        broker_name: String,
        owner_name: String,
        account_number: String,
        #[serde(default)]
        account_type: Option<String>, // e.g., "Individual", "IRA", "401k", "Roth IRA"
        #[serde(default)]
        color: Option<String>,
        #[serde(default)]
        txid_prefix: Option<String>,
    },
}

impl Account {
    #[allow(dead_code)]
    pub fn kind(&self) -> &'static str {
        match &self.metadata {
            AccountMetadata::Tagged { account_type, .. } => match account_type.as_str() {
                "Checking" => "Checking",
                "Savings" => "Savings",
                "Credit" => "Credit",
                "CryptoWallet" => "CryptoWallet",
                "Cex" => "Cex",
                "Trust" => "Trust",
                "BrokerageAccount" => "BrokerageAccount",
                _ => "Unknown",
            },
            AccountMetadata::Checking { .. } => "Checking",
            AccountMetadata::Savings { .. } => "Savings",
            AccountMetadata::Credit { .. } => "Credit",
            AccountMetadata::CryptoWallet { .. } => "CryptoWallet",
            AccountMetadata::Cex { .. } => "Cex",
            AccountMetadata::Trust { .. } => "Trust",
            AccountMetadata::BrokerageAccount { .. } => "BrokerageAccount",
        }
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct AccountBalanceQuery {
    // Choose ONE of: as_of OR (from & to) OR label
    pub as_of: Option<i64>,    // unix ts inclusive
    pub from: Option<i64>,     // unix ts inclusive
    pub to: Option<i64>,       // unix ts inclusive
    pub label: Option<String>, // cycle label "YYYY-MM"
}

#[derive(Serialize)]
pub struct AccountPointBalance {
    account_id: String,
    balance: Money,
    as_of: i64,
}

#[derive(Serialize)]
pub struct AccountRangeBalance {
    account_id: String,
    opening: Money,
    closing: Money,
    delta: Money,
    start_ts: i64,
    end_ts: i64,
    label: Option<String>,
}

pub async fn get_account_balance(
    State(state): State<Arc<AppState>>,
    Path(account_id): Path<String>,
    Query(q): Query<AccountBalanceQuery>,
) -> Result<Json<serde_json::Value>, String> {
    let db = state.mongo_client.database("wyat");
    let accounts = db.collection::<Account>("capital_accounts");

    // 1) Load account for currency
    let account = accounts
        .find_one(doc! { "id": &account_id }, None)
        .await
        .map_err(|e| format!("db error: {e}"))?
        .ok_or_else(|| "account not found".to_string())?;

    let ccy_str = match account.currency {
        Currency::USD => "USD",
        Currency::HKD => "HKD",
        Currency::BTC => "BTC",
    };

    // Helper: sum signed fiat legs for this account up to and including `as_of`
    async fn sum_as_of(
        db: &mongodb::Database,
        account_id: &str,
        ccy_str: &str,
        as_of: i64,
    ) -> Result<Decimal, String> {
        let ledger = db.collection::<mongodb::bson::Document>("capital_ledger");
        // Match by account, currency, and time <= as_of (posted_ts or ts)
        let pipeline = vec![
            doc! { "$unwind": "$legs" },
            doc! { "$match": {
              "legs.account_id": account_id,
              "legs.amount.kind": "Fiat",
              "legs.amount.data.ccy": ccy_str,
              "$expr": { "$lte": [ { "$ifNull": [ "$posted_ts", "$ts" ] }, as_of ] }
            }},
            doc! { "$project": {
              "signed": {
                "$cond": [
                  { "$eq": [ "$legs.direction", "Debit" ] },
                  { "$toDecimal": "$legs.amount.data.amount" },
                  { "$multiply": [ { "$toDecimal": "$legs.amount.data.amount" }, -1 ] }
                ]
              }
            }},
            doc! { "$group": { "_id": null, "sum": { "$sum": "$signed" } } },
        ];

        let mut cursor = ledger
            .aggregate(pipeline, None)
            .await
            .map_err(|e| format!("agg error: {e}"))?;
        let mut amt = Decimal::ZERO;
        if let Some(doc) = cursor
            .try_next()
            .await
            .map_err(|e| format!("cursor error: {e}"))?
        {
            if let Some(sum) = doc.get("sum") {
                amt = match sum {
                    Bson::Decimal128(d) => {
                        Decimal::from_str_exact(&d.to_string()).unwrap_or(Decimal::ZERO)
                    }
                    Bson::Double(f) => Decimal::try_from(*f).unwrap_or(Decimal::ZERO),
                    Bson::Int32(i) => Decimal::from(*i),
                    Bson::Int64(i) => Decimal::from(*i),
                    _ => Decimal::ZERO,
                };
            }
        }
        Ok(amt)
    }

    // 2) Resolve query intent: point vs range
    if let Some(label) = q.label.clone() {
        // Use cycle boundaries for this label
        let (start_ts, end_ts) = crate::capital::cycle_bounds_for_label(&label)
            .ok_or_else(|| format!("Invalid cycle label: {label}"))?;
        let opening_as_of = start_ts - 1;
        let closing_as_of = end_ts;

        let opening = sum_as_of(&db, &account_id, ccy_str, opening_as_of).await?;
        let closing = sum_as_of(&db, &account_id, ccy_str, closing_as_of).await?;
        let delta = closing - opening;

        return Ok(Json(serde_json::json!({
          "account_id": account_id,
          "opening": { "amount": opening, "ccy": account.currency },
          "closing": { "amount": closing, "ccy": account.currency },
          "delta":   { "amount": delta,   "ccy": account.currency },
          "start_ts": start_ts,
          "end_ts": end_ts,
          "label": label
        })));
    }

    if q.from.is_some() && q.to.is_some() {
        let start_ts = q.from.unwrap();
        let end_ts = q.to.unwrap();
        let opening_as_of = start_ts - 1;
        let closing_as_of = end_ts;

        let opening = sum_as_of(&db, &account_id, ccy_str, opening_as_of).await?;
        let closing = sum_as_of(&db, &account_id, ccy_str, closing_as_of).await?;
        let delta = closing - opening;

        return Ok(Json(serde_json::json!({
          "account_id": account_id,
          "opening": { "amount": opening, "ccy": account.currency },
          "closing": { "amount": closing, "ccy": account.currency },
          "delta":   { "amount": delta,   "ccy": account.currency },
          "start_ts": start_ts,
          "end_ts": end_ts
        })));
    }

    // Default: point-in-time balance (now or provided as_of)
    let as_of = q.as_of.unwrap_or_else(|| chrono::Utc::now().timestamp());
    let amount = sum_as_of(&db, &account_id, ccy_str, as_of).await?;
    Ok(Json(serde_json::json!({
      "account_id": account_id,
      "balance": { "amount": amount, "ccy": account.currency },
      "as_of": as_of
    })))
}

// ======================= //
// * * * * LEDGER. * * * * //
// ======================= //

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
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
#[derive(Clone, Copy, Debug, Serialize, Deserialize, ToSchema)]
pub struct FxSnapshot {
    pub to: Currency,  // currency to value in (e.g., USD or BTC)
    pub rate: Decimal, // price per 1 unit of the leg's native unit in `to`
}

/// Amount carried by a leg: either fiat (Money) or a crypto asset quantity.
#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
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

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct Leg {
    pub account_id: String,          // e.g., "acct.chase_credit" or "acct.binance"
    pub direction: LegDirection,     // Debit or Credit
    pub amount: LegAmount,           // Fiat or Crypto amount
    pub fx: Option<FxSnapshot>,      // Optional valuation snapshot
    pub category_id: Option<String>, // Optional envelope/category link (e.g., "env_transport")
    pub fee_of_leg_idx: Option<u32>, // If this is a fee tied to another leg (index within `legs`)
    pub notes: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
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

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
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

// ====================== //
// * * * * FUNDS. * * * * //
// ====================== //

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct Fund {
    #[serde(rename = "_id")]
    #[schema(value_type = String)]
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
    #[schema(value_type = Option<Object>)]
    pub balancing_policy: Option<mongodb::bson::Document>,
    #[serde(default)]
    pub multiplier_rules: Option<Vec<String>>,
    pub max_pct_networth: f64,
    pub max_pct_liquid: f64,
    pub liquid: bool,
    pub review_cadence: String,
    pub status: String,
    #[serde(default)]
    #[schema(value_type = Option<i64>)]
    pub created_at: Option<mongodb::bson::DateTime>,
    #[serde(default)]
    #[schema(value_type = Option<i64>)]
    pub updated_at: Option<mongodb::bson::DateTime>,
    pub fund_id: String,
}

#[derive(Clone, Debug, Serialize, ToSchema)]
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
    #[schema(value_type = Option<Object>)]
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

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct Position {
    pub fund_id: String,
    pub asset: String, // "BONK", "DOGE"
    pub qty: Decimal,
    pub price_in_base_ccy: Decimal,
    pub last_updated: i64, // Unix timestamp
}

/// --- Fund Positions API Response Types ---
// (legacy response types removed)

// ============================= //
// * * * * API HANDLERS. * * * * //
// ============================= //
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

#[derive(Serialize, ToSchema)]
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
#[utoipa::path(
    get,
    path = "/capital/envelopes",
    responses(
        (status = 200, description = "List of all envelopes", body = Vec<Envelope>)
    ),
    tag = "capital"
)]
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
#[utoipa::path(
    get,
    path = "/capital/funds",
    responses(
        (status = 200, description = "List of all funds", body = Vec<PublicFund>)
    ),
    tag = "capital"
)]
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

/// Helper function to get positions for a single fund
async fn get_positions_for_fund(state: &Arc<AppState>, fund_id: &str) -> Vec<Position> {
    use futures::stream::TryStreamExt;
    use mongodb::bson::{Bson, doc};

    let db = state.mongo_client.database("wyat");
    let ledger = db.collection::<mongodb::bson::Document>("capital_ledger");

    let pipeline = vec![
        doc! { "$unwind": "$legs" },
        doc! { "$match": {
            "legs.category_id": &fund_id
        }},
        doc! { "$addFields": {
            "signed_qty": { "$cond": [
                { "$eq": ["$legs.direction", "Debit"] },
                { "$cond": [
                    { "$eq": ["$legs.amount.kind", "Crypto"] },
                    { "$toDecimal": "$legs.amount.data.qty" },
                    { "$toDecimal": "$legs.amount.data.amount" }
                ]},
                { "$cond": [
                    { "$eq": ["$legs.amount.kind", "Crypto"] },
                    { "$multiply": [{ "$toDecimal": "$legs.amount.data.qty" }, -1] },
                    { "$multiply": [{ "$toDecimal": "$legs.amount.data.amount" }, -1] }
                ]}
            ]},
            "asset_name": { "$cond": [
                { "$eq": ["$legs.amount.kind", "Crypto"] },
                "$legs.amount.data.asset",
                "$legs.amount.data.ccy"
            ]}
        }},
        doc! { "$group": {
            "_id": "$asset_name",
            "qty": { "$sum": "$signed_qty" },
            "last_updated": { "$max": { "$ifNull": ["$posted_ts", "$ts"] } }
        }},
    ];

    let mut out: Vec<Position> = Vec::new();
    match ledger.aggregate(pipeline, None).await {
        Ok(mut cursor) => {
            while let Ok(Some(doc)) = cursor.try_next().await {
                let asset = doc.get_str("_id").unwrap_or("").to_string();

                // qty as Decimal
                let mut qty_dec = Decimal::ZERO;
                if let Some(qv) = doc.get("qty") {
                    qty_dec = match qv {
                        Bson::Decimal128(d) => {
                            Decimal::from_str_exact(&d.to_string()).unwrap_or(Decimal::ZERO)
                        }
                        Bson::Double(f) => Decimal::try_from(*f).unwrap_or(Decimal::ZERO),
                        Bson::Int32(i) => Decimal::from(*i),
                        Bson::Int64(i) => Decimal::from(*i),
                        _ => Decimal::ZERO,
                    };
                }

                // last_updated
                let last_updated = doc
                    .get_i64("last_updated")
                    .unwrap_or_else(|_| chrono::Utc::now().timestamp());

                out.push(Position {
                    fund_id: fund_id.to_string(),
                    asset,
                    qty: qty_dec,
                    // price unknown here; can be filled by valuation service later
                    price_in_base_ccy: Decimal::ZERO,
                    last_updated,
                });
            }
        }
        Err(e) => {
            eprintln!("Error aggregating fund positions for {}: {}", fund_id, e);
        }
    }

    out
}

/// GET /capital/funds/positions - Get positions for all funds
#[utoipa::path(
    get,
    path = "/capital/funds/positions",
    responses(
        (status = 200, description = "Positions grouped by fund", body = HashMap<String, Vec<Position>>)
    ),
    tag = "capital"
)]
pub async fn get_all_fund_positions(
    State(state): State<Arc<AppState>>,
) -> Json<std::collections::HashMap<String, Vec<Position>>> {
    use futures::stream::TryStreamExt;
    use std::collections::HashMap;

    let db = state.mongo_client.database("wyat");
    let funds_collection = db.collection::<Fund>("capital_funds");

    let mut result: HashMap<String, Vec<Position>> = HashMap::new();

    // Get all funds
    match funds_collection.find(None, None).await {
        Ok(cursor) => {
            let funds: Vec<Fund> = cursor.try_collect().await.unwrap_or_default();

            // For each fund, get its positions
            for fund in funds {
                let positions = get_positions_for_fund(&state, &fund.fund_id).await;
                result.insert(fund.fund_id, positions);
            }
        }
        Err(e) => {
            eprintln!("Error fetching funds: {}", e);
        }
    }

    Json(result)
}

/// GET /capital/funds/:fund_id/positions - Get positions for a specific fund
#[utoipa::path(
    get,
    path = "/capital/funds/{fund_id}/positions",
    params(
        ("fund_id" = String, Path, description = "Fund ID")
    ),
    responses(
        (status = 200, description = "Fund positions", body = Vec<Position>)
    ),
    tag = "capital"
)]
pub async fn get_fund_positions(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(fund_id): axum::extract::Path<String>,
) -> Json<Vec<Position>> {
    Json(get_positions_for_fund(&state, &fund_id).await)
}

/// GET /capital/funds/:fund_id/positions - Compute positions for a specific fund
///
/// Positions are derived from capital_ledger transactions filtered by transaction-level `fund_id`.
/// For v1, this endpoint returns net quantities per asset (fiat currencies and crypto assets).
/// Valuation and pricing are intentionally omitted for now.
// (duplicate get_fund_positions removed in favor of category-based aggregator above)

/// GET /capital/accounts - Fetch all accounts from MongoDB
#[utoipa::path(
    get,
    path = "/capital/accounts",
    responses(
        (status = 200, description = "List of all accounts", body = Vec<Account>)
    ),
    tag = "capital"
)]
pub async fn get_all_accounts(State(state): State<Arc<AppState>>) -> Json<Vec<Account>> {
    println!("=== GET_ALL_ACCOUNTS START ===");
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Account>("capital_accounts");

    use futures::stream::TryStreamExt;

    match collection.find(None, None).await {
        Ok(cursor) => match cursor.try_collect::<Vec<Account>>().await {
            Ok(accounts) => {
                println!("Successfully fetched {} accounts", accounts.len());
                for account in &accounts {
                    println!("  Account: id={}, name={}", account.id, account.name);
                }
                println!("=== GET_ALL_ACCOUNTS END ===");
                Json(accounts)
            }
            Err(e) => {
                eprintln!("Error collecting accounts: {}", e);
                println!("=== GET_ALL_ACCOUNTS ERROR ===");
                Json(Vec::new())
            }
        },
        Err(e) => {
            eprintln!("Error fetching accounts: {}", e);
            println!("=== GET_ALL_ACCOUNTS ERROR ===");
            Json(Vec::new())
        }
    }
}

/// POST /capital/accounts - Create a new account
#[utoipa::path(
    post,
    path = "/capital/accounts",
    request_body = Account,
    responses(
        (status = 200, description = "Account created successfully", body = Account)
    ),
    tag = "capital"
)]
pub async fn create_account(
    State(state): State<Arc<AppState>>,
    Json(account): Json<Account>,
) -> Result<Json<Account>, String> {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Account>("capital_accounts");

    use mongodb::bson::doc;

    // Validate account ID is not empty
    if account.id.trim().is_empty() {
        return Err("Account ID cannot be empty".to_string());
    }

    // Validate account name is not empty
    if account.name.trim().is_empty() {
        return Err("Account name cannot be empty".to_string());
    }

    // Check if account already exists
    let existing = collection
        .find_one(doc! { "id": &account.id }, None)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    if existing.is_some() {
        return Err(format!("Account with ID '{}' already exists", account.id));
    }

    // Insert the new account
    collection
        .insert_one(&account, None)
        .await
        .map_err(|e| format!("Failed to create account: {}", e))?;

    Ok(Json(account))
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

#[utoipa::path(
    get,
    path = "/capital/transactions",
    params(
        ("account_id" = Option<String>, Query, description = "Filter by account ID"),
        ("envelope_id" = Option<String>, Query, description = "Filter by envelope/category ID"),
        ("label" = Option<String>, Query, description = "Filter by cycle label (e.g., '2025-10')"),
        ("from" = Option<i64>, Query, description = "Unix timestamp for start of time range"),
        ("to" = Option<i64>, Query, description = "Unix timestamp for end of time range"),
        ("tx_type" = Option<String>, Query, description = "Filter by transaction type")
    ),
    responses(
        (status = 200, description = "List of transactions", body = Vec<Transaction>)
    ),
    tag = "capital"
)]
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

/// GET /capital/transactions/:transaction_id - Get a single transaction by ID
///
#[utoipa::path(
    get,
    path = "/capital/transactions/{transaction_id}",
    params(
        ("transaction_id" = String, Path, description = "Transaction ID")
    ),
    responses(
        (status = 200, description = "Transaction details", body = Transaction),
        (status = 404, description = "Transaction not found")
    ),
    tag = "capital"
)]
pub async fn get_transaction_by_id(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(transaction_id): axum::extract::Path<String>,
) -> Result<Json<Transaction>, String> {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Transaction>("capital_ledger");

    use mongodb::bson::doc;

    let filter = doc! { "id": &transaction_id };

    match collection.find_one(filter, None).await {
        Ok(Some(transaction)) => Ok(Json(transaction)),
        Ok(None) => Err(format!("Transaction not found: {}", transaction_id)),
        Err(e) => {
            eprintln!("Error fetching transaction {}: {}", transaction_id, e);
            Err(format!("Database error: {}", e))
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

/// PATCH /capital/transactions/{transaction_id}/legs - Edit transaction legs
///
/// Updates the legs array of a transaction, including direction, amount, memo, payee.
///
/// Body: {
///   "legs": [...],  // full array of legs to replace
///   "payee": "...",  // optional: update payee
///   "memo": "..."    // optional: update memo
/// }
#[derive(Debug, Deserialize)]
pub struct UpdateTransactionLegsRequest {
    pub legs: Vec<Leg>,
    pub payee: Option<String>,
    pub memo: Option<String>,
}

pub async fn update_transaction_legs(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(transaction_id): axum::extract::Path<String>,
    Json(request): Json<UpdateTransactionLegsRequest>,
) -> Result<Json<serde_json::Value>, String> {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Transaction>("capital_ledger");

    use mongodb::bson::doc;

    if request.legs.is_empty() {
        return Err("Transaction must have at least one leg".to_string());
    }

    let filter = doc! { "id": &transaction_id };

    // Build update document
    let mut update_fields = doc! {
        "legs": bson::to_bson(&request.legs)
            .map_err(|e| format!("Failed to serialize legs: {}", e))?
    };

    if let Some(payee) = &request.payee {
        update_fields.insert("payee", payee);
    }
    if let Some(memo) = &request.memo {
        update_fields.insert("memo", memo);
    }

    let update = doc! { "$set": update_fields };

    match collection.update_one(filter, update, None).await {
        Ok(result) => {
            if result.modified_count == 1 || result.matched_count == 1 {
                Ok(Json(serde_json::json!({
                    "success": true,
                    "message": "Transaction legs updated successfully",
                    "transaction_id": transaction_id
                })))
            } else {
                Err(format!("Transaction not found: {}", transaction_id))
            }
        }
        Err(e) => Err(format!("Database update error: {}", e)),
    }
}

/// POST /capital/transactions/{transaction_id}/balance - Balance and reconcile a transaction
///
/// Attempts to balance a transaction by:
/// 1. Checking that credit and debit legs sum to zero (in USD)
/// 2. Verifying that __pnl__ leg (if present) has a category_id
/// 3. If checks pass, sets balance_state to "Balanced" and reconciled to true
///
/// Returns success or error message with details
pub async fn balance_transaction(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(transaction_id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, String> {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Transaction>("capital_ledger");

    use mongodb::bson::doc;

    // Fetch the transaction
    let filter = doc! { "id": &transaction_id };
    let mut transaction = match collection.find_one(filter.clone(), None).await {
        Ok(Some(tx)) => tx,
        Ok(None) => return Err(format!("Transaction not found: {}", transaction_id)),
        Err(e) => return Err(format!("Database query error: {}", e)),
    };

    // Check if already balanced
    if transaction.balance_state == BalanceState::Balanced {
        return Ok(Json(serde_json::json!({
            "success": true,
            "message": "Transaction is already balanced",
            "transaction_id": transaction_id
        })));
    }

    // Check 1: Verify legs sum to zero in USD
    let (is_balanced, net) = transaction.is_balanced_in(Currency::USD);
    if !is_balanced {
        return Err(format!(
            "Transaction does not balance: net amount is {} {}",
            net.amount,
            match net.ccy {
                Currency::USD => "USD",
                Currency::HKD => "HKD",
                Currency::BTC => "BTC",
            }
        ));
    }

    // Check 2: Verify __pnl__ leg has category_id
    let pnl_leg = transaction
        .legs
        .iter()
        .find(|leg| leg.account_id == PNL_ACCOUNT_ID);
    if let Some(leg) = pnl_leg {
        if leg.category_id.is_none() {
            return Err("__pnl__ leg must have a category_id (envelope)".to_string());
        }
    }

    // All checks passed - update balance_state and reconciled
    transaction.balance_state = BalanceState::Balanced;
    transaction.reconciled = true;

    let update = doc! {
        "$set": {
            "balance_state": bson::to_bson(&BalanceState::Balanced)
                .map_err(|e| format!("Failed to serialize balance_state: {}", e))?,
            "reconciled": true
        }
    };

    match collection.update_one(filter, update, None).await {
        Ok(_) => Ok(Json(serde_json::json!({
            "success": true,
            "message": "Transaction balanced and reconciled successfully",
            "transaction_id": transaction_id,
            "balance_state": "Balanced"
        }))),
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
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
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

// ======================= //
// * * * * DATA FEEDS * * * //
// ======================= //

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum WatchlistAssetKind {
    Stock,
    Crypto,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct WatchlistEntry {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<String>)]
    pub id: Option<ObjectId>,
    pub symbol: String,
    pub name: String,
    pub kind: WatchlistAssetKind,
    pub feed_symbol: String,
    pub pair: Option<String>,
    pub unit: Option<String>,
    #[schema(value_type = i64)]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct AddWatchlistAssetRequest {
    pub symbol: String,
    pub name: String,
    pub kind: WatchlistAssetKind,
    pub pair: Option<String>,
    pub unit: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct UpdateWatchlistAssetRequest {
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct WatchlistAssetResponse {
    pub symbol: String,
    pub name: String,
    pub kind: WatchlistAssetKind,
    pub pair: Option<String>,
    pub unit: Option<String>,
    pub source: Option<String>,
    pub latest_value: Option<f64>,
    pub latest_value_text: Option<String>,
    pub change_24h_pct: Option<f64>,
    #[schema(value_type = Option<i64>)]
    pub last_updated: Option<DateTime<Utc>>,
}

fn provider_for_kind(kind: &WatchlistAssetKind) -> DataFeedProvider {
    match kind {
        WatchlistAssetKind::Stock => DataFeedProvider::YahooFinance,
        WatchlistAssetKind::Crypto => DataFeedProvider::Coingecko,
    }
}

fn categories_for_kind(kind: &WatchlistAssetKind) -> Vec<String> {
    match kind {
        WatchlistAssetKind::Stock => vec!["stock".to_string(), "price".to_string()],
        WatchlistAssetKind::Crypto => vec!["crypto".to_string(), "price".to_string()],
    }
}

fn normalize_symbol(kind: &WatchlistAssetKind, symbol: &str) -> String {
    let trimmed = symbol.trim();
    match kind {
        WatchlistAssetKind::Stock => trimmed.to_uppercase(),
        WatchlistAssetKind::Crypto => trimmed.to_lowercase(),
    }
}

fn metadata_from_pair_unit(pair: &Option<String>, unit: &Option<String>) -> Option<BsonDocument> {
    let mut doc = BsonDocument::new();
    if let Some(pair_val) = pair {
        if !pair_val.is_empty() {
            doc.insert("pair", pair_val.clone());
        }
    }
    if let Some(unit_val) = unit {
        if !unit_val.is_empty() {
            doc.insert("unit", unit_val.clone());
        }
    }
    if doc.is_empty() { None } else { Some(doc) }
}

fn build_watchlist_response(
    entry: &WatchlistEntry,
    feed: &DataFeed,
    snapshot: Option<&DataSnapshot>,
) -> WatchlistAssetResponse {
    let mut latest_value = None;
    let mut latest_text = None;
    let mut last_updated = None;
    let mut unit = entry.unit.clone();
    let mut change_24h_pct = None;

    if let Some(snapshot) = snapshot {
        if let Some(data) = snapshot.data.first() {
            latest_value = data.value.to_f64();
            latest_text = Some(data.value.normalize().to_string());
            if let Some(snapshot_unit) = &data.unit {
                unit = Some(snapshot_unit.clone());
            }
            last_updated = snapshot.source_time.or(Some(snapshot.fetch_time));

            // Extract 24h change from metadata
            if let Some(metadata) = &data.metadata {
                change_24h_pct = metadata.get("change_24h_pct").and_then(|v| v.as_f64());
            }
        }
    }

    WatchlistAssetResponse {
        symbol: entry.symbol.clone(),
        name: entry.name.clone(),
        kind: entry.kind.clone(),
        pair: entry.pair.clone(),
        unit,
        source: feed.source.publisher.clone(),
        latest_value,
        latest_value_text: latest_text,
        change_24h_pct,
        last_updated,
    }
}

#[utoipa::path(
    get,
    path = "/capital/data/watchlist",
    responses((status = 200, description = "Current watchlist with latest prices", body = [WatchlistAssetResponse])),
    tag = "capital"
)]
pub async fn get_watchlist_data(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<WatchlistAssetResponse>>, String> {
    let service = DataFeedService::new().map_err(|e| e.to_string())?;
    let db = state.mongo_client.database("wyat");

    let watchlist = db.collection::<WatchlistEntry>("capital_watchlist");
    let mut cursor = watchlist
        .find(
            None,
            FindOptions::builder()
                .sort(doc! { "created_at": 1 })
                .build(),
        )
        .await
        .map_err(|e| format!("Database error: {e}"))?;

    let feeds = db.collection::<DataFeed>("capital_data_feeds");
    let mut responses = Vec::new();

    while let Some(entry) = cursor
        .try_next()
        .await
        .map_err(|e| format!("Database error: {e}"))?
    {
        let provider = provider_for_kind(&entry.kind);
        let metadata = metadata_from_pair_unit(&entry.pair, &entry.unit);
        let mut feed = match feeds
            .find_one(doc! { "symbol": &entry.feed_symbol }, None)
            .await
            .map_err(|e| format!("Database error: {e}"))?
        {
            Some(existing) => existing,
            None => DataFeed {
                name: entry.name.clone(),
                symbol: entry.feed_symbol.clone(),
                categories: categories_for_kind(&entry.kind),
                source: service.source_for(&provider, &entry.feed_symbol),
                last_fetch: None,
                metadata: metadata.clone(),
            },
        };

        feed.name = entry.name.clone();
        feed.categories = categories_for_kind(&entry.kind);
        feed.source = service.source_for(&provider, &entry.feed_symbol);
        feed.metadata = metadata.clone();

        let mut snapshot_opt: Option<DataSnapshot> = None;
        let mut refreshed = false;

        if service.needs_refresh(&feed) {
            match service
                .fetch_and_store_snapshot(&db, &mut feed, entry.pair.clone(), entry.unit.clone())
                .await
            {
                Ok(snapshot) => {
                    refreshed = true;
                    snapshot_opt = Some(snapshot);
                }
                Err(err) => {
                    eprintln!("Failed to refresh feed {}: {}", feed.symbol, err);
                }
            }
        }

        if !refreshed {
            let feed_doc =
                bson::to_document(&feed).map_err(|e| format!("Serialization error: {e}"))?;
            feeds
                .update_one(
                    doc! { "symbol": &feed.symbol },
                    doc! { "$set": feed_doc },
                    UpdateOptions::builder().upsert(true).build(),
                )
                .await
                .map_err(|e| format!("Database error: {e}"))?;
        }

        if snapshot_opt.is_none() {
            snapshot_opt = service
                .get_latest_snapshot(&db, &feed.symbol)
                .await
                .map_err(|e| format!("Database error: {e}"))?;
        }

        responses.push(build_watchlist_response(
            &entry,
            &feed,
            snapshot_opt.as_ref(),
        ));
    }

    Ok(Json(responses))
}

#[utoipa::path(
    post,
    path = "/capital/data/watchlist",
    request_body = AddWatchlistAssetRequest,
    responses((status = 200, description = "Asset added to watchlist", body = WatchlistAssetResponse)),
    tag = "capital"
)]
pub async fn add_watchlist_asset(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AddWatchlistAssetRequest>,
) -> Result<Json<WatchlistAssetResponse>, String> {
    println!("=== ADD WATCHLIST ASSET START ===");
    println!(
        "Request: symbol={}, name={}, kind={:?}, pair={:?}, unit={:?}",
        req.symbol, req.name, req.kind, req.pair, req.unit
    );

    if req.symbol.trim().is_empty() {
        eprintln!("❌ Symbol is empty");
        return Err("Symbol is required".to_string());
    }
    if req.name.trim().is_empty() {
        eprintln!("❌ Name is empty");
        return Err("Name is required".to_string());
    }

    println!("Creating DataFeedService...");
    let service = DataFeedService::new().map_err(|e| {
        eprintln!("❌ Failed to create DataFeedService: {}", e);
        e.to_string()
    })?;

    let db = state.mongo_client.database("wyat");
    let watchlist = db.collection::<WatchlistEntry>("capital_watchlist");
    let feeds = db.collection::<DataFeed>("capital_data_feeds");

    let normalized_symbol = normalize_symbol(&req.kind, &req.symbol);
    println!("Normalized symbol: {} -> {}", req.symbol, normalized_symbol);

    println!("Checking if asset already exists in watchlist...");
    if watchlist
        .find_one(doc! { "symbol": &normalized_symbol }, None)
        .await
        .map_err(|e| {
            eprintln!("❌ Database error checking watchlist: {}", e);
            format!("Database error: {e}")
        })?
        .is_some()
    {
        eprintln!("❌ Asset '{}' already on watchlist", normalized_symbol);
        return Err(format!(
            "Asset '{}' is already on the watchlist",
            normalized_symbol
        ));
    }
    println!("✅ Asset not in watchlist, proceeding...");

    let provider = provider_for_kind(&req.kind);
    println!("Provider: {:?}", provider);

    let pair = req.pair.as_ref().and_then(|p| {
        let trimmed = p.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });
    let unit = req.unit.as_ref().and_then(|u| {
        let trimmed = u.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_uppercase())
        }
    });
    println!("Processed pair: {:?}, unit: {:?}", pair, unit);

    let metadata = metadata_from_pair_unit(&pair, &unit);

    println!("Checking for existing feed...");
    let mut feed = match feeds
        .find_one(doc! { "symbol": &normalized_symbol }, None)
        .await
        .map_err(|e| {
            eprintln!("❌ Database error checking feeds: {}", e);
            format!("Database error: {e}")
        })? {
        Some(existing) => {
            println!("Found existing feed for {}", normalized_symbol);
            existing
        }
        None => {
            println!("Creating new feed for {}", normalized_symbol);
            DataFeed {
                name: req.name.trim().to_string(),
                symbol: normalized_symbol.clone(),
                categories: categories_for_kind(&req.kind),
                source: service.source_for(&provider, &normalized_symbol),
                last_fetch: None,
                metadata: metadata.clone(),
            }
        }
    };

    println!("Updating feed metadata...");
    feed.name = req.name.trim().to_string();
    feed.categories = categories_for_kind(&req.kind);
    feed.source = service.source_for(&provider, &normalized_symbol);
    feed.metadata = metadata.clone();

    println!("Fetching latest price snapshot...");
    let snapshot = service
        .fetch_and_store_snapshot(&db, &mut feed, pair.clone(), unit.clone())
        .await
        .map_err(|e| {
            eprintln!("❌ Failed to fetch snapshot: {}", e);
            format!("Failed to fetch latest data: {e}")
        })?;
    println!("✅ Successfully fetched snapshot");

    println!("Creating watchlist entry...");
    let entry = WatchlistEntry {
        id: None,
        symbol: normalized_symbol.clone(),
        name: req.name.trim().to_string(),
        kind: req.kind.clone(),
        feed_symbol: normalized_symbol.clone(),
        pair: pair.clone(),
        unit: unit.clone(),
        created_at: Utc::now(),
    };

    println!("Inserting entry into watchlist collection...");
    watchlist.insert_one(&entry, None).await.map_err(|e| {
        eprintln!("❌ Failed to insert watchlist entry: {}", e);
        format!("Database error: {e}")
    })?;
    println!("✅ Successfully inserted watchlist entry");

    println!("Building response...");
    let response = build_watchlist_response(&entry, &feed, Some(&snapshot));
    println!("✅ Successfully added {} to watchlist", normalized_symbol);
    println!("=== ADD WATCHLIST ASSET END ===");

    Ok(Json(response))
}

#[utoipa::path(
    delete,
    path = "/capital/data/watchlist/{symbol}",
    params(("symbol" = String, Path, description = "Symbol to remove")),
    responses(
        (status = 204, description = "Asset removed from watchlist"),
        (status = 404, description = "Asset not found"),
    ),
    tag = "capital"
)]
pub async fn remove_watchlist_asset(
    State(state): State<Arc<AppState>>,
    Path(symbol): Path<String>,
) -> Result<StatusCode, String> {
    let db = state.mongo_client.database("wyat");
    let watchlist = db.collection::<WatchlistEntry>("capital_watchlist");
    let trimmed = symbol.trim();

    let mut candidates = vec![trimmed.to_string()];
    let upper = trimmed.to_uppercase();
    if !candidates.contains(&upper) {
        candidates.push(upper);
    }
    let lower = trimmed.to_lowercase();
    if !candidates.contains(&lower) {
        candidates.push(lower);
    }

    for candidate in candidates {
        let result = watchlist
            .delete_one(doc! { "symbol": &candidate }, None)
            .await
            .map_err(|e| format!("Database error: {e}"))?;

        if result.deleted_count > 0 {
            return Ok(StatusCode::NO_CONTENT);
        }
    }

    Ok(StatusCode::NOT_FOUND)
}

#[utoipa::path(
    patch,
    path = "/capital/data/watchlist/{symbol}",
    params(("symbol" = String, Path, description = "Symbol to update")),
    request_body = UpdateWatchlistAssetRequest,
    responses(
        (status = 200, description = "Asset name updated", body = WatchlistAssetResponse),
        (status = 404, description = "Asset not found")
    ),
    tag = "capital"
)]
pub async fn update_watchlist_asset(
    State(state): State<Arc<AppState>>,
    Path(symbol): Path<String>,
    Json(req): Json<UpdateWatchlistAssetRequest>,
) -> Result<Json<WatchlistAssetResponse>, String> {
    println!("=== UPDATE WATCHLIST ASSET START ===");
    println!("Symbol: {}, New name: {}", symbol, req.name);

    if req.name.trim().is_empty() {
        eprintln!("❌ Name is empty");
        return Err("Name is required".to_string());
    }

    let db = state.mongo_client.database("wyat");
    let watchlist = db.collection::<WatchlistEntry>("capital_watchlist");
    let feeds = db.collection::<DataFeed>("capital_data_feeds");
    let trimmed = symbol.trim();

    // Try different case variations
    let mut candidates = vec![trimmed.to_string()];
    let upper = trimmed.to_uppercase();
    if !candidates.contains(&upper) {
        candidates.push(upper);
    }
    let lower = trimmed.to_lowercase();
    if !candidates.contains(&lower) {
        candidates.push(lower);
    }

    println!("Searching for symbol in: {:?}", candidates);

    // Find the watchlist entry
    let mut found_entry: Option<WatchlistEntry> = None;
    for candidate in &candidates {
        if let Some(entry) = watchlist
            .find_one(doc! { "symbol": candidate }, None)
            .await
            .map_err(|e| format!("Database error: {e}"))?
        {
            found_entry = Some(entry);
            break;
        }
    }

    let entry = found_entry.ok_or_else(|| {
        eprintln!("❌ Asset '{}' not found in watchlist", trimmed);
        format!("Asset '{}' not found in watchlist", trimmed)
    })?;

    println!("Found entry with symbol: {}", entry.symbol);

    // Update watchlist entry name
    watchlist
        .update_one(
            doc! { "symbol": &entry.symbol },
            doc! { "$set": { "name": req.name.trim() } },
            None,
        )
        .await
        .map_err(|e| {
            eprintln!("❌ Failed to update watchlist entry: {}", e);
            format!("Database error: {e}")
        })?;

    println!("✅ Updated watchlist entry");

    // Update data feed name
    feeds
        .update_one(
            doc! { "symbol": &entry.symbol },
            doc! { "$set": { "name": req.name.trim() } },
            None,
        )
        .await
        .map_err(|e| {
            eprintln!("❌ Failed to update data feed: {}", e);
            format!("Database error: {e}")
        })?;

    println!("✅ Updated data feed");

    // Fetch the updated entry
    let updated_entry = watchlist
        .find_one(doc! { "symbol": &entry.symbol }, None)
        .await
        .map_err(|e| format!("Database error: {e}"))?
        .ok_or_else(|| "Entry disappeared after update".to_string())?;

    // Fetch the feed and latest snapshot for response
    let feed = feeds
        .find_one(doc! { "symbol": &entry.symbol }, None)
        .await
        .map_err(|e| format!("Database error: {e}"))?
        .ok_or_else(|| "Feed not found".to_string())?;

    let service = DataFeedService::new().map_err(|e| e.to_string())?;
    let snapshot_opt = service
        .get_latest_snapshot(&db, &entry.symbol)
        .await
        .map_err(|e| format!("Database error: {e}"))?;

    let response = build_watchlist_response(&updated_entry, &feed, snapshot_opt.as_ref());

    println!("✅ Successfully updated {} to '{}'", entry.symbol, req.name);
    println!("=== UPDATE WATCHLIST ASSET END ===");

    Ok(Json(response))
}
