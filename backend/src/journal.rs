// backend/src/journal.rs
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::Utc;
use futures::stream::TryStreamExt;
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
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<mongodb::bson::oid::ObjectId>,
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
        id: None,
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

pub async fn get_journal_entry_by_id_mongo(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    use mongodb::bson::{Bson, doc};
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
    Json(payload): Json<NewJournalEntry>,
) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let collection: Collection<JournalEntry> = db.collection("journal");

    let object_id = match mongodb::bson::oid::ObjectId::parse_str(&id) {
        Ok(oid) => oid,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid ID format").into_response(),
    };

    let filter = doc! { "_id": object_id };
    let update = doc! {
        "$set": {
            "title": payload.title,
            "text": payload.text,
            "timestamp": mongodb::bson::DateTime::from(std::time::SystemTime::now()),
        }
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
) -> impl IntoResponse {
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
