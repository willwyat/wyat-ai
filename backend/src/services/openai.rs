use anyhow::{Result, anyhow};
use async_openai::types::{
    ChatCompletionRequestMessage, ChatCompletionRequestUserMessageArgs, CreateAssistantRequestArgs,
    CreateChatCompletionRequestArgs, CreateFileRequest, CreateMessageRequestArgs,
    CreateRunRequestArgs, CreateThreadRequestArgs, FilePurpose, MessageContent, MessageRole,
    RunStatus,
};
use async_openai::{Client, config::OpenAIConfig};
use bytes::Bytes;
use serde::{Deserialize, Serialize};
use std::time::Duration;

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
        .messages(vec![ChatCompletionRequestMessage::User(
            ChatCompletionRequestUserMessageArgs::default()
                .content(prompt)
                .build()
                .map_err(|e| e.to_string())?,
        )])
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
// TODO: Re-enable structured parsing once we validate the raw assistant output
// This struct defines the expected JSON structure from the assistant
/// Extract transactions from a bank statement PDF using OpenAI Assistants API.
/// - Uploads PDF to OpenAI Files API
/// - Uses gpt-4o-mini with vision to extract structured data
/// - Returns JSON transactions array with metadata
#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractResult {
    pub transactions: Vec<serde_json::Value>,
    pub audit: serde_json::Value,
    pub inferred_meta: serde_json::Value,
    pub quality: String,
    pub confidence: f64,
}

pub async fn extract_bank_statement(
    prompt: &str,
    pdf_bytes: &Bytes,
    model: &str,
    assistant_name: &str,
) -> Result<ExtractResult> {
    println!("=== extract_bank_statement START (Assistants API) ===");
    println!("PDF bytes length: {}", pdf_bytes.len());
    println!("Prompt length: {} chars", prompt.len());
    println!("Model: {}, Assistant: {}", model, assistant_name);

    let api_key = std::env::var("OPENAI_API_SECRET")?;
    let client = Client::with_config(OpenAIConfig::new().with_api_key(api_key));

    // 1) Upload PDF to OpenAI
    println!("Uploading PDF to OpenAI...");
    let file_id = upload_pdf_to_openai(&client, pdf_bytes).await?;
    println!("PDF uploaded with file_id: {}", file_id);

    // 2) Get or create assistant
    println!("Getting assistant...");
    let assistant_id = get_or_create_assistant(&client, model, assistant_name, prompt).await?;
    println!("Using assistant_id: {}", assistant_id);

    // 3) Create thread
    println!("Creating thread...");
    let thread_id = create_thread(&client).await?;
    println!("Thread created: {}", thread_id);

    // 4) Add message with file attachment
    println!("Adding message to thread...");
    add_message_to_thread(&client, &thread_id, prompt, &file_id).await?;

    // 5) Run assistant
    println!("Running assistant...");
    let run_id = run_assistant(&client, &thread_id, &assistant_id).await?;
    println!("Run created: {}", run_id);

    // 6) Poll for completion
    println!("Polling for completion...");
    let response_text = poll_run_completion(&client, &thread_id, &run_id).await?;
    println!("Response received: {} chars", response_text.len());

    // 7) Cleanup
    println!("Cleaning up resources...");
    cleanup_resources(&client, &file_id, &thread_id).await;

    // 8) Parse to structured shape (JSON-first, CSV fallback)
    let parsed = parse_extraction_result(&response_text)?;
    println!(
        "Parsed: txns={}, quality={:?}",
        parsed.transactions.len(),
        parsed.quality
    );
    Ok(parsed)
}

/// Upload PDF bytes to OpenAI Files API
#[allow(dead_code)]
async fn upload_pdf_to_openai(client: &Client<OpenAIConfig>, pdf_bytes: &Bytes) -> Result<String> {
    use async_openai::types::FileInput;

    // Create a FileInput from bytes
    let file_input = FileInput::from_bytes("statement.pdf".to_string(), pdf_bytes.clone());

    let request = CreateFileRequest {
        file: file_input,
        purpose: FilePurpose::Assistants,
        expires_after: None,
    };

    let file = client.files().create(request).await?;
    Ok(file.id)
}

/// Get existing assistant or create a new one
#[allow(dead_code)]
async fn get_or_create_assistant(
    client: &Client<OpenAIConfig>,
    model: &str,
    name: &str,
    instructions: &str,
) -> Result<String> {
    // Try to get assistant ID from environment
    if let Ok(assistant_id) = std::env::var("OPENAI_ASSISTANT_ID") {
        println!("Using existing assistant from env: {}", assistant_id);
        return Ok(assistant_id);
    }

    // Create new assistant
    println!("Creating new assistant...");
    println!("  Model: {}", model);
    println!("  Name: {}", name);
    println!("  Instructions length: {} chars", instructions.len());

    use async_openai::types::{AssistantTools, AssistantToolsFileSearch};

    let request = CreateAssistantRequestArgs::default()
        .model(model)
        .name(name)
        .instructions(instructions)
        .temperature(0.0)
        .top_p(0.1)
        .tools(vec![AssistantTools::FileSearch(
            AssistantToolsFileSearch::default(),
        )])
        .build()?;

    let assistant = client.assistants().create(request).await?;
    println!(
        "Created assistant: {} (consider saving to OPENAI_ASSISTANT_ID env var)",
        assistant.id
    );

    Ok(assistant.id)
}

/// Create a new thread
async fn create_thread(client: &Client<OpenAIConfig>) -> Result<String> {
    let request = CreateThreadRequestArgs::default().build()?;
    let thread = client.threads().create(request).await?;
    Ok(thread.id)
}

/// Add a message with file attachment to thread
async fn add_message_to_thread(
    client: &Client<OpenAIConfig>,
    thread_id: &str,
    prompt: &str,
    file_id: &str,
) -> Result<()> {
    use async_openai::types::MessageAttachmentTool;

    let request = CreateMessageRequestArgs::default()
        .role(MessageRole::User)
        .content(prompt.to_string())
        .attachments(vec![async_openai::types::MessageAttachment {
            file_id: file_id.to_string(),
            tools: vec![MessageAttachmentTool::FileSearch],
        }])
        .build()?;

    client.threads().messages(thread_id).create(request).await?;
    Ok(())
}

/// Run the assistant on the thread
async fn run_assistant(
    client: &Client<OpenAIConfig>,
    thread_id: &str,
    assistant_id: &str,
) -> Result<String> {
    let request = CreateRunRequestArgs::default()
        .assistant_id(assistant_id)
        .temperature(0.0)
        .top_p(0.1)
        .build()?;

    let run = client.threads().runs(thread_id).create(request).await?;
    Ok(run.id)
}

/// Poll run until completion and extract response
async fn poll_run_completion(
    client: &Client<OpenAIConfig>,
    thread_id: &str,
    run_id: &str,
) -> Result<String> {
    // Allow long-running extractions. Configure via env:
    // OPENAI_ASSISTANT_RUN_TIMEOUT_SECS (default 180s), OPENAI_ASSISTANT_POLL_MS (default 1000ms)
    let timeout_secs: u64 = std::env::var("OPENAI_ASSISTANT_RUN_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(180);
    let poll_ms: u64 = std::env::var("OPENAI_ASSISTANT_POLL_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(1000);
    let max_attempts = ((timeout_secs * 1000) / poll_ms).max(1);
    let mut attempts = 0u64;

    loop {
        attempts += 1;
        if attempts > max_attempts {
            return Err(anyhow!(
                "Run timed out after {} attempts (~{}s). Consider increasing OPENAI_ASSISTANT_RUN_TIMEOUT_SECS or reducing prompt size.",
                max_attempts,
                timeout_secs
            ));
        }

        let run = client.threads().runs(thread_id).retrieve(run_id).await?;

        match run.status {
            RunStatus::Completed => {
                println!("Run completed successfully");
                // Get messages from thread
                let messages = client
                    .threads()
                    .messages(thread_id)
                    .list(&[("limit", "10")])
                    .await?;

                // Find the assistant's response (most recent assistant message)
                for message in messages.data {
                    if message.role == MessageRole::Assistant {
                        return extract_text_from_message(message.content);
                    }
                }

                return Err(anyhow!("No assistant message found in completed run"));
            }
            RunStatus::Failed => {
                let error = run
                    .last_error
                    .map(|e| format!("{:?}", e))
                    .unwrap_or_else(|| "Unknown error".to_string());
                return Err(anyhow!("Run failed: {}", error));
            }
            RunStatus::Cancelled => {
                return Err(anyhow!("Run was cancelled"));
            }
            RunStatus::Expired => {
                return Err(anyhow!("Run expired"));
            }
            _ => {
                // Still running, wait and retry
                println!("Run status: {:?}, waiting...", run.status);
                tokio::time::sleep(Duration::from_millis(poll_ms)).await;
            }
        }
    }
}

/// Extract text content from message content array
fn extract_text_from_message(content: Vec<MessageContent>) -> Result<String> {
    for item in content {
        if let MessageContent::Text(text_content) = item {
            return Ok(text_content.text.value);
        }
    }
    Err(anyhow!("No text content found in message"))
}

/// Clean up temporary resources (files and threads)
async fn cleanup_resources(client: &Client<OpenAIConfig>, file_id: &str, thread_id: &str) {
    // Delete file
    if let Err(e) = client.files().delete(file_id).await {
        eprintln!("Warning: Failed to delete file {}: {}", file_id, e);
    } else {
        println!("Deleted file: {}", file_id);
    }

    // Delete thread
    if let Err(e) = client.threads().delete(thread_id).await {
        eprintln!("Warning: Failed to delete thread {}: {}", thread_id, e);
    } else {
        println!("Deleted thread: {}", thread_id);
    }
}

// TODO: Re-enable once we validate the assistant output format
/// Parse the extraction result from response text
#[allow(dead_code)]
fn parse_extraction_result(response_text: &str) -> Result<ExtractResult> {
    // 0) Try raw JSON first
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(response_text) {
        return extract_result_from_value(v);
    }

    // 1) Strip code fences and retry
    let cleaned = strip_code_fences(response_text);
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&cleaned) {
        return extract_result_from_value(v);
    }

    // 2) Double-encoded path: the whole payload is a JSON *string* containing JSON
    if let Ok(inner_string) = serde_json::from_str::<String>(&cleaned) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&inner_string) {
            return extract_result_from_value(v);
        }
    }

    // 3) Last resort: unescape common sequences and try again
    let lossy = cleaned.replace("\\n", "\n").replace("\\\"", "\"");
    let v: serde_json::Value = serde_json::from_str(&lossy).map_err(|e| {
        println!("JSON parsing error after fallbacks: {}", e);
        println!(
            "Content preview: {}",
            response_text.chars().take(400).collect::<String>()
        );
        anyhow!("Model did not return valid JSON: {}", e)
    })?;

    extract_result_from_value(v)
}

fn extract_result_from_value(v: serde_json::Value) -> Result<ExtractResult> {
    // Prefer JSON-first shape
    if let Some(arr) = v.get("transactions").and_then(|x| x.as_array()) {
        return Ok(ExtractResult {
            transactions: arr.clone(),
            audit: v.get("audit").cloned().unwrap_or(serde_json::json!({})),
            inferred_meta: v
                .get("inferred_meta")
                .cloned()
                .unwrap_or(serde_json::json!({})),
            quality: v
                .get("quality")
                .and_then(|q| q.as_str())
                .unwrap_or("unknown")
                .to_string(),
            confidence: v.get("confidence").and_then(|c| c.as_f64()).unwrap_or(0.0),
        });
    }

    // Optional: if you still want to support CSV fallback, map it here
    if let Some(csv) = v.get("csv_text").and_then(|x| x.as_str()) {
        let rows_preview = v
            .get("rows_preview")
            .cloned()
            .unwrap_or(serde_json::json!([]));
        let audit_json = v
            .get("audit_json")
            .cloned()
            .unwrap_or(serde_json::json!({}));
        let inferred_meta = v
            .get("inferred_meta")
            .cloned()
            .unwrap_or(serde_json::json!({}));
        let quality = v
            .get("quality")
            .and_then(|q| q.as_str())
            .unwrap_or("unknown")
            .to_string();
        let confidence = v.get("confidence").and_then(|c| c.as_f64()).unwrap_or(0.0);

        // Wrap CSV path in a JSON-first ExtractResult if you want to keep one type:
        return Ok(ExtractResult {
            transactions: vec![
                serde_json::json!({ "csv_text": csv, "rows_preview": rows_preview }),
            ],
            audit: audit_json,
            inferred_meta,
            quality,
            confidence,
        });
    }

    Err(anyhow!(
        "Response JSON missing both 'transactions' and 'csv_text'"
    ))
}

// TODO: Helper for parse_extraction_result
#[allow(dead_code)]
fn strip_code_fences(input: &str) -> String {
    // Trim BOM/zero-width/nbsp and outer whitespace
    let s = input
        .trim_matches(|c| c == '\u{feff}' || c == '\u{200b}' || c == '\u{00a0}')
        .trim();

    // Find the first opening fence anywhere
    if let Some(start) = s.find("```") {
        // Slice after the opening ```
        let after = &s[start + 3..];

        // Split into lines; the first line may be a language tag or empty
        let mut lines = after.lines();

        // Drop optional language tag (handles ```json, ``` JSON, or just ```\n)
        let _ = lines.next();

        // Collect lines until a line that is a closing fence (allow spaces, CRLF)
        let mut body = String::new();
        for line in lines {
            if line.trim().starts_with("```") {
                break;
            }
            if !body.is_empty() {
                body.push('\n');
            }
            body.push_str(line);
        }

        let out = body.trim();
        if !out.is_empty() {
            return out.to_string();
        }
    }

    // No (useful) fenced block found; return original
    s.to_string()
}
