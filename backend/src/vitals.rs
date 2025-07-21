use crate::AppState;
use crate::services::oura::{
    DailyActivityData, DailyCardiovascularAgeData, DailyReadinessData, DailyResilienceData,
    DailySleepData, DailySpO2Data, DailyStressData, VO2MaxData,
};
use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::Duration as ChronoDuration;
use futures::stream::TryStreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyVitals {
    pub day: String,
    pub activity: Option<DailyActivityData>,
    pub sleep: Option<DailySleepData>,
    pub readiness: Option<DailyReadinessData>,
    pub resilience: Option<DailyResilienceData>,
    pub stress: Option<DailyStressData>,
    pub spo2: Option<DailySpO2Data>,
    pub cardiovascular_age: Option<DailyCardiovascularAgeData>,
    pub vo2_max: Option<VO2MaxData>,
}

#[derive(Deserialize)]
pub struct TimestampRangeQuery {
    start: i64, // Unix timestamp (seconds)
    end: i64,   // Unix timestamp (seconds)
}

/// Aggregates all daily Oura data for the given timestamp range and returns Vec<DailyVitals>
pub async fn get_daily_vitals(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TimestampRangeQuery>,
) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let start_dt = match chrono::DateTime::<chrono::Utc>::from_timestamp(query.start, 0) {
        Some(dt) => dt,
        None => return (StatusCode::BAD_REQUEST, "Invalid start timestamp").into_response(),
    };
    let end_dt = match chrono::DateTime::<chrono::Utc>::from_timestamp(query.end, 0) {
        Some(dt) => dt,
        None => return (StatusCode::BAD_REQUEST, "Invalid end timestamp").into_response(),
    };
    let start = start_dt.date_naive();
    let end = end_dt.date_naive();
    if end < start {
        return (StatusCode::BAD_REQUEST, "end must be after start").into_response();
    }
    // Helper to build a date filter
    let date_range: Vec<String> = (0..=(end - start).num_days())
        .map(|i| {
            (start + ChronoDuration::days(i))
                .format("%Y-%m-%d")
                .to_string()
        })
        .collect();
    // Fetch all data types in parallel
    let (activity, sleep, readiness, resilience, stress, spo2, cardiovascular_age, vo2_max) = tokio::join!(
        fetch_map::<DailyActivityData>(&db, "oura_daily_activity", "day", &date_range),
        fetch_map::<DailySleepData>(&db, "oura_daily_sleep", "day", &date_range),
        fetch_map::<DailyReadinessData>(&db, "oura_daily_readiness", "day", &date_range),
        fetch_map::<DailyResilienceData>(&db, "oura_daily_resilience", "day", &date_range),
        fetch_map::<DailyStressData>(&db, "oura_daily_stress", "day", &date_range),
        fetch_map::<DailySpO2Data>(&db, "oura_daily_spo2", "day", &date_range),
        fetch_map::<DailyCardiovascularAgeData>(
            &db,
            "oura_daily_cardiovascular_age",
            "day",
            &date_range
        ),
        fetch_map::<VO2MaxData>(&db, "oura_vo2_max", "day", &date_range),
    );
    // Build DailyVitals for each day in range
    let mut results = Vec::new();
    for day in &date_range {
        results.push(DailyVitals {
            day: day.clone(),
            activity: activity.as_ref().ok().and_then(|m| m.get(day).cloned()),
            sleep: sleep.as_ref().ok().and_then(|m| m.get(day).cloned()),
            readiness: readiness.as_ref().ok().and_then(|m| m.get(day).cloned()),
            resilience: resilience.as_ref().ok().and_then(|m| m.get(day).cloned()),
            stress: stress.as_ref().ok().and_then(|m| m.get(day).cloned()),
            spo2: spo2.as_ref().ok().and_then(|m| m.get(day).cloned()),
            cardiovascular_age: cardiovascular_age
                .as_ref()
                .ok()
                .and_then(|m| m.get(day).cloned()),
            vo2_max: vo2_max.as_ref().ok().and_then(|m| m.get(day).cloned()),
        });
    }
    Json(results).into_response()
}

/// Helper to fetch a map of day -> data from a MongoDB collection
async fn fetch_map<T: for<'de> Deserialize<'de> + Unpin + Send + Sync + Clone + 'static>(
    db: &mongodb::Database,
    collection_name: &str,
    day_field: &str,
    days: &[String],
) -> Result<HashMap<String, T>, String> {
    let collection = db.collection::<T>(collection_name);
    let filter = mongodb::bson::doc! { day_field: { "$in": days } };
    let mut cursor = collection
        .find(filter, None)
        .await
        .map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    while let Some(item) = cursor.try_next().await.map_err(|e| e.to_string())? {
        let day = if let Some(day) = get_day_field(&item) {
            day
        } else {
            continue;
        };
        map.insert(day, item);
    }
    Ok(map)
}

/// Helper to extract the day field from each data type
fn get_day_field<T: ?Sized>(_item: &T) -> Option<String> {
    // Use downcasting to get the day field for each known type
    // This is a workaround for Rust's lack of reflection
    None // Will be replaced below with per-type impls
}

// Per-type implementations for get_day_field
impl DailyActivityData {
    pub fn get_day(&self) -> Option<String> {
        Some(self.day.clone())
    }
}
impl DailySleepData {
    pub fn get_day(&self) -> Option<String> {
        Some(self.day.clone())
    }
}
impl DailyReadinessData {
    pub fn get_day(&self) -> Option<String> {
        Some(self.day.clone())
    }
}
impl DailyResilienceData {
    pub fn get_day(&self) -> Option<String> {
        Some(self.day.clone())
    }
}
impl DailyStressData {
    pub fn get_day(&self) -> Option<String> {
        Some(self.day.clone())
    }
}
impl DailySpO2Data {
    pub fn get_day(&self) -> Option<String> {
        Some(self.day.clone())
    }
}
impl DailyCardiovascularAgeData {
    pub fn get_day(&self) -> Option<String> {
        Some(self.day.clone())
    }
}
impl VO2MaxData {
    pub fn get_day(&self) -> Option<String> {
        Some(self.day.clone())
    }
}
