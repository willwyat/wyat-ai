use axum::http::{HeaderName, HeaderValue, Method};
use dotenvy::dotenv;
use tokio::fs;
use tower_http::cors::{Any, CorsLayer};

use axum::{
    Extension, Json, Router,
    extract::{Path as AxumPath, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post},
};
use chrono::Utc;
use hyper;
use mongodb::bson::doc;
use mongodb::{Client as MongoClient, Collection, options::ClientOptions};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::net::SocketAddr;

mod oura;
use oura::{
    SleepData, fetch_oura_heart_rate_data, fetch_oura_sleep_data, fetch_oura_stress_data,
    fetch_oura_vo2_data, fetch_oura_workout_data, write_heart_rate_to_file, write_stress_to_file,
    write_vo2_to_file, write_workout_to_file,
};

use axum::extract::Query;
use std::collections::HashMap;

use axum::Json as AxumJson;
use reqwest::Client;
use std::env;
use std::sync::Arc;

#[derive(Deserialize)]
struct NewJournalEntry {
    title: String,
    text: String,
}

#[derive(Serialize, Deserialize, Clone)]
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

// MongoDB journal entry struct for storage
#[derive(Serialize, Deserialize, Debug)]
struct JournalEntry {
    title: String,
    text: String,
    timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Clone)]
struct AppState {
    mongo_client: MongoClient,
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
        versions: vec![new_version.clone()],
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

async fn test_mongo() -> impl IntoResponse {
    Json(json!({"status": "MongoDB endpoint ready"}))
}

async fn create_journal_entry_mongo(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<NewJournalEntry>,
) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let collection: Collection<JournalEntry> = db.collection("journal");
    let mongo_entry = JournalEntry {
        title: payload.title,
        text: payload.text,
        timestamp: chrono::Utc::now(),
    };
    match collection.insert_one(mongo_entry, None).await {
        Ok(_) => Json(json!({"status": "success", "message": "Saved to MongoDB"})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
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

async fn fetch_oura_sleep() -> impl IntoResponse {
    println!("Loaded OURA_API_URL: {:?}", std::env::var("OURA_API_URL"));
    match fetch_oura_sleep_data("2025-06-25", "2025-06-26").await {
        Ok(data) => Json(data).into_response(),
        Err(err) => (StatusCode::BAD_GATEWAY, err).into_response(),
    }
}

async fn sync_oura_sleep(Query(params): Query<HashMap<String, String>>) -> impl IntoResponse {
    let today = chrono::Utc::now().date_naive();
    let default_date = (today - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    let start_date = params
        .get("start")
        .map(|s| s.as_str())
        .unwrap_or(&default_date);
    let end_date = params
        .get("end")
        .map(|s| s.as_str())
        .unwrap_or(&default_date);

    match fetch_oura_sleep_data(start_date, end_date).await {
        Ok(sleep_data) => match oura::write_sleep_summary_to_file(&sleep_data).await {
            Ok(_) => Json(JournalResponse {
                message: format!("Synced sleep data for {} → {}", start_date, end_date),
            })
            .into_response(),
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        },
        Err(err) => (StatusCode::BAD_GATEWAY, err).into_response(),
    }
}

async fn fetch_oura_workouts() -> impl IntoResponse {
    match fetch_oura_workout_data("2025-06-02", "2025-06-24").await {
        Ok(data) => Json(data).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e).into_response(),
    }
}

async fn sync_oura_workouts(Query(params): Query<HashMap<String, String>>) -> impl IntoResponse {
    let today = chrono::Utc::now().date_naive();
    let default = (today - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    let start = params.get("start").unwrap_or(&default).as_str();
    let end = params.get("end").unwrap_or(&default).as_str();

    match fetch_oura_workout_data(start, end).await {
        Ok(data) => match write_workout_to_file(&data).await {
            Ok(_) => Json(JournalResponse {
                message: format!("Synced workouts {}→{}", start, end),
            })
            .into_response(),
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        },
        Err(e) => (StatusCode::BAD_GATEWAY, e).into_response(),
    }
}

async fn fetch_oura_heart_rate() -> impl IntoResponse {
    match fetch_oura_heart_rate_data("2025-06-01", "2025-06-25").await {
        Ok(data) => Json(data).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e).into_response(),
    }
}

async fn sync_oura_heart_rate(Query(params): Query<HashMap<String, String>>) -> impl IntoResponse {
    let today = chrono::Utc::now().date_naive();
    let default = (today - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    let start = params.get("start").unwrap_or(&default).as_str();
    let end = params.get("end").unwrap_or(&default).as_str();

    match fetch_oura_heart_rate_data(start, end).await {
        Ok(data) => match write_heart_rate_to_file(&data).await {
            Ok(_) => Json(JournalResponse {
                message: format!("Synced heart rate {}→{}", start, end),
            })
            .into_response(),
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        },
        Err(e) => (StatusCode::BAD_GATEWAY, e).into_response(),
    }
}

async fn fetch_oura_vo2() -> impl IntoResponse {
    match fetch_oura_vo2_data("2025-06-01", "2025-06-25").await {
        Ok(data) => Json(data).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e).into_response(),
    }
}

async fn sync_oura_vo2(Query(params): Query<HashMap<String, String>>) -> impl IntoResponse {
    let today = chrono::Utc::now().date_naive();
    let default = (today - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    let start = params.get("start").unwrap_or(&default).as_str();
    let end = params.get("end").unwrap_or(&default).as_str();

    match fetch_oura_vo2_data(start, end).await {
        Ok(data) => match write_vo2_to_file(&data).await {
            Ok(_) => Json(JournalResponse {
                message: format!("Synced VO2 max {}→{}", start, end),
            })
            .into_response(),
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        },
        Err(e) => (StatusCode::BAD_GATEWAY, e).into_response(),
    }
}

async fn fetch_oura_stress() -> impl IntoResponse {
    match fetch_oura_stress_data("2025-06-01", "2025-06-25").await {
        Ok(data) => Json(data).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e).into_response(),
    }
}

async fn sync_oura_stress(Query(params): Query<HashMap<String, String>>) -> impl IntoResponse {
    let today = chrono::Utc::now().date_naive();
    let default = (today - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    let start = params.get("start").unwrap_or(&default).as_str();
    let end = params.get("end").unwrap_or(&default).as_str();

    match fetch_oura_stress_data(start, end).await {
        Ok(data) => match write_stress_to_file(&data).await {
            Ok(_) => Json(JournalResponse {
                message: format!("Synced stress {}→{}", start, end),
            })
            .into_response(),
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        },
        Err(e) => (StatusCode::BAD_GATEWAY, e).into_response(),
    }
}

#[derive(Serialize)]
struct PlaidLinkTokenRequest<'a> {
    client_id: &'a str,
    secret: &'a str,
    client_name: &'a str,
    language: &'a str,
    country_codes: Vec<&'a str>,
    user: PlaidUser,
    products: Vec<&'a str>,
}

#[derive(Serialize)]
struct PlaidUser {
    client_user_id: String,
}

#[derive(Serialize, Deserialize)]
struct PlaidLinkTokenResponse {
    link_token: String,
}

pub async fn create_plaid_link_token() -> impl IntoResponse {
    let client_id = match env::var("PLAID_CLIENT_ID") {
        Ok(id) => id,
        Err(e) => {
            return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    };
    let secret = match env::var("PLAID_SECRET") {
        Ok(secret) => secret,
        Err(e) => {
            return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    };

    let payload = PlaidLinkTokenRequest {
        client_id: &client_id,
        secret: &secret,
        client_name: "Wyat AI",
        language: "en",
        country_codes: vec!["US"],
        user: PlaidUser {
            client_user_id: "wyat-demo-user".to_string(),
        },
        products: vec!["transactions"],
    };

    let client = Client::new();
    let response = match client
        .post("https://sandbox.plaid.com/link/token/create")
        .json(&payload)
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(e) => {
            return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    };

    let text = response.text().await.unwrap_or_else(|e| {
        println!("Failed to read response text: {}", e);
        "{}".to_string()
    });
    println!("Plaid response: {}", text);

    // Then try to deserialize it
    let json = match serde_json::from_str::<PlaidLinkTokenResponse>(&text) {
        Ok(json) => json,
        Err(e) => {
            println!("Deserialization error: {}", e);
            return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    };

    AxumJson(json).into_response()
}

#[derive(Serialize, Deserialize, Debug)]
struct OuraSleepRecord {
    summary_date: String,
    total_sleep: i32,
    score: i32,
    timestamp: chrono::DateTime<chrono::Utc>,
}

async fn log_oura_sleep_data(
    Json(payload): Json<OuraSleepRecord>,
    Extension(mongo_client): Extension<MongoClient>,
) -> impl IntoResponse {
    let db = mongo_client.database("wyat");
    let collection: Collection<OuraSleepRecord> = db.collection("oura_sleep");

    let record = OuraSleepRecord {
        summary_date: payload.summary_date,
        total_sleep: payload.total_sleep,
        score: payload.score,
        timestamp: chrono::Utc::now(),
    };

    match collection.insert_one(record, None).await {
        Ok(_) => Json(json!({"status": "success"})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[tokio::main]
async fn main() {
    dotenv().ok();

    // MongoDB: connect to Atlas
    let mongo_uri = std::env::var("MONGODB_URI").expect("Missing MONGODB_URI in .env");
    let mongo_options = ClientOptions::parse(&mongo_uri)
        .await
        .expect("Failed to parse MongoDB options");
    let mongo_client =
        MongoClient::with_options(mongo_options).expect("Failed to connect to MongoDB");

    println!("✅ Connected to MongoDB Atlas");

    let state = Arc::new(AppState { mongo_client });

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
        .route(
            "/journal",
            get(get_journal_entries).post(create_journal_entry),
        )
        .route("/journal/mongo", post(create_journal_entry_mongo))
        .route(
            "/journal/:id",
            get(get_journal_entry_by_id)
                .patch(edit_journal_entry)
                .delete(delete_journal_entry),
        )
        .route("/oura/sleep", get(fetch_oura_sleep))
        .route("/oura/sleep/sync", get(sync_oura_sleep))
        .route("/oura/workout", get(fetch_oura_workouts))
        .route("/oura/workout/sync", get(sync_oura_workouts))
        .route("/oura/heart_rate", get(fetch_oura_heart_rate))
        .route("/oura/heart_rate/sync", get(sync_oura_heart_rate))
        .route("/oura/vO2_max", get(fetch_oura_vo2))
        .route("/oura/vO2_max/sync", get(sync_oura_vo2))
        .route("/oura/stress", get(fetch_oura_stress))
        .route("/oura/stress/sync", get(sync_oura_stress))
        .route("/plaid/link-token/create", get(create_plaid_link_token))
        .route("/test-mongo", get(test_mongo))
        .layer(cors)
        .with_state(state.clone());

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
