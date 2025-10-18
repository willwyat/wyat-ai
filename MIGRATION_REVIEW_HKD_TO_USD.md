# Migration Script Review: HKD→USD P&L Normalization

## ✅ **Overall Assessment: PRODUCTION-READY**

The migration script `patch_hkd_pnl_to_usd.rs` is **well-designed, safe, and idempotent**. All critical aspects have been validated.

---

## 📋 **Correctness Review**

### **✅ Filter Specificity**

```rust
let filter = doc! {
    "source": &args.source,
    "legs": {
        "$elemMatch": {
            "account_id": "__pnl__",
            "amount.kind": "Fiat",
            "amount.data.ccy": "HKD"
        }
    }
};
```

**Analysis:**

- ✅ Uses `$elemMatch` for precise leg matching
- ✅ Only matches docs with HKD P&L legs
- ✅ No overlap with already-converted docs (USD won't match filter)
- ✅ Source filter prevents cross-contamination

### **✅ Conversion Logic**

```rust
let hkd_clean = hkd_str.replace([',', ' '], "");
let hkd = Decimal::from_str(&hkd_clean)?;
let usd = (hkd * peg).round_dp(2);
```

**Analysis:**

- ✅ Handles string amounts correctly
- ✅ Cleans commas/spaces before parsing
- ✅ Uses Decimal for precision (no float errors)
- ✅ Rounds to 2dp for consistency
- ✅ Default peg: 1/7.8 = 0.1282051282051282 (correct)

### **✅ Update Paths**

```rust
set_doc.insert("legs.{pnl_idx}.amount.data.amount", usd_string);
set_doc.insert("legs.{pnl_idx}.amount.data.ccy", "USD");
set_doc.insert("legs.{pnl_idx}.notes", provenance);
set_doc.insert("legs.{custody_idx}.fx", fx_snapshot); // optional
```

**Analysis:**

- ✅ Only touches specific indices (no bulk overwrites)
- ✅ Updates only necessary fields
- ✅ Doesn't modify transaction-level data
- ✅ FX snapshot is optional and safe

---

## 🔄 **Idempotency Review**

### **Primary Guard: MongoDB Filter**

- Filter explicitly looks for `"ccy": "HKD"`
- Already-converted docs have `"ccy": "USD"` → won't match

### **Secondary Guard: Notes Check** (Added)

```rust
if let Some(notes) = &pnl_leg.notes {
    if notes.contains("patched_hkd_to_usd") {
        // Skip - already patched
        continue;
    }
}
```

**Result:** ✅ **Safe to run multiple times** - Will find 0 documents on second run

---

## 🛡️ **Error Handling Review**

### **✅ Connection Errors**

```rust
let client_opts = ClientOptions::parse(&uri)
    .await
    .context("Failed to parse MongoDB URI")?;
let client = Client::with_options(client_opts)
    .context("Failed to create MongoDB client")?;
```

### **✅ Parsing Errors**

```rust
let hkd = match Decimal::from_str(&hkd_clean) {
    Ok(d) if d.is_zero() => { /* skip */ },
    Ok(d) => d,
    Err(e) => {
        eprintln!("❌ [skip] failed to parse: {}", e);
        continue;
    }
};
```

### **✅ Update Errors**

```rust
match coll.update_one(...).await {
    Ok(res) => { /* handle */ },
    Err(e) => {
        eprintln!("❌ [error] update failed: {}", e);
        skipped += 1;
    }
}
```

**Result:** ✅ **No panics, graceful degradation, comprehensive logging**

---

## 🔍 **BSON/Decimal String Handling Review**

### **✅ String Amount Handling**

```rust
amount: String,  // MongoDB stores as string
```

- Parses with error handling
- Cleans formatting characters
- Converts to Decimal for math
- Outputs as string for MongoDB

### **✅ BSON Type Safety**

```rust
Bson::String(usd.to_string())  // Correct type
Bson::Document(doc!{...})      // Correct type for fx
```

**Result:** ✅ **Proper BSON types, consistent with existing schema**

---

## 🎯 **No Accidental Filter Overlap**

### **Documents Matched:**

1. ✅ `source = "za_bank_csv"` only
2. ✅ Has `__pnl__` leg
3. ✅ That leg is Fiat
4. ✅ That leg's ccy is HKD

### **Documents NOT Matched:**

- ❌ Manual entries (different source)
- ❌ Chase CSV entries (different source)
- ❌ Already-patched docs (USD P&L legs)
- ❌ Crypto legs
- ❌ Non-P&L legs

**Result:** ✅ **Surgical precision - only affects intended transactions**

---

## 🔧 **Usage Examples**

### **Dry Run (Recommended First)**

```bash
cargo run --bin patch_hkd_pnl_to_usd -- --dry-run --limit 10
```

### **Limited Production Run (Test)**

```bash
cargo run --bin patch_hkd_pnl_to_usd -- --limit 5
```

### **Full Production Run**

```bash
cargo run --bin patch_hkd_pnl_to_usd
```

### **Custom Peg Rate**

```bash
cargo run --bin patch_hkd_pnl_to_usd -- --peg 0.13 --dry-run
```

### **Skip FX Snapshot**

```bash
cargo run --bin patch_hkd_pnl_to_usd -- --add-fx-on-custody=false
```

---

## ✅ **Final Recommendations**

### **Before Running:**

1. ✅ Backup database (recommended for all migrations)
2. ✅ Run `--dry-run --limit 10` first to preview
3. ✅ Verify sample output looks correct

### **Execution Strategy:**

```bash
# Step 1: Preview
cargo run --bin patch_hkd_pnl_to_usd -- --dry-run

# Step 2: Test with small batch
cargo run --bin patch_hkd_pnl_to_usd -- --limit 5

# Step 3: Verify in database
# Check that USD amounts look correct

# Step 4: Full run
cargo run --bin patch_hkd_pnl_to_usd
```

### **Validation After Migration:**

```bash
# Should return 0 (all converted)
curl "http://localhost:3001/capital/transactions?source=za_bank_csv" \
  | jq '[.[] | .legs[] | select(.account_id == "__pnl__" and .amount.data.ccy == "HKD")] | length'
```

---

## 📊 **What Gets Changed**

### **Before:**

```json
{
  "source": "za_bank_csv",
  "legs": [
    {
      "account_id": "acct.za_bank",
      "direction": "Credit",
      "amount": { "kind": "Fiat", "data": { "amount": "780.00", "ccy": "HKD" } }
    },
    {
      "account_id": "__pnl__",
      "direction": "Debit",
      "amount": {
        "kind": "Fiat",
        "data": { "amount": "780.00", "ccy": "HKD" }
      },
      "category_id": "env.groceries"
    }
  ]
}
```

### **After:**

```json
{
  "source": "za_bank_csv",
  "legs": [
    {
      "account_id": "acct.za_bank",
      "direction": "Credit",
      "amount": {
        "kind": "Fiat",
        "data": { "amount": "780.00", "ccy": "HKD" }
      },
      "fx": { "to": "USD", "rate": "0.1282051282051282" } // ← Added
    },
    {
      "account_id": "__pnl__",
      "direction": "Debit",
      "amount": {
        "kind": "Fiat",
        "data": { "amount": "100.00", "ccy": "USD" }
      }, // ← Changed
      "category_id": "env.groceries",
      "notes": "patched_hkd_to_usd@0.1282051282051282" // ← Added
    }
  ]
}
```

**Key Changes:**

- P&L leg: HKD → USD conversion with provenance
- Custody leg: FX snapshot added (optional)
- Envelope math now works correctly (all USD)

---

## ✅ **Safety Checklist**

- [x] Idempotent (safe to re-run)
- [x] No accidental filter overlap
- [x] Proper error handling (no panics)
- [x] Updates only intended paths
- [x] BSON types correct
- [x] Decimal precision maintained
- [x] Provenance tracked
- [x] Dry-run mode available
- [x] Limit flag for testing
- [x] Clear logging and progress tracking

---

## 🎯 **APPROVED FOR PRODUCTION**

The migration script is **ready to run**. All requested safety checks passed:

✅ **Correctness** - Logic is sound, math is precise  
✅ **Idempotency** - Double-guard prevents re-conversion  
✅ **Error Handling** - Comprehensive, no panics  
✅ **BSON/Decimal** - Properly handled  
✅ **No Overlap** - Surgical filter  
✅ **Update Paths** - Only touches intended fields

**Recommendation:** Run `--dry-run` first, then execute full migration.
