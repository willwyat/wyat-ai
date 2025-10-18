use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use mongodb::bson::{Bson, Document, doc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

use crate::AppState;

// Custom response structs for frontend consumption
#[derive(Serialize)]
pub struct PersonRegistryResponse {
    pub _id: String,
    pub type_: String,
    pub title: String,
    pub version: String,
    pub persons: Vec<Person>,
    pub createdAt: String,
    pub updatedAt: String,
}

#[derive(Serialize)]
pub struct PlaceRegistryResponse {
    pub _id: String,
    pub type_: String,
    pub title: String,
    pub version: String,
    pub places: Vec<Place>,
    pub createdAt: String,
    pub updatedAt: String,
}

// Helper function to convert BSON DateTime to ISO string
fn bson_datetime_to_string(dt: &mongodb::bson::DateTime) -> String {
    dt.to_string()
}

// Helper function to convert ObjectId to string
fn bson_objectid_to_string(oid: &mongodb::bson::oid::ObjectId) -> String {
    oid.to_hex()
}

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
    pub modules: Option<Vec<String>>,
    pub createdAt: mongodb::bson::DateTime,
    pub updatedAt: mongodb::bson::DateTime,
}

#[derive(Deserialize)]
pub struct MetaDocumentUpdate {
    pub title: Option<String>,
    pub version: Option<String>,
    pub content: Option<String>,
    pub visibility: Option<String>,
    pub modules: Option<Vec<String>>,
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

#[derive(Serialize, Deserialize, Clone)]
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

#[derive(Serialize, Deserialize, Clone)]
pub struct Place {
    pub tag: String,
    pub name: String,
    pub aliases: Vec<String>,
    pub notes: String,
    pub visibility: String,
}

// Person operations
#[derive(Deserialize)]
pub struct AddPersonRequest {
    pub tag: String,
    pub name: String,
    pub nicknames: Option<Vec<String>>,
    pub visibility: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdatePersonRequest {
    pub tag: String,
    pub name: Option<String>,
    pub nicknames: Option<Vec<String>>,
    pub visibility: Option<String>,
}

// Place operations
#[derive(Deserialize)]
pub struct AddPlaceRequest {
    pub tag: String,
    pub name: String,
    pub aliases: Option<Vec<String>>,
    pub notes: Option<String>,
    pub visibility: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdatePlaceRequest {
    pub tag: String,
    pub name: Option<String>,
    pub aliases: Option<Vec<String>>,
    pub notes: Option<String>,
    pub visibility: Option<String>,
}

// Helper function to check for duplicate tags
async fn check_duplicate_tag(
    state: &State<Arc<AppState>>,
    doc_type: &str,
    tag: &str,
    exclude_tag: Option<&str>,
) -> Result<bool, String> {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<serde_json::Value>("meta");

    let filter = if let Some(exclude) = exclude_tag {
        doc! {
            "type": doc_type,
            "$or": [
                { "persons.tag": tag, "persons.tag": { "$ne": exclude } },
                { "places.tag": tag, "places.tag": { "$ne": exclude } }
            ]
        }
    } else {
        doc! {
            "type": doc_type,
            "$or": [
                { "persons.tag": tag },
                { "places.tag": tag }
            ]
        }
    };

    let count = collection
        .count_documents(filter, None)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    Ok(count > 0)
}

// Person operations
pub async fn add_person(
    state: State<Arc<AppState>>,
    request: Json<AddPersonRequest>,
) -> impl IntoResponse {
    // Check for duplicate tag
    if check_duplicate_tag(&state, "person_registry", &request.tag, None)
        .await
        .unwrap_or(false)
    {
        return (StatusCode::CONFLICT, "Person with this tag already exists").into_response();
    }

    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<PersonRegistry>("meta");

    let new_person = Person {
        tag: request.tag.clone(),
        name: request.name.clone(),
        nicknames: request.nicknames.clone().unwrap_or_default(),
        visibility: request
            .visibility
            .clone()
            .unwrap_or_else(|| "public".to_string()),
    };

    let filter = doc! { "type": "person_registry" };
    let person_doc = match mongodb::bson::to_document(&new_person) {
        Ok(doc) => doc,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let update = doc! {
        "$push": { "persons": person_doc },
        "$set": { "updatedAt": mongodb::bson::DateTime::now() }
    };

    match collection.update_one(filter, update, None).await {
        Ok(result) => {
            if result.matched_count == 0 {
                (StatusCode::NOT_FOUND, "Person registry not found").into_response()
            } else {
                Json(json!({
                    "message": "Person added successfully",
                    "person": {
                        "tag": request.tag,
                        "name": request.name
                    }
                }))
                .into_response()
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn update_person(
    state: State<Arc<AppState>>,
    request: Json<UpdatePersonRequest>,
) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<PersonRegistry>("meta");

    // Build update document for the specific person
    let mut update_fields = doc! {};

    if let Some(name) = &request.name {
        update_fields.insert("persons.$.name", name);
    }
    if let Some(nicknames) = &request.nicknames {
        update_fields.insert("persons.$.nicknames", nicknames);
    }
    if let Some(visibility) = &request.visibility {
        update_fields.insert("persons.$.visibility", visibility);
    }

    // Add updatedAt timestamp
    update_fields.insert("updatedAt", mongodb::bson::DateTime::now());

    let filter = doc! {
        "type": "person_registry",
        "persons.tag": &request.tag
    };
    let update = doc! { "$set": update_fields };

    match collection.update_one(filter, update, None).await {
        Ok(result) => {
            if result.matched_count == 0 {
                (StatusCode::NOT_FOUND, "Person not found").into_response()
            } else if result.modified_count == 0 {
                (StatusCode::NOT_MODIFIED, "No changes made").into_response()
            } else {
                Json(json!({
                    "message": "Person updated successfully",
                    "tag": request.tag
                }))
                .into_response()
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn delete_person(state: State<Arc<AppState>>, tag: String) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<PersonRegistry>("meta");

    let filter = doc! { "type": "person_registry" };
    let update = doc! {
        "$pull": { "persons": { "tag": &tag } },
        "$set": { "updatedAt": mongodb::bson::DateTime::now() }
    };

    match collection.update_one(filter, update, None).await {
        Ok(result) => {
            if result.matched_count == 0 {
                (StatusCode::NOT_FOUND, "Person registry not found").into_response()
            } else if result.modified_count == 0 {
                (StatusCode::NOT_FOUND, "Person not found").into_response()
            } else {
                Json(json!({
                    "message": "Person deleted successfully",
                    "tag": tag
                }))
                .into_response()
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// Place operations
pub async fn add_place(
    state: State<Arc<AppState>>,
    request: Json<AddPlaceRequest>,
) -> impl IntoResponse {
    // Check for duplicate tag
    if check_duplicate_tag(&state, "place_registry", &request.tag, None)
        .await
        .unwrap_or(false)
    {
        return (StatusCode::CONFLICT, "Place with this tag already exists").into_response();
    }

    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<PlaceRegistry>("meta");

    let new_place = Place {
        tag: request.tag.clone(),
        name: request.name.clone(),
        aliases: request.aliases.clone().unwrap_or_default(),
        notes: request.notes.clone().unwrap_or_default(),
        visibility: request
            .visibility
            .clone()
            .unwrap_or_else(|| "public".to_string()),
    };

    let filter = doc! { "type": "place_registry" };
    let place_doc = match mongodb::bson::to_document(&new_place) {
        Ok(doc) => doc,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let update = doc! {
        "$push": { "places": place_doc },
        "$set": { "updatedAt": mongodb::bson::DateTime::now() }
    };

    match collection.update_one(filter, update, None).await {
        Ok(result) => {
            if result.matched_count == 0 {
                (StatusCode::NOT_FOUND, "Place registry not found").into_response()
            } else {
                Json(json!({
                    "message": "Place added successfully",
                    "place": {
                        "tag": request.tag,
                        "name": request.name
                    }
                }))
                .into_response()
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn update_place(
    state: State<Arc<AppState>>,
    request: Json<UpdatePlaceRequest>,
) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<PlaceRegistry>("meta");

    // Build update document for the specific place
    let mut update_fields = doc! {};

    if let Some(name) = &request.name {
        update_fields.insert("places.$.name", name);
    }
    if let Some(aliases) = &request.aliases {
        update_fields.insert("places.$.aliases", aliases);
    }
    if let Some(notes) = &request.notes {
        update_fields.insert("places.$.notes", notes);
    }
    if let Some(visibility) = &request.visibility {
        update_fields.insert("places.$.visibility", visibility);
    }

    // Add updatedAt timestamp
    update_fields.insert("updatedAt", mongodb::bson::DateTime::now());

    let filter = doc! {
        "type": "place_registry",
        "places.tag": &request.tag
    };
    let update = doc! { "$set": update_fields };

    match collection.update_one(filter, update, None).await {
        Ok(result) => {
            if result.matched_count == 0 {
                (StatusCode::NOT_FOUND, "Place not found").into_response()
            } else if result.modified_count == 0 {
                (StatusCode::NOT_MODIFIED, "No changes made").into_response()
            } else {
                Json(json!({
                    "message": "Place updated successfully",
                    "tag": request.tag
                }))
                .into_response()
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn delete_place(state: State<Arc<AppState>>, tag: String) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<PlaceRegistry>("meta");

    let filter = doc! { "type": "place_registry" };
    let update = doc! {
        "$pull": { "places": { "tag": &tag } },
        "$set": { "updatedAt": mongodb::bson::DateTime::now() }
    };

    match collection.update_one(filter, update, None).await {
        Ok(result) => {
            if result.matched_count == 0 {
                (StatusCode::NOT_FOUND, "Place registry not found").into_response()
            } else if result.modified_count == 0 {
                (StatusCode::NOT_FOUND, "Place not found").into_response()
            } else {
                Json(json!({
                    "message": "Place deleted successfully",
                    "tag": tag
                }))
                .into_response()
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
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
    let collection: mongodb::Collection<Document> = db.collection("meta");

    match collection
        .find_one(doc! { "type": "person_registry" }, None)
        .await
    {
        Ok(Some(bson_doc)) => {
            // Convert BSON document to JSON-compatible structure
            let mut json_doc = serde_json::Map::new();

            // Convert ObjectId to string
            if let Some(Bson::ObjectId(oid)) = bson_doc.get("_id") {
                json_doc.insert("_id".to_string(), serde_json::Value::String(oid.to_hex()));
            }

            // Convert type field
            if let Some(Bson::String(doc_type)) = bson_doc.get("type") {
                json_doc.insert(
                    "type".to_string(),
                    serde_json::Value::String(doc_type.clone()),
                );
            }

            // Convert title and version
            if let Some(Bson::String(title)) = bson_doc.get("title") {
                json_doc.insert(
                    "title".to_string(),
                    serde_json::Value::String(title.clone()),
                );
            }
            if let Some(Bson::String(version)) = bson_doc.get("version") {
                json_doc.insert(
                    "version".to_string(),
                    serde_json::Value::String(version.clone()),
                );
            }

            // Convert persons array
            if let Some(Bson::Array(persons)) = bson_doc.get("persons") {
                let mut json_persons = Vec::new();
                for person_bson in persons {
                    if let Bson::Document(person_doc) = person_bson {
                        let mut json_person = serde_json::Map::new();

                        if let Some(Bson::String(tag)) = person_doc.get("tag") {
                            json_person
                                .insert("tag".to_string(), serde_json::Value::String(tag.clone()));
                        }
                        if let Some(Bson::String(name)) = person_doc.get("name") {
                            json_person.insert(
                                "name".to_string(),
                                serde_json::Value::String(name.clone()),
                            );
                        }
                        if let Some(Bson::Array(nicknames)) = person_doc.get("nicknames") {
                            let mut json_nicknames = Vec::new();
                            for nickname in nicknames {
                                if let Bson::String(nick) = nickname {
                                    json_nicknames.push(serde_json::Value::String(nick.clone()));
                                }
                            }
                            json_person.insert(
                                "nicknames".to_string(),
                                serde_json::Value::Array(json_nicknames),
                            );
                        }
                        if let Some(Bson::String(visibility)) = person_doc.get("visibility") {
                            json_person.insert(
                                "visibility".to_string(),
                                serde_json::Value::String(visibility.clone()),
                            );
                        }

                        json_persons.push(serde_json::Value::Object(json_person));
                    }
                }
                json_doc.insert(
                    "persons".to_string(),
                    serde_json::Value::Array(json_persons),
                );
            }

            // Convert DateTime fields to ISO strings
            if let Some(Bson::DateTime(created_at)) = bson_doc.get("createdAt") {
                json_doc.insert(
                    "createdAt".to_string(),
                    serde_json::Value::String(created_at.to_string()),
                );
            }
            if let Some(Bson::DateTime(updated_at)) = bson_doc.get("updatedAt") {
                json_doc.insert(
                    "updatedAt".to_string(),
                    serde_json::Value::String(updated_at.to_string()),
                );
            }

            Json(serde_json::Value::Object(json_doc)).into_response()
        }
        Ok(None) => (StatusCode::NOT_FOUND, "Person registry not found").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_place_registry(state: State<Arc<AppState>>) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let collection: mongodb::Collection<Document> = db.collection("meta");

    match collection
        .find_one(doc! { "type": "place_registry" }, None)
        .await
    {
        Ok(Some(bson_doc)) => {
            // Convert BSON document to JSON-compatible structure
            let mut json_doc = serde_json::Map::new();

            // Convert ObjectId to string
            if let Some(Bson::ObjectId(oid)) = bson_doc.get("_id") {
                json_doc.insert("_id".to_string(), serde_json::Value::String(oid.to_hex()));
            }

            // Convert type field
            if let Some(Bson::String(doc_type)) = bson_doc.get("type") {
                json_doc.insert(
                    "type".to_string(),
                    serde_json::Value::String(doc_type.clone()),
                );
            }

            // Convert title and version
            if let Some(Bson::String(title)) = bson_doc.get("title") {
                json_doc.insert(
                    "title".to_string(),
                    serde_json::Value::String(title.clone()),
                );
            }
            if let Some(Bson::String(version)) = bson_doc.get("version") {
                json_doc.insert(
                    "version".to_string(),
                    serde_json::Value::String(version.clone()),
                );
            }

            // Convert places array
            if let Some(Bson::Array(places)) = bson_doc.get("places") {
                let mut json_places = Vec::new();
                for place_bson in places {
                    if let Bson::Document(place_doc) = place_bson {
                        let mut json_place = serde_json::Map::new();

                        if let Some(Bson::String(tag)) = place_doc.get("tag") {
                            json_place
                                .insert("tag".to_string(), serde_json::Value::String(tag.clone()));
                        }
                        if let Some(Bson::String(name)) = place_doc.get("name") {
                            json_place.insert(
                                "name".to_string(),
                                serde_json::Value::String(name.clone()),
                            );
                        }
                        if let Some(Bson::Array(aliases)) = place_doc.get("aliases") {
                            let mut json_aliases = Vec::new();
                            for alias in aliases {
                                if let Bson::String(alias_str) = alias {
                                    json_aliases.push(serde_json::Value::String(alias_str.clone()));
                                }
                            }
                            json_place.insert(
                                "aliases".to_string(),
                                serde_json::Value::Array(json_aliases),
                            );
                        }
                        if let Some(Bson::String(notes)) = place_doc.get("notes") {
                            json_place.insert(
                                "notes".to_string(),
                                serde_json::Value::String(notes.clone()),
                            );
                        }
                        if let Some(Bson::String(visibility)) = place_doc.get("visibility") {
                            json_place.insert(
                                "visibility".to_string(),
                                serde_json::Value::String(visibility.clone()),
                            );
                        }

                        json_places.push(serde_json::Value::Object(json_place));
                    }
                }
                json_doc.insert("places".to_string(), serde_json::Value::Array(json_places));
            }

            // Convert DateTime fields to ISO strings
            if let Some(Bson::DateTime(created_at)) = bson_doc.get("createdAt") {
                json_doc.insert(
                    "createdAt".to_string(),
                    serde_json::Value::String(created_at.to_string()),
                );
            }
            if let Some(Bson::DateTime(updated_at)) = bson_doc.get("updatedAt") {
                json_doc.insert(
                    "updatedAt".to_string(),
                    serde_json::Value::String(updated_at.to_string()),
                );
            }

            Json(serde_json::Value::Object(json_doc)).into_response()
        }
        Ok(None) => (StatusCode::NOT_FOUND, "Place registry not found").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_capital_readme(state: State<Arc<AppState>>) -> impl IntoResponse {
    get_meta_document(state, "capital_readme".to_string()).await
}

pub async fn update_meta_document(
    state: State<Arc<AppState>>,
    doc_type: String,
    update_data: Json<MetaDocumentUpdate>,
) -> impl IntoResponse {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<MetaDocument>("meta");

    // Build update document with only provided fields
    let mut update_doc = doc! {};

    if let Some(title) = &update_data.title {
        update_doc.insert("title", title);
    }
    if let Some(version) = &update_data.version {
        update_doc.insert("version", version);
    }
    if let Some(content) = &update_data.content {
        update_doc.insert("content", content);
    }
    if let Some(visibility) = &update_data.visibility {
        update_doc.insert("visibility", visibility);
    }
    if let Some(modules) = &update_data.modules {
        update_doc.insert("modules", modules);
    }

    // Add updatedAt timestamp
    update_doc.insert("updatedAt", mongodb::bson::DateTime::now());

    let filter = doc! { "type": doc_type.clone() };
    let update = doc! { "$set": update_doc };

    match collection.update_one(filter, update, None).await {
        Ok(result) => {
            if result.matched_count == 0 {
                (
                    StatusCode::NOT_FOUND,
                    format!("{} document not found", doc_type),
                )
                    .into_response()
            } else if result.modified_count == 0 {
                (StatusCode::NOT_MODIFIED, "No changes made").into_response()
            } else {
                Json(json!({
                    "message": format!("{} document updated successfully", doc_type),
                    "modified_count": result.modified_count
                }))
                .into_response()
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn update_tag_taxonomy(
    state: State<Arc<AppState>>,
    update_data: Json<MetaDocumentUpdate>,
) -> impl IntoResponse {
    update_meta_document(state, "tag_taxonomy".to_string(), update_data).await
}

pub async fn update_keywording_best_practices(
    state: State<Arc<AppState>>,
    update_data: Json<MetaDocumentUpdate>,
) -> impl IntoResponse {
    update_meta_document(state, "keywording_best_practices".to_string(), update_data).await
}

pub async fn update_capital_readme(
    state: State<Arc<AppState>>,
    update_data: Json<MetaDocumentUpdate>,
) -> impl IntoResponse {
    update_meta_document(state, "capital_readme".to_string(), update_data).await
}
