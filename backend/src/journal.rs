// backend/src/journal.rs
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use chrono::Utc;
use mongodb::{Client as MongoClient, Collection, bson::doc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub mongo_client: MongoClient,
}

#[derive(Deserialize)]
pub struct NewJournalEntry {
    pub title: String,
    pub text: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct JournalEntry {
    pub title: String,
    pub text: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize)]
pub struct JournalResponse {
    pub message: String,
}

pub async fn create_journal_entry_mongo(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<NewJournalEntry>,
) -> impl axum::response::IntoResponse {
    let db = state.mongo_client.database("wyat");
    let collection: Collection<JournalEntry> = db.collection("journal");
    let mongo_entry = JournalEntry {
        title: payload.title,
        text: payload.text,
        timestamp: Utc::now(),
    };
    match collection.insert_one(mongo_entry, None).await {
        Ok(_) => Json(serde_json::json!({"status": "success", "message": "Saved to MongoDB"}))
            .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_journal_entries_mongo(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<JournalEntry>> {
    let db = state.mongo_client.database("wyat");
    let collection: Collection<JournalEntry> = db.collection("journal");
    let mut cursor = collection
        .find(None, None)
        .await
        .unwrap_or_else(|_| panic!("Find failed"));
    let mut entries = Vec::new();
    while let Some(doc) = cursor.try_next().await.unwrap_or(None) {
        entries.push(doc);
    }
    Json(entries)
}
