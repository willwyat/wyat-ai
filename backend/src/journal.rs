// backend/src/journal.rs
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::{DateTime, Utc};
use futures::stream::TryStreamExt;
use mongodb::bson::oid::ObjectId;
use mongodb::{
    Client as MongoClient, Collection,
    bson::{doc, to_bson},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub mongo_client: MongoClient,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JournalVersion {
    pub text: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JournalEntry {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub title: String,
    pub versions: Vec<JournalVersion>,
    pub preview_text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewJournalEntry {
    pub title: String,
    pub text: String,
}

#[derive(Serialize)]
pub struct JournalResponse {
    pub message: String,
}

pub async fn create_journal_entry_mongo(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<NewJournalEntry>,
) -> impl axum::response::IntoResponse {
    let expected_key = std::env::var("WYAT_API_KEY").unwrap_or_default();
    let provided_key = headers.get("x-wyat-api-key").and_then(|v| v.to_str().ok());

    if provided_key != Some(expected_key.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            "Unauthorized: missing or invalid API key",
        )
            .into_response();
    }

    let db = state.mongo_client.database("wyat");
    let collection: Collection<JournalEntry> = db.collection("journal");
    let version = JournalVersion {
        text: payload.text.clone(),
        timestamp: Utc::now(),
    };

    let preview_text = payload.text.chars().take(100).collect::<String>();

    let new_entry = JournalEntry {
        id: None,
        title: payload.title.clone(),
        versions: vec![version],
        preview_text,
    };
    match collection.insert_one(new_entry, None).await {
        Ok(_) => Json(serde_json::json!({"status": "success", "message": "Saved to MongoDB"}))
            .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_journal_entries_mongo(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    let expected_key = std::env::var("WYAT_API_KEY").unwrap_or_default();
    let provided_key = headers.get("x-wyat-api-key").and_then(|v| v.to_str().ok());

    if provided_key != Some(expected_key.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            "Unauthorized: missing or invalid API key",
        )
            .into_response();
    }

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
    Json(entries).into_response()
}

pub async fn get_journal_entry_by_id_mongo(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    let expected_key = std::env::var("WYAT_API_KEY").unwrap_or_default();
    let provided_key = headers.get("x-wyat-api-key").and_then(|v| v.to_str().ok());

    if provided_key != Some(expected_key.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            "Unauthorized: missing or invalid API key",
        )
            .into_response();
    }
    use mongodb::bson::doc;
    let db = state.mongo_client.database("wyat");
    let collection: Collection<JournalEntry> = db.collection("journal");

    // Attempt to parse the string ID into an ObjectId
    let object_id = match mongodb::bson::oid::ObjectId::parse_str(&id) {
        Ok(oid) => oid,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid ID format").into_response(),
    };

    match collection.find_one(doc! { "_id": object_id }, None).await {
        Ok(Some(entry)) => Json(entry).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Entry not found").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn edit_journal_entry_mongo(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<NewJournalEntry>,
) -> impl IntoResponse {
    let expected_key = std::env::var("WYAT_API_KEY").unwrap_or_default();
    let provided_key = headers.get("x-wyat-api-key").and_then(|v| v.to_str().ok());

    if provided_key != Some(expected_key.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            "Unauthorized: missing or invalid API key",
        )
            .into_response();
    }
    let db = state.mongo_client.database("wyat");
    let collection: Collection<JournalEntry> = db.collection("journal");

    let object_id = match mongodb::bson::oid::ObjectId::parse_str(&id) {
        Ok(oid) => oid,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid ID format").into_response(),
    };

    let filter = doc! { "_id": object_id };
    let new_version = JournalVersion {
        text: payload.text.clone(),
        timestamp: Utc::now(),
    };
    let preview_text = payload.text.chars().take(100).collect::<String>();
    let update = doc! {
        "$push": { "versions": to_bson(&new_version).unwrap() },
        "$set": { "preview_text": preview_text }
    };

    match collection.update_one(filter, update, None).await {
        Ok(update_result) => {
            if update_result.matched_count == 1 {
                Json(JournalResponse {
                    message: format!("Journal entry {} updated in MongoDB.", id),
                })
                .into_response()
            } else {
                (StatusCode::NOT_FOUND, "Entry not found").into_response()
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn delete_journal_entry_mongo(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    let expected_key = std::env::var("WYAT_API_KEY").unwrap_or_default();
    let provided_key = headers.get("x-wyat-api-key").and_then(|v| v.to_str().ok());

    if provided_key != Some(expected_key.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            "Unauthorized: missing or invalid API key",
        )
            .into_response();
    }
    let db = state.mongo_client.database("wyat");
    let collection: Collection<JournalEntry> = db.collection("journal");

    let object_id = match mongodb::bson::oid::ObjectId::parse_str(&id) {
        Ok(oid) => oid,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid ID format").into_response(),
    };

    let filter = doc! { "_id": object_id };

    match collection.delete_one(filter, None).await {
        Ok(delete_result) => {
            if delete_result.deleted_count == 1 {
                Json(JournalResponse {
                    message: format!("Journal entry {} deleted from MongoDB.", id),
                })
                .into_response()
            } else {
                (StatusCode::NOT_FOUND, "Entry not found").into_response()
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
