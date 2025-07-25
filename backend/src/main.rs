mod journal;
use axum::http::{HeaderName, HeaderValue, Method};
use dotenvy::dotenv;
mod vitals;
use journal::{
    AppState, create_journal_entry_mongo, delete_journal_entry_mongo, edit_journal_entry_mongo,
    get_journal_entries_mongo, get_journal_entry_by_id_mongo,
};
use tower_http::cors::CorsLayer;

use axum::{
    Json, Router,
    response::IntoResponse,
    routing::{delete, get, patch, post},
};
use hyper;
use mongodb::bson::doc;
use mongodb::{Client as MongoClient, options::ClientOptions};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::net::SocketAddr;

mod services;
use services::oura::{
    generate_oura_auth_url, handle_oura_callback, handle_oura_daily_activity_sync,
    handle_oura_daily_cardiovascular_age_sync, handle_oura_daily_readiness_sync,
    handle_oura_daily_resilience_sync, handle_oura_daily_sleep_sync, handle_oura_daily_spo2_sync,
    handle_oura_daily_stress_sync, handle_oura_heartrate_sync, handle_oura_historical_sync,
    handle_oura_sleep_sync, handle_oura_vo2_max_sync,
};
use vitals::{
    get_daily_activity, get_daily_cardiovascular_age, get_daily_readiness, get_daily_resilience,
    get_daily_spo2, get_daily_stress, get_vo2_max,
};

use axum::Json as AxumJson;
use reqwest::Client;
use std::env;
use std::sync::Arc;

async fn test_mongo() -> impl IntoResponse {
    Json(json!({"status": "MongoDB endpoint ready"}))
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

    let origin =
        std::env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".to_string());

    let cors = CorsLayer::new()
        .allow_origin(origin.parse::<HeaderValue>().unwrap())
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
        .allow_headers([
            HeaderName::from_static("content-type"),
            HeaderName::from_static("accept"),
            HeaderName::from_static("x-wyat-api-key"),
        ])
        .allow_credentials(true);

    let app = Router::new()
        .route("/", get(|| async { "Hello from backend" }))
        .route("/journal/mongo", post(create_journal_entry_mongo))
        .route("/journal/mongo/all", get(get_journal_entries_mongo))
        .route("/journal/mongo/:id", get(get_journal_entry_by_id_mongo))
        .route("/journal/mongo/:id", patch(edit_journal_entry_mongo))
        .route("/journal/mongo/:id", delete(delete_journal_entry_mongo))
        .route("/oura/sleep/sync", get(handle_oura_sleep_sync))
        .route("/oura/daily-sleep/sync", get(handle_oura_daily_sleep_sync))
        .route(
            "/oura/daily-activity/sync",
            get(handle_oura_daily_activity_sync),
        )
        .route(
            "/oura/daily-stress/sync",
            get(handle_oura_daily_stress_sync),
        )
        .route(
            "/oura/daily-cardiovascular-age/sync",
            get(handle_oura_daily_cardiovascular_age_sync),
        )
        .route(
            "/oura/daily-readiness/sync",
            get(handle_oura_daily_readiness_sync),
        )
        .route(
            "/oura/daily-resilience/sync",
            get(handle_oura_daily_resilience_sync),
        )
        .route("/oura/daily-spo2/sync", get(handle_oura_daily_spo2_sync))
        .route("/oura/vo2-max/sync", get(handle_oura_vo2_max_sync))
        .route("/oura/heartrate/sync", get(handle_oura_heartrate_sync))
        .route("/oura/historical-sync", get(handle_oura_historical_sync))
        .route("/api/oura/auth", get(generate_oura_auth_url))
        .route("/api/oura/callback", get(handle_oura_callback))
        .route("/plaid/link-token/create", get(create_plaid_link_token))
        .route("/test-mongo", get(test_mongo))
        // .route("/vitals/daily", get(get_daily_vitals))
        .route("/vitals/readiness", get(get_daily_readiness))
        .route("/vitals/activity", get(get_daily_activity))
        .route(
            "/vitals/cardiovascular-age",
            get(get_daily_cardiovascular_age),
        )
        .route("/vitals/resilience", get(get_daily_resilience))
        .route("/vitals/spo2", get(get_daily_spo2))
        .route("/vitals/stress", get(get_daily_stress))
        .route("/vitals/vo2-max", get(get_vo2_max))
        .layer(cors)
        .with_state(state.clone());

    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("Backend listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    let std_listener = listener.into_std().unwrap();
    hyper::Server::from_tcp(std_listener)
        .unwrap()
        .serve(app.into_make_service())
        .await
        .unwrap();
}
