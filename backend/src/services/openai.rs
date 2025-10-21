use anyhow::Result;
use async_openai::Client;
use async_openai::config::OpenAIConfig;
use async_openai::types::{
    ChatCompletionRequestMessageArgs, CreateChatCompletionRequestArgs, Role,
};

use anyhow::anyhow;
use bytes::Bytes;
use mongodb::{
    Database,
    bson::{doc, oid::ObjectId},
};
use serde::{Deserialize, Serialize};

use crate::services::pdf::extract_text_from_pdf;

#[derive(Debug, Serialize, Deserialize)]
struct Prompt {
    #[serde(rename = "_id")]
    _id: ObjectId,
    pub id: String,
    pub namespace: String,
    pub task: String,
    pub version: i32,
    pub description: Option<String>,
    pub model: Option<String>,
    pub prompt_template: String,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(default)]
    pub calls: Vec<serde_json::Value>,
}

// ===================
// * * * JOURNAL * * *
// ===================
pub async fn generate_tags_and_keywords(
    entry_text: &str,
) -> Result<(Vec<String>, Vec<String>), String> {
    let prompt = format!(
        "Extract meaningful tags and keywords from this journal entry. \
         Tags should follow format 'theme/x', 'emotion/x', 'person/x' etc. \
         Respond in JSON: {{ \"tags\": [...], \"keywords\": [...] }}.\n\nEntry:\n{}",
        entry_text
    );

    println!("=== OpenAI API Call ===");
    println!(
        "Entry text (first 200 chars): {}",
        entry_text.chars().take(200).collect::<String>()
    );
    println!("Prompt: {}", prompt);

    let api_key = std::env::var("OPENAI_API_SECRET").map_err(|e| e.to_string())?;
    println!(
        "API Key (first 10 chars): {}",
        api_key.chars().take(10).collect::<String>()
    );

    let config = OpenAIConfig::new().with_api_key(api_key);
    let client = Client::with_config(config);

    let request = CreateChatCompletionRequestArgs::default()
        .model("gpt-3.5-turbo")
        .messages([ChatCompletionRequestMessageArgs::default()
            .role(Role::User)
            .content(prompt)
            .build()
            .map_err(|e| e.to_string())?])
        .temperature(0.3)
        .build()
        .map_err(|e| e.to_string())?;

    println!("Sending request to OpenAI...");
    let response = client.chat().create(request).await.map_err(|e| {
        println!("OpenAI API error: {}", e);
        e.to_string()
    })?;

    let content = response.choices[0]
        .message
        .content
        .as_ref()
        .ok_or("No content from OpenAI")?;

    println!("OpenAI response: {}", content);

    let parsed: serde_json::Value = serde_json::from_str(content).map_err(|e| {
        println!("JSON parsing error: {}", e);
        println!("Raw content: {}", content);
        e.to_string()
    })?;
    let tags = parsed["tags"]
        .as_array()
        .ok_or("Missing tags")?
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect();

    let keywords = parsed["keywords"]
        .as_array()
        .ok_or("Missing keywords")?
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect();

    println!("Extracted tags: {:?}", tags);
    println!("Extracted keywords: {:?}", keywords);
    println!("=== End OpenAI API Call ===");

    Ok((tags, keywords))
}

// ===================
// * * * CAPITAL * * *
// ===================
/// Extract transactions from a bank statement PDF.
/// - Accepts already-loaded `pdf_bytes`
/// - Extracts transactions + summary info in one OpenAI call.
#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractResult {
    pub csv_text: String,
    pub audit_json: serde_json::Value,
    pub inferred_meta: serde_json::Value,
    pub rows_preview: Vec<serde_json::Value>,
}
// TODO(wyat-capital):
// The prompt in `ai_prompts.id = "capital.extract_bank_statement"` MUST specify the exact CSV schema.
// Require this header (one posting per row):
// txid,date,description,account,commodity,quantity,price,price_commodity,status,code,posting_comment,envelope,tx_type,posted_ts,ext1_kind,ext1_val,ext2_kind,ext2_val
// Rules:
// - date=YYYY-MM-DD; posted_ts=unix seconds
// - decimal with '.'; no thousands separators
// - one posting per row; rows with same txid must balance to zero (same-commodity) or include price (@) to value mixed commodities
// - emit CSV in `csv_text` AND return a `rows_preview` array (first 10 rows parsed as objects)
// - if unsure about a field, leave it empty (do NOT invent values)
// ACTION: tighten the stored prompt to include the above and sample rows; add a server-side CSV validator before saving.
pub async fn extract_bank_statement(
    db: Option<&Database>,
    pdf_bytes: &Bytes,
    prompt_override: Option<String>,
) -> Result<ExtractResult> {
    println!("=== extract_bank_statement START ===");
    println!("PDF bytes length: {}", pdf_bytes.len());

    // 1) bytes -> text
    println!("Extracting text from PDF...");
    let text = extract_text_from_pdf(pdf_bytes)?; // implement or call another helper
    println!("PDF text extracted: {} chars", text.len());
    let text_preview = text.chars().take(8000).collect::<String>();
    println!("Text preview length: {} chars", text_preview.len());

    // 2) load prompt template
    println!("Loading prompt template...");
    let prompt = if let Some(p) = prompt_override {
        println!("Using prompt override");
        if p.contains("{}") {
            p.replace("{}", &text_preview)
        } else {
            format!("{p}\n\nTEXT:\n{text_preview}")
        }
    } else {
        println!("Loading prompt from database");
        let db = db.ok_or_else(|| anyhow!("no prompt provided and no DB connection"))?;
        let coll = db.collection::<Prompt>("ai_prompts");
        let prompt_doc = coll
            .find_one(doc! {"id": "capital.extract_bank_statement"}, None)
            .await?
            .ok_or_else(|| anyhow!("missing prompt capital.extract_bank_statement"))?;
        println!(
            "Prompt loaded from DB: {} chars",
            prompt_doc.prompt_template.len()
        );
        let mut t = prompt_doc.prompt_template;
        if !t.contains("{}") {
            t.push_str("\n\nTEXT:\n{}");
        }
        t.replace("{}", &text_preview)
    };
    println!("Final prompt length: {} chars", prompt.len());

    // 3) call OpenAI
    println!("Calling OpenAI API...");
    let api_key = std::env::var("OPENAI_API_SECRET")?;
    let client = Client::with_config(OpenAIConfig::new().with_api_key(api_key));

    let req = CreateChatCompletionRequestArgs::default()
        .model("gpt-4o-mini")
        .messages([ChatCompletionRequestMessageArgs::default()
            .role(Role::User)
            .content(prompt)
            .build()?])
        .temperature(0.2)
        .build()?;

    let resp = client.chat().create(req).await?;
    println!("OpenAI API call successful");

    // 4) parse content (strip code fences if present)
    println!("Parsing OpenAI response...");
    let content = resp
        .choices
        .first()
        .and_then(|c| c.message.content.clone())
        .ok_or_else(|| anyhow!("no model content"))?;
    println!("Raw content length: {} chars", content.len());

    let cleaned = strip_code_fences(&content);
    println!("Cleaned content length: {} chars", cleaned.len());

    let v: serde_json::Value = serde_json::from_str(&cleaned).map_err(|e| {
        println!("JSON parsing error: {}", e);
        println!(
            "Cleaned content preview: {}",
            cleaned.chars().take(500).collect::<String>()
        );
        anyhow!("model did not return valid JSON: {e}")
    })?;
    println!("JSON parsed successfully");

    let result = ExtractResult {
        csv_text: v["csv_text"].as_str().unwrap_or_default().to_string(),
        audit_json: v["audit_json"].clone(),
        inferred_meta: v["inferred_meta"].clone(),
        rows_preview: v["rows_preview"].as_array().cloned().unwrap_or_default(),
    };

    println!("CSV text length: {} chars", result.csv_text.len());
    println!("Rows preview count: {}", result.rows_preview.len());
    println!("=== extract_bank_statement SUCCESS ===");

    Ok(result)
}

fn strip_code_fences(s: &str) -> String {
    let s = s.trim();
    if s.starts_with("```") {
        let s = s.trim_start_matches("```json").trim_start_matches("```");
        return s.trim_end_matches("```").trim().to_string();
    }
    s.to_string()
}
