use anyhow::Result;
use mongodb::{
    Database,
    bson::{doc, oid::ObjectId},
};
use sha2::{Digest, Sha256};

use crate::services::ai_prompts::get_prompt_by_id;
use crate::services::openai::{ExtractResult, extract_bank_statement};
use crate::services::storage as storage_svc;
use crate::storage::{ExtractionRun, PromptRef};

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
    let prompt_text = &ai_prompt.prompt_template;
    println!("Prompt retrieved: {} chars", prompt_text.len());

    // 2) Load blob bytes
    println!("Loading PDF bytes...");
    let pdf_bytes = storage_svc::get_blob_bytes_by_id(db, blob_oid).await?;
    println!("Blob size: {} bytes", pdf_bytes.len());

    // 3) Call OpenAI extraction
    println!("Calling OpenAI extraction...");
    let result = extract_bank_statement(prompt_text, &pdf_bytes, model, assistant_name).await?;
    println!(
        "Extraction succeeded: {} transactions, quality={}",
        result.transactions.len(),
        result.quality
    );

    // 4) Construct PromptRef with content hash
    let prompt_ref = PromptRef {
        id: prompt_id.to_string(),
        version: prompt_version.to_string(),
        hash: format!("{:x}", Sha256::digest(prompt_text.as_bytes())),
    };

    // 5) Build metadata document
    let result_json = serde_json::to_string(&result).unwrap_or_default();
    let result_hash = format!("{:x}", Sha256::digest(result_json.as_bytes()));

    let metadata = doc! {
        "model": model,
        "assistant_name": assistant_name,
        "blob_id": blob_oid.to_hex(),
        "result_hash": result_hash,
        "transaction_count": result.transactions.len() as i32,
        "quality": &result.quality,
        "confidence": result.confidence,
        // Store full response for audit trail
        "response_text": result_json,
    };

    // 6) Create extraction run record
    println!("Creating extraction run record...");
    let run = crate::storage::create_extraction_run(
        db,
        doc_oid,
        "bank_statement",
        model,
        prompt_ref,
        metadata,
    )
    .await?;

    println!("=== run_bank_statement_extraction SUCCESS ===");
    println!("ExtractionRun ID: {}", run.id);

    Ok((run, result))
}
