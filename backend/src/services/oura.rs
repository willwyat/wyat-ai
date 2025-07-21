use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    response::Redirect,
};
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::env;

use crate::AppState;
use mongodb::bson::doc;
use mongodb::options::ReplaceOptions;
use std::sync::Arc;

// =============================================
// * * * * Oura OAuth & Token Management * * * *
// =============================================
// Handles OAuth URL generation, callback, token storage, refresh, and helpers
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OuraTokens {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<mongodb::bson::oid::ObjectId>,
    pub user_id: String, // For future multi-user support
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_type: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct OuraTokenRequest {
    grant_type: String,
    code: String,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
}

#[derive(Deserialize)]
pub struct OuraTokenResponse {
    access_token: String,
    token_type: String,
    expires_in: Option<u32>,
    refresh_token: Option<String>,
}

#[derive(Serialize)]
pub struct RefreshTokenRequest {
    grant_type: String,
    refresh_token: String,
    client_id: String,
    client_secret: String,
}

#[derive(Deserialize)]
pub struct OuraCallbackQuery {
    code: String,
    state: Option<String>,
}

pub async fn get_valid_oura_access_token(
    mongo_client: &mongodb::Client,
    user_id: &str,
) -> Result<Option<String>, String> {
    // Try to get and refresh tokens if needed
    let tokens = refresh_oura_tokens(mongo_client, user_id).await?;

    match tokens {
        Some(tokens) => Ok(Some(tokens.access_token)),
        None => Ok(None),
    }
}

pub async fn refresh_oura_tokens(
    mongo_client: &mongodb::Client,
    user_id: &str,
) -> Result<Option<OuraTokens>, String> {
    // Get current tokens
    let current_tokens = match get_oura_tokens_from_mongo(mongo_client, user_id).await? {
        Some(tokens) => tokens,
        None => return Ok(None), // No tokens to refresh
    };

    // Check if we have a refresh token
    let refresh_token = match &current_tokens.refresh_token {
        Some(token) => token.clone(),
        None => return Ok(Some(current_tokens)), // No refresh token, return current tokens
    };

    // Check if token is expired (with 5 minute buffer)
    if let Some(expires_at) = current_tokens.expires_at {
        if Utc::now() < expires_at - chrono::Duration::minutes(5) {
            return Ok(Some(current_tokens)); // Token not expired yet
        }
    }

    println!("🔄 Refreshing Oura tokens for user: {}", user_id);

    let client_id = env::var("OURA_CLIENT_ID").unwrap_or_else(|_| "missing".to_string());
    let client_secret = env::var("OURA_CLIENT_SECRET").unwrap_or_else(|_| "missing".to_string());

    let refresh_request = RefreshTokenRequest {
        grant_type: "refresh_token".to_string(),
        refresh_token,
        client_id,
        client_secret,
    };

    let client = Client::new();
    let response = client
        .post("https://api.ouraring.com/oauth/token")
        .json(&refresh_request)
        .send()
        .await
        .map_err(|e| format!("Refresh request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Token refresh failed with status: {}",
            response.status()
        ));
    }

    let token_data: OuraTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    // Create new tokens
    let expires_at = token_data
        .expires_in
        .map(|expires_in| Utc::now() + chrono::Duration::seconds(expires_in as i64));

    let new_tokens = OuraTokens {
        id: current_tokens.id, // Keep the same ID
        user_id: current_tokens.user_id.clone(),
        access_token: token_data.access_token,
        refresh_token: token_data.refresh_token.or(current_tokens.refresh_token), // Keep old refresh token if new one not provided
        token_type: token_data.token_type,
        expires_at,
        created_at: current_tokens.created_at, // Keep original creation time
        updated_at: Utc::now(),
    };

    // Save updated tokens
    save_oura_tokens_to_mongo(mongo_client, &new_tokens).await?;
    println!("✅ Oura tokens refreshed successfully");

    Ok(Some(new_tokens))
}

pub async fn save_oura_tokens_to_mongo(
    mongo_client: &mongodb::Client,
    tokens: &OuraTokens,
) -> Result<(), String> {
    let db = mongo_client.database("wyat");
    let collection = db.collection::<OuraTokens>("oura_tokens");

    let filter = doc! { "user_id": &tokens.user_id };
    let options = ReplaceOptions::builder().upsert(true).build();

    collection
        .replace_one(filter, tokens, options)
        .await
        .map_err(|e| format!("MongoDB error: {}", e))?;

    println!(
        "💾 Oura tokens saved to MongoDB for user: {}",
        tokens.user_id
    );
    Ok(())
}

pub async fn get_oura_tokens_from_mongo(
    mongo_client: &mongodb::Client,
    user_id: &str,
) -> Result<Option<OuraTokens>, String> {
    let db = mongo_client.database("wyat");
    let collection = db.collection::<OuraTokens>("oura_tokens");

    let filter = doc! { "user_id": user_id };

    match collection.find_one(filter, None).await {
        Ok(tokens) => Ok(tokens),
        Err(e) => Err(format!("MongoDB error: {}", e)),
    }
}

pub async fn generate_oura_auth_url() -> impl IntoResponse {
    let client_id = env::var("OURA_CLIENT_ID").unwrap_or_else(|_| "missing".to_string());
    let frontend_url =
        env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
    let redirect_uri = format!("{}/api/oura/callback", frontend_url.trim_end_matches('/'));
    let scope = "email personal daily heartrate workout session";

    println!("🔐 Oura OAuth - Client ID: {}", client_id);
    println!("🔐 Oura OAuth - Redirect URI: {}", redirect_uri);
    println!("🔐 Oura OAuth - Scope: {}", scope);

    let auth_url = format!(
        "https://cloud.ouraring.com/oauth/authorize?response_type=code&client_id={}&redirect_uri={}&scope={}",
        client_id, redirect_uri, scope
    );

    println!("🔐 Oura OAuth - Generated URL: {}", auth_url);
    Redirect::to(&auth_url)
}

pub async fn handle_oura_callback(
    State(state): State<Arc<AppState>>,
    Query(query): Query<OuraCallbackQuery>,
) -> impl IntoResponse {
    let client_id = env::var("OURA_CLIENT_ID").unwrap_or_else(|_| "missing".to_string());
    let client_secret = env::var("OURA_CLIENT_SECRET").unwrap_or_else(|_| "missing".to_string());
    let frontend_url =
        env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
    let redirect_uri = format!("{}/api/oura/callback", frontend_url.trim_end_matches('/'));

    println!("🔄 Oura Callback - Received code: {}", &query.code[..10]);
    println!("🔄 Oura Callback - Client ID: {}", client_id);
    println!("🔄 Oura Callback - Client Secret: {}", &client_secret[..10]);
    println!("🔄 Oura Callback - Redirect URI: {}", redirect_uri);

    let token_request = OuraTokenRequest {
        grant_type: "authorization_code".to_string(),
        code: query.code,
        client_id,
        client_secret,
        redirect_uri: redirect_uri.to_string(),
    };

    let client = Client::new();
    println!("🔄 Oura Callback - Making token request to Oura API...");
    let response = client
        .post("https://api.ouraring.com/oauth/token")
        .json(&token_request)
        .send()
        .await;

    match response {
        Ok(resp) => {
            println!("🔄 Oura Callback - Response status: {}", resp.status());
            if resp.status().is_success() {
                match resp.json::<OuraTokenResponse>().await {
                    Ok(token_data) => {
                        // Store the access token securely
                        println!(
                            "Oura access token obtained: {}",
                            &token_data.access_token[..10]
                        );

                        // Store tokens in MongoDB
                        let expires_at = token_data.expires_in.map(|expires_in| {
                            Utc::now() + chrono::Duration::seconds(expires_in as i64)
                        });

                        let tokens = OuraTokens {
                            id: None,
                            user_id: "default_user".to_string(), // For single-user app
                            access_token: token_data.access_token,
                            refresh_token: token_data.refresh_token,
                            token_type: token_data.token_type,
                            expires_at,
                            created_at: Utc::now(),
                            updated_at: Utc::now(),
                        };

                        match save_oura_tokens_to_mongo(&state.mongo_client, &tokens).await {
                            Ok(_) => {
                                println!("✅ Oura tokens stored successfully");
                                Redirect::to(&format!(
                                    "{}/oura-success",
                                    frontend_url.trim_end_matches('/')
                                ))
                            }
                            Err(e) => {
                                println!("❌ Failed to store tokens: {}", e);
                                Redirect::to(&format!(
                                    "{}/oura-error",
                                    frontend_url.trim_end_matches('/')
                                ))
                            }
                        }
                    }
                    Err(e) => {
                        println!("Failed to parse token response: {}", e);
                        Redirect::to(&format!(
                            "{}/oura-error",
                            frontend_url.trim_end_matches('/')
                        ))
                    }
                }
            } else {
                println!("Token exchange failed with status: {}", resp.status());
                Redirect::to(&format!(
                    "{}/oura-error",
                    frontend_url.trim_end_matches('/')
                ))
            }
        }
        Err(e) => {
            println!("Failed to exchange code for token: {}", e);
            Redirect::to(&format!(
                "{}/oura-error",
                frontend_url.trim_end_matches('/')
            ))
        }
    }
}

// ==============================
// * * * * Daily Activity * * * *
// ==============================
// Data structures, API fetch, and MongoDB storage for daily activity
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyActivityData {
    pub id: Option<String>,
    pub day: String,
    pub class_5_min: Option<String>,
    pub score: Option<i32>,
    pub active_calories: Option<i32>,
    pub average_met_minutes: Option<f32>,
    pub contributors: Option<DailyActivityContributors>,
    pub equivalent_walking_distance: Option<i32>,
    pub high_activity_met_minutes: Option<i32>,
    pub high_activity_time: Option<i32>,
    pub inactivity_alerts: Option<i32>,
    pub low_activity_met_minutes: Option<i32>,
    pub low_activity_time: Option<i32>,
    pub medium_activity_met_minutes: Option<i32>,
    pub medium_activity_time: Option<i32>,
    pub met: Option<DailyActivityMet>,
    pub meters_to_target: Option<i32>,
    pub non_wear_time: Option<i32>,
    pub resting_time: Option<i32>,
    pub sedentary_met_minutes: Option<i32>,
    pub sedentary_time: Option<i32>,
    pub steps: Option<i32>,
    pub target_calories: Option<i32>,
    pub target_meters: Option<i32>,
    pub total_calories: Option<i32>,
    pub timestamp: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyActivityContributors {
    pub meet_daily_targets: Option<i32>,
    pub move_every_hour: Option<i32>,
    pub recovery_time: Option<i32>,
    pub stay_active: Option<i32>,
    pub training_frequency: Option<i32>,
    pub training_volume: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyActivityMet {
    pub interval: Option<i32>,
    pub items: Option<Vec<f32>>,
    pub timestamp: Option<String>,
}

pub async fn get_oura_daily_activity_data_from_api(
    start_date: &str,
    end_date: &str,
    access_token: &str,
) -> Result<Vec<DailyActivityData>, String> {
    let base_url = "https://api.ouraring.com/v2";

    let url = format!(
        "{}/usercollection/daily_activity?start_date={}&end_date={}",
        base_url, start_date, end_date
    );

    let client = Client::new();
    let res = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Oura API error: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct OuraDailyActivityResponse {
        data: Vec<DailyActivityData>,
    }

    let response: OuraDailyActivityResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(response.data)
}

pub async fn save_daily_activity_data_to_mongo(
    mongo_client: &mongodb::Client,
    daily_activity_data: &[DailyActivityData],
) -> Result<(), String> {
    let db = mongo_client.database("wyat");
    let collection = db.collection::<DailyActivityData>("oura_daily_activity");

    let mut inserted_count = 0;
    let mut skipped_count = 0;

    for entry in daily_activity_data {
        // Check if this record already exists using id if available, otherwise use day
        let filter = if let Some(ref id) = entry.id {
            doc! { "id": id }
        } else {
            doc! { "day": &entry.day }
        };
        let existing = collection
            .find_one(filter.clone(), None)
            .await
            .map_err(|e| format!("MongoDB find error: {}", e))?;

        if existing.is_some() {
            skipped_count += 1;
            continue; // Skip if already exists
        }

        // Insert new entry
        collection
            .insert_one(entry, None)
            .await
            .map_err(|e| format!("MongoDB insert error: {}", e))?;

        inserted_count += 1;
    }

    println!(
        "💾 Daily activity data: {} new entries inserted, {} duplicates skipped",
        inserted_count, skipped_count
    );
    Ok(())
}

pub async fn handle_oura_daily_activity_sync(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let user_id = "default_user";

    // Get last sync date from database, or default to yesterday
    let last_sync_status =
        get_oura_sync_status(&state.mongo_client, user_id, "daily_activity").await;
    let today = chrono::Utc::now().date_naive();

    let start_date = match last_sync_status {
        Ok(Some(status)) => {
            // Use the day after last sync as start date
            let last_date = chrono::NaiveDate::parse_from_str(&status.last_sync_date, "%Y-%m-%d")
                .unwrap_or_else(|_| today - chrono::Duration::days(1));

            // Calculate the next day after last sync
            let next_day = last_date + chrono::Duration::days(1);

            // Ensure start date is not after today
            if next_day > today {
                // If next day is in the future, use yesterday
                (today - chrono::Duration::days(1))
                    .format("%Y-%m-%d")
                    .to_string()
            } else {
                next_day.format("%Y-%m-%d").to_string()
            }
        }
        Ok(None) => {
            // First time sync - default to yesterday
            (today - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        }
        Err(e) => {
            println!("🏃 Daily Activity Sync - Error getting sync status: {}", e);
            (today - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        }
    };

    let end_date = today.format("%Y-%m-%d").to_string();

    // Try to get OAuth access token, fallback to personal token
    let access_token = match get_valid_oura_access_token(&state.mongo_client, user_id).await {
        Ok(Some(token)) => {
            println!(
                "🏃 Daily Activity Sync - Using OAuth token: {}",
                &token[..10]
            );
            token
        }
        Ok(None) => {
            let personal_token = env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string());
            personal_token
        }
        Err(e) => {
            println!(
                "🏃 Daily Activity Sync - Token error: {}, using personal token",
                e
            );
            env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string())
        }
    };

    println!(
        "🏃 Daily Activity Sync - Date range: {} → {}",
        start_date, end_date
    );

    match get_oura_daily_activity_data_from_api(&start_date, &end_date, &access_token).await {
        Ok(daily_activity_data) => {
            println!(
                "🏃 Daily Activity Sync - Retrieved {} daily activity records",
                daily_activity_data.len()
            );

            match save_daily_activity_data_to_mongo(&state.mongo_client, &daily_activity_data).await
            {
                Ok(_) => {
                    // Update sync status
                    if let Err(e) = update_oura_sync_status(
                        &state.mongo_client,
                        user_id,
                        "daily_activity",
                        &end_date,
                    )
                    .await
                    {
                        println!(
                            "🏃 Daily Activity Sync - Warning: Failed to update sync status: {}",
                            e
                        );
                    }

                    println!(
                        "🏃 Daily Activity Sync - Saved {} daily activity records to MongoDB",
                        daily_activity_data.len()
                    );
                    Json(serde_json::json!({
                        "status": "success",
                        "message": format!("Synced {} daily activity records from {} to {}", daily_activity_data.len(), start_date, end_date),
                        "sync_range": {
                            "start_date": start_date,
                            "end_date": end_date
                        },
                        "data": daily_activity_data
                    }))
                    .into_response()
                }
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
            }
        }
        Err(err) => (StatusCode::BAD_GATEWAY, err).into_response(),
    }
}

// ========================================
// * * * * Daily Cardiovascular Age * * * *
// ========================================
// Data structures, API fetch, and MongoDB storage for daily cardiovascular age
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyCardiovascularAgeData {
    pub day: String,
    pub vascular_age: Option<i32>,
}

pub async fn get_oura_daily_cardiovascular_age_data_from_api(
    start_date: &str,
    end_date: &str,
    access_token: &str,
) -> Result<Vec<DailyCardiovascularAgeData>, String> {
    let base_url = "https://api.ouraring.com/v2";

    let url = format!(
        "{}/usercollection/daily_cardiovascular_age?start_date={}&end_date={}",
        base_url, start_date, end_date
    );

    let client = Client::new();
    let res = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Oura API error: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct OuraDailyCardiovascularAgeResponse {
        data: Vec<DailyCardiovascularAgeData>,
    }

    let response: OuraDailyCardiovascularAgeResponse =
        res.json().await.map_err(|e| e.to_string())?;
    Ok(response.data)
}

pub async fn save_daily_cardiovascular_age_data_to_mongo(
    mongo_client: &mongodb::Client,
    daily_cardiovascular_age_data: &[DailyCardiovascularAgeData],
) -> Result<(), String> {
    let db = mongo_client.database("wyat");
    let collection = db.collection::<DailyCardiovascularAgeData>("oura_daily_cardiovascular_age");

    let mut inserted_count = 0;
    let mut skipped_count = 0;

    for entry in daily_cardiovascular_age_data {
        // Check if this record already exists using id if available, otherwise use day
        let filter = doc! { "day": &entry.day };
        let existing = collection
            .find_one(filter.clone(), None)
            .await
            .map_err(|e| format!("MongoDB find error: {}", e))?;

        if existing.is_some() {
            skipped_count += 1;
            continue; // Skip if already exists
        }

        // Insert new entry
        collection
            .insert_one(entry, None)
            .await
            .map_err(|e| format!("MongoDB insert error: {}", e))?;

        inserted_count += 1;
    }

    println!(
        "💾 Daily cardiovascular age data: {} new entries inserted, {} duplicates skipped",
        inserted_count, skipped_count
    );
    Ok(())
}

pub async fn handle_oura_daily_cardiovascular_age_sync(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let user_id = "default_user";

    // Get last sync date from database, or default to yesterday
    let last_sync_status =
        get_oura_sync_status(&state.mongo_client, user_id, "daily_cardiovascular_age").await;
    let today = chrono::Utc::now().date_naive();

    let start_date = match last_sync_status {
        Ok(Some(status)) => {
            // Use the day after last sync as start date
            let last_date = chrono::NaiveDate::parse_from_str(&status.last_sync_date, "%Y-%m-%d")
                .unwrap_or_else(|_| today - chrono::Duration::days(1));

            // Calculate the next day after last sync
            let next_day = last_date + chrono::Duration::days(1);

            // Ensure start date is not after today
            if next_day > today {
                // If next day is in the future, use yesterday
                (today - chrono::Duration::days(1))
                    .format("%Y-%m-%d")
                    .to_string()
            } else {
                next_day.format("%Y-%m-%d").to_string()
            }
        }
        Ok(None) => {
            // First time sync - default to yesterday
            (today - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        }
        Err(e) => {
            println!(
                "❤️ Daily Cardiovascular Age Sync - Error getting sync status: {}",
                e
            );
            (today - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        }
    };

    let end_date = today.format("%Y-%m-%d").to_string();

    // Try to get OAuth access token, fallback to personal token
    let access_token = match get_valid_oura_access_token(&state.mongo_client, user_id).await {
        Ok(Some(token)) => {
            println!(
                "❤️ Daily Cardiovascular Age Sync - Using OAuth token: {}",
                &token[..10]
            );
            token
        }
        Ok(None) => {
            let personal_token = env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string());
            personal_token
        }
        Err(e) => {
            println!(
                "❤️ Daily Cardiovascular Age Sync - Token error: {}, using personal token",
                e
            );
            env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string())
        }
    };

    println!(
        "❤️ Daily Cardiovascular Age Sync - Date range: {} → {}",
        start_date, end_date
    );

    match get_oura_daily_cardiovascular_age_data_from_api(&start_date, &end_date, &access_token)
        .await
    {
        Ok(daily_cardiovascular_age_data) => {
            println!(
                "❤️ Daily Cardiovascular Age Sync - Retrieved {} daily cardiovascular age records",
                daily_cardiovascular_age_data.len()
            );

            match save_daily_cardiovascular_age_data_to_mongo(
                &state.mongo_client,
                &daily_cardiovascular_age_data,
            )
            .await
            {
                Ok(_) => {
                    // Update sync status
                    if let Err(e) = update_oura_sync_status(
                        &state.mongo_client,
                        user_id,
                        "daily_cardiovascular_age",
                        &end_date,
                    )
                    .await
                    {
                        println!(
                            "❤️ Daily Cardiovascular Age Sync - Warning: Failed to update sync status: {}",
                            e
                        );
                    }

                    println!(
                        "❤️ Daily Cardiovascular Age Sync - Saved {} daily cardiovascular age records to MongoDB",
                        daily_cardiovascular_age_data.len()
                    );
                    Json(serde_json::json!({
                        "status": "success",
                        "message": format!("Synced {} daily cardiovascular age records from {} to {}", daily_cardiovascular_age_data.len(), start_date, end_date),
                        "sync_range": {
                            "start_date": start_date,
                            "end_date": end_date
                        },
                        "data": daily_cardiovascular_age_data
                    }))
                    .into_response()
                }
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
            }
        }
        Err(err) => (StatusCode::BAD_GATEWAY, err).into_response(),
    }
}

// ===============================
// * * * * Daily Readiness * * * *
// ===============================
// Data structures, API fetch, and MongoDB storage for daily readiness
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyReadinessData {
    pub id: Option<String>,
    pub day: String,
    pub score: Option<i32>,
    pub temperature_deviation: Option<f32>,
    pub temperature_trend_deviation: Option<f32>,
    pub timestamp: Option<String>,
    pub contributors: Option<DailyReadinessContributors>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyReadinessContributors {
    pub activity_balance: Option<i32>,
    pub body_temperature: Option<i32>,
    pub hrv_balance: Option<i32>,
    pub previous_day_activity: Option<i32>,
    pub previous_night: Option<i32>,
    pub recovery_index: Option<i32>,
    pub resting_heart_rate: Option<i32>,
    pub sleep_balance: Option<i32>,
}

pub async fn get_oura_daily_readiness_data_from_api(
    start_date: &str,
    end_date: &str,
    access_token: &str,
) -> Result<Vec<DailyReadinessData>, String> {
    let base_url = "https://api.ouraring.com/v2";

    let url = format!(
        "{}/usercollection/daily_readiness?start_date={}&end_date={}",
        base_url, start_date, end_date
    );

    let client = Client::new();
    let res = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Oura API error: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct OuraDailyReadinessResponse {
        data: Vec<DailyReadinessData>,
    }

    let response: OuraDailyReadinessResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(response.data)
}

pub async fn save_daily_readiness_data_to_mongo(
    mongo_client: &mongodb::Client,
    daily_readiness_data: &[DailyReadinessData],
) -> Result<(), String> {
    let db = mongo_client.database("wyat");
    let collection = db.collection::<DailyReadinessData>("oura_daily_readiness");

    let mut inserted_count = 0;
    let mut skipped_count = 0;

    for entry in daily_readiness_data {
        // Check if this record already exists using id if available, otherwise use day
        let filter = if let Some(ref id) = entry.id {
            doc! { "id": id }
        } else {
            doc! { "day": &entry.day }
        };
        let existing = collection
            .find_one(filter.clone(), None)
            .await
            .map_err(|e| format!("MongoDB find error: {}", e))?;

        if existing.is_some() {
            skipped_count += 1;
            continue; // Skip if already exists
        }

        // Insert new entry
        collection
            .insert_one(entry, None)
            .await
            .map_err(|e| format!("MongoDB insert error: {}", e))?;

        inserted_count += 1;
    }

    println!(
        "💾 Daily readiness data: {} new entries inserted, {} duplicates skipped",
        inserted_count, skipped_count
    );
    Ok(())
}

pub async fn handle_oura_daily_readiness_sync(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let user_id = "default_user";

    // Get last sync date from database, or default to yesterday
    let last_sync_status =
        get_oura_sync_status(&state.mongo_client, user_id, "daily_readiness").await;
    let today = chrono::Utc::now().date_naive();

    let start_date = match last_sync_status {
        Ok(Some(status)) => {
            // Use the day after last sync as start date
            let last_date = chrono::NaiveDate::parse_from_str(&status.last_sync_date, "%Y-%m-%d")
                .unwrap_or_else(|_| today - chrono::Duration::days(1));

            // Calculate the next day after last sync
            let next_day = last_date + chrono::Duration::days(1);

            // Ensure start date is not after today
            if next_day > today {
                // If next day is in the future, use yesterday
                (today - chrono::Duration::days(1))
                    .format("%Y-%m-%d")
                    .to_string()
            } else {
                next_day.format("%Y-%m-%d").to_string()
            }
        }
        Ok(None) => {
            // First time sync - default to yesterday
            (today - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        }
        Err(e) => {
            println!("⚡ Daily Readiness Sync - Error getting sync status: {}", e);
            (today - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        }
    };

    let end_date = today.format("%Y-%m-%d").to_string();

    // Try to get OAuth access token, fallback to personal token
    let access_token = match get_valid_oura_access_token(&state.mongo_client, user_id).await {
        Ok(Some(token)) => {
            println!(
                "⚡ Daily Readiness Sync - Using OAuth token: {}",
                &token[..10]
            );
            token
        }
        Ok(None) => {
            let personal_token = env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string());
            personal_token
        }
        Err(e) => {
            println!(
                "⚡ Daily Readiness Sync - Token error: {}, using personal token",
                e
            );
            env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string())
        }
    };

    println!(
        "⚡ Daily Readiness Sync - Date range: {} → {}",
        start_date, end_date
    );

    match get_oura_daily_readiness_data_from_api(&start_date, &end_date, &access_token).await {
        Ok(daily_readiness_data) => {
            println!(
                "⚡ Daily Readiness Sync - Retrieved {} daily readiness records",
                daily_readiness_data.len()
            );

            match save_daily_readiness_data_to_mongo(&state.mongo_client, &daily_readiness_data)
                .await
            {
                Ok(_) => {
                    // Update sync status
                    if let Err(e) = update_oura_sync_status(
                        &state.mongo_client,
                        user_id,
                        "daily_readiness",
                        &end_date,
                    )
                    .await
                    {
                        println!(
                            "⚡ Daily Readiness Sync - Warning: Failed to update sync status: {}",
                            e
                        );
                    }

                    println!(
                        "⚡ Daily Readiness Sync - Saved {} daily readiness records to MongoDB",
                        daily_readiness_data.len()
                    );
                    Json(serde_json::json!({
                        "status": "success",
                        "message": format!("Synced {} daily readiness records from {} to {}", daily_readiness_data.len(), start_date, end_date),
                        "sync_range": {
                            "start_date": start_date,
                            "end_date": end_date
                        },
                        "data": daily_readiness_data
                    }))
                    .into_response()
                }
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
            }
        }
        Err(err) => (StatusCode::BAD_GATEWAY, err).into_response(),
    }
}

// ================================
// * * * * Daily Resilience * * * *
// ================================
// Data structures, API fetch, and MongoDB storage for daily resilience
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyResilienceData {
    pub id: Option<String>,
    pub day: String,
    pub contributors: Option<DailyResilienceContributors>,
    pub level: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyResilienceContributors {
    pub sleep_recovery: Option<f32>,
    pub daytime_recovery: Option<f32>,
    pub stress: Option<f32>,
}

pub async fn get_oura_daily_resilience_data_from_api(
    start_date: &str,
    end_date: &str,
    access_token: &str,
) -> Result<Vec<DailyResilienceData>, String> {
    let base_url = "https://api.ouraring.com/v2";

    let url = format!(
        "{}/usercollection/daily_resilience?start_date={}&end_date={}",
        base_url, start_date, end_date
    );

    let client = Client::new();
    let res = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Oura API error: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct OuraDailyResilienceResponse {
        data: Vec<DailyResilienceData>,
    }

    let response: OuraDailyResilienceResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(response.data)
}

pub async fn save_daily_resilience_data_to_mongo(
    mongo_client: &mongodb::Client,
    daily_resilience_data: &[DailyResilienceData],
) -> Result<(), String> {
    let db = mongo_client.database("wyat");
    let collection = db.collection::<DailyResilienceData>("oura_daily_resilience");

    let mut inserted_count = 0;
    let mut skipped_count = 0;

    for entry in daily_resilience_data {
        // Check if this record already exists using id if available, otherwise use day
        let filter = if let Some(ref id) = entry.id {
            doc! { "id": id }
        } else {
            doc! { "day": &entry.day }
        };
        let existing = collection
            .find_one(filter.clone(), None)
            .await
            .map_err(|e| format!("MongoDB find error: {}", e))?;

        if existing.is_some() {
            skipped_count += 1;
            continue; // Skip if already exists
        }

        collection
            .insert_one(entry, None)
            .await
            .map_err(|e| format!("MongoDB insert error: {}", e))?;
        inserted_count += 1;
    }

    println!(
        "Saved {} daily resilience records, skipped {} duplicates",
        inserted_count, skipped_count
    );
    Ok(())
}

pub async fn handle_oura_daily_resilience_sync(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let user_id = "default_user";

    // Get last sync date from database, or default to yesterday
    let last_sync_status =
        get_oura_sync_status(&state.mongo_client, user_id, "daily_resilience").await;
    let today = chrono::Utc::now().date_naive();

    let start_date = match last_sync_status {
        Ok(Some(status)) => {
            // Use the day after last sync as start date
            let last_date = chrono::NaiveDate::parse_from_str(&status.last_sync_date, "%Y-%m-%d")
                .unwrap_or_else(|_| today - chrono::Duration::days(1));

            // Calculate the next day after last sync
            let next_day = last_date + chrono::Duration::days(1);
            next_day.format("%Y-%m-%d").to_string()
        }
        _ => {
            // Default to yesterday if no previous sync
            let yesterday = today - chrono::Duration::days(1);
            yesterday.format("%Y-%m-%d").to_string()
        }
    };

    let end_date = today.format("%Y-%m-%d").to_string();

    println!(
        "🔄 Syncing daily resilience data from {} to {}",
        start_date, end_date
    );

    // Get valid access token
    let access_token = match get_valid_oura_access_token(&state.mongo_client, user_id).await {
        Ok(Some(token)) => token,
        Ok(None) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "status": "error",
                    "message": "No valid Oura access token found. Please authenticate first."
                })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "status": "error",
                    "message": format!("Failed to get access token: {}", e)
                })),
            )
                .into_response();
        }
    };

    // Fetch data from Oura API
    let daily_resilience_data = match get_oura_daily_resilience_data_from_api(
        &start_date,
        &end_date,
        &access_token,
    )
    .await
    {
        Ok(data) => data,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "status": "error",
                    "message": format!("Failed to fetch daily resilience data: {}", e)
                })),
            )
                .into_response();
        }
    };

    if daily_resilience_data.is_empty() {
        return (
            StatusCode::OK,
            Json(json!({
                "status": "success",
                "message": format!("No daily resilience data found for {} to {}", start_date, end_date),
                "sync_range": {
                    "start_date": start_date,
                    "end_date": end_date
                },
                "data": []
            })),
        )
            .into_response();
    }

    // Save to MongoDB
    if let Err(e) =
        save_daily_resilience_data_to_mongo(&state.mongo_client, &daily_resilience_data).await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "status": "error",
                "message": format!("Failed to save daily resilience data: {}", e)
            })),
        )
            .into_response();
    }

    // Update sync status
    if let Err(e) =
        update_oura_sync_status(&state.mongo_client, user_id, "daily_resilience", &end_date).await
    {
        println!("⚠️  Warning: Failed to update sync status: {}", e);
    }

    (
        StatusCode::OK,
        Json(json!({
            "status": "success",
            "message": format!("Synced {} daily resilience records from {} to {}", daily_resilience_data.len(), start_date, end_date),
            "sync_range": {
                "start_date": start_date,
                "end_date": end_date
            },
            "data": daily_resilience_data
        })),
    )
        .into_response()
}

// ===========================
// * * * * Daily Sleep * * * *
// ===========================
// Data structures, API fetch, and MongoDB storage for daily sleep (v2 daily endpoint)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailySleepData {
    pub id: Option<String>,
    pub day: String,
    pub score: Option<i32>,
    pub timestamp: Option<String>,
    pub contributors: Option<DailySleepContributors>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailySleepContributors {
    pub deep_sleep: Option<i32>,
    pub efficiency: Option<i32>,
    pub latency: Option<i32>,
    pub rem_sleep: Option<i32>,
    pub restfulness: Option<i32>,
    pub timing: Option<i32>,
    pub total_sleep: Option<i32>,
}

pub async fn get_oura_daily_sleep_data_from_api(
    start_date: &str,
    end_date: &str,
    access_token: &str,
) -> Result<Vec<DailySleepData>, String> {
    let base_url = "https://api.ouraring.com/v2";

    let url = format!(
        "{}/usercollection/daily_sleep?start_date={}&end_date={}",
        base_url, start_date, end_date
    );

    let client = Client::new();
    let res = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Oura API error: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct OuraDailySleepResponse {
        data: Vec<DailySleepData>,
    }

    let response: OuraDailySleepResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(response.data)
}

pub async fn save_daily_sleep_data_to_mongo(
    mongo_client: &mongodb::Client,
    daily_sleep_data: &[DailySleepData],
) -> Result<(), String> {
    let db = mongo_client.database("wyat");
    let collection = db.collection::<DailySleepData>("oura_daily_sleep");

    let mut inserted_count = 0;
    let mut skipped_count = 0;

    for entry in daily_sleep_data {
        // Check if this record already exists using id if available, otherwise use day
        let filter = if let Some(ref id) = entry.id {
            doc! { "id": id }
        } else {
            doc! { "day": &entry.day }
        };
        let existing = collection
            .find_one(filter.clone(), None)
            .await
            .map_err(|e| format!("MongoDB find error: {}", e))?;

        if existing.is_some() {
            skipped_count += 1;
            continue; // Skip if already exists
        }

        // Insert new entry
        collection
            .insert_one(entry, None)
            .await
            .map_err(|e| format!("MongoDB insert error: {}", e))?;

        inserted_count += 1;
    }

    println!(
        "💾 Daily sleep data: {} new entries inserted, {} duplicates skipped",
        inserted_count, skipped_count
    );
    Ok(())
}

pub async fn handle_oura_daily_sleep_sync(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let user_id = "default_user";

    // Get last sync date from database, or default to yesterday
    let last_sync_status = get_oura_sync_status(&state.mongo_client, user_id, "daily_sleep").await;
    let today = chrono::Utc::now().date_naive();

    let start_date = match last_sync_status {
        Ok(Some(status)) => {
            // Use the day after last sync as start date
            let last_date = chrono::NaiveDate::parse_from_str(&status.last_sync_date, "%Y-%m-%d")
                .unwrap_or_else(|_| today - chrono::Duration::days(1));

            // Calculate the next day after last sync
            let next_day = last_date + chrono::Duration::days(1);

            // Ensure start date is not after today
            if next_day > today {
                // If next day is in the future, use yesterday
                (today - chrono::Duration::days(1))
                    .format("%Y-%m-%d")
                    .to_string()
            } else {
                next_day.format("%Y-%m-%d").to_string()
            }
        }
        Ok(None) => {
            // First time sync - default to yesterday
            (today - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        }
        Err(e) => {
            println!("😴 Daily Sleep Sync - Error getting sync status: {}", e);
            (today - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        }
    };

    let end_date = today.format("%Y-%m-%d").to_string();

    // Try to get OAuth access token, fallback to personal token
    let access_token = match get_valid_oura_access_token(&state.mongo_client, user_id).await {
        Ok(Some(token)) => {
            println!("😴 Daily Sleep Sync - Using OAuth token: {}", &token[..10]);
            token
        }
        Ok(None) => {
            let personal_token = env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string());
            personal_token
        }
        Err(e) => {
            println!(
                "😴 Daily Sleep Sync - Token error: {}, using personal token",
                e
            );
            env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string())
        }
    };

    println!(
        "😴 Daily Sleep Sync - Date range: {} → {}",
        start_date, end_date
    );

    match get_oura_daily_sleep_data_from_api(&start_date, &end_date, &access_token).await {
        Ok(daily_sleep_data) => {
            println!(
                "😴 Daily Sleep Sync - Retrieved {} daily sleep records",
                daily_sleep_data.len()
            );

            match save_daily_sleep_data_to_mongo(&state.mongo_client, &daily_sleep_data).await {
                Ok(_) => {
                    // Update sync status
                    if let Err(e) = update_oura_sync_status(
                        &state.mongo_client,
                        user_id,
                        "daily_sleep",
                        &end_date,
                    )
                    .await
                    {
                        println!(
                            "😴 Daily Sleep Sync - Warning: Failed to update sync status: {}",
                            e
                        );
                    }

                    println!(
                        "😴 Daily Sleep Sync - Saved {} daily sleep records to MongoDB",
                        daily_sleep_data.len()
                    );
                    Json(serde_json::json!({
                        "status": "success",
                        "message": format!("Synced {} daily sleep records from {} to {}", daily_sleep_data.len(), start_date, end_date),
                        "sync_range": {
                            "start_date": start_date,
                            "end_date": end_date
                        },
                        "data": daily_sleep_data
                    }))
                    .into_response()
                }
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
            }
        }
        Err(err) => (StatusCode::BAD_GATEWAY, err).into_response(),
    }
}

// ==========================
// * * * * Daily SpO2 * * * *
// ==========================
// Data structures, API fetch, and MongoDB storage for daily SpO2
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailySpO2Data {
    pub id: Option<String>,
    pub day: String,
    pub spo2_percentage: Option<serde_json::Value>,
    pub breathing_disturbance_index: Option<i32>,
}

pub async fn get_oura_daily_spo2_data_from_api(
    start_date: &str,
    end_date: &str,
    access_token: &str,
) -> Result<Vec<DailySpO2Data>, String> {
    let base_url = "https://api.ouraring.com/v2";

    let url = format!(
        "{}/usercollection/daily_spo2?start_date={}&end_date={}",
        base_url, start_date, end_date
    );

    let client = Client::new();
    let res = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Oura API error: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct OuraDailySpO2Response {
        data: Vec<DailySpO2Data>,
    }

    let response: OuraDailySpO2Response = res.json().await.map_err(|e| e.to_string())?;
    Ok(response.data)
}

pub async fn save_daily_spo2_data_to_mongo(
    mongo_client: &mongodb::Client,
    daily_spo2_data: &[DailySpO2Data],
) -> Result<(), String> {
    let db = mongo_client.database("wyat");
    let collection = db.collection::<DailySpO2Data>("oura_daily_spo2");

    let mut inserted_count = 0;
    let mut skipped_count = 0;

    for entry in daily_spo2_data {
        // Check if this record already exists using id if available, otherwise use day
        let filter = if let Some(ref id) = entry.id {
            doc! { "id": id }
        } else {
            doc! { "day": &entry.day }
        };
        let existing = collection
            .find_one(filter.clone(), None)
            .await
            .map_err(|e| format!("MongoDB find error: {}", e))?;

        if existing.is_some() {
            skipped_count += 1;
            continue; // Skip if already exists
        }

        collection
            .insert_one(entry, None)
            .await
            .map_err(|e| format!("MongoDB insert error: {}", e))?;
        inserted_count += 1;
    }

    println!(
        "Saved {} daily SpO2 records, skipped {} duplicates",
        inserted_count, skipped_count
    );
    Ok(())
}

pub async fn handle_oura_daily_spo2_sync(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let user_id = "default_user";

    // Get last sync date from database, or default to yesterday
    let last_sync_status = get_oura_sync_status(&state.mongo_client, user_id, "daily_spo2").await;
    let today = chrono::Utc::now().date_naive();

    let start_date = match last_sync_status {
        Ok(Some(status)) => {
            // Use the day after last sync as start date
            let last_date = chrono::NaiveDate::parse_from_str(&status.last_sync_date, "%Y-%m-%d")
                .unwrap_or_else(|_| today - chrono::Duration::days(1));

            // Calculate the next day after last sync
            let next_day = last_date + chrono::Duration::days(1);
            next_day.format("%Y-%m-%d").to_string()
        }
        _ => {
            // Default to yesterday if no previous sync
            let yesterday = today - chrono::Duration::days(1);
            yesterday.format("%Y-%m-%d").to_string()
        }
    };

    let end_date = today.format("%Y-%m-%d").to_string();

    println!(
        "🔄 Syncing daily SpO2 data from {} to {}",
        start_date, end_date
    );

    // Get valid access token
    let access_token = match get_valid_oura_access_token(&state.mongo_client, user_id).await {
        Ok(Some(token)) => token,
        Ok(None) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "status": "error",
                    "message": "No valid Oura access token found. Please authenticate first."
                })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "status": "error",
                    "message": format!("Failed to get access token: {}", e)
                })),
            )
                .into_response();
        }
    };

    // Fetch data from Oura API
    let daily_spo2_data =
        match get_oura_daily_spo2_data_from_api(&start_date, &end_date, &access_token).await {
            Ok(data) => data,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({
                        "status": "error",
                        "message": format!("Failed to fetch daily SpO2 data: {}", e)
                    })),
                )
                    .into_response();
            }
        };

    if daily_spo2_data.is_empty() {
        return (
            StatusCode::OK,
            Json(json!({
                "status": "success",
                "message": format!("No daily SpO2 data found for {} to {}", start_date, end_date),
                "sync_range": {
                    "start_date": start_date,
                    "end_date": end_date
                },
                "data": []
            })),
        )
            .into_response();
    }

    // Save to MongoDB
    if let Err(e) = save_daily_spo2_data_to_mongo(&state.mongo_client, &daily_spo2_data).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "status": "error",
                "message": format!("Failed to save daily SpO2 data: {}", e)
            })),
        )
            .into_response();
    }

    // Update sync status
    if let Err(e) =
        update_oura_sync_status(&state.mongo_client, user_id, "daily_spo2", &end_date).await
    {
        println!("⚠️  Warning: Failed to update sync status: {}", e);
    }

    (
        StatusCode::OK,
        Json(json!({
            "status": "success",
            "message": format!("Synced {} daily SpO2 records from {} to {}", daily_spo2_data.len(), start_date, end_date),
            "sync_range": {
                "start_date": start_date,
                "end_date": end_date
            },
            "data": daily_spo2_data
        })),
    )
        .into_response()
}

// ============================
// * * * * Daily Stress * * * *
// ============================
// Data structures, API fetch, and MongoDB storage for daily stress
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyStressData {
    pub id: Option<String>,
    pub day: String,
    pub stress_high: Option<i32>,
    pub recovery_high: Option<i32>,
    pub day_summary: Option<String>,
}

pub async fn get_oura_daily_stress_data_from_api(
    start_date: &str,
    end_date: &str,
    access_token: &str,
) -> Result<Vec<DailyStressData>, String> {
    let base_url = "https://api.ouraring.com/v2";

    let url = format!(
        "{}/usercollection/daily_stress?start_date={}&end_date={}",
        base_url, start_date, end_date
    );

    let client = Client::new();
    let res = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Oura API error: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct OuraDailyStressResponse {
        data: Vec<DailyStressData>,
    }

    let response: OuraDailyStressResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(response.data)
}

pub async fn save_daily_stress_data_to_mongo(
    mongo_client: &mongodb::Client,
    daily_stress_data: &[DailyStressData],
) -> Result<(), String> {
    let db = mongo_client.database("wyat");
    let collection = db.collection::<DailyStressData>("oura_daily_stress");

    let mut inserted_count = 0;
    let mut skipped_count = 0;

    for entry in daily_stress_data {
        // Check if this record already exists using id if available, otherwise use day
        let filter = if let Some(ref id) = entry.id {
            doc! { "id": id }
        } else {
            doc! { "day": &entry.day }
        };
        let existing = collection
            .find_one(filter.clone(), None)
            .await
            .map_err(|e| format!("MongoDB find error: {}", e))?;

        if existing.is_some() {
            skipped_count += 1;
            continue; // Skip if already exists
        }

        // Insert new entry
        collection
            .insert_one(entry, None)
            .await
            .map_err(|e| format!("MongoDB insert error: {}", e))?;

        inserted_count += 1;
    }

    println!(
        "💾 Daily stress data: {} new entries inserted, {} duplicates skipped",
        inserted_count, skipped_count
    );
    Ok(())
}

pub async fn handle_oura_daily_stress_sync(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let user_id = "default_user";

    // Get last sync date from database, or default to yesterday
    let last_sync_status = get_oura_sync_status(&state.mongo_client, user_id, "daily_stress").await;
    let today = chrono::Utc::now().date_naive();

    let start_date = match last_sync_status {
        Ok(Some(status)) => {
            // Use the day after last sync as start date
            let last_date = chrono::NaiveDate::parse_from_str(&status.last_sync_date, "%Y-%m-%d")
                .unwrap_or_else(|_| today - chrono::Duration::days(1));

            // Calculate the next day after last sync
            let next_day = last_date + chrono::Duration::days(1);

            // Ensure start date is not after today
            if next_day > today {
                // If next day is in the future, use yesterday
                (today - chrono::Duration::days(1))
                    .format("%Y-%m-%d")
                    .to_string()
            } else {
                next_day.format("%Y-%m-%d").to_string()
            }
        }
        Ok(None) => {
            // First time sync - default to yesterday
            (today - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        }
        Err(e) => {
            println!("😰 Daily Stress Sync - Error getting sync status: {}", e);
            (today - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        }
    };

    let end_date = today.format("%Y-%m-%d").to_string();

    // Try to get OAuth access token, fallback to personal token
    let access_token = match get_valid_oura_access_token(&state.mongo_client, user_id).await {
        Ok(Some(token)) => {
            println!("😰 Daily Stress Sync - Using OAuth token: {}", &token[..10]);
            token
        }
        Ok(None) => {
            let personal_token = env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string());
            personal_token
        }
        Err(e) => {
            println!(
                "😰 Daily Stress Sync - Token error: {}, using personal token",
                e
            );
            env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string())
        }
    };

    println!(
        "😰 Daily Stress Sync - Date range: {} → {}",
        start_date, end_date
    );

    match get_oura_daily_stress_data_from_api(&start_date, &end_date, &access_token).await {
        Ok(daily_stress_data) => {
            println!(
                "😰 Daily Stress Sync - Retrieved {} daily stress records",
                daily_stress_data.len()
            );

            match save_daily_stress_data_to_mongo(&state.mongo_client, &daily_stress_data).await {
                Ok(_) => {
                    // Update sync status
                    if let Err(e) = update_oura_sync_status(
                        &state.mongo_client,
                        user_id,
                        "daily_stress",
                        &end_date,
                    )
                    .await
                    {
                        println!(
                            "😰 Daily Stress Sync - Warning: Failed to update sync status: {}",
                            e
                        );
                    }

                    println!(
                        "😰 Daily Stress Sync - Saved {} daily stress records to MongoDB",
                        daily_stress_data.len()
                    );
                    Json(serde_json::json!({
                        "status": "success",
                        "message": format!("Synced {} daily stress records from {} to {}", daily_stress_data.len(), start_date, end_date),
                        "sync_range": {
                            "start_date": start_date,
                            "end_date": end_date
                        },
                        "data": daily_stress_data
                    }))
                    .into_response()
                }
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
            }
        }
        Err(err) => (StatusCode::BAD_GATEWAY, err).into_response(),
    }
}

// ==========================
// * * * * Heart Rate * * * *
// ==========================
// Data structures, API fetch, and MongoDB storage for heart rate
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HeartRateData {
    pub timestamp: String,
    pub bpm: u32,
}

pub async fn get_oura_heartrate_data_from_api(
    start_date: &str,
    end_date: &str,
    access_token: &str,
) -> Result<Vec<HeartRateData>, String> {
    let base_url = "https://api.ouraring.com/v2";
    let url = format!(
        "{}/usercollection/heartrate?start_date={}&end_date={}",
        base_url, start_date, end_date
    );

    println!("💓 Heart Rate API - Requesting: {}", url);

    let client = Client::new();
    let res = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    println!("💓 Heart Rate API - Response status: {}", res.status());

    if !res.status().is_success() {
        return Err(format!("Oura API error: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct OuraHeartRateResponse {
        data: Vec<HeartRateData>,
    }

    let response: OuraHeartRateResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(response.data)
}

pub async fn save_heartrate_data_to_mongo(
    mongo_client: &mongodb::Client,
    heartrate_data: &[HeartRateData],
) -> Result<(), String> {
    let db = mongo_client.database("wyat");
    let collection = db.collection::<HeartRateData>("oura_heartrate");

    let mut inserted_count = 0;
    let mut skipped_count = 0;

    for entry in heartrate_data {
        // Check if this timestamp already exists
        let filter = doc! { "timestamp": &entry.timestamp };
        let existing = collection
            .find_one(filter.clone(), None)
            .await
            .map_err(|e| format!("MongoDB find error: {}", e))?;

        if existing.is_some() {
            skipped_count += 1;
            continue; // Skip if already exists
        }

        // Insert new entry
        collection
            .insert_one(entry, None)
            .await
            .map_err(|e| format!("MongoDB insert error: {}", e))?;

        inserted_count += 1;
    }

    println!(
        "💾 Heart rate data: {} new entries inserted, {} duplicates skipped",
        inserted_count, skipped_count
    );
    Ok(())
}

pub async fn handle_oura_heartrate_sync(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let user_id = "default_user";

    // Get last sync date from database, or default to yesterday
    let last_sync_status = get_oura_sync_status(&state.mongo_client, user_id, "heartrate").await;
    let today = chrono::Utc::now().date_naive();

    let start_date = match last_sync_status {
        Ok(Some(status)) => {
            // Use the day after last sync as start date
            let last_date = chrono::NaiveDate::parse_from_str(&status.last_sync_date, "%Y-%m-%d")
                .unwrap_or_else(|_| today - chrono::Duration::days(1));

            // Calculate the next day after last sync
            let next_day = last_date + chrono::Duration::days(1);

            // Ensure start date is not after today
            if next_day > today {
                // If next day is in the future, use yesterday
                (today - chrono::Duration::days(1))
                    .format("%Y-%m-%d")
                    .to_string()
            } else {
                next_day.format("%Y-%m-%d").to_string()
            }
        }
        Ok(None) => {
            // First time sync - default to yesterday
            (today - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        }
        Err(e) => {
            println!("💓 Heart Rate Sync - Error getting sync status: {}", e);
            (today - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        }
    };

    let end_date = today.format("%Y-%m-%d").to_string();

    // Try to get OAuth access token, fallback to personal token
    let access_token = match get_valid_oura_access_token(&state.mongo_client, user_id).await {
        Ok(Some(token)) => {
            println!("💓 Heart Rate Sync - Using OAuth token: {}", &token[..10]);
            token
        }
        Ok(None) => {
            let personal_token = env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string());
            personal_token
        }
        Err(e) => {
            println!(
                "💓 Heart Rate Sync - Token error: {}, using personal token",
                e
            );
            env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string())
        }
    };

    println!(
        "💓 Heart Rate Sync - Date range: {} → {}",
        start_date, end_date
    );

    match get_oura_heartrate_data_from_api(&start_date, &end_date, &access_token).await {
        Ok(heartrate_data) => {
            println!(
                "💓 Heart Rate Sync - Retrieved {} data points",
                heartrate_data.len()
            );

            // Save to MongoDB
            match save_heartrate_data_to_mongo(&state.mongo_client, &heartrate_data).await {
                Ok(_) => {
                    // Update sync status
                    if let Err(e) = update_oura_sync_status(
                        &state.mongo_client,
                        user_id,
                        "heartrate",
                        &end_date,
                    )
                    .await
                    {
                        println!(
                            "💓 Heart Rate Sync - Warning: Failed to update sync status: {}",
                            e
                        );
                    }

                    println!(
                        "💓 Heart Rate Sync - Saved {} data points to MongoDB",
                        heartrate_data.len()
                    );
                    Json(serde_json::json!({
                        "status": "success",
                        "message": format!("Synced {} heart rate data points from {} to {}", heartrate_data.len(), start_date, end_date),
                        "sync_range": {
                            "start_date": start_date,
                            "end_date": end_date
                        },
                        "data": heartrate_data
                    }))
                    .into_response()
                }
                Err(e) => {
                    println!("💓 Heart Rate Sync - MongoDB save error: {}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, e).into_response()
                }
            }
        }
        Err(err) => {
            println!("💓 Heart Rate Sync - Error: {}", err);
            (StatusCode::BAD_GATEWAY, err).into_response()
        }
    }
}

// ========================================
// * * * * Sleep (Classic Endpoint) * * * *
// ========================================
// Data structures, API fetch, and MongoDB storage for classic sleep endpoint
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SleepData {
    pub date: String,
    pub sleep_score: Option<u8>,
    pub total_sleep_minutes: u32,
    pub rem_sleep_minutes: u32,
    pub deep_sleep_minutes: u32,
    pub light_sleep_minutes: u32,
    pub time_in_bed_minutes: u32,
    pub efficiency: Option<u8>,
    pub average_hr: Option<f32>,
    pub lowest_hr: Option<f32>,
    pub hrv: Option<f32>,
}

pub async fn get_oura_sleep_data_from_api(
    start_date: &str,
    end_date: &str,
    access_token: &str,
) -> Result<Vec<SleepData>, String> {
    let base_url = "https://api.ouraring.com/v2";

    let url = format!(
        "{}/usercollection/sleep?start_date={}&end_date={}",
        base_url, start_date, end_date
    );

    let client = Client::new();
    let res = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Oura API error: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct OuraSleepResponse {
        data: Vec<OuraSleepRecord>,
    }

    #[derive(Deserialize)]
    struct OuraSleepRecord {
        day: String,
        score: Option<u8>,
        total_sleep_duration: u32,
        rem_sleep_duration: Option<u32>,
        deep_sleep_duration: Option<u32>,
        light_sleep_duration: Option<u32>,
        time_in_bed: Option<u32>,
        efficiency: Option<u8>,
        average_hr: Option<f32>,
        lowest_hr: Option<f32>,
        rmssd: Option<f32>,
    }

    let response: OuraSleepResponse = res.json().await.map_err(|e| e.to_string())?;
    let results = response
        .data
        .into_iter()
        .map(|record| SleepData {
            date: record.day,
            sleep_score: record.score,
            total_sleep_minutes: record.total_sleep_duration / 60,
            rem_sleep_minutes: record.rem_sleep_duration.unwrap_or(0) / 60,
            deep_sleep_minutes: record.deep_sleep_duration.unwrap_or(0) / 60,
            light_sleep_minutes: record.light_sleep_duration.unwrap_or(0) / 60,
            time_in_bed_minutes: record.time_in_bed.unwrap_or(0) / 60,
            efficiency: record.efficiency,
            average_hr: record.average_hr,
            lowest_hr: record.lowest_hr,
            hrv: record.rmssd,
        })
        .collect();

    Ok(results)
}

pub async fn save_sleep_data_to_mongo(
    mongo_client: &mongodb::Client,
    sleep_data: &[SleepData],
) -> Result<(), String> {
    let db = mongo_client.database("wyat");
    let collection = db.collection::<SleepData>("oura_sleep");

    let mut inserted_count = 0;
    let mut skipped_count = 0;

    for entry in sleep_data {
        // Check if this date already exists
        let filter = doc! { "date": &entry.date };
        let existing = collection
            .find_one(filter.clone(), None)
            .await
            .map_err(|e| format!("MongoDB find error: {}", e))?;

        if existing.is_some() {
            skipped_count += 1;
            continue; // Skip if already exists
        }

        // Insert new entry
        collection
            .insert_one(entry, None)
            .await
            .map_err(|e| format!("MongoDB insert error: {}", e))?;

        inserted_count += 1;
    }

    println!(
        "💾 Sleep data: {} new entries inserted, {} duplicates skipped",
        inserted_count, skipped_count
    );
    Ok(())
}

pub async fn handle_oura_sleep_sync(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let user_id = "default_user";

    // Get last sync date from database, or default to yesterday
    let last_sync_status = get_oura_sync_status(&state.mongo_client, user_id, "sleep").await;
    let today = chrono::Utc::now().date_naive();

    let start_date = match last_sync_status {
        Ok(Some(status)) => {
            // Use the day after last sync as start date
            let last_date = chrono::NaiveDate::parse_from_str(&status.last_sync_date, "%Y-%m-%d")
                .unwrap_or_else(|_| today - chrono::Duration::days(1));

            // Calculate the next day after last sync
            let next_day = last_date + chrono::Duration::days(1);

            // Ensure start date is not after today
            if next_day > today {
                // If next day is in the future, use yesterday
                (today - chrono::Duration::days(1))
                    .format("%Y-%m-%d")
                    .to_string()
            } else {
                next_day.format("%Y-%m-%d").to_string()
            }
        }
        Ok(None) => {
            // First time sync - default to yesterday
            (today - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        }
        Err(e) => {
            println!("💤 Sleep Sync - Error getting sync status: {}", e);
            (today - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        }
    };

    let end_date = today.format("%Y-%m-%d").to_string();

    // Try to get OAuth access token, fallback to personal token
    let access_token = match get_valid_oura_access_token(&state.mongo_client, user_id).await {
        Ok(Some(token)) => {
            println!("💤 Sleep Sync - Using OAuth token: {}", &token[..10]);
            token
        }
        Ok(None) => {
            let personal_token = env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string());
            personal_token
        }
        Err(e) => {
            println!("💤 Sleep Sync - Token error: {}, using personal token", e);
            env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string())
        }
    };

    println!("💤 Sleep Sync - Date range: {} → {}", start_date, end_date);

    match get_oura_sleep_data_from_api(&start_date, &end_date, &access_token).await {
        Ok(sleep_data) => {
            println!(
                "💤 Sleep Sync - Retrieved {} sleep records",
                sleep_data.len()
            );

            match save_sleep_data_to_mongo(&state.mongo_client, &sleep_data).await {
                Ok(_) => {
                    // Update sync status
                    if let Err(e) =
                        update_oura_sync_status(&state.mongo_client, user_id, "sleep", &end_date)
                            .await
                    {
                        println!(
                            "💤 Sleep Sync - Warning: Failed to update sync status: {}",
                            e
                        );
                    }

                    println!(
                        "💤 Sleep Sync - Saved {} sleep records to MongoDB",
                        sleep_data.len()
                    );
                    Json(serde_json::json!({
                        "status": "success",
                        "message": format!("Synced {} sleep records from {} to {}", sleep_data.len(), start_date, end_date),
                        "sync_range": {
                            "start_date": start_date,
                            "end_date": end_date
                        },
                        "data": sleep_data
                    }))
                    .into_response()
                }
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
            }
        }
        Err(err) => (StatusCode::BAD_GATEWAY, err).into_response(),
    }
}

// =======================
// * * * * VO2 Max * * * *
// =======================
// Data structures, API fetch, and MongoDB storage for VO2 max

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VO2MaxData {
    pub id: Option<String>,
    pub day: String,
    pub timestamp: Option<String>,
    pub vo2_max: Option<f32>,
}

pub async fn get_oura_vo2_max_data_from_api(
    start_date: &str,
    end_date: &str,
    access_token: &str,
) -> Result<Vec<VO2MaxData>, String> {
    let base_url = "https://api.ouraring.com/v2";

    let url = format!(
        "{}/usercollection/vo2_max?start_date={}&end_date={}",
        base_url, start_date, end_date
    );

    let client = Client::new();
    let res = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Oura API error: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct OuraVO2MaxResponse {
        data: Vec<VO2MaxData>,
    }

    let response: OuraVO2MaxResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(response.data)
}

pub async fn save_vo2_max_data_to_mongo(
    mongo_client: &mongodb::Client,
    vo2_max_data: &[VO2MaxData],
) -> Result<(), String> {
    let db = mongo_client.database("wyat");
    let collection = db.collection::<VO2MaxData>("oura_vo2_max");

    let mut inserted_count = 0;
    let mut skipped_count = 0;

    for entry in vo2_max_data {
        // Check if this record already exists using id if available, otherwise use day
        let filter = if let Some(ref id) = entry.id {
            doc! { "id": id }
        } else {
            doc! { "day": &entry.day }
        };
        let existing = collection
            .find_one(filter.clone(), None)
            .await
            .map_err(|e| format!("MongoDB find error: {}", e))?;

        if existing.is_some() {
            skipped_count += 1;
            continue; // Skip if already exists
        }

        collection
            .insert_one(entry, None)
            .await
            .map_err(|e| format!("MongoDB insert error: {}", e))?;
        inserted_count += 1;
    }

    println!(
        "Saved {} VO2 max records, skipped {} duplicates",
        inserted_count, skipped_count
    );
    Ok(())
}

pub async fn handle_oura_vo2_max_sync(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let user_id = "default_user";

    // Get last sync date from database, or default to yesterday
    let last_sync_status = get_oura_sync_status(&state.mongo_client, user_id, "vo2_max").await;
    let today = chrono::Utc::now().date_naive();

    let start_date = match last_sync_status {
        Ok(Some(status)) => {
            // Use the day after last sync as start date
            let last_date = chrono::NaiveDate::parse_from_str(&status.last_sync_date, "%Y-%m-%d")
                .unwrap_or_else(|_| today - chrono::Duration::days(1));

            // Calculate the next day after last sync
            let next_day = last_date + chrono::Duration::days(1);
            next_day.format("%Y-%m-%d").to_string()
        }
        _ => {
            // Default to yesterday if no previous sync
            let yesterday = today - chrono::Duration::days(1);
            yesterday.format("%Y-%m-%d").to_string()
        }
    };

    let end_date = today.format("%Y-%m-%d").to_string();

    println!(
        "🔄 Syncing VO2 max data from {} to {}",
        start_date, end_date
    );

    // Get valid access token
    let access_token = match get_valid_oura_access_token(&state.mongo_client, user_id).await {
        Ok(Some(token)) => token,
        Ok(None) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "status": "error",
                    "message": "No valid Oura access token found. Please authenticate first."
                })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "status": "error",
                    "message": format!("Failed to get access token: {}", e)
                })),
            )
                .into_response();
        }
    };

    // Fetch data from Oura API
    let vo2_max_data =
        match get_oura_vo2_max_data_from_api(&start_date, &end_date, &access_token).await {
            Ok(data) => data,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({
                        "status": "error",
                        "message": format!("Failed to fetch VO2 max data: {}", e)
                    })),
                )
                    .into_response();
            }
        };

    if vo2_max_data.is_empty() {
        return (
            StatusCode::OK,
            Json(json!({
                "status": "success",
                "message": format!("No VO2 max data found for {} to {}", start_date, end_date),
                "sync_range": {
                    "start_date": start_date,
                    "end_date": end_date
                },
                "data": []
            })),
        )
            .into_response();
    }

    // Save to MongoDB
    if let Err(e) = save_vo2_max_data_to_mongo(&state.mongo_client, &vo2_max_data).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "status": "error",
                "message": format!("Failed to save VO2 max data: {}", e)
            })),
        )
            .into_response();
    }

    // Update sync status
    if let Err(e) =
        update_oura_sync_status(&state.mongo_client, user_id, "vo2_max", &end_date).await
    {
        println!("⚠️  Warning: Failed to update sync status: {}", e);
    }

    (
        StatusCode::OK,
        Json(json!({
            "status": "success",
            "message": format!("Synced {} VO2 max records from {} to {}", vo2_max_data.len(), start_date, end_date),
            "sync_range": {
                "start_date": start_date,
                "end_date": end_date
            },
            "data": vo2_max_data
        })),
    )
        .into_response()
}

// ===================================
// * * * * Sync Status Helpers * * * *
// ===================================
// Helpers for tracking last sync date/status in MongoDB

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OuraSyncStatus {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<mongodb::bson::oid::ObjectId>,
    pub user_id: String,
    pub data_type: String, // "heartrate", "sleep", etc.
    pub last_sync_at: DateTime<Utc>,
    pub last_sync_date: String, // YYYY-MM-DD format
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub async fn get_oura_sync_status(
    mongo_client: &mongodb::Client,
    user_id: &str,
    data_type: &str,
) -> Result<Option<OuraSyncStatus>, String> {
    let db = mongo_client.database("wyat");
    let collection = db.collection::<OuraSyncStatus>("oura_sync_status");

    let filter = doc! {
        "user_id": user_id,
        "data_type": data_type
    };

    match collection.find_one(filter, None).await {
        Ok(status) => Ok(status),
        Err(e) => Err(format!("MongoDB error: {}", e)),
    }
}

pub async fn update_oura_sync_status(
    mongo_client: &mongodb::Client,
    user_id: &str,
    data_type: &str,
    last_sync_date: &str,
) -> Result<(), String> {
    let db = mongo_client.database("wyat");
    let collection = db.collection::<OuraSyncStatus>("oura_sync_status");

    let now = Utc::now();
    let sync_status = OuraSyncStatus {
        id: None,
        user_id: user_id.to_string(),
        data_type: data_type.to_string(),
        last_sync_at: now,
        last_sync_date: last_sync_date.to_string(),
        created_at: now,
        updated_at: now,
    };

    let filter = doc! {
        "user_id": user_id,
        "data_type": data_type
    };
    let options = ReplaceOptions::builder().upsert(true).build();

    collection
        .replace_one(filter, sync_status, options)
        .await
        .map_err(|e| format!("MongoDB error: {}", e))?;

    println!(
        "💾 Updated sync status for {}: {}",
        data_type, last_sync_date
    );
    Ok(())
}
