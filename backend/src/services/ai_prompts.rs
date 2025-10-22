use anyhow::Result;
use mongodb::{Database, bson::doc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiPrompt {
    #[serde(rename = "_id")]
    pub _id: mongodb::bson::oid::ObjectId,
    pub id: String,
    pub namespace: String,
    pub task: String,
    pub version: i32,
    pub description: Option<String>,
    pub model: Option<String>,
    pub prompt_template: String,
    #[serde(default)]
    pub created_at: Option<mongodb::bson::DateTime>,
    #[serde(default)]
    pub updated_at: Option<mongodb::bson::DateTime>,
}

/// Get an AI prompt by its ID
pub async fn get_prompt_by_id(db: &Database, prompt_id: &str) -> Result<AiPrompt> {
    println!("=== get_prompt_by_id START ===");
    println!("Fetching prompt with id: {}", prompt_id);

    let coll = db.collection::<AiPrompt>("ai_prompts");
    let prompt = coll
        .find_one(doc! {"id": prompt_id}, None)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Prompt not found: {}", prompt_id))?;

    println!("Prompt found: {}", prompt.id);
    println!(
        "Prompt template length: {} chars",
        prompt.prompt_template.len()
    );
    println!("=== get_prompt_by_id SUCCESS ===");

    Ok(prompt)
}

/// List all prompts (optionally filtered by namespace)
pub async fn list_prompts(db: &Database, namespace: Option<&str>) -> Result<Vec<AiPrompt>> {
    println!("=== list_prompts START ===");

    let coll = db.collection::<AiPrompt>("ai_prompts");
    let filter = if let Some(ns) = namespace {
        println!("Filtering by namespace: {}", ns);
        doc! {"namespace": ns}
    } else {
        doc! {}
    };

    let mut cursor = coll.find(filter, None).await?;
    let mut prompts = Vec::new();

    use futures::stream::StreamExt;
    while let Some(result) = cursor.next().await {
        match result {
            Ok(prompt) => prompts.push(prompt),
            Err(e) => eprintln!("Error reading prompt: {}", e),
        }
    }

    println!("Found {} prompts", prompts.len());
    println!("=== list_prompts SUCCESS ===");

    Ok(prompts)
}
