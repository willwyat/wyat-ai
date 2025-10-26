mod capital;
mod journal;
use axum::http::{HeaderName, HeaderValue, Method};
use dotenvy::dotenv;
mod meta;
mod storage;
mod vitals;
mod workout;
use crate::services::storage::Document;
use capital::{BatchImportResponse, FlatTransaction, process_batch_import};

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
use futures::stream::TryStreamExt;
use hyper;
use mongodb::bson::doc;
use mongodb::bson::oid::ObjectId;
use mongodb::options::{FindOneOptions, FindOptions};
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
use services::extraction::{
    ImportDefaults, PreparedBatchImport, prepare_batch_import_from_extract,
    run_bank_statement_extraction,
};

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

// Simple OpenAI test handler
async fn test_openai_handler() -> Result<Json<serde_json::Value>, axum::http::StatusCode> {
    println!("=== test_openai_handler START ===");

    use async_openai::types::{
        ChatCompletionRequestMessage, ChatCompletionRequestUserMessageArgs,
        CreateChatCompletionRequestArgs,
    };
    use async_openai::{Client, config::OpenAIConfig};

    let api_key = std::env::var("OPENAI_API_SECRET").map_err(|_| {
        eprintln!("OPENAI_API_SECRET not found");
        axum::http::StatusCode::INTERNAL_SERVER_ERROR
    })?;

    println!(
        "API key found: {}...",
        &api_key.chars().take(10).collect::<String>()
    );

    let client = Client::with_config(OpenAIConfig::new().with_api_key(api_key));

    let request = CreateChatCompletionRequestArgs::default()
        .model("gpt-3.5-turbo")
        .messages(vec![ChatCompletionRequestMessage::User(
            ChatCompletionRequestUserMessageArgs::default()
                .content("Say 'Hello, World!' in JSON format with a single key 'message'.")
                .build()
                .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?,
        )])
        .build()
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;

    println!("Calling OpenAI API...");
    let response = client.chat().create(request).await.map_err(|e| {
        eprintln!("OpenAI API error: {}", e);
        axum::http::StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let content = response.choices[0]
        .message
        .content
        .as_ref()
        .ok_or(axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;

    println!("=== test_openai_handler SUCCESS ===");
    Ok(Json(json!({
        "status": "ok",
        "response": content
    })))
}

// Extract bank statement handler
#[derive(Clone, Debug, Deserialize, Default)]
struct ImportOptionsPayload {
    #[serde(default)]
    submit: bool,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    debit_tx_type: Option<String>,
    #[serde(default)]
    credit_tx_type: Option<String>,
    #[serde(default)]
    fallback_account_id: Option<String>,
}

#[derive(Deserialize)]
struct ExtractBankStatementRequest {
    blob_id: String,
    doc_id: String,
    prompt: String,
    prompt_id: String,
    prompt_version: String,
    model: String,
    assistant_name: String,
    #[serde(default)]
    import: Option<ImportOptionsPayload>,
}

#[derive(Serialize)]
struct ExtractBankStatementResponse {
    transactions: Vec<FlatTransaction>,
    audit: serde_json::Value,
    inferred_meta: serde_json::Value,
    quality: String,
    confidence: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    import_summary: Option<BatchImportResponse>,
}

async fn extract_bank_statement_handler(
    AxumState(state): AxumState<Arc<AppState>>,
    Json(req): Json<ExtractBankStatementRequest>,
) -> Result<Json<ExtractBankStatementResponse>, axum::http::StatusCode> {
    println!("=== extract_bank_statement_handler START ===");
    println!("Blob ID: {}", req.blob_id);
    println!("Doc ID: {}", req.doc_id);
    println!("Model: {}", req.model);

    let db = state.mongo_client.database("wyat");

    // Parse blob_id to ObjectId
    let blob_oid = mongodb::bson::oid::ObjectId::parse_str(&req.blob_id).map_err(|e| {
        eprintln!("Invalid blob_id: {}", e);
        axum::http::StatusCode::BAD_REQUEST
    })?;

    // Resolve doc_id: accept either a Mongo ObjectId (hex) or a human-readable doc_id string
    let doc_oid = match mongodb::bson::oid::ObjectId::parse_str(&req.doc_id) {
        Ok(oid) => oid,
        Err(_) => {
            // Lookup by string doc_id in documents collection
            let docs = db.collection::<Document>("documents");
            match docs
                .find_one(mongodb::bson::doc! { "doc_id": &req.doc_id }, None)
                .await
                .map_err(|e| {
                    eprintln!("Failed to resolve doc_id '{}': {}", req.doc_id, e);
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR
                })? {
                Some(doc) => doc.id,
                None => {
                    eprintln!("Document with doc_id '{}' not found", req.doc_id);
                    return Err(axum::http::StatusCode::BAD_REQUEST);
                }
            }
        }
    };

    // Delegate orchestration to service layer
    match run_bank_statement_extraction(
        &db,
        doc_oid,
        blob_oid,
        &req.prompt,
        &req.prompt_id,
        &req.prompt_version,
        &req.model,
        &req.assistant_name,
    )
    .await
    {
        Ok((_run, result)) => {
            println!("=== extract_bank_statement_handler SUCCESS ===");

            let import_opts = req.import.unwrap_or_default();
            let normalize = |value: Option<String>| -> Option<String> {
                value.and_then(|s| {
                    let trimmed = s.trim();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed.to_string())
                    }
                })
            };

            let ImportOptionsPayload {
                submit,
                source,
                status,
                debit_tx_type,
                credit_tx_type,
                fallback_account_id,
            } = import_opts;

            let mut defaults = ImportDefaults::new();
            if let Some(source_value) = normalize(source) {
                defaults.source = source_value;
            }
            if let Some(status_value) = status {
                defaults.status = normalize(Some(status_value));
            }
            if let Some(debit_value) = debit_tx_type {
                defaults.debit_tx_type = normalize(Some(debit_value));
            }
            if let Some(credit_value) = credit_tx_type {
                defaults.credit_tx_type = normalize(Some(credit_value));
            }
            if let Some(account_id_value) = fallback_account_id {
                defaults.fallback_account_id = normalize(Some(account_id_value));
            }

            let prepared =
                prepare_batch_import_from_extract(&result, &defaults).map_err(|err| {
                    eprintln!(
                        "Failed to prepare batch import payload from extraction: {}",
                        err
                    );
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR
                })?;

            let mut import_summary: Option<BatchImportResponse> = None;
            let PreparedBatchImport {
                mut request,
                preview,
            } = prepared;

            if submit {
                let transactions = std::mem::take(&mut request.transactions);
                match process_batch_import(&db, transactions).await {
                    Ok(summary) => import_summary = Some(summary),
                    Err(err) => {
                        eprintln!("Batch import during extraction failed: {}", err);
                        return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR);
                    }
                }
            }

            Ok(Json(ExtractBankStatementResponse {
                transactions: preview,
                audit: result.audit.clone(),
                inferred_meta: result.inferred_meta.clone(),
                quality: result.quality.clone(),
                confidence: result.confidence,
                import_summary,
            }))
        }
        Err(e) => {
            eprintln!("=== extract_bank_statement_handler ERROR ===");
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
            workout::FindByMuscleRequest,
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
        .route("/capital/funds", get(capital::get_all_funds))
        .route(
            "/capital/funds/:fund_id/positions",
            get(capital::get_fund_positions),
        )
        .route("/capital/transactions", get(capital::get_transactions))
        .route("/capital/transactions", post(capital::create_transaction))
        .route(
            "/capital/transactions/batch-import",
            post(capital::batch_import_transactions),
        )
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
        .route("/ai/test-openai", get(test_openai_handler))
        .route(
            "/ai/extract/bank-statement",
            post(extract_bank_statement_handler),
        )
        .route("/ai/extraction-runs", get(list_extraction_runs_handler))
        .route(
            "/ai/extraction-runs/:run_id",
            get(get_extraction_run_handler),
        )
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

#[derive(Serialize)]
struct PublicRunListItem {
    _id: String,
    created_at: i64,
    status: String,
    quality: Option<String>,
    confidence: Option<f64>,
}

async fn list_extraction_runs_handler(
    AxumState(state): AxumState<Arc<AppState>>,
    AxumQuery(q): AxumQuery<std::collections::HashMap<String, String>>,
) -> Result<Json<Vec<PublicRunListItem>>, axum::http::StatusCode> {
    let Some(doc_id_str) = q.get("doc_id") else {
        return Err(axum::http::StatusCode::BAD_REQUEST);
    };
    let db = state.mongo_client.database("wyat");
    // Resolve doc_id: accept either a Mongo ObjectId (hex) or a human-readable doc_id string
    let doc_oid = match ObjectId::parse_str(doc_id_str) {
        Ok(oid) => oid,
        Err(_) => {
            // Lookup by string doc_id in documents collection
            let docs = db.collection::<Document>("documents");
            match docs
                .find_one(mongodb::bson::doc! { "doc_id": doc_id_str.as_str() }, None)
                .await
                .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?
            {
                Some(doc) => doc.id,
                None => return Err(axum::http::StatusCode::BAD_REQUEST),
            }
        }
    };

    let coll = db.collection::<mongodb::bson::Document>("doc_extraction_runs");

    let mut cursor = coll
        .find(
            doc! { "doc_id": doc_oid },
            FindOptions::builder()
                .sort(doc! { "created_at": -1 })
                .projection(doc! {
                    "_id": 1,
                    "created_at": 1,
                    "status": 1,
                    "metadata.quality": 1,
                    "metadata.confidence": 1,
                })
                .limit(50)
                .build(),
        )
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut out = Vec::new();
    while let Some(doc) = cursor
        .try_next()
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?
    {
        let id = doc
            .get_object_id("_id")
            .map(|o| o.to_hex())
            .unwrap_or_default();
        let created_at = doc.get_i64("created_at").unwrap_or_default();
        let status = doc.get_str("status").unwrap_or("unknown").to_string();
        let quality = doc
            .get_document("metadata")
            .ok()
            .and_then(|m| m.get_str("quality").ok())
            .map(|s| s.to_string());
        let confidence = doc
            .get_document("metadata")
            .ok()
            .and_then(|m| m.get_f64("confidence").ok());

        out.push(PublicRunListItem {
            _id: id,
            created_at,
            status,
            quality,
            confidence,
        });
    }

    Ok(Json(out))
}

#[derive(Serialize)]
struct PublicRunDetail {
    _id: String,
    created_at: i64,
    status: String,
    quality: Option<String>,
    confidence: Option<f64>,
    response_text: String,
}

async fn get_extraction_run_handler(
    AxumState(state): AxumState<Arc<AppState>>,
    AxumPath(run_id): AxumPath<String>,
) -> Result<Json<PublicRunDetail>, axum::http::StatusCode> {
    let Ok(run_oid) = ObjectId::parse_str(&run_id) else {
        return Err(axum::http::StatusCode::BAD_REQUEST);
    };

    let db = state.mongo_client.database("wyat");
    let coll = db.collection::<mongodb::bson::Document>("doc_extraction_runs");

    let doc = coll
        .find_one(
            doc! { "_id": run_oid },
            FindOneOptions::builder()
                .projection(doc! {
                    "_id": 1, "created_at": 1, "status": 1,
                    "metadata.quality": 1, "metadata.confidence": 1,
                    "response_text": 1
                })
                .build(),
        )
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(axum::http::StatusCode::NOT_FOUND)?;

    let id = doc
        .get_object_id("_id")
        .map(|o| o.to_hex())
        .unwrap_or_default();
    let created_at = doc.get_i64("created_at").unwrap_or_default();
    let status = doc.get_str("status").unwrap_or("unknown").to_string();
    let md = doc.get_document("metadata").ok();
    let quality = md
        .and_then(|m| m.get_str("quality").ok())
        .map(|s| s.to_string());
    let confidence = md.and_then(|m| m.get_f64("confidence").ok());
    let response_text = doc.get_str("response_text").unwrap_or("{}").to_string();

    Ok(Json(PublicRunDetail {
        _id: id,
        created_at,
        status,
        quality,
        confidence,
        response_text,
    }))
}
