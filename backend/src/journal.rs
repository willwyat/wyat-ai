// backend/src/journal.rs
use crate::services::openai::generate_tags_and_keywords;
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
use serde_json::json;
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
    pub date_unix: i64,
    pub versions: Vec<JournalVersion>,
    pub preview_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keywords: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewJournalEntry {
    pub title: String,
    pub text: String,
    pub date_unix: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EditJournalEntry {
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
    let date_unix = payload.date_unix;

    let new_entry = JournalEntry {
        id: None,
        title: payload.title.clone(),
        date_unix,
        versions: vec![version],
        preview_text,
        tags: None,
        keywords: None,
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

    let mut cursor = match collection.find(None, None).await {
        Ok(cursor) => cursor,
        Err(e) => {
            println!("MongoDB find error: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
            )
                .into_response();
        }
    };

    let mut entries = Vec::new();
    while let Some(doc) = match cursor.try_next().await {
        Ok(doc) => doc,
        Err(e) => {
            println!("MongoDB cursor error: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
            )
                .into_response();
        }
    } {
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
    Json(payload): Json<EditJournalEntry>,
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

pub async fn patch_all_journal_entries_metadata(
    State(state): State<Arc<AppState>>,
    _: axum::http::HeaderMap,
) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let collection: Collection<JournalEntry> = db.collection("journal");

    let cursor = collection.find(None, None).await.unwrap();
    let entries: Vec<_> = cursor.try_collect().await.unwrap();

    for entry in entries {
        let latest_text = entry.versions.last().unwrap().text.clone();
        println!("Processing entry: {}", entry.title);

        let Ok((tags, keywords)) = generate_tags_and_keywords(&latest_text).await else {
            println!(
                "Failed to generate tags/keywords for entry: {}",
                entry.title
            );
            continue; // Skip entries that fail
        };

        println!("Generated tags: {:?}", tags);
        println!("Generated keywords: {:?}", keywords);

        let Some(entry_id) = entry.id else {
            println!("Entry has no ID: {}", entry.title);
            continue; // Skip entries without ID
        };

        let filter = doc! { "_id": entry_id };
        let update = doc! {
            "$set": {
                "tags": tags,
                "keywords": keywords
            }
        };

        match collection.update_one(filter, update, None).await {
            Ok(result) => println!(
                "Updated entry {}: {} documents modified",
                entry.title, result.modified_count
            ),
            Err(e) => println!("Failed to update entry {}: {}", entry.title, e),
        }
    }

    Json(json!({ "status": "patched" })).into_response()
}
