//! Capital domain models: Expenses & simple personal finance records
//! Keep it lean: integer cents, UTC seconds, optional tz.
//!
//! Conventions:
//! - `amount_cents`: negative for spend, positive for income/refund.
//! - `date_unix`: UTC seconds since epoch.
//! - `tz`: IANA timezone at log time, optional (e.g., "America/New_York").
//!
//! This mirrors the minimal CSV schema:
//! date, merchant, description, amount, category, account, is_transfer, notes
//!
//! You can expand later with imports (CSV), recurrence detection, etc.

use serde::{Deserialize, Serialize};
use std::borrow::Cow;

/// Expense / transaction category (coarse-grained)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExpenseCategory {
    Transit,
    Rideshare,
    Groceries,
    Subscriptions,
    Shopping,
    DiningEntertainment,
    Fees,
    Income,
    Transfer, // internal transfers (exclude from spend)
    Other,
}

impl Default for ExpenseCategory {
    fn default() -> Self {
        ExpenseCategory::Other
    }
}

/// Minimal account label. Keep as a free string for now (e.g., "Chase Checking").
pub type AccountLabel = String;

/// Core model stored in Mongo (or any DB): use integer cents to avoid float drift.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpenseEntry {
    /// Mongo ObjectId as hex string (optional on create)
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,

    /// UTC seconds since epoch (Unix time)
    pub date_unix: i64,

    /// Optional IANA timezone at time of logging (e.g., "America/New_York")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tz: Option<String>,

    /// Merchant / counterparty
    pub merchant: String,

    /// Free text description (e.g., statement memo)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Signed amount in cents. Negative = spend, positive = income/refund.
    pub amount_cents: i64,

    /// 3-letter currency code (default "USD")
    #[serde(default = "default_usd")]
    pub currency: String,

    /// Category (coarse)
    #[serde(default)]
    pub category: ExpenseCategory,

    /// Which of your accounts this hit (e.g., "Chase Checking")
    pub account: AccountLabel,

    /// Mark true for internal transfers so they don't count toward spend totals
    #[serde(default)]
    pub is_transfer: bool,

    /// Optional notes
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

fn default_usd() -> String {
    "USD".to_string()
}

impl ExpenseEntry {
    /// Convenience: is cash-out?
    pub fn is_expense(&self) -> bool {
        self.amount_cents < 0 && !self.is_transfer
    }
    /// Convenience: is income (excluding transfers)?
    pub fn is_income(&self) -> bool {
        self.amount_cents > 0 && !self.is_transfer
    }
    /// Format amount like -$87.16 (USD). For UI; keep i18n elsewhere.
    pub fn amount_str(&self) -> String {
        let sign = if self.amount_cents < 0 { "-" } else { "" };
        let abs = self.amount_cents.abs();
        let dollars = abs / 100;
        let cents = abs % 100;
        format!("{sign}${dollars}.{cents:02}")
    }
}

/// Input payload for creating an expense (lean, mirrors CSV columns).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpenseInput {
    pub date_unix: i64,
    #[serde(default)]
    pub tz: Option<String>,
    pub merchant: String,
    #[serde(default)]
    pub description: Option<String>,
    /// Accept signed dollars; convert to cents in handler if you prefer.
    /// If you already provide cents, pass directly to `amount_cents`.
    #[serde(default)]
    pub amount_cents: i64,
    #[serde(default = "default_usd")]
    pub currency: String,
    #[serde(default)]
    pub category: ExpenseCategory,
    pub account: AccountLabel,
    #[serde(default)]
    pub is_transfer: bool,
    #[serde(default)]
    pub notes: Option<String>,
}

/// Partial update (patch) payload
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExpensePatch {
    #[serde(default)]
    pub date_unix: Option<i64>,
    #[serde(default)]
    pub tz: Option<String>,
    #[serde(default)]
    pub merchant: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub amount_cents: Option<i64>,
    #[serde(default)]
    pub currency: Option<String>,
    #[serde(default)]
    pub category: Option<ExpenseCategory>,
    #[serde(default)]
    pub account: Option<AccountLabel>,
    #[serde(default)]
    pub is_transfer: Option<bool>,
    #[serde(default)]
    pub notes: Option<String>,
}

/// Optional helper: quick heuristic category by merchant descriptor
pub fn guess_category(merchant: &str, description: Option<&str>) -> ExpenseCategory {
    let m = merchant.to_lowercase();
    let d = description.unwrap_or("").to_lowercase();
    let hay = format!("{m} {d}");

    if hay.contains("mta") || hay.contains("nyct") || hay.contains("metrocard") {
        return ExpenseCategory::Transit;
    }
    if hay.contains("uber") || hay.contains("lyft") {
        return ExpenseCategory::Rideshare;
    }
    if hay.contains("trader joe") || hay.contains("market") || hay.contains("grocery") {
        return ExpenseCategory::Groceries;
    }
    if hay.contains("openai")
        || hay.contains("apple.com/bill")
        || hay.contains("wsj")
        || hay.contains("max.com")
        || hay.contains("discord")
        || hay.contains("spotify")
    {
        return ExpenseCategory::Subscriptions;
    }
    if hay.contains("amazon") || hay.contains("lockwood") {
        return ExpenseCategory::Shopping;
    }
    if hay.contains("joe & the juice")
        || hay.contains("axs")
        || hay.contains("ticket")
        || hay.contains("fandango")
        || hay.contains("nebula")
    {
        return ExpenseCategory::DiningEntertainment;
    }
    if hay.contains("fee") || hay.contains("service charge") {
        return ExpenseCategory::Fees;
    }
    if hay.contains("zelle") || hay.contains("real time transfer recd") || hay.contains("wise") {
        return ExpenseCategory::Transfer;
    }
    ExpenseCategory::Other
}

/// Light validation (range/sanity checks). Expand in handlers as needed.
pub fn validate_expense(input: &ExpenseInput) -> Result<(), Cow<'static, str>> {
    if input.merchant.trim().is_empty() {
        return Err("merchant cannot be empty".into());
    }
    if input.account.trim().is_empty() {
        return Err("account cannot be empty".into());
    }
    // Accept negative (spend) and positive (income); just disallow zero.
    if input.amount_cents == 0 {
        return Err("amount_cents cannot be zero".into());
    }
    Ok(())
}
