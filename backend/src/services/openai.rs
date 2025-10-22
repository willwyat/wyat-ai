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
) -> Result<String> {
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

    // 8) Return raw response (no parsing yet - let caller decide)
    println!("=== extract_bank_statement SUCCESS ===");
    println!(
        "Response preview: {}",
        response_text.chars().take(200).collect::<String>()
    );

    Ok(response_text)
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

    let request = CreateAssistantRequestArgs::default()
        .model(model)
        .name(name)
        .instructions(instructions)
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
    let request = CreateMessageRequestArgs::default()
        .role(MessageRole::User)
        .content(prompt.to_string())
        .attachments(vec![async_openai::types::MessageAttachment {
            file_id: file_id.to_string(),
            tools: vec![],
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
    let max_attempts = 120; // 60 seconds max (500ms intervals)
    let mut attempts = 0;

    loop {
        attempts += 1;
        if attempts > max_attempts {
            return Err(anyhow!("Run timed out after {} attempts", max_attempts));
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
                tokio::time::sleep(Duration::from_millis(500)).await;
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
    let cleaned = strip_code_fences(response_text);

    let v: serde_json::Value = serde_json::from_str(&cleaned).map_err(|e| {
        println!("JSON parsing error: {}", e);
        println!(
            "Cleaned content preview: {}",
            cleaned.chars().take(500).collect::<String>()
        );
        anyhow!("Model did not return valid JSON: {}", e)
    })?;

    // Extract required fields
    let transactions = v
        .get("transactions")
        .and_then(|x| x.as_array())
        .cloned()
        .ok_or_else(|| anyhow!("Missing or invalid 'transactions' field"))?;

    let audit = v.get("audit").cloned().unwrap_or(serde_json::json!({}));

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

    Ok(ExtractResult {
        transactions,
        audit,
        inferred_meta,
        quality,
        confidence,
    })
}

// TODO: Helper for parse_extraction_result
#[allow(dead_code)]
fn strip_code_fences(s: &str) -> String {
    let s = s.trim();
    if s.starts_with("```") {
        let s = s.trim_start_matches("```json").trim_start_matches("```");
        return s.trim_end_matches("```").trim().to_string();
    }
    s.to_string()
}
