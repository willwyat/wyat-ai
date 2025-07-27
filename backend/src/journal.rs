// backend/src/journal.rs
use crate::services::openai::generate_tags_and_keywords;
use axum::{
    Json,
    extract::{Path, Query, State},
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
use regex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
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

// ===============================
// * * * * Tags & Keywords * * * *
// ===============================
pub async fn patch_journal_entry_tags_and_keywords(
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

    // Parse the ObjectId
    let object_id = match ObjectId::parse_str(&id) {
        Ok(oid) => oid,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid ID format").into_response(),
    };

    // Find the specific entry
    let entry = match collection.find_one(doc! { "_id": object_id }, None).await {
        Ok(Some(entry)) => entry,
        Ok(None) => return (StatusCode::NOT_FOUND, "Entry not found").into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let latest_text = entry.versions.last().unwrap().text.clone();
    println!("Processing entry: {}", entry.title);

    let Ok((tags, keywords)) = generate_tags_and_keywords(&latest_text).await else {
        println!(
            "Failed to generate tags/keywords for entry: {}",
            entry.title
        );
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to generate tags and keywords",
        )
            .into_response();
    };

    println!("Generated tags: {:?}", tags);
    println!("Generated keywords: {:?}", keywords);

    // Clone tags and keywords for the response
    let tags_clone = tags.clone();
    let keywords_clone = keywords.clone();

    // Use $addToSet to add tags and keywords without replacing existing ones
    let update = doc! {
        "$addToSet": {
            "tags": { "$each": tags },
            "keywords": { "$each": keywords }
        }
    };

    match collection
        .update_one(doc! { "_id": object_id }, update, None)
        .await
    {
        Ok(result) => {
            println!(
                "Updated entry {}: {} documents modified",
                entry.title, result.modified_count
            );
            Json(json!({
                "status": "success",
                "message": format!("Added tags and keywords to entry: {}", entry.title),
                "generated_tags": tags_clone,
                "generated_keywords": keywords_clone,
                "modified_count": result.modified_count
            }))
            .into_response()
        }
        Err(e) => {
            println!("Failed to update entry {}: {}", entry.title, e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database update error: {}", e),
            )
                .into_response()
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct EditTagsPayload {
    pub add: Option<Vec<String>>,
    pub remove: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JournalEntryId {
    #[serde(rename = "_id")]
    pub id: ObjectId,
}

pub async fn edit_journal_entry_tags(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<EditTagsPayload>,
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

    let object_id = match ObjectId::parse_str(&id) {
        Ok(oid) => oid,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid ID format").into_response(),
    };

    let mut update_doc = doc! {};

    if let Some(add_tags) = &payload.add {
        if !add_tags.is_empty() {
            update_doc.insert("$addToSet", doc! { "tags": { "$each": add_tags } });
        }
    }

    if let Some(remove_tags) = &payload.remove {
        if !remove_tags.is_empty() {
            update_doc.insert("$pull", doc! { "tags": { "$in": remove_tags } });
        }
    }

    if update_doc.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            "Nothing to update: provide 'add' or 'remove' arrays.",
        )
            .into_response();
    }

    match collection
        .update_one(doc! { "_id": object_id }, update_doc, None)
        .await
    {
        Ok(result) => Json(json!({
            "status": "success",
            "modified_count": result.modified_count
        }))
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database update error: {}", e),
        )
            .into_response(),
    }
}

// ========================================
// * * * * Search Simple & Semantic * * * *
// ========================================
pub async fn search_journal_entries(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Query(params): Query<HashMap<String, String>>,
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

    // Accept search terms like: ?q=history,ceremonial,mystery
    let search_terms = params.get("q").map(|s| {
        s.split(',')
            .map(|term| term.trim())
            .filter(|term| !term.is_empty())
            .collect::<Vec<_>>()
    });

    let filter = if let Some(terms) = search_terms {
        // Build regex patterns for each term
        let mut or_conditions = Vec::new();

        for term in terms {
            let regex_pattern = format!(".*{}.*", regex::escape(term));
            let regex_pattern_clone = regex_pattern.clone();
            or_conditions.push(doc! {
                "tags": { "$elemMatch": { "$regex": regex_pattern, "$options": "i" } }
            });
            or_conditions.push(doc! {
                "keywords": { "$elemMatch": { "$regex": regex_pattern_clone, "$options": "i" } }
            });
        }

        doc! {
            "$or": or_conditions
        }
    } else {
        doc! {} // return all if no query
    };

    let mut cursor = match collection.find(filter, None).await {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut entries = Vec::new();
    while let Some(doc) = match cursor.try_next().await {
        Ok(doc) => doc,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    } {
        entries.push(doc);
    }

    Json(entries).into_response()
}

pub async fn search_journal_entries_return_ids(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Query(params): Query<HashMap<String, String>>,
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

    // Accept search terms like: ?q=history,ceremonial,mystery
    let search_terms = params.get("q").map(|s| {
        s.split(',')
            .map(|term| term.trim())
            .filter(|term| !term.is_empty())
            .collect::<Vec<_>>()
    });

    let filter = if let Some(terms) = search_terms {
        // Build regex patterns for each term
        let mut or_conditions = Vec::new();

        for term in terms {
            let regex_pattern = format!(".*{}.*", regex::escape(term));
            let regex_pattern_clone = regex_pattern.clone();
            or_conditions.push(doc! {
                "tags": { "$elemMatch": { "$regex": regex_pattern, "$options": "i" } }
            });
            or_conditions.push(doc! {
                "keywords": { "$elemMatch": { "$regex": regex_pattern_clone, "$options": "i" } }
            });
        }

        doc! {
            "$or": or_conditions
        }
    } else {
        doc! {} // return all if no query
    };

    let mut cursor = match collection.find(filter, None).await {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut ids = Vec::new();
    while let Some(doc) = match cursor.try_next().await {
        Ok(doc) => doc,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    } {
        // Extract just the ID from the document
        if let Some(id) = doc.id {
            ids.push(id.to_string());
        }
    }

    Json(ids).into_response()
}
