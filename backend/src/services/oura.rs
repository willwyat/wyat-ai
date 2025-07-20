use axum::{
    Form, Json,
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    response::Redirect,
};
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;

// Import JournalResponse from the journal module
use crate::AppState;
use crate::journal::JournalResponse;
use mongodb::bson::doc;
use mongodb::options::ReplaceOptions;
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HeartRateData {
    pub timestamp: String,
    pub bpm: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VO2Data {
    pub date: String,
    pub vo2_max: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StressData {
    pub day: String,
    pub score: Option<u8>,
}

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

pub async fn handle_oura_sleep_sync(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
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

    // Try to get OAuth access token, fallback to personal token
    let access_token = match get_valid_oura_access_token(&state.mongo_client, "default_user").await
    {
        Ok(Some(token)) => {
            println!("💤 Sleep Sync - Using OAuth token: {}", &token[..10]);
            token
        }
        Ok(None) => {
            let personal_token = env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string());
            println!(
                "💤 Sleep Sync - Using personal token: {}",
                &personal_token[..10]
            );
            personal_token
        }
        Err(e) => {
            println!("💤 Sleep Sync - Token error: {}, using personal token", e);
            env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string())
        }
    };

    match get_oura_sleep_data_from_api(start_date, end_date, &access_token).await {
        Ok(sleep_data) => match save_sleep_data_to_mongo(&state.mongo_client, &sleep_data).await {
            Ok(_) => Json(JournalResponse {
                message: format!("Synced sleep data for {} → {}", start_date, end_date),
            })
            .into_response(),
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        },
        Err(err) => (StatusCode::BAD_GATEWAY, err).into_response(),
    }
}

pub async fn save_sleep_data_to_mongo(
    mongo_client: &mongodb::Client,
    sleep_data: &[SleepData],
) -> Result<(), String> {
    let db = mongo_client.database("wyat");
    let collection = db.collection::<SleepData>("oura_sleep");

    for entry in sleep_data {
        let filter = doc! { "date": &entry.date };
        let options = ReplaceOptions::builder().upsert(true).build();
        collection
            .replace_one(filter, entry, options)
            .await
            .map_err(|e| format!("MongoDB error: {}", e))?;
    }

    Ok(())
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

#[derive(Deserialize)]
pub struct OuraCallbackQuery {
    code: String,
    state: Option<String>,
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
pub struct RefreshTokenRequest {
    grant_type: String,
    refresh_token: String,
    client_id: String,
    client_secret: String,
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
                        Redirect::to("https://wyat-ai.vercel.app/oura-error")
                    }
                }
            } else {
                println!("Token exchange failed with status: {}", resp.status());
                Redirect::to("https://wyat-ai.vercel.app/oura-error")
            }
        }
        Err(e) => {
            println!("Failed to exchange code for token: {}", e);
            Redirect::to("https://wyat-ai.vercel.app/oura-error")
        }
    }
}

// #[allow(dead_code)]
// pub async fn write_sleep_summary_to_file(sleep_data: &[SleepData]) -> Result<(), String> {
//     let path = Path::new("vitals/sleep.json");

//     // Load existing data if file exists
//     let existing_data: Vec<SleepData> = if path.exists() {
//         let content = fs::read_to_string(path)
//             .await
//             .map_err(|e| format!("Failed to read file: {}", e))?;
//         serde_json::from_str(&content).unwrap_or_default()
//     } else {
//         Vec::new()
//     };

//     // Index by date
//     let mut map: HashMap<String, SleepData> = existing_data
//         .into_iter()
//         .map(|entry| (entry.date.clone(), entry))
//         .collect();

//     // Insert/overwrite with new data
//     for entry in sleep_data {
//         map.insert(entry.date.clone(), entry.clone());
//     }

//     // Save merged results
//     let merged: Vec<SleepData> = map.into_values().collect();
//     let json = serde_json::to_string_pretty(&merged)
//         .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

//     fs::create_dir_all("vitals")
//         .await
//         .map_err(|e| format!("Failed to create vitals directory: {}", e))?;
//     fs::write(path, json)
//         .await
//         .map_err(|e| format!("Failed to write file: {}", e))?;

//     Ok(())
// }

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkoutData {
    pub id: String,
    pub date: String,
    pub start: String,
    pub end: String,
    pub activity: Option<String>,
    pub calories: Option<f32>,
    pub distance: Option<f32>,
    pub intensity: Option<String>,
}

// pub async fn fetch_oura_workout_data(
//     start_date: &str,
//     end_date: &str,
// ) -> Result<Vec<WorkoutData>, String> {
//     let token = env::var("OURA_TOKEN").map_err(|_| "Missing OURA_TOKEN".to_string())?;
//     let base_url = env::var("OURA_API_URL").map_err(|_| "Missing OURA_API_URL".to_string())?;
//     let base_url = base_url.trim_end_matches('/').to_string();
//     let url = format!(
//         "{}/usercollection/workout?start_date={}&end_date={}",
//         base_url, start_date, end_date
//     );

//     let client = Client::new();
//     let res = client
//         .get(&url)
//         .bearer_auth(token)
//         .send()
//         .await
//         .map_err(|e| e.to_string())?;

//     if !res.status().is_success() {
//         let status = res.status();
//         let err_text = res
//             .text()
//             .await
//             .unwrap_or_else(|_| "Failed to read error body".to_string());
//         return Err(format!("Oura API error: {} - {}", status, err_text));
//     }

//     #[derive(Deserialize)]
//     struct OuraWorkoutResponse {
//         data: Vec<OuraWorkoutRecord>,
//     }

//     #[derive(Deserialize)]
//     struct OuraWorkoutRecord {
//         id: String,
//         day: String,
//         start_datetime: String,
//         end_datetime: String,
//         activity: Option<String>,
//         calories: Option<f32>,
//         distance: Option<f32>,
//         intensity: Option<String>,
//         // add other fields based on docs
//     }

//     let response: OuraWorkoutResponse = res.json().await.map_err(|e| e.to_string())?;
//     let results = response
//         .data
//         .into_iter()
//         .map(|rec| WorkoutData {
//             id: rec.id,
//             date: rec.day,
//             start: rec.start_datetime,
//             end: rec.end_datetime,
//             activity: rec.activity,
//             calories: rec.calories,
//             distance: rec.distance,
//             intensity: rec.intensity,
//         })
//         .collect();

//     Ok(results)
// }

// pub async fn write_workout_to_file(workouts: &[WorkoutData]) -> Result<(), String> {
//     let path = Path::new("vitals/workout.json");
//     let mut existing: Vec<WorkoutData> = if path.exists() {
//         let content = fs::read_to_string(path)
//             .await
//             .map_err(|e| format!("Read error: {}", e))?;
//         serde_json::from_str(&content).unwrap_or_default()
//     } else {
//         Vec::new()
//     };

//     let mut map: HashMap<String, WorkoutData> =
//         existing.into_iter().map(|w| (w.id.clone(), w)).collect();

//     for w in workouts {
//         map.insert(w.id.clone(), w.clone());
//     }

//     let merged: Vec<WorkoutData> = map.into_values().collect();
//     let json =
//         serde_json::to_string_pretty(&merged).map_err(|e| format!("Serialize error: {}", e))?;

//     fs::create_dir_all("vitals")
//         .await
//         .map_err(|e| format!("mkdir error: {}", e))?;
//     fs::write(path, json)
//         .await
//         .map_err(|e| format!("Write error: {}", e))?;
//     Ok(())
// }

// pub async fn fetch_oura_heart_rate_data(
//     start: &str,
//     end: &str,
// ) -> Result<Vec<HeartRateData>, String> {
//     let token = env::var("OURA_TOKEN").map_err(|_| "Missing OURA_TOKEN".to_string())?;
//     let base_url = env::var("OURA_API_URL").map_err(|_| "Missing OURA_API_URL".to_string())?;
//     let base_url = base_url.trim_end_matches('/').to_string();
//     let url = format!(
//         "{}/usercollection/heartrate?start={}&end={}",
//         base_url, start, end
//     );

//     let res = Client::new()
//         .get(&url)
//         .bearer_auth(token)
//         .send()
//         .await
//         .map_err(|e| e.to_string())?;

//     if !res.status().is_success() {
//         return Err(format!("Oura API error: {}", res.status()));
//     }

//     #[derive(Deserialize)]
//     struct OuraHeartRateResponse {
//         data: Vec<HeartRateData>,
//     }

//     let response: OuraHeartRateResponse = res.json().await.map_err(|e| e.to_string())?;
//     Ok(response.data)
// }

// pub async fn fetch_oura_vo2_data(start: &str, end: &str) -> Result<Vec<VO2Data>, String> {
//     let token = env::var("OURA_TOKEN").map_err(|_| "Missing OURA_TOKEN".to_string())?;
//     let base_url = env::var("OURA_API_URL").map_err(|_| "Missing OURA_API_URL".to_string())?;
//     let base_url = base_url.trim_end_matches('/').to_string();
//     let url = format!(
//         "{}/usercollection/vO2_max?start_date={}&end_date={}",
//         base_url, start, end
//     );

//     let res = Client::new()
//         .get(&url)
//         .bearer_auth(token)
//         .send()
//         .await
//         .map_err(|e| e.to_string())?;

//     if !res.status().is_success() {
//         return Err(format!("Oura API error: {}", res.status()));
//     }

//     #[derive(Deserialize)]
//     struct VO2Response {
//         data: Vec<VO2Data>,
//     }

//     let response: VO2Response = res.json().await.map_err(|e| e.to_string())?;
//     Ok(response.data)
// }

// pub async fn fetch_oura_stress_data(start: &str, end: &str) -> Result<Vec<StressData>, String> {
//     let token = env::var("OURA_TOKEN").map_err(|_| "Missing OURA_TOKEN".to_string())?;
//     let base_url = env::var("OURA_API_URL").map_err(|_| "Missing OURA_API_URL".to_string())?;
//     let base_url = base_url.trim_end_matches('/').to_string();
//     let url = format!(
//         "{}/usercollection/daily_stress?start_date={}&end_date={}",
//         base_url, start, end
//     );

//     let res = Client::new()
//         .get(&url)
//         .bearer_auth(token)
//         .send()
//         .await
//         .map_err(|e| e.to_string())?;

//     if !res.status().is_success() {
//         let status = res.status();
//         let err_text = res
//             .text()
//             .await
//             .unwrap_or_else(|_| "Failed to read error body".to_string());
//         return Err(format!("Oura API error: {} - {}", status, err_text));
//     }

//     #[derive(Deserialize)]
//     struct StressResponse {
//         data: Vec<StressData>,
//     }

//     let response: StressResponse = res.json().await.map_err(|e| e.to_string())?;
//     Ok(response.data)
// }

// pub async fn write_heart_rate_to_file(data: &[HeartRateData]) -> Result<(), String> {
//     let path = Path::new("vitals/heartrate.json");
//     let json = serde_json::to_string_pretty(data).map_err(|e| format!("Serialize error: {}", e))?;
//     fs::create_dir_all("vitals")
//         .await
//         .map_err(|e| format!("mkdir error: {}", e))?;
//     fs::write(path, json)
//         .await
//         .map_err(|e| format!("Write error: {}", e))?;
//     Ok(())
// }

// pub async fn write_vo2_to_file(data: &[VO2Data]) -> Result<(), String> {
//     let path = Path::new("vitals/vo2.json");
//     let json = serde_json::to_string_pretty(data).map_err(|e| format!("Serialize error: {}", e))?;
//     fs::create_dir_all("vitals")
//         .await
//         .map_err(|e| format!("mkdir error: {}", e))?;
//     fs::write(path, json)
//         .await
//         .map_err(|e| format!("Write error: {}", e))?;
//     Ok(())
// }

// pub async fn write_stress_to_file(data: &[StressData]) -> Result<(), String> {
//     let path = Path::new("vitals/stress.json");

//     // Load existing data if file exists
//     let mut existing_data: Vec<StressData> = if path.exists() {
//         let content = fs::read_to_string(path)
//             .await
//             .map_err(|e| format!("Failed to read file: {}", e))?;
//         serde_json::from_str(&content).unwrap_or_default()
//     } else {
//         Vec::new()
//     };

//     // Index by day
//     let mut map: HashMap<String, StressData> = existing_data
//         .into_iter()
//         .map(|entry| (entry.day.clone(), entry))
//         .collect();

//     // Insert/overwrite with new data
//     for entry in data {
//         map.insert(entry.day.clone(), entry.clone());
//     }

//     // Save merged results
//     let merged: Vec<StressData> = map.into_values().collect();
//     let json = serde_json::to_string_pretty(&merged)
//         .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

//     fs::create_dir_all("vitals")
//         .await
//         .map_err(|e| format!("Failed to create vitals directory: {}", e))?;
//     fs::write(path, json)
//         .await
//         .map_err(|e| format!("Failed to write file: {}", e))?;

//     Ok(())
// }

pub async fn handle_oura_heartrate_sync(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let today = chrono::Utc::now().date_naive();
    let default_start = (today - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    let default_end = today.format("%Y-%m-%d").to_string();

    let start_date = params
        .get("start")
        .map(|s| s.as_str())
        .unwrap_or(&default_start);
    let end_date = params
        .get("end")
        .map(|s| s.as_str())
        .unwrap_or(&default_end);

    // Try to get OAuth access token, fallback to personal token
    let access_token = match get_valid_oura_access_token(&state.mongo_client, "default_user").await
    {
        Ok(Some(token)) => {
            println!("💓 Heart Rate Sync - Using OAuth token: {}", &token[..10]);
            token
        }
        Ok(None) => {
            let personal_token = env::var("OURA_TOKEN").unwrap_or_else(|_| "missing".to_string());
            println!(
                "💓 Heart Rate Sync - Using personal token: {}",
                &personal_token[..10]
            );
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

    match get_oura_heartrate_data_from_api(start_date, end_date, &access_token).await {
        Ok(heartrate_data) => {
            println!(
                "💓 Heart Rate Sync - Retrieved {} data points",
                heartrate_data.len()
            );
            Json(serde_json::json!({
                "status": "success",
                "message": format!("Retrieved {} heart rate data points", heartrate_data.len()),
                "data": heartrate_data
            }))
            .into_response()
        }
        Err(err) => {
            println!("💓 Heart Rate Sync - Error: {}", err);
            (StatusCode::BAD_GATEWAY, err).into_response()
        }
    }
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
