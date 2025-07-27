use async_openai::types::{
    ChatCompletionRequestMessageArgs, CreateChatCompletionRequestArgs, Role,
};
use async_openai::{Client, config::OpenAIConfig};

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
