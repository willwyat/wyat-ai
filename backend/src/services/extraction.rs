use anyhow::{Result, anyhow};
use mongodb::{
    Database,
    bson::{doc, oid::ObjectId},
};
use sha2::{Digest, Sha256};

use crate::capital::{BatchImportRequest, FlatTransaction};
use crate::services::ai_prompts::get_prompt_by_id;
use crate::services::openai::{ExtractResult, extract_bank_statement};
use crate::services::storage as storage_svc;
use crate::storage::ExtractionRun;
use serde_json::Value;

/// Orchestrate the full bank statement extraction pipeline.
///
/// # Workflow
/// 1. Retrieve AI prompt from database
/// 2. Load PDF bytes from blob storage
/// 3. Call OpenAI extraction API
/// 4. Create ExtractionRun record with results
/// 5. Link run to document via latest_extraction_run_id
///
/// # Arguments
/// * `db` - MongoDB database reference
/// * `doc_oid` - Document ObjectId to link extraction run
/// * `blob_oid` - Blob ObjectId containing PDF bytes
/// * `prompt_text` - Raw prompt content supplied by the client (falls back to stored template when empty)
/// * `prompt_id` - AI prompt identifier (e.g., "capital.extract_bank_statement")
/// * `prompt_version` - Prompt version for tracking
/// * `model` - OpenAI model to use (e.g., "gpt-4o-mini")
/// * `assistant_name` - Assistant identifier for OpenAI
///
/// # Returns
/// * `Ok((ExtractionRun, ExtractResult))` - The created run record and parsed extraction result
/// * `Err` - If any step fails (prompt not found, blob not found, extraction fails, etc.)
pub async fn run_bank_statement_extraction(
    db: &Database,
    doc_oid: ObjectId,
    blob_oid: ObjectId,
    prompt_text: &str,
    prompt_id: &str,
    prompt_version: &str,
    model: &str,
    assistant_name: &str,
) -> Result<(ExtractionRun, ExtractResult)> {
    println!("=== run_bank_statement_extraction START ===");
    println!("Document: {}", doc_oid.to_hex());
    println!("Blob: {}", blob_oid.to_hex());
    println!("Prompt: {} v{}", prompt_id, prompt_version);
    println!("Model: {}, Assistant: {}", model, assistant_name);

    // 1) Retrieve AI prompt from database
    println!("Fetching AI prompt...");
    let ai_prompt = get_prompt_by_id(db, prompt_id).await?;
    let effective_prompt = if prompt_text.trim().is_empty() {
        println!("Request prompt empty, using stored template");
        ai_prompt.prompt_template.clone()
    } else {
        prompt_text.to_string()
    };
    println!("Prompt ready: {} chars", effective_prompt.len());

    // 2) Load blob bytes
    println!("Loading PDF bytes...");
    let pdf_bytes = storage_svc::get_blob_bytes_by_id(db, blob_oid).await?;
    println!("Blob size: {} bytes", pdf_bytes.len());

    // 3) Call OpenAI extraction
    println!("Calling OpenAI extraction...");
    let result =
        extract_bank_statement(&effective_prompt, &pdf_bytes, model, assistant_name).await?;
    println!(
        "Extraction succeeded: {} transactions, quality={}",
        result.transactions.len(),
        result.quality
    );

    // 4) Build metadata document for the run
    let result_json = serde_json::to_string(&result).unwrap_or_default();
    let result_hash = format!("{:x}", Sha256::digest(result_json.as_bytes()));
    let prompt_hash = format!("{:x}", Sha256::digest(effective_prompt.as_bytes()));

    let metadata = doc! {
        "model": model,
        "assistant_name": assistant_name,
        "blob_id": blob_oid.to_hex(),
        "prompt_id": prompt_id,
        "prompt_version": prompt_version,
        "prompt_hash": &prompt_hash,
        "result_hash": result_hash,
        "transaction_count": result.transactions.len() as i32,
        "quality": &result.quality,
        "confidence": result.confidence,
    };

    // 5) Create extraction run record (links document on success)
    println!("Creating extraction run record...");
    let run = crate::storage::create_extraction_run(
        db,
        doc_oid,
        "bank_statement",
        model,
        effective_prompt,
        metadata,
    )
    .await?;

    // Store full response text separately after run creation
    let update = doc! { "$set": { "response_text": result_json } };
    db.collection::<mongodb::bson::Document>("extraction_runs")
        .update_one(doc! { "_id": &run.id }, update, None)
        .await?;

    println!("=== run_bank_statement_extraction SUCCESS ===");
    println!("ExtractionRun ID: {}", run.id);

    Ok((run, result))
}

#[derive(Clone, Debug, Default)]
pub struct ImportDefaults {
    pub source: String,
    pub status: Option<String>,
    pub debit_tx_type: Option<String>,
    pub credit_tx_type: Option<String>,
    pub fallback_account_id: Option<String>,
}

impl ImportDefaults {
    pub fn new() -> Self {
        Self {
            source: "assistant_extraction".to_string(),
            status: Some("imported".to_string()),
            debit_tx_type: Some("spending".to_string()),
            credit_tx_type: Some("income".to_string()),
            fallback_account_id: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct PreparedBatchImport {
    pub request: BatchImportRequest,
    pub preview: Vec<FlatTransaction>,
}

pub fn prepare_batch_import_from_extract(
    result: &ExtractResult,
    defaults: &ImportDefaults,
) -> Result<PreparedBatchImport> {
    let mut rows: Vec<FlatTransaction> = Vec::with_capacity(result.transactions.len());

    for value in &result.transactions {
        let obj = value
            .as_object()
            .ok_or_else(|| anyhow!("transaction row was not an object"))?;

        let txid = required_string(obj, "txid")?;
        let date = required_string(obj, "date")?;

        let account_id = required_string(obj, "account_id").or_else(|_| {
            defaults
                .fallback_account_id
                .clone()
                .ok_or_else(|| anyhow!("{}: missing account_id and no fallback provided", txid))
        })?;

        let direction_raw = required_string(obj, "direction")?;
        let direction = normalize_direction(&direction_raw).ok_or_else(|| {
            anyhow!(
                "{}: invalid direction '{}': expected Debit or Credit",
                txid,
                direction_raw
            )
        })?;

        let kind_raw = required_string(obj, "kind")?;
        let kind = normalize_kind(&kind_raw).ok_or_else(|| {
            anyhow!(
                "{}: invalid kind '{}': expected Fiat or Crypto",
                txid,
                kind_raw
            )
        })?;

        let ccy_or_asset = required_string(obj, "ccy_or_asset")?;
        let amount_or_qty = required_f64(obj.get("amount_or_qty"), "amount_or_qty", &txid)?;

        let posted_ts = optional_i64(obj.get("posted_ts"))?;
        let source = optional_string(obj.get("source"));
        let payee = optional_string(obj.get("payee"));
        let memo = optional_string(obj.get("memo"));
        let price = optional_f64(obj.get("price"))?;
        let price_ccy = optional_string(obj.get("price_ccy"));
        let category_id = optional_string(obj.get("category_id"));
        let status = optional_string(obj.get("status"));
        let tx_type = optional_string(obj.get("tx_type"));
        let ext1_kind = optional_string(obj.get("ext1_kind"));
        let ext1_val = optional_string(obj.get("ext1_val"));

        let mut row = FlatTransaction {
            txid,
            date,
            posted_ts,
            source: source.unwrap_or_else(|| defaults.source.clone()),
            payee,
            memo,
            account_id,
            direction,
            kind,
            ccy_or_asset,
            amount_or_qty,
            price,
            price_ccy,
            category_id,
            status: status.or_else(|| defaults.status.clone()),
            tx_type,
            ext1_kind,
            ext1_val,
        };

        row.ensure_defaults(
            defaults.debit_tx_type.as_deref(),
            defaults.credit_tx_type.as_deref(),
        );

        rows.push(row);
    }

    let preview = rows.clone();
    let request = BatchImportRequest { transactions: rows };

    Ok(PreparedBatchImport { request, preview })
}

fn optional_string(value: Option<&Value>) -> Option<String> {
    value.and_then(|v| match v {
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Null => None,
        other => {
            let text = other.to_string();
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
    })
}

fn required_string(obj: &serde_json::Map<String, Value>, key: &str) -> Result<String> {
    optional_string(obj.get(key)).ok_or_else(|| anyhow!("missing '{}'", key))
}

fn optional_i64(value: Option<&Value>) -> Result<Option<i64>> {
    Ok(match value {
        None => None,
        Some(Value::Null) => None,
        Some(Value::Number(n)) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)),
        Some(Value::String(s)) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.parse::<i64>().map_err(|e| anyhow!(e))?)
            }
        }
        Some(other) => {
            let text = other.to_string();
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.parse::<i64>().map_err(|e| anyhow!(e))?)
            }
        }
    })
}

fn required_f64(value: Option<&Value>, field: &str, txid: &str) -> Result<f64> {
    let Some(value) = value else {
        return Err(anyhow!("{}: missing '{}'", txid, field));
    };

    match value {
        Value::Number(n) => n
            .as_f64()
            .ok_or_else(|| anyhow!("{}: '{}' was not a valid number", txid, field)),
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                Err(anyhow!("{}: '{}' was empty", txid, field))
            } else {
                trimmed
                    .parse::<f64>()
                    .map_err(|e| anyhow!("{}: failed to parse '{}': {}", txid, field, e))
            }
        }
        other => {
            let text = other.to_string();
            let trimmed = text.trim();
            if trimmed.is_empty() {
                Err(anyhow!("{}: '{}' was empty", txid, field))
            } else {
                trimmed
                    .parse::<f64>()
                    .map_err(|e| anyhow!("{}: failed to parse '{}': {}", txid, field, e))
            }
        }
    }
}

fn optional_f64(value: Option<&Value>) -> Result<Option<f64>> {
    Ok(match value {
        None => None,
        Some(Value::Null) => None,
        Some(Value::Number(n)) => n.as_f64(),
        Some(Value::String(s)) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.parse::<f64>().map_err(|e| anyhow!(e))?)
            }
        }
        Some(other) => {
            let text = other.to_string();
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.parse::<f64>().map_err(|e| anyhow!(e))?)
            }
        }
    })
}

fn normalize_direction(input: &str) -> Option<String> {
    match input.trim().to_ascii_lowercase().as_str() {
        "debit" => Some("Debit".to_string()),
        "credit" => Some("Credit".to_string()),
        _ => None,
    }
}

fn normalize_kind(input: &str) -> Option<String> {
    match input.trim().to_ascii_lowercase().as_str() {
        "fiat" => Some("Fiat".to_string()),
        "crypto" => Some("Crypto".to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn prepares_flat_transactions_with_defaults() {
        let result = ExtractResult {
            transactions: vec![json!({
                "txid": "ABC-1",
                "date": "2025-09-01",
                "account_id": "acct.test",
                "direction": "debit",
                "kind": "fiat",
                "ccy_or_asset": "USD",
                "amount_or_qty": "42.10",
                "status": "",
                "source": "",
            })],
            audit: json!({}),
            inferred_meta: json!({}),
            quality: "ok".to_string(),
            confidence: 0.9,
        };

        let defaults = ImportDefaults::new();
        let prepared = prepare_batch_import_from_extract(&result, &defaults).unwrap();

        assert_eq!(prepared.preview.len(), 1);
        let row = &prepared.preview[0];
        assert_eq!(row.source, "assistant_extraction");
        assert_eq!(row.status.as_deref(), Some("imported"));
        assert_eq!(row.tx_type.as_deref(), Some("spending"));
        assert_eq!(row.direction, "Debit");
        assert!((row.amount_or_qty - 42.10).abs() < f64::EPSILON);
    }
}
