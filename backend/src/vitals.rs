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

// #[derive(Debug, Serialize, Deserialize, Clone)]
// pub struct DailyVitals {
//     pub day: String,
//     pub activity: Option<DailyActivityData>,
//     pub sleep: Option<DailySleepData>,
//     pub readiness: Option<DailyReadinessData>,
//     pub resilience: Option<DailyResilienceData>,
//     pub stress: Option<DailyStressData>,
//     pub spo2: Option<DailySpO2Data>,
//     pub cardiovascular_age: Option<DailyCardiovascularAgeData>,
//     pub vo2_max: Option<VO2MaxData>,
// }

#[derive(Deserialize)]
pub struct DateQuery {
    date: String, // Format: "YYYY-MM-DD"
}

/// Typed version: fetch readiness docs for a single date and deserialize into DailyReadinessData
pub async fn get_daily_readiness(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DateQuery>,
) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let filter = mongodb::bson::doc! { "day": &query.date };
    println!("[get_readiness] Querying readiness with: {:?}", filter);

    let collection = db.collection::<DailyReadinessData>("oura_daily_readiness");
    let cursor = match collection.find(filter, None).await {
        Ok(cursor) => cursor,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Mongo error: {}", e),
            )
                .into_response();
        }
    };

    let docs: Vec<_> = match cursor.try_collect().await {
        Ok(docs) => docs,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Cursor error: {}", e),
            )
                .into_response();
        }
    };

    println!("[get_daily_readiness] Found {} documents", docs.len());
    Json(docs).into_response()
}

/// Typed version: fetch activity docs for a single date and deserialize into DailyActivityData
pub async fn get_daily_activity(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DateQuery>,
) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let filter = mongodb::bson::doc! { "day": &query.date };
    println!("[get_daily_activity] Querying activity with: {:?}", filter);

    let collection = db.collection::<DailyActivityData>("oura_daily_activity");
    let cursor = match collection.find(filter, None).await {
        Ok(cursor) => cursor,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Mongo error: {}", e),
            )
                .into_response();
        }
    };

    let docs: Vec<_> = match cursor.try_collect().await {
        Ok(docs) => docs,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Cursor error: {}", e),
            )
                .into_response();
        }
    };

    println!("[get_daily_activity] Found {} documents", docs.len());
    Json(docs).into_response()
}

/// Typed version: fetch cardiovascular age docs for a single date and deserialize into DailyCardiovascularAgeData
pub async fn get_daily_cardiovascular_age(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DateQuery>,
) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let filter = mongodb::bson::doc! { "day": &query.date };
    println!(
        "[get_daily_cardiovascular_age] Querying cardiovascular age with: {:?}",
        filter
    );

    let collection = db.collection::<DailyCardiovascularAgeData>("oura_daily_cardiovascular_age");
    let cursor = match collection.find(filter, None).await {
        Ok(cursor) => cursor,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Mongo error: {}", e),
            )
                .into_response();
        }
    };

    let docs: Vec<_> = match cursor.try_collect().await {
        Ok(docs) => docs,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Cursor error: {}", e),
            )
                .into_response();
        }
    };

    println!(
        "[get_daily_cardiovascular_age] Found {} documents",
        docs.len()
    );
    Json(docs).into_response()
}

/// Typed version: fetch resilience docs for a single date and deserialize into DailyResilienceData
pub async fn get_daily_resilience(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DateQuery>,
) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let filter = mongodb::bson::doc! { "day": &query.date };
    println!(
        "[get_daily_resilience] Querying resilience with: {:?}",
        filter
    );

    let collection = db.collection::<DailyResilienceData>("oura_daily_resilience");
    let cursor = match collection.find(filter, None).await {
        Ok(cursor) => cursor,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Mongo error: {}", e),
            )
                .into_response();
        }
    };

    let docs: Vec<_> = match cursor.try_collect().await {
        Ok(docs) => docs,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Cursor error: {}", e),
            )
                .into_response();
        }
    };

    println!("[get_daily_resilience] Found {} documents", docs.len());
    Json(docs).into_response()
}

/// Typed version: fetch SpO2 docs for a single date and deserialize into DailySpO2Data
pub async fn get_daily_spo2(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DateQuery>,
) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let filter = mongodb::bson::doc! { "day": &query.date };
    println!("[get_daily_spo2] Querying SpO2 with: {:?}", filter);

    let collection = db.collection::<DailySpO2Data>("oura_daily_spo2");
    let cursor = match collection.find(filter, None).await {
        Ok(cursor) => cursor,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Mongo error: {}", e),
            )
                .into_response();
        }
    };

    let docs: Vec<_> = match cursor.try_collect().await {
        Ok(docs) => docs,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Cursor error: {}", e),
            )
                .into_response();
        }
    };

    println!("[get_daily_spo2] Found {} documents", docs.len());
    Json(docs).into_response()
}

/// Typed version: fetch stress docs for a single date and deserialize into DailyStressData
pub async fn get_daily_stress(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DateQuery>,
) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let filter = mongodb::bson::doc! { "day": &query.date };
    println!("[get_daily_stress] Querying stress with: {:?}", filter);

    let collection = db.collection::<DailyStressData>("oura_daily_stress");
    let cursor = match collection.find(filter, None).await {
        Ok(cursor) => cursor,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Mongo error: {}", e),
            )
                .into_response();
        }
    };

    let docs: Vec<_> = match cursor.try_collect().await {
        Ok(docs) => docs,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Cursor error: {}", e),
            )
                .into_response();
        }
    };

    println!("[get_daily_stress] Found {} documents", docs.len());
    Json(docs).into_response()
}

/// Typed version: fetch VO2 max docs for a single date and deserialize into VO2MaxData
pub async fn get_vo2_max(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DateQuery>,
) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let filter = mongodb::bson::doc! { "day": &query.date };
    println!("[get_vo2_max] Querying VO2 max with: {:?}", filter);

    let collection = db.collection::<VO2MaxData>("oura_vo2_max");
    let cursor = match collection.find(filter, None).await {
        Ok(cursor) => cursor,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Mongo error: {}", e),
            )
                .into_response();
        }
    };

    let docs: Vec<_> = match cursor.try_collect().await {
        Ok(docs) => docs,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Cursor error: {}", e),
            )
                .into_response();
        }
    };

    println!("[get_vo2_max] Found {} documents", docs.len());
    Json(docs).into_response()
}
