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
use rust_decimal::prelude::FromPrimitive;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;

// ------------------------- Money -------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Currency {
    USD,
    HKD,
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
pub enum AccountKind {
    Checking,
    Savings,
    Credit, // for statement parsing; envelope spend still debits logical budgets
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub kind: AccountKind,
    pub currency: Currency,
}

// ------------------------- Bucket -------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Bucket {
    pub name: String,
    pub envelopes: HashMap<String, Envelope>, // key = envelope id
    pub accounts: HashMap<String, Account>,   // optional mapping to real rails
}

impl Bucket {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            envelopes: HashMap::new(),
            accounts: HashMap::new(),
        }
    }

    pub fn add_envelope(&mut self, env: Envelope) {
        self.envelopes.insert(env.id.clone(), env);
    }

    pub fn add_account(&mut self, acct: Account) {
        self.accounts.insert(acct.id.clone(), acct);
    }

    /// Apply month-open processing to all envelopes (rollover + funding).
    pub fn start_month(&mut self, year: i32, month: u32) {
        for env in self.envelopes.values_mut() {
            env.start_new_period(year, month);
        }
    }

    /// Spend from a specific envelope id.
    pub fn spend(&mut self, envelope_id: &str, amt: Money) -> Result<(), CapitalError> {
        let env = self
            .envelopes
            .get_mut(envelope_id)
            .ok_or_else(|| CapitalError::EnvelopeNotFound(envelope_id.to_string()))?;

        if matches!(env.status, EnvelopeStatus::Inactive) {
            return Err(CapitalError::InactiveEnvelope(envelope_id.to_string()));
        }
        env.debit(amt)
    }

    /// Credit/top-up an envelope.
    pub fn fund(&mut self, envelope_id: &str, amt: Money) -> Result<(), CapitalError> {
        let env = self
            .envelopes
            .get_mut(envelope_id)
            .ok_or_else(|| CapitalError::EnvelopeNotFound(envelope_id.to_string()))?;
        env.credit(amt)
    }

    /// Human-readable summary for UI/debug.
    pub fn summary(&self) -> Vec<(String, Money)> {
        let mut rows: Vec<(String, Money)> = self
            .envelopes
            .values()
            .map(|e| (e.name.clone(), e.balance))
            .collect();
        rows.sort_by(|a, b| a.0.cmp(&b.0));
        rows
    }
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
pub fn family_bucket_example() -> Bucket {
    use Currency::*;
    use EnvelopeKind::*;
    use EnvelopeStatus::*;
    use RolloverPolicy::*;

    let mut b = Bucket::new("Family");

    // USD envelopes
    let w_pocket = Envelope {
        id: "env.w_pocket".into(),
        name: "W Pocket Money".into(),
        kind: Variable,
        status: Active,
        funding: Some(FundingRule {
            amount: Money::new(Decimal::from(1800), USD),
            freq: FundingFreq::Monthly,
        }),
        rollover: CarryOver { cap: None },
        balance: Money::zero(USD),
        period_limit: None,
        last_period: None,
        allow_negative: false,
        min_balance: None,
        deficit_policy: None,
    };

    let a_pocket = Envelope {
        id: "env.a_pocket".into(),
        name: "A Pocket Money".into(),
        kind: Variable,
        status: Active,
        funding: Some(FundingRule {
            amount: Money::new(Decimal::from(1800), USD),
            freq: FundingFreq::Monthly,
        }),
        rollover: CarryOver { cap: None },
        balance: Money::zero(USD),
        period_limit: None,
        last_period: None,
        allow_negative: false,
        min_balance: None,
        deficit_policy: None,
    };

    let groceries = Envelope {
        id: "env.groceries".into(),
        name: "Groceries".into(),
        kind: Variable,
        status: Active,
        funding: Some(FundingRule {
            amount: Money::new(Decimal::from(1000), USD),
            freq: FundingFreq::Monthly,
        }),
        rollover: ResetToZero,
        balance: Money::zero(USD),
        period_limit: Some(Money::new(Decimal::from(1000), USD)),
        last_period: None,
        allow_negative: true,
        min_balance: Some(Decimal::from_i64(-150).unwrap()),
        deficit_policy: Some(DeficitPolicy::AutoNet),
    };

    let transport = Envelope {
        id: "env.transport".into(),
        name: "Transport".into(),
        kind: Variable,
        status: Active,
        funding: Some(FundingRule {
            amount: Money::new(Decimal::from(500), USD),
            freq: FundingFreq::Monthly,
        }),
        rollover: ResetToZero,
        balance: Money::zero(USD),
        period_limit: Some(Money::new(Decimal::from(500), USD)),
        last_period: None,
        allow_negative: true,
        min_balance: Some(Decimal::from_i64(-150).unwrap()),
        deficit_policy: Some(DeficitPolicy::AutoNet),
    };

    let extras = Envelope {
        id: "env.extras".into(),
        name: "Extras".into(),
        kind: Variable,
        status: Active,
        funding: None,
        rollover: CarryOver {
            cap: Some(Money::new(Decimal::from(3000), USD)),
        },
        balance: Money::zero(USD),
        period_limit: None,
        last_period: None,
        allow_negative: false,
        min_balance: None,
        deficit_policy: None,
    };

    let rent = Envelope {
        id: "env.rent".into(),
        name: "Rent".into(),
        kind: Fixed,
        status: Inactive, // activate when lease starts; funding below will kick in
        funding: Some(FundingRule {
            amount: Money::new(Decimal::from(4500), USD),
            freq: FundingFreq::Monthly,
        }),
        rollover: ResetToZero,
        balance: Money::zero(USD),
        period_limit: Some(Money::new(Decimal::from(4500), USD)),
        last_period: None,
        allow_negative: false,
        min_balance: None,
        deficit_policy: None,
    };

    // HKD sinking funds (modeled here for structure; adjust caps/amounts to real HKD values)
    let flights = Envelope {
        id: "env.flights".into(),
        name: "Flights (HKD)".into(),
        kind: Variable,
        status: Active,
        funding: Some(FundingRule {
            amount: Money::new(Decimal::from(1500), USD),
            freq: FundingFreq::Monthly,
        }), // placeholder USD until FX module
        rollover: SinkingFund {
            cap: Some(Money::new(Decimal::from(10000), USD)),
        }, // placeholder USD
        balance: Money::zero(USD),
        period_limit: None,
        last_period: None,
        allow_negative: false,
        min_balance: None,
        deficit_policy: None,
    };

    let family = Envelope {
        id: "env.family".into(),
        name: "Family (HKD)".into(),
        kind: Variable,
        status: Active,
        funding: Some(FundingRule {
            amount: Money::new(Decimal::from(1000), USD),
            freq: FundingFreq::Monthly,
        }), // placeholder USD
        rollover: SinkingFund {
            cap: Some(Money::new(Decimal::from(12000), USD)),
        }, // placeholder USD
        balance: Money::zero(USD),
        period_limit: None,
        last_period: None,
        allow_negative: false,
        min_balance: None,
        deficit_policy: None,
    };

    for e in [
        w_pocket, a_pocket, groceries, transport, extras, rent, flights, family,
    ] {
        b.add_envelope(e);
    }

    b
}

// ------------------------- API Handlers -------------------------

use crate::journal::AppState;

/// GET /capital/envelopes - Fetch all envelopes from MongoDB
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

// ------------------------- Tests -------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use Currency::*;

    #[test]
    fn month_rollover_and_funding() {
        let mut b = family_bucket_example();
        b.start_month(2025, 10);

        let g = b.envelopes.get("env.groceries").unwrap();
        assert_eq!(g.balance, Money::new(Decimal::from(1000), USD));

        let t = b.envelopes.get("env.transport").unwrap();
        assert_eq!(t.balance, Money::new(Decimal::from(500), USD));

        let w = b.envelopes.get("env.w_pocket").unwrap();
        assert_eq!(w.balance, Money::new(Decimal::from(1800), USD));

        // Spend from groceries, ensure ResetToZero behavior with deficits allowed:
        // overspend to a small negative, then next month should carry the negative and auto-net.
        let _ = b
            .spend("env.groceries", Money::new(Decimal::from(1100), USD))
            .unwrap(); // -> -100
        let g_after = b.envelopes.get("env.groceries").unwrap();
        assert_eq!(
            g_after.balance,
            Money::new(Decimal::from_i64(-100).unwrap(), USD)
        );

        // Next month: ResetToZero but keep negative (deficit), then add +1000 funding => net to 900
        b.start_month(2025, 11);
        let g2 = b.envelopes.get("env.groceries").unwrap();
        assert_eq!(g2.balance, Money::new(Decimal::from(900), USD));
    }
}
