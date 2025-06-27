use axum::http::{HeaderName, HeaderValue, Method};
use dotenvy::dotenv;
use tokio::fs;
use tower_http::cors::{Any, CorsLayer};

use axum::{
    Json, Router,
    extract::Path as AxumPath,
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post},
};
use hyper;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;

#[derive(Deserialize)]
struct NewJournalEntry {
    title: String,
    text: String,
}

#[derive(Serialize, Deserialize)]
struct JournalVersion {
    title: String,
    text: String,
    timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, Deserialize)]
struct VersionedJournalEntry {
    id: u32,
    versions: Vec<JournalVersion>,
    preview_text: String,
}

#[derive(Serialize)]
struct JournalResponse {
    message: String,
}

async fn create_journal_entry(Json(payload): Json<NewJournalEntry>) -> Json<JournalResponse> {
    let new_version = JournalVersion {
        title: payload.title.clone(),
        text: payload.text.clone(),
        timestamp: chrono::Utc::now(),
    };

    let path = std::path::Path::new("journal.json");
    let mut entries: Vec<VersionedJournalEntry> = if path.exists() {
        let data = fs::read_to_string(path)
            .await
            .unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&data).unwrap_or_else(|_| vec![])
    } else {
        vec![]
    };

    let new_id = entries.last().map_or(1, |entry| entry.id + 1);

    let new_entry = VersionedJournalEntry {
        id: new_id,
        versions: vec![new_version],
        preview_text: payload.text.chars().take(300).collect(),
    };

    entries.push(new_entry);

    let json = serde_json::to_string_pretty(&entries).unwrap();
    fs::write(path, json).await.unwrap();

    println!("Saved new journal entry with id {}", new_id);

    Json(JournalResponse {
        message: format!("Journal entry #{} saved to journal.json.", new_id),
    })
}

async fn get_journal_entries() -> Json<Vec<VersionedJournalEntry>> {
    let path = std::path::Path::new("journal.json");

    let entries: Vec<VersionedJournalEntry> = if path.exists() {
        let data = fs::read_to_string(path)
            .await
            .unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&data).unwrap_or_else(|_| vec![])
    } else {
        vec![]
    };

    Json(entries)
}

async fn get_journal_entry_by_id(AxumPath(id): AxumPath<u32>) -> impl IntoResponse {
    let path = std::path::Path::new("journal.json");

    let entries: Vec<VersionedJournalEntry> = if path.exists() {
        let data = fs::read_to_string(path)
            .await
            .unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&data).unwrap_or_else(|_| vec![])
    } else {
        vec![]
    };

    match entries.into_iter().find(|entry| entry.id == id) {
        Some(entry) => Json(entry).into_response(),
        None => (StatusCode::NOT_FOUND, "Entry not found").into_response(),
    }
}

async fn edit_journal_entry(
    AxumPath(id): AxumPath<u32>,
    Json(payload): Json<NewJournalEntry>,
) -> impl IntoResponse {
    let path = std::path::Path::new("journal.json");

    let mut entries: Vec<VersionedJournalEntry> = if path.exists() {
        let data = fs::read_to_string(path)
            .await
            .unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&data).unwrap_or_else(|_| vec![])
    } else {
        vec![]
    };

    let mut found = false;

    for entry in &mut entries {
        if entry.id == id {
            entry.versions.push(JournalVersion {
                title: payload.title.clone(),
                text: payload.text.clone(),
                timestamp: chrono::Utc::now(),
            });
            entry.preview_text = payload.text.chars().take(300).collect();
            found = true;
            break;
        }
    }

    if found {
        let json = serde_json::to_string_pretty(&entries).unwrap();
        fs::write(path, json).await.unwrap();
        Json(JournalResponse {
            message: format!("Journal entry #{} updated.", id),
        })
        .into_response()
    } else {
        (StatusCode::NOT_FOUND, "Entry not found").into_response()
    }
}

async fn delete_journal_entry(AxumPath(id): AxumPath<u32>) -> impl IntoResponse {
    let path = std::path::Path::new("journal.json");

    let mut entries: Vec<VersionedJournalEntry> = if path.exists() {
        let data = fs::read_to_string(path)
            .await
            .unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&data).unwrap_or_else(|_| vec![])
    } else {
        vec![]
    };

    let original_len = entries.len();
    entries.retain(|entry| entry.id != id);

    if entries.len() < original_len {
        let json = serde_json::to_string_pretty(&entries).unwrap();
        fs::write(path, json).await.unwrap();
        Json(JournalResponse {
            message: format!("Journal entry #{} deleted.", id),
        })
        .into_response()
    } else {
        (StatusCode::NOT_FOUND, "Entry not found").into_response()
    }
}

#[derive(Serialize)]
struct SleepData {
    date: String,
    total_sleep_minutes: u32,
}

async fn fetch_oura_sleep() -> axum::Json<SleepData> {
    let dummy_data = SleepData {
        date: "2025-06-26".to_string(),
        total_sleep_minutes: 430,
    };
    axum::Json(dummy_data)
}
#[tokio::main]
async fn main() {
    dotenv().ok();

    let cors = CorsLayer::new()
        .allow_origin(HeaderValue::from_static("http://localhost:3000")) // ✅ match frontend origin
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
        .allow_headers([
            HeaderName::from_static("content-type"),
            HeaderName::from_static("accept"),
        ])
        .allow_credentials(true);

    let app = Router::new()
        .route("/", get(|| async { "Hello from backend" }))
        .route("/oura/sleep", get(fetch_oura_sleep))
        .route(
            "/journal",
            get(get_journal_entries).post(create_journal_entry),
        )
        .route(
            "/journal/:id",
            get(get_journal_entry_by_id)
                .patch(edit_journal_entry)
                .delete(delete_journal_entry),
        )
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3001));
    println!("Backend listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    let std_listener = listener.into_std().unwrap();
    hyper::Server::from_tcp(std_listener)
        .unwrap()
        .serve(app.into_make_service())
        .await
        .unwrap();
}
