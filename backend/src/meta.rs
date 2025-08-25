use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use mongodb::bson::doc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::AppState;

// Meta data structures
#[derive(Serialize, Deserialize)]
pub struct MetaDocument {
    #[serde(rename = "_id")]
    pub id: mongodb::bson::oid::ObjectId,
    #[serde(rename = "type")]
    pub doc_type: String,
    pub title: String,
    pub version: String,
    pub content: String,
    pub visibility: String,
    pub createdAt: mongodb::bson::DateTime,
    pub updatedAt: mongodb::bson::DateTime,
}

#[derive(Serialize, Deserialize)]
pub struct PersonRegistry {
    #[serde(rename = "_id")]
    pub id: mongodb::bson::oid::ObjectId,
    #[serde(rename = "type")]
    pub doc_type: String,
    pub title: String,
    pub version: String,
    pub persons: Vec<Person>,
    pub createdAt: mongodb::bson::DateTime,
    pub updatedAt: mongodb::bson::DateTime,
}

#[derive(Serialize, Deserialize)]
pub struct Person {
    pub tag: String,
    pub name: String,
    pub nicknames: Vec<String>,
    pub visibility: String,
}

#[derive(Serialize, Deserialize)]
pub struct PlaceRegistry {
    #[serde(rename = "_id")]
    pub id: mongodb::bson::oid::ObjectId,
    #[serde(rename = "type")]
    pub doc_type: String,
    pub title: String,
    pub version: String,
    pub places: Vec<Place>,
    pub createdAt: mongodb::bson::DateTime,
    pub updatedAt: mongodb::bson::DateTime,
}

#[derive(Serialize, Deserialize)]
pub struct Place {
    pub tag: String,
    pub name: String,
    pub aliases: Vec<String>,
    pub notes: String,
    pub visibility: String,
}

pub async fn get_meta_document(state: State<Arc<AppState>>, doc_type: String) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<MetaDocument>("meta");

    match collection
        .find_one(doc! { "type": doc_type.clone() }, None)
        .await
    {
        Ok(Some(document)) => Json(document).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            format!("{} document not found", doc_type),
        )
            .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_tag_taxonomy(state: State<Arc<AppState>>) -> impl IntoResponse {
    get_meta_document(state, "tag_taxonomy".to_string()).await
}

pub async fn get_keywording_best_practices(state: State<Arc<AppState>>) -> impl IntoResponse {
    get_meta_document(state, "keywording_best_practices".to_string()).await
}

pub async fn get_person_registry(state: State<Arc<AppState>>) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<PersonRegistry>("meta");

    match collection
        .find_one(doc! { "type": "person_registry" }, None)
        .await
    {
        Ok(Some(registry)) => Json(registry).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Person registry not found").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_place_registry(state: State<Arc<AppState>>) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<PlaceRegistry>("meta");

    match collection
        .find_one(doc! { "type": "place_registry" }, None)
        .await
    {
        Ok(Some(registry)) => Json(registry).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Place registry not found").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
