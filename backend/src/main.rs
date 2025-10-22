mod capital;
mod journal;
use axum::http::{HeaderName, HeaderValue, Method};
use dotenvy::dotenv;
mod meta;
mod storage;
mod vitals;
mod workout;

// AppState is now defined in the root module
pub struct AppState {
    pub mongo_client: mongodb::Client,
}

use journal::{
    create_journal_entry_mongo, delete_journal_entry_mongo, edit_journal_entry_mongo,
    edit_journal_entry_tags, get_journal_entries_mongo, get_journal_entry_by_date_mongo,
    get_journal_entry_by_id_mongo, patch_journal_entry_tags_and_keywords, search_journal_entries,
    search_journal_entries_return_ids,
};
use meta::{
    add_person, add_place, delete_person, delete_place, get_capital_readme,
    get_keywording_best_practices, get_person_registry, get_place_registry, get_tag_taxonomy,
    update_capital_readme, update_keywording_best_practices, update_person, update_place,
    update_tag_taxonomy,
};
use tower_http::cors::CorsLayer;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use axum::{
    Json, Router,
    response::IntoResponse,
    routing::{delete, get, patch, post, put},
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
use services::storage_http;
use vitals::{
    get_daily_activity, get_daily_cardiovascular_age, get_daily_readiness, get_daily_resilience,
    get_daily_spo2, get_daily_stress, get_vo2_max,
};
use workout::init_indexes;

use axum::Json as AxumJson;
use reqwest::Client;
use std::env;
use std::sync::Arc;

async fn test_mongo() -> impl IntoResponse {
    Json(json!({"status": "MongoDB endpoint ready"}))
}

// AI Prompts handlers
use axum::extract::{Path as AxumPath, Query as AxumQuery, State as AxumState};
use services::ai_prompts::{AiPrompt, get_prompt_by_id, list_prompts};

async fn get_ai_prompt_handler(
    AxumState(state): AxumState<Arc<AppState>>,
    AxumPath(prompt_id): AxumPath<String>,
) -> Result<Json<AiPrompt>, axum::http::StatusCode> {
    println!("=== get_ai_prompt_handler START ===");
    println!("Prompt ID: {}", prompt_id);

    let db = state.mongo_client.database("wyat");

    match get_prompt_by_id(&db, &prompt_id).await {
        Ok(prompt) => {
            println!("=== get_ai_prompt_handler SUCCESS ===");
            Ok(Json(prompt))
        }
        Err(e) => {
            eprintln!("=== get_ai_prompt_handler ERROR ===");
            eprintln!("Error: {}", e);
            Err(axum::http::StatusCode::NOT_FOUND)
        }
    }
}

#[derive(Deserialize)]
struct ListPromptsQuery {
    namespace: Option<String>,
}

async fn list_ai_prompts_handler(
    AxumState(state): AxumState<Arc<AppState>>,
    AxumQuery(query): AxumQuery<ListPromptsQuery>,
) -> Result<Json<Vec<AiPrompt>>, axum::http::StatusCode> {
    println!("=== list_ai_prompts_handler START ===");

    let db = state.mongo_client.database("wyat");

    match list_prompts(&db, query.namespace.as_deref()).await {
        Ok(prompts) => {
            println!("=== list_ai_prompts_handler SUCCESS ===");
            Ok(Json(prompts))
        }
        Err(e) => {
            eprintln!("=== list_ai_prompts_handler ERROR ===");
            eprintln!("Error: {}", e);
            Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
        }
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

#[derive(OpenApi)]
#[openapi(
    paths(
        workout::create_exercise_type_mongo,
        workout::update_exercise_type_mongo,
        workout::get_all_exercise_types_mongo,
        workout::create_exercise_entry_mongo,
        workout::update_exercise_entry_mongo,
        workout::get_all_exercise_entries_mongo,
        workout::get_exercise_entries_by_day,
        workout::find_exercise_type_by_muscle,
    ),
    components(
        schemas(
            workout::ExerciseEntry,
            workout::ExerciseType,
            workout::ExerciseTypeInput,
            workout::ExerciseTypePatch,
            workout::ExerciseEntryInput,
            workout::ExerciseEntryPatch,
            workout::WeightUnit,
            workout::LoadBasis,
            workout::Muscle,
            workout::Region,
        )
    ),
    modifiers(&SecurityAddon),
    tags(
        (name = "workout", description = "Workout tracking endpoints")
    )
)]
struct ApiDoc;

struct SecurityAddon;

impl utoipa::Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "ApiKey",
                utoipa::openapi::security::SecurityScheme::ApiKey(
                    utoipa::openapi::security::ApiKey::Header(
                        utoipa::openapi::security::ApiKeyValue::new("x-wyat-api-key"),
                    ),
                ),
            )
        }
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

    // Initialize workout indexes
    let db = mongo_client.database("wyat");
    if let Err(e) = init_indexes(&db).await {
        eprintln!("⚠️  Failed to initialize workout indexes: {:?}", e);
    } else {
        println!("✅ Workout indexes initialized");
    }

    let state = Arc::new(AppState { mongo_client });

    let origin =
        std::env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".to_string());

    let cors = CorsLayer::new()
        .allow_origin(origin.parse::<HeaderValue>().unwrap())
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
        ])
        .allow_headers([
            HeaderName::from_static("content-type"),
            HeaderName::from_static("accept"),
            HeaderName::from_static("x-wyat-api-key"),
        ])
        .allow_credentials(true);

    let app = Router::new()
        .route("/", get(|| async { "Hello from backend" }))
        .route("/capital/envelopes", get(capital::get_all_envelopes))
        .route(
            "/capital/envelopes/:envelope_id/usage",
            get(capital::get_envelope_usage),
        )
        .route("/capital/cycles", get(capital::get_cycles))
        .route("/capital/accounts", get(capital::get_all_accounts))
        .route("/capital/transactions", get(capital::get_transactions))
        .route("/capital/transactions", post(capital::create_transaction))
        .route(
            "/capital/transactions/reclassify",
            put(capital::reclassify_transaction),
        )
        .route(
            "/capital/transactions/:transaction_id",
            axum::routing::delete(capital::delete_transaction),
        )
        .route(
            "/capital/transactions/:transaction_id/type",
            patch(capital::update_transaction_type),
        )
        .route("/journal/mongo", post(create_journal_entry_mongo))
        .route("/journal/mongo/all", get(get_journal_entries_mongo))
        .route("/journal/mongo/:id", get(get_journal_entry_by_id_mongo))
        .route(
            "/journal/mongo/date/:date",
            get(get_journal_entry_by_date_mongo),
        )
        .route("/journal/mongo/:id", patch(edit_journal_entry_mongo))
        .route("/journal/mongo/:id", delete(delete_journal_entry_mongo))
        .route("/journal/mongo/:id/tags", patch(edit_journal_entry_tags))
        .route("/journal/mongo/search", get(search_journal_entries))
        .route(
            "/journal/mongo/search/ids",
            get(search_journal_entries_return_ids),
        )
        .route(
            "/journal/mongo/:id/generate-tags",
            post(patch_journal_entry_tags_and_keywords),
        )
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
        .route("/ai/prompts", get(list_ai_prompts_handler))
        .route("/ai/prompts/:prompt_id", get(get_ai_prompt_handler))
        .route("/meta/tag-taxonomy", get(get_tag_taxonomy))
        .route("/meta/person-registry", get(get_person_registry))
        .route("/meta/place-registry", get(get_place_registry))
        .route(
            "/meta/keywording-best-practices",
            get(get_keywording_best_practices),
        )
        .route(
            "/meta/keywording-best-practices",
            patch(update_keywording_best_practices),
        )
        .route("/meta/tag-taxonomy", patch(update_tag_taxonomy))
        .route("/meta/capital-readme", get(get_capital_readme))
        .route("/meta/capital-readme", patch(update_capital_readme))
        // Person registry CRUD operations
        .route("/meta/persons", post(add_person))
        .route("/meta/persons", patch(update_person))
        .route("/meta/persons/:tag", delete(delete_person))
        // Place registry CRUD operations
        .route("/meta/places", post(add_place))
        .route("/meta/places", patch(update_place))
        .route("/meta/places/:tag", delete(delete_place))
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
        .route(
            "/workout/exercise-types",
            post(workout::create_exercise_type_mongo),
        )
        .route(
            "/workout/exercise-types/:id",
            patch(workout::update_exercise_type_mongo),
        )
        .route(
            "/workout/exercise-entries",
            post(workout::create_exercise_entry_mongo),
        )
        .route(
            "/workout/exercise-entries/:id",
            patch(workout::update_exercise_entry_mongo),
        )
        .route(
            "/workout/exercise-types",
            get(workout::get_all_exercise_types_mongo),
        )
        .route(
            "/workout/exercise-entries",
            get(workout::get_all_exercise_entries_mongo),
        )
        .route(
            "/workout/exercise-entries/day/:date_unix",
            get(workout::get_exercise_entries_by_day),
        )
        .route(
            "/workout/exercise-types/find-by-muscle",
            post(workout::find_exercise_type_by_muscle),
        )
        .with_state(state.clone())
        .merge(storage_http::routes(state.clone()))
        .merge(SwaggerUi::new("/docs").url("/docs/openapi.json", ApiDoc::openapi()))
        .layer(cors);

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
