use anyhow::{Result, bail};
use chrono::Utc;
use mongodb::{
    Database,
    bson::{self, doc, oid::ObjectId},
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractionRun {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub doc_id: ObjectId,
    pub kind: String,
    pub model: String,
    pub prompt: String,
    pub metadata: bson::Document,
    pub status: String,
    pub expires_at: Option<i64>,
    pub created_at: i64,
}

pub async fn create_extraction_run(
    db: &Database,
    doc_id: ObjectId,
    kind: &str,
    model: &str,
    prompt: String,
    metadata: bson::Document,
) -> Result<ExtractionRun> {
    let runs = db.collection::<ExtractionRun>("doc_extraction_runs");
    let run = ExtractionRun {
        id: ObjectId::new(),
        doc_id,
        kind: kind.to_string(),
        model: model.to_string(),
        prompt,
        metadata,
        status: "succeeded".to_string(),
        expires_at: None,
        created_at: Utc::now().timestamp(),
    };
    runs.insert_one(&run, None).await?;
    update_document_extraction_run(db, doc_id, run.id).await?;
    Ok(run.clone())
}

pub async fn update_document_extraction_run(
    db: &Database,
    doc_id: ObjectId,
    extraction_run_id: ObjectId,
) -> Result<()> {
    let docs = db.collection::<bson::Document>("documents");

    let update = doc! {
        "$set": {
            "latest_extraction_run_id": extraction_run_id,
            "updated_at": Utc::now().timestamp(),
        }
    };

    let result = docs
        .update_one(doc! { "_id": doc_id }, update, None)
        .await?;
    if result.matched_count == 0 {
        bail!("document not found");
    }
    Ok(())
}
