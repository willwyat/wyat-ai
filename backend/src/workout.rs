use crate::journal::AppState;
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use mongodb::bson::{self, Bson, doc, oid::ObjectId};
use mongodb::{Collection, Database, IndexModel};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use std::collections::HashMap;
use futures::stream::TryStreamExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WeightUnit {
    Kg,
    Lb,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LoadBasis {
    PerSide,
    Total,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Muscle {
    Chest,
    Back,
    Shoulders,
    Biceps,
    Triceps,
    Forearms,
    Glutes,
    Quads,
    Hamstrings,
    Calves,
    Abdominals,
    SpinalErectors,
    Obliques,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Region {
    UpperBody,
    LowerBody,
    Core,
}

impl Muscle {
    pub fn region(&self) -> Region {
        match self {
            // Upper body
            Muscle::Chest
            | Muscle::Back
            | Muscle::Shoulders
            | Muscle::Biceps
            | Muscle::Triceps
            | Muscle::Forearms => Region::UpperBody,

            // Lower body
            Muscle::Glutes | Muscle::Quads | Muscle::Hamstrings | Muscle::Calves => {
                Region::LowerBody
            }

            // Core
            Muscle::Abdominals | Muscle::SpinalErectors | Muscle::Obliques => Region::Core,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExerciseEntry {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub exercise_id: Option<ObjectId>,
    pub exercise_label: String,
    pub date_unix: i64,
    pub intensity: Option<u8>, // 1-5
    pub notes: Option<String>,

    // Timezone where the exercise was logged (IANA timezone, e.g., "America/New_York")
    // If None, assume UTC for backward compatibility
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tz: Option<String>,

    // For gym exercises
    pub sets: Option<u16>,
    pub reps: Option<u16>,
    pub weight_value: Option<f32>,
    pub weight_unit: Option<WeightUnit>,
    pub load_basis: Option<LoadBasis>,

    // For running or cycling exercises
    pub time_seconds: Option<u32>,
    pub distance_meters: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExerciseType {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub name: String,
    #[serde(default)]
    pub aliases: Option<Vec<String>>,
    #[serde(default)]
    pub primary_muscles: Vec<Muscle>,
    #[serde(default)]
    pub guidance: Option<Vec<String>>,
    pub default_load_basis: Option<LoadBasis>,
}

// Input types for creating/updating
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExerciseTypeInput {
    pub name: String,
    #[serde(default)]
    pub aliases: Option<Vec<String>>,
    #[serde(default)]
    pub primary_muscles: Vec<Muscle>,
    #[serde(default)]
    pub guidance: Option<Vec<String>>,
    pub default_load_basis: Option<LoadBasis>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExerciseTypePatch {
    pub name: Option<String>,
    pub aliases: Option<Vec<String>>,
    pub primary_muscles: Option<Vec<Muscle>>,
    pub guidance: Option<Vec<String>>,
    pub default_load_basis: Option<LoadBasis>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExerciseEntryInput {
    pub exercise_id: ObjectId,
    pub date_unix: i64,
    pub intensity: Option<u8>,
    pub notes: Option<String>,
    // Timezone where the exercise was logged (IANA timezone, e.g., "America/New_York")
    // Defaults to "UTC" if not provided
    #[serde(default)]
    pub tz: Option<String>,
    pub sets: Option<u16>,
    pub reps: Option<u16>,
    pub weight_value: Option<f32>,
    pub weight_unit: Option<WeightUnit>,
    pub load_basis: Option<LoadBasis>,
    pub time_seconds: Option<u32>,
    pub distance_meters: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExerciseEntryPatch {
    pub exercise_id: Option<ObjectId>,
    pub date_unix: Option<i64>,
    pub intensity: Option<u8>,
    pub notes: Option<String>,
    pub tz: Option<String>,
    pub sets: Option<u16>,
    pub reps: Option<u16>,
    pub weight_value: Option<f32>,
    pub weight_unit: Option<WeightUnit>,
    pub load_basis: Option<LoadBasis>,
    pub time_seconds: Option<u32>,
    pub distance_meters: Option<u32>,
}

// Error types
#[derive(Debug, thiserror::Error)]
pub enum WorkoutError {
    #[error("Validation error: {0}")]
    Validation(String),
    #[error("Exercise type not found")]
    ExerciseTypeNotFound,
    #[error("Database error: {0}")]
    Database(#[from] mongodb::error::Error),
}

// MongoDB collection helpers
pub fn exercise_types(db: &Database) -> Collection<ExerciseType> {
    db.collection("exercise_types")
}

pub fn exercise_entries(db: &Database) -> Collection<ExerciseEntry> {
    db.collection("exercise_entries")
}

use mongodb::options::{Collation, CollationStrength, IndexOptions};

// Initialize indexes
pub async fn init_indexes(db: &Database) -> Result<(), WorkoutError> {
    let exercise_types_collection = exercise_types(db);
    let exercise_entries_collection = exercise_entries(db);

    // Unique index on ExerciseType.name (case-insensitive)
    let name_index = IndexModel::builder()
        .keys(doc! { "name": 1 })
        .options(
            IndexOptions::builder()
                .unique(true)
                .collation(Some(
                    Collation::builder()
                        .locale("en".to_string())
                        .strength(CollationStrength::Secondary) // case-insensitive
                        .build(),
                ))
                .build(),
        )
        .build();

    exercise_types_collection
        .create_index(name_index, None)
        .await?;

    // Normal index on ExerciseEntry.exercise_id + date_unix
    let entry_index = IndexModel::builder()
        .keys(doc! { "exercise_id": 1, "date_unix": 1 })
        .build();

    exercise_entries_collection
        .create_index(entry_index, None)
        .await?;

    Ok(())
}

// Validation helpers
fn validate_date_unix(date_unix: i64) -> Result<(), WorkoutError> {
    // Check if it's a 10-digit timestamp
    if date_unix < 946684800 || date_unix > 9999999999 {
        return Err(WorkoutError::Validation(
            "date_unix must be a 10-digit UTC seconds timestamp".to_string(),
        ));
    }

    // Check if it's within [2000-01-01, now+24h]
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let min_date = 946684800; // 2000-01-01
    let max_date = now + 86400; // now + 24h

    if date_unix < min_date || date_unix > max_date {
        return Err(WorkoutError::Validation(format!(
            "date_unix must be between 2000-01-01 and {} (now+24h)",
            max_date
        )));
    }

    Ok(())
}

fn validate_intensity(intensity: u8) -> Result<(), WorkoutError> {
    if intensity < 1 || intensity > 5 {
        return Err(WorkoutError::Validation(
            "intensity must be between 1 and 5".to_string(),
        ));
    }
    Ok(())
}

fn validate_weight_data(
    weight_value: Option<f32>,
    weight_unit: Option<WeightUnit>,
) -> Result<(), WorkoutError> {
    if weight_value.is_some() && weight_unit.is_none() {
        return Err(WorkoutError::Validation(
            "weight_unit must be provided when weight_value is present".to_string(),
        ));
    }
    Ok(())
}

fn validate_exercise_entry_data(input: &ExerciseEntryInput) -> Result<(), WorkoutError> {
    validate_date_unix(input.date_unix)?;

    if let Some(intensity) = input.intensity {
        validate_intensity(intensity)?;
    }

    validate_weight_data(input.weight_value, input.weight_unit)?;

    // Ensure at least some exercise data is provided
    let has_gym_data = input.sets.is_some() || input.reps.is_some() || input.weight_value.is_some();
    let has_cardio_data = input.time_seconds.is_some() || input.distance_meters.is_some();

    if !has_gym_data && !has_cardio_data {
        return Err(WorkoutError::Validation(
            "Exercise entry must have either gym data (sets/reps/weight) or cardio data (time/distance)".to_string()
        ));
    }

    Ok(())
}

pub fn muscle_for_region(region: Region) -> &'static [Muscle] {
    match region {
        Region::UpperBody => &[
            Muscle::Chest,
            Muscle::Back,
            Muscle::Shoulders,
            Muscle::Biceps,
            Muscle::Triceps,
            Muscle::Forearms,
        ],
        Region::LowerBody => &[
            Muscle::Glutes,
            Muscle::Quads,
            Muscle::Hamstrings,
            Muscle::Calves,
        ],
        Region::Core => &[Muscle::Abdominals, Muscle::SpinalErectors, Muscle::Obliques],
    }
}

pub fn muscle_for_alias(term: &str) -> Option<&'static [Muscle]> {
    match term.to_lowercase().as_str() {
        "arms" => Some(&[Muscle::Biceps, Muscle::Triceps, Muscle::Forearms]),
        "legs" => Some(&[
            Muscle::Glutes,
            Muscle::Quads,
            Muscle::Hamstrings,
            Muscle::Calves,
        ]),
        "core" => Some(&[Muscle::Abdominals, Muscle::Obliques, Muscle::SpinalErectors]),
        "upper body" | "upperbody" => Some(muscle_for_region(Region::UpperBody)),
        "lower body" | "lowerbody" => Some(muscle_for_region(Region::LowerBody)),
        _ => None,
    }
}

pub async fn find_exercise_type_by_muscle(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(muscles): Json<Vec<String>>,
) -> impl IntoResponse {
    // API key check
    let expected_key = std::env::var("WYAT_API_KEY").unwrap_or_default();
    let provided_key = headers.get("x-wyat-api-key").and_then(|v| v.to_str().ok());

    if provided_key != Some(expected_key.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            "Unauthorized: missing or invalid API key",
        ).into_response();
    }

    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<ExerciseType>("exercise_types");

    let filter = doc! {
        "primary_muscles": {
            "$in": muscles
        }
    };

    match collection.find(filter, None).await {
        Ok(mut cursor) => {
            let mut results = Vec::new();
            while let Some(doc) = cursor.try_next().await.unwrap_or(None) {
                results.push(doc);
            }
            (StatusCode::OK, Json(results)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
        .into_response(),
    }
}


pub async fn recent_muscle_counts(
    db: &Database,
    since_unix: i64,
) -> Result<HashMap<Muscle, u32>, WorkoutError> {
    // 1) fetch entries since `since_unix`
    // 2) join to ExerciseType to read primary_muscles
    // 3) count hits per Muscle
    // keep this as a TODO if you’re not ready to join yet
    Ok(HashMap::new())
}

// ExerciseType service functions

pub async fn create_exercise_type(
    db: &Database,
    new_type: ExerciseTypeInput,
) -> Result<ExerciseType, WorkoutError> {
    // Validate name is non-empty
    if new_type.name.trim().is_empty() {
        return Err(WorkoutError::Validation(
            "Exercise type name cannot be empty".to_string(),
        ));
    }
    let exercise_type = ExerciseType {
        id: None,
        name: new_type.name.trim().to_string(),
        aliases: new_type.aliases,
        primary_muscles: new_type.primary_muscles,
        guidance: new_type.guidance,
        default_load_basis: new_type.default_load_basis,
    };
    let collection = exercise_types(db);
    let result = collection.insert_one(&exercise_type, None).await?;
    let mut created_type = exercise_type;
    created_type.id = Some(result.inserted_id.as_object_id().unwrap());
    Ok(created_type)
}

pub async fn update_exercise_type(
    db: &Database,
    id: ObjectId,
    patch: ExerciseTypePatch,
) -> Result<ExerciseType, WorkoutError> {
    let collection = exercise_types(db);
    // Build update document
    let mut update_doc = doc! {};
    if let Some(name) = patch.name {
        if name.trim().is_empty() {
            return Err(WorkoutError::Validation(
                "Exercise type name cannot be empty".to_string(),
            ));
        }
        update_doc.insert("name", name.trim());
    }
    if let Some(aliases) = patch.aliases {
        let arr = aliases.into_iter().map(Bson::from).collect::<Vec<Bson>>();
        update_doc.insert("aliases", Bson::Array(arr));
    }
    if let Some(primary_muscles) = patch.primary_muscles {
        let arr: Vec<Bson> = primary_muscles
            .into_iter()
            .map(|m| bson::to_bson(&m).expect("to_bson(Muscle)"))
            .collect();
        update_doc.insert("primary_muscles", Bson::Array(arr));
    }

    if let Some(guidance) = patch.guidance {
        let arr = guidance.into_iter().map(Bson::from).collect::<Vec<Bson>>();
        update_doc.insert("guidance", Bson::Array(arr));
    }

    if let Some(default_load_basis) = patch.default_load_basis {
        update_doc.insert(
            "default_load_basis",
            bson::to_bson(&default_load_basis).expect("to_bson(LoadBasis)"),
        );
    }

    if update_doc.is_empty() {
        return Err(WorkoutError::Validation("No fields to update".to_string()));
    }

    let result = collection
        .find_one_and_update(
            doc! { "_id": id },
            doc! { "$set": update_doc },
            mongodb::options::FindOneAndUpdateOptions::builder()
                .return_document(mongodb::options::ReturnDocument::After)
                .build(),
        )
        .await?;

    result.ok_or(WorkoutError::ExerciseTypeNotFound)
}

// ExerciseEntry service functions
pub async fn create_exercise_entry(
    db: &Database,
    input: ExerciseEntryInput,
) -> Result<ExerciseEntry, WorkoutError> {
    validate_exercise_entry_data(&input)?;

    // Verify exercise_id exists and get the exercise type
    let exercise_type = get_exercise_type_by_id(db, input.exercise_id).await?;

    // Determine load_basis
    let load_basis = if let Some(provided_load_basis) = input.load_basis {
        Some(provided_load_basis)
    } else {
        exercise_type.default_load_basis
    };

    let exercise_entry = ExerciseEntry {
        id: None,
        exercise_id: Some(input.exercise_id),
        exercise_label: exercise_type.name.clone(),
        date_unix: input.date_unix,
        intensity: input.intensity,
        notes: input.notes,
        tz: input.tz.or(Some("UTC".to_string())), // Default to UTC if not provided
        sets: input.sets,
        reps: input.reps,
        weight_value: input.weight_value,
        weight_unit: input.weight_unit,
        load_basis,
        time_seconds: input.time_seconds,
        distance_meters: input.distance_meters,
    };

    let collection = exercise_entries(db);
    let result = collection.insert_one(&exercise_entry, None).await?;

    let mut created_entry = exercise_entry;
    created_entry.id = Some(result.inserted_id.as_object_id().unwrap());

    Ok(created_entry)
}

pub async fn update_exercise_entry(
    db: &Database,
    id: ObjectId,
    patch: ExerciseEntryPatch,
) -> Result<ExerciseEntry, WorkoutError> {
    let collection = exercise_entries(db);

    // Get current entry
    let current_entry =
        collection
            .find_one(doc! { "_id": id }, None)
            .await?
            .ok_or(WorkoutError::Validation(
                "Exercise entry not found".to_string(),
            ))?;

    // Validate date if provided
    if let Some(date_unix) = patch.date_unix {
        validate_date_unix(date_unix)?;
    }

    // Validate intensity if provided
    if let Some(intensity) = patch.intensity {
        validate_intensity(intensity)?;
    }

    // Validate weight data if provided
    let weight_value = patch.weight_value.or(current_entry.weight_value);
    let weight_unit = patch.weight_unit.or(current_entry.weight_unit);
    validate_weight_data(weight_value, weight_unit)?;

    // 1) Decide id and label once
    let (new_exercise_id, new_exercise_label, id_changed) =
        if let Some(exercise_id) = patch.exercise_id {
            let exercise_type = get_exercise_type_by_id(db, exercise_id).await?;
            (Some(exercise_id), Some(exercise_type.name), true)
        } else {
            (current_entry.exercise_id, None, false)
        };

    // 2) Derive load_basis from patch or the (possibly new) type default
    let load_basis_opt = if let Some(provided) = patch.load_basis {
        Some(provided)
    } else if let Some(ex_id) = new_exercise_id {
        let ex_type = get_exercise_type_by_id(db, ex_id).await?;
        ex_type.default_load_basis
    } else {
        current_entry.load_basis
    };

    // 3) Build $set: only set label if id_changed
    let mut update_doc = doc! {};
    if id_changed {
        update_doc.insert("exercise_id", new_exercise_id.unwrap());
        update_doc.insert("exercise_label", new_exercise_label.unwrap());
    }

    if let Some(date_unix) = patch.date_unix {
        update_doc.insert("date_unix", date_unix);
    }

    if let Some(intensity) = patch.intensity {
        update_doc.insert("intensity", intensity as i32);
    }

    if let Some(notes) = patch.notes {
        update_doc.insert("notes", notes);
    }

    if let Some(tz) = patch.tz {
        update_doc.insert("tz", tz);
    }

    if let Some(sets) = patch.sets {
        update_doc.insert("sets", sets as i32);
    }

    if let Some(reps) = patch.reps {
        update_doc.insert("reps", reps as i32);
    }

    if let Some(weight_value) = patch.weight_value {
        update_doc.insert("weight_value", weight_value);
    }

    if let Some(weight_unit) = patch.weight_unit {
        update_doc.insert(
            "weight_unit",
            bson::to_bson(&weight_unit).expect("to_bson(WeightUnit)"),
        );
    }

    if let Some(lb) = load_basis_opt {
        update_doc.insert(
            "load_basis",
            bson::to_bson(&lb).expect("to_bson(LoadBasis)"),
        );
    }

    if let Some(time_seconds) = patch.time_seconds {
        update_doc.insert("time_seconds", time_seconds);
    }

    if let Some(distance_meters) = patch.distance_meters {
        update_doc.insert("distance_meters", distance_meters);
    }

    if update_doc.is_empty() {
        return Err(WorkoutError::Validation("No fields to update".to_string()));
    }

    let result = collection
        .find_one_and_update(
            doc! { "_id": id },
            doc! { "$set": update_doc },
            mongodb::options::FindOneAndUpdateOptions::builder()
                .return_document(mongodb::options::ReturnDocument::After)
                .build(),
        )
        .await?;

    result.ok_or(WorkoutError::Validation(
        "Exercise entry not found".to_string(),
    ))
}

// Helper function to get exercise type by ID
async fn get_exercise_type_by_id(
    db: &Database,
    id: ObjectId,
) -> Result<ExerciseType, WorkoutError> {
    let collection = exercise_types(db);
    collection
        .find_one(doc! { "_id": id }, None)
        .await?
        .ok_or(WorkoutError::ExerciseTypeNotFound)
}

pub async fn create_exercise_type_mongo(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<ExerciseTypeInput>,
) -> impl axum::response::IntoResponse {
    let expected_key = std::env::var("WYAT_API_KEY").unwrap_or_default();
    let provided_key = headers.get("x-wyat-api-key").and_then(|v| v.to_str().ok());

    if provided_key != Some(expected_key.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            "Unauthorized: missing or invalid API key",
        )
            .into_response();
    }

    let db = state.mongo_client.database("wyat");
    let collection: Collection<ExerciseType> = db.collection("exercise_types");

    // Validate name is non-empty
    if payload.name.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Exercise type name cannot be empty" })),
        )
            .into_response();
    }

    let exercise_type = ExerciseType {
        id: None,
        name: payload.name.trim().to_string(),
        aliases: payload.aliases,
        primary_muscles: payload.primary_muscles,
        guidance: payload.guidance,
        default_load_basis: payload.default_load_basis,
    };

    match collection.insert_one(&exercise_type, None).await {
        Ok(result) => {
            let mut created = exercise_type;
            created.id = Some(result.inserted_id.as_object_id().unwrap());
            (StatusCode::CREATED, Json(created)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn update_exercise_type_mongo(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<ExerciseTypePatch>,
) -> impl axum::response::IntoResponse {
    let expected_key = std::env::var("WYAT_API_KEY").unwrap_or_default();
    let provided_key = headers.get("x-wyat-api-key").and_then(|v| v.to_str().ok());

    if provided_key != Some(expected_key.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            "Unauthorized: missing or invalid API key",
        )
            .into_response();
    }

    let db = state.mongo_client.database("wyat");
    let collection: Collection<ExerciseType> = db.collection("exercise_types");

    let object_id = match ObjectId::parse_str(&id) {
        Ok(id) => id,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "Invalid ObjectId" })),
            )
                .into_response();
        }
    };

    // Build update document
    let mut update_doc = doc! {};

    if let Some(name) = payload.name {
        if name.trim().is_empty() {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "Exercise type name cannot be empty" })),
            )
                .into_response();
        }
        update_doc.insert("name", name.trim());
    }

    if let Some(aliases) = payload.aliases {
        let arr = aliases.into_iter().map(Bson::from).collect::<Vec<Bson>>();
        update_doc.insert("aliases", Bson::Array(arr));
    }

    if let Some(primary_muscles) = payload.primary_muscles {
        let arr: Vec<Bson> = primary_muscles
            .into_iter()
            .map(|m| bson::to_bson(&m).expect("to_bson(Muscle)"))
            .collect();
        update_doc.insert("primary_muscles", Bson::Array(arr));
    }

    if let Some(guidance) = payload.guidance {
        let arr = guidance.into_iter().map(Bson::from).collect::<Vec<Bson>>();
        update_doc.insert("guidance", Bson::Array(arr));
    }

    if let Some(default_load_basis) = payload.default_load_basis {
        update_doc.insert(
            "default_load_basis",
            bson::to_bson(&default_load_basis).expect("to_bson(LoadBasis)"),
        );
    }

    if update_doc.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "No fields to update" })),
        )
            .into_response();
    }

    match collection
        .find_one_and_update(
            doc! { "_id": object_id },
            doc! { "$set": update_doc },
            mongodb::options::FindOneAndUpdateOptions::builder()
                .return_document(mongodb::options::ReturnDocument::After)
                .build(),
        )
        .await
    {
        Ok(Some(exercise_type)) => (StatusCode::OK, Json(exercise_type)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Exercise type not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_all_exercise_types_mongo(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    let expected_key = std::env::var("WYAT_API_KEY").unwrap_or_default();
    let provided_key = headers.get("x-wyat-api-key").and_then(|v| v.to_str().ok());

    if provided_key != Some(expected_key.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            "Unauthorized: missing or invalid API key",
        ).into_response();
    }

    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<ExerciseType>("exercise_types");

    match collection.find(None, None).await {
        Ok(mut cursor) => {
            let mut results = Vec::new();
            while let Some(doc) = cursor.try_next().await.unwrap_or(None) {
                results.push(doc);
            }
            (StatusCode::OK, Json(results)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn create_exercise_entry_mongo(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<ExerciseEntryInput>,
) -> impl axum::response::IntoResponse {
    let expected_key = std::env::var("WYAT_API_KEY").unwrap_or_default();
    let provided_key = headers.get("x-wyat-api-key").and_then(|v| v.to_str().ok());

    if provided_key != Some(expected_key.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            "Unauthorized: missing or invalid API key",
        )
            .into_response();
    }

    let db = state.mongo_client.database("wyat");
    let exercise_entries_collection: Collection<ExerciseEntry> = db.collection("exercise_entries");
    let exercise_types_collection: Collection<ExerciseType> = db.collection("exercise_types");

    // Validate date_unix
    if payload.date_unix < 946684800 || payload.date_unix > 9999999999 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "date_unix must be a 10-digit UTC seconds timestamp" })),
        )
            .into_response();
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let min_date = 946684800; // 2000-01-01
    let max_date = now + 86400; // now + 24h

    if payload.date_unix < min_date || payload.date_unix > max_date {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ 
                "error": format!("date_unix must be between 2000-01-01 and {} (now+24h)", max_date)
            })),
        )
            .into_response();
    }

    // Validate intensity if provided
    if let Some(intensity) = payload.intensity {
        if intensity < 1 || intensity > 5 {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "intensity must be between 1 and 5" })),
            )
                .into_response();
        }
    }

    // Validate weight data
    if payload.weight_value.is_some() && payload.weight_unit.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "weight_unit must be provided when weight_value is present" })),
        )
            .into_response();
    }

    // Ensure at least some exercise data is provided
    let has_gym_data = payload.sets.is_some() || payload.reps.is_some() || payload.weight_value.is_some();
    let has_cardio_data = payload.time_seconds.is_some() || payload.distance_meters.is_some();

    if !has_gym_data && !has_cardio_data {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ 
                "error": "Exercise entry must have either gym data (sets/reps/weight) or cardio data (time/distance)" 
            })),
        )
            .into_response();
    }

    // Verify exercise_id exists and get the exercise type
    let exercise_type = match exercise_types_collection
        .find_one(doc! { "_id": payload.exercise_id }, None)
        .await
    {
        Ok(Some(exercise_type)) => exercise_type,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "Exercise type not found" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    // Determine load_basis
    let load_basis = if let Some(provided_load_basis) = payload.load_basis {
        Some(provided_load_basis)
    } else {
        exercise_type.default_load_basis
    };

    let exercise_entry = ExerciseEntry {
        id: None,
        exercise_id: Some(payload.exercise_id),
        exercise_label: exercise_type.name.clone(),
        date_unix: payload.date_unix,
        intensity: payload.intensity,
        notes: payload.notes,
        tz: payload.tz.or(Some("UTC".to_string())), // Default to UTC if not provided
        sets: payload.sets,
        reps: payload.reps,
        weight_value: payload.weight_value,
        weight_unit: payload.weight_unit,
        load_basis,
        time_seconds: payload.time_seconds,
        distance_meters: payload.distance_meters,
    };

    match exercise_entries_collection.insert_one(&exercise_entry, None).await {
        Ok(result) => {
            let mut created_entry = exercise_entry;
            created_entry.id = Some(result.inserted_id.as_object_id().unwrap());
            (StatusCode::CREATED, Json(created_entry)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn update_exercise_entry_mongo(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<ExerciseEntryPatch>,
) -> impl axum::response::IntoResponse {
    let expected_key = std::env::var("WYAT_API_KEY").unwrap_or_default();
    let provided_key = headers.get("x-wyat-api-key").and_then(|v| v.to_str().ok());

    if provided_key != Some(expected_key.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            "Unauthorized: missing or invalid API key",
        )
            .into_response();
    }

    let db = state.mongo_client.database("wyat");
    let exercise_entries_collection: Collection<ExerciseEntry> = db.collection("exercise_entries");
    let exercise_types_collection: Collection<ExerciseType> = db.collection("exercise_types");

    let object_id = match ObjectId::parse_str(&id) {
        Ok(id) => id,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "Invalid ObjectId" })),
            )
                .into_response();
        }
    };

    // Get current entry
    let current_entry = match exercise_entries_collection
        .find_one(doc! { "_id": object_id }, None)
        .await
    {
        Ok(Some(entry)) => entry,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "Exercise entry not found" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    // Validate date if provided
    if let Some(date_unix) = payload.date_unix {
        if date_unix < 946684800 || date_unix > 9999999999 {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "date_unix must be a 10-digit UTC seconds timestamp" })),
            )
                .into_response();
        }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let min_date = 946684800; // 2000-01-01
        let max_date = now + 86400; // now + 24h

        if date_unix < min_date || date_unix > max_date {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ 
                    "error": format!("date_unix must be between 2000-01-01 and {} (now+24h)", max_date)
                })),
            )
                .into_response();
        }
    }

    // Validate intensity if provided
    if let Some(intensity) = payload.intensity {
        if intensity < 1 || intensity > 5 {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "intensity must be between 1 and 5" })),
            )
                .into_response();
        }
    }

    // Validate weight data if provided
    let weight_value = payload.weight_value.or(current_entry.weight_value);
    let weight_unit = payload.weight_unit.or(current_entry.weight_unit);
    if weight_value.is_some() && weight_unit.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "weight_unit must be provided when weight_value is present" })),
        )
            .into_response();
    }

    // Determine new exercise_id and exercise_label
    let (new_exercise_id, new_exercise_label, id_changed) = if let Some(exercise_id) = payload.exercise_id {
        // Exercise ID is changing, verify it exists and get new label
        match exercise_types_collection
            .find_one(doc! { "_id": exercise_id }, None)
            .await
        {
            Ok(Some(exercise_type)) => (Some(exercise_id), Some(exercise_type.name), true),
            Ok(None) => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({ "error": "Exercise type not found" })),
                )
                    .into_response();
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": e.to_string() })),
                )
                    .into_response();
            }
        }
    } else {
        // Exercise ID not changing, keep current values
        (current_entry.exercise_id, None, false)
    };

    // Determine load_basis
    let load_basis_opt = if let Some(provided) = payload.load_basis {
        Some(provided)
    } else if let Some(ex_id) = new_exercise_id {
        // Get default from the exercise type
        match exercise_types_collection
            .find_one(doc! { "_id": ex_id }, None)
            .await
        {
            Ok(Some(exercise_type)) => exercise_type.default_load_basis,
            Ok(None) => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({ "error": "Exercise type not found" })),
                )
                    .into_response();
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": e.to_string() })),
                )
                    .into_response();
            }
        }
    } else {
        current_entry.load_basis
    };

    // Build update document
    let mut update_doc = doc! {};
    if id_changed {
        update_doc.insert("exercise_id", new_exercise_id.unwrap());
        update_doc.insert("exercise_label", new_exercise_label.unwrap());
    }

    if let Some(date_unix) = payload.date_unix {
        update_doc.insert("date_unix", date_unix);
    }

    if let Some(intensity) = payload.intensity {
        update_doc.insert("intensity", intensity as i32);
    }

    if let Some(notes) = payload.notes {
        update_doc.insert("notes", notes);
    }

    if let Some(tz) = payload.tz {
        update_doc.insert("tz", tz);
    }

    if let Some(sets) = payload.sets {
        update_doc.insert("sets", sets as i32);
    }

    if let Some(reps) = payload.reps {
        update_doc.insert("reps", reps as i32);
    }

    if let Some(weight_value) = payload.weight_value {
        update_doc.insert("weight_value", weight_value);
    }

    if let Some(weight_unit) = payload.weight_unit {
        update_doc.insert(
            "weight_unit",
            bson::to_bson(&weight_unit).expect("to_bson(WeightUnit)"),
        );
    }

    if let Some(lb) = load_basis_opt {
        update_doc.insert(
            "load_basis",
            bson::to_bson(&lb).expect("to_bson(LoadBasis)"),
        );
    }

    if let Some(time_seconds) = payload.time_seconds {
        update_doc.insert("time_seconds", time_seconds);
    }

    if let Some(distance_meters) = payload.distance_meters {
        update_doc.insert("distance_meters", distance_meters);
    }

    if update_doc.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "No fields to update" })),
        )
            .into_response();
    }

    match exercise_entries_collection
        .find_one_and_update(
            doc! { "_id": object_id },
            doc! { "$set": update_doc },
            mongodb::options::FindOneAndUpdateOptions::builder()
                .return_document(mongodb::options::ReturnDocument::After)
                .build(),
        )
        .await
    {
        Ok(Some(exercise_entry)) => (StatusCode::OK, Json(exercise_entry)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Exercise entry not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_all_exercise_entries_mongo(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    let expected_key = std::env::var("WYAT_API_KEY").unwrap_or_default();
    let provided_key = headers.get("x-wyat-api-key").and_then(|v| v.to_str().ok());

    if provided_key != Some(expected_key.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            "Unauthorized: missing or invalid API key",
        ).into_response();
    }

    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<ExerciseEntry>("exercise_entries");

    match collection.find(None, None).await {
        Ok(mut cursor) => {
            let mut results = Vec::new();
            while let Some(doc) = cursor.try_next().await.unwrap_or(None) {
                results.push(doc);
            }
            (StatusCode::OK, Json(results)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// Get all exercise entries for a specific day
/// Path parameter: date_unix - Unix timestamp (any time on the target day)
/// Query parameter: tz - Optional IANA timezone (e.g., "America/New_York", "Asia/Hong_Kong")
/// Returns all entries whose timestamps fall within the local day range
/// [local 00:00:00, next local 00:00:00) for the requested timezone (DST-safe).
/// If no tz is provided, uses UTC.
pub async fn get_exercise_entries_by_day(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Path(date_unix): Path<i64>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
) -> impl IntoResponse {
    use chrono::{DateTime, Utc, TimeZone};
    use chrono_tz::Tz;
    
    let expected_key = std::env::var("WYAT_API_KEY").unwrap_or_default();
    let provided_key = headers.get("x-wyat-api-key").and_then(|v| v.to_str().ok());

    if provided_key != Some(expected_key.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            "Unauthorized: missing or invalid API key",
        ).into_response();
    }

    // Validate the timestamp
    if date_unix < 946684800 || date_unix > 9999999999 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "date_unix must be a 10-digit UTC seconds timestamp" })),
        )
            .into_response();
    }

    // Parse timezone (IANA timezone string, e.g., "America/New_York")
    let tz_str = params.get("tz").map(|s| s.as_str()).unwrap_or("UTC");
    
    // Parse the timezone
    let tz: Tz = match tz_str.parse() {
        Ok(tz) => tz,
        Err(_) => {
            eprintln!("❌ Invalid timezone: {}", tz_str);
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ 
                    "error": format!("Invalid timezone: {}. Use IANA timezone names like 'America/New_York' or 'Asia/Hong_Kong'", tz_str)
                })),
            )
                .into_response();
        }
    };

    // Convert Unix timestamp to DateTime<Utc>
    let utc_dt = match DateTime::from_timestamp(date_unix, 0) {
        Some(dt) => dt,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "Invalid timestamp" })),
            )
                .into_response();
        }
    };
    // Convert to the target timezone
    let local_dt = utc_dt.with_timezone(&tz);

    // Determine the local calendar date
    let local_date = local_dt.date_naive();

    // Start of local day (handles DST ambiguous/nonexistent times)
    let local_day_start = tz
        .from_local_datetime(&local_date.and_hms_opt(0, 0, 0).unwrap())
        .earliest()
        .unwrap();

    // Exclusive end: next day's local midnight, then convert to UTC
    let local_day_end = local_day_start + chrono::Duration::days(1);

    // Convert back to UTC for database query (exclusive upper bound)
    let utc_day_start = local_day_start.with_timezone(&Utc).timestamp();
    let utc_day_end = local_day_end.with_timezone(&Utc).timestamp();

    // Debug logging
    eprintln!("🌍 Timezone query debug:");
    eprintln!("  Input timestamp: {} ({})", date_unix, utc_dt.format("%Y-%m-%d %H:%M:%S UTC"));
    eprintln!("  Requested timezone: {}", tz_str);
    eprintln!("  Local date: {}", local_dt.format("%Y-%m-%d %H:%M:%S %Z"));
    eprintln!("  Local day start: {}", local_day_start.format("%Y-%m-%d %H:%M:%S %Z"));
    eprintln!("  Local day end: {}", local_day_end.format("%Y-%m-%d %H:%M:%S %Z"));
    eprintln!("  UTC range: {} to {} ({} to {})",
        utc_day_start,
        utc_day_end,
        DateTime::from_timestamp(utc_day_start, 0).unwrap().format("%Y-%m-%d %H:%M:%S UTC"),
        DateTime::from_timestamp(utc_day_end, 0).unwrap().format("%Y-%m-%d %H:%M:%S UTC")
    );

    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<ExerciseEntry>("exercise_entries");

    // Query for entries within the day range (in UTC)
    let filter = doc! {
        "date_unix": {
            "$gte": utc_day_start,
            "$lt": utc_day_end
        }
    };

    match collection.find(filter, None).await {
        Ok(mut cursor) => {
            let mut results = Vec::new();
            while let Some(doc) = cursor.try_next().await.unwrap_or(None) {
                results.push(doc);
            }
            eprintln!("  Found {} entries", results.len());
            (StatusCode::OK, Json(results)).into_response()
        }
        Err(e) => {
            eprintln!("❌ Database error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}



// Test outline and example test cases
#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::Client;

    async fn setup_test_db() -> Database {
        let client = Client::with_uri_str("mongodb://localhost:27017")
            .await
            .unwrap();
        let db = client.database("test_workout");
        init_indexes(&db).await.unwrap();
        db
    }

    #[tokio::test]
    async fn test_create_entry_with_nonexistent_exercise_id_fails() {
        let db = setup_test_db().await;

        let input = ExerciseEntryInput {
            exercise_id: ObjectId::new(),
            date_unix: 1609459200, // 2021-01-01
            intensity: Some(3),
            notes: None,
            tz: Some("UTC".to_string()),
            sets: Some(3),
            reps: Some(10),
            weight_value: Some(100.0),
            weight_unit: Some(WeightUnit::Lb),
            load_basis: None,
            time_seconds: None,
            distance_meters: None,
        };

        let result = create_exercise_entry(&db, input).await;
        assert!(matches!(result, Err(WorkoutError::ExerciseTypeNotFound)));
    }

    #[tokio::test]
    async fn test_create_entry_without_load_basis_picks_up_type_default() {
        let db = setup_test_db().await;

        // Create exercise type with default load basis
        let exercise_type_input = ExerciseTypeInput {
            name: "Bench Press".to_string(),
            aliases: None,
            primary_muscles: vec![Muscle::Chest],
            guidance: None,
            default_load_basis: Some(LoadBasis::Total),
        };

        let exercise_type = create_exercise_type(&db, exercise_type_input)
            .await
            .unwrap();

        let input = ExerciseEntryInput {
            exercise_id: exercise_type.id.unwrap(),
            date_unix: 1609459200,
            intensity: Some(3),
            notes: None,
            tz: Some("UTC".to_string()),
            sets: Some(3),
            reps: Some(10),
            weight_value: Some(100.0),
            weight_unit: Some(WeightUnit::Lb),
            load_basis: None, // Not provided
            time_seconds: None,
            distance_meters: None,
        };

        let entry = create_exercise_entry(&db, input).await.unwrap();
        assert_eq!(entry.load_basis, Some(LoadBasis::Total));
    }

    #[tokio::test]
    async fn test_changing_exercise_id_updates_exercise_label() {
        let db = setup_test_db().await;

        // Create two exercise types
        let type1 = create_exercise_type(
            &db,
            ExerciseTypeInput {
                name: "Bench Press".to_string(),
                aliases: None,
                primary_muscles: vec![],
                guidance: None,
                default_load_basis: None,
            },
        )
        .await
        .unwrap();

        let type2 = create_exercise_type(
            &db,
            ExerciseTypeInput {
                name: "Squat".to_string(),
                aliases: None,
                primary_muscles: vec![],
                guidance: None,
                default_load_basis: None,
            },
        )
        .await
        .unwrap();

        // Create entry with first type
        let input = ExerciseEntryInput {
            exercise_id: type1.id.unwrap(),
            date_unix: 1609459200,
            intensity: Some(3),
            notes: None,
            tz: Some("UTC".to_string()),
            sets: Some(3),
            reps: Some(10),
            weight_value: Some(100.0),
            weight_unit: Some(WeightUnit::Lb),
            load_basis: None,
            time_seconds: None,
            distance_meters: None,
        };

        let entry = create_exercise_entry(&db, input).await.unwrap();
        assert_eq!(entry.exercise_label, "Bench Press");

        // Update to second type
        let patch = ExerciseEntryPatch {
            exercise_id: Some(type2.id.unwrap()),
            date_unix: None,
            intensity: None,
            notes: None,
            tz: None,
            sets: None,
            reps: None,
            weight_value: None,
            weight_unit: None,
            load_basis: None,
            time_seconds: None,
            distance_meters: None,
        };

        let updated_entry = update_exercise_entry(&db, entry.id.unwrap(), patch)
            .await
            .unwrap();
        assert_eq!(updated_entry.exercise_label, "Squat");
    }

    #[tokio::test]
    async fn test_supplying_weight_value_without_weight_unit_fails() {
        let db = setup_test_db().await;

        let exercise_type = create_exercise_type(
            &db,
            ExerciseTypeInput {
                name: "Bench Press".to_string(),
                aliases: None,
                primary_muscles: vec![],
                guidance: None,
                default_load_basis: None,
            },
        )
        .await
        .unwrap();

        let input = ExerciseEntryInput {
            exercise_id: exercise_type.id.unwrap(),
            date_unix: 1609459200,
            intensity: Some(3),
            notes: None,
            tz: Some("UTC".to_string()),
            sets: Some(3),
            reps: Some(10),
            weight_value: Some(100.0),
            weight_unit: None, // Missing weight unit
            load_basis: None,
            time_seconds: None,
            distance_meters: None,
        };

        let result = create_exercise_entry(&db, input).await;
        assert!(matches!(result, Err(WorkoutError::Validation(_))));
    }

    #[tokio::test]
    async fn test_cardio_entry_with_only_time_seconds_succeeds() {
        let db = setup_test_db().await;

        let exercise_type = create_exercise_type(
            &db,
            ExerciseTypeInput {
                name: "Running".to_string(),
                aliases: None,
                primary_muscles: vec![],
                guidance: None,
                default_load_basis: None,
            },
        )
        .await
        .unwrap();

        let input = ExerciseEntryInput {
            exercise_id: exercise_type.id.unwrap(),
            date_unix: 1609459200,
            intensity: Some(4),
            notes: Some("Morning run".to_string()),
            tz: Some("UTC".to_string()),
            sets: None,
            reps: None,
            weight_value: None,
            weight_unit: None,
            load_basis: None,
            time_seconds: Some(1800), // 30 minutes
            distance_meters: None,
        };

        let entry = create_exercise_entry(&db, input).await.unwrap();
        assert_eq!(entry.time_seconds, Some(1800));
        assert_eq!(entry.sets, None);
        assert_eq!(entry.weight_value, None);
    }
}
