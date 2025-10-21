use crate::capital::{ImportReq, ImportResp, import_bank_statement};
use crate::storage::{Document, create_document, get_blob_bytes_by_id, insert_blob};
use axum::{
    Json, Router,
    body::Bytes,
    extract::{Path, Query, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use mongodb::bson::{self, doc, oid::ObjectId};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

// AppState is defined in main.rs, we need to use it from there
pub fn routes(state: Arc<crate::AppState>) -> Router {
    Router::new()
        .route("/blobs", post(upload_blob_handler))
        .route("/blobs/:blob_id", get(get_blob_handler))
        .route(
            "/capital/documents",
            get(list_documents_handler).post(create_doc_handler),
        )
        .route("/capital/documents/:doc_id", get(get_document_handler))
        .route("/capital/documents/import", post(import_doc_handler))
        .with_state(state)
}

#[derive(Debug, Serialize)]
struct BlobResponse {
    blob_id: String,
    sha256: String,
    size_bytes: i64,
    content_type: String,
}

#[derive(Debug, Deserialize)]
struct ListDocumentsQuery {
    #[serde(default)]
    namespace: Option<String>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    limit: Option<i64>,
}

#[derive(Serialize)]
struct ListDocumentsResponse {
    documents: Vec<Document>,
    count: usize,
}

#[derive(Debug, Deserialize)]
struct CreateDocRequest {
    blob_id: String,
    namespace: String,
    kind: String,
    title: String,
    #[serde(default)]
    doc_id: Option<String>,
}

#[derive(Serialize)]
struct CreateDocResponse {
    doc: Document,
}

async fn upload_blob_handler(
    State(state): State<Arc<crate::AppState>>,
    body: Bytes,
) -> Result<Json<BlobResponse>, StatusCode> {
    println!("=== upload_blob_handler START ===");
    println!("Body size: {} bytes", body.len());

    let db = state.mongo_client.database("wyat");
    // Is the colleciton stated?
    // For now, assume PDF - in production, parse Content-Type header
    let content_type = "application/pdf";

    let blob = insert_blob(&db, body, content_type).await.map_err(|e| {
        eprintln!("upload_blob_handler: insert_blob failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    println!("=== upload_blob_handler SUCCESS ===");
    println!("Blob ID: {}", blob.id.to_hex());
    println!("SHA256: {}", blob.sha256);

    let response = BlobResponse {
        blob_id: blob.id.to_hex(),
        sha256: blob.sha256,
        size_bytes: blob.size_bytes,
        content_type: blob.content_type,
    };

    println!("Response: {:?}", response);

    Ok(Json(response))
}

async fn get_blob_handler(
    State(state): State<Arc<crate::AppState>>,
    Path(blob_id): Path<String>,
) -> Result<Response, StatusCode> {
    println!("=== get_blob_handler START ===");
    println!("blob_id: {}", blob_id);

    let db = state.mongo_client.database("wyat");

    // Parse blob_id
    let blob_id = ObjectId::parse_str(&blob_id).map_err(|e| {
        eprintln!("Invalid blob_id: {}", e);
        StatusCode::BAD_REQUEST
    })?;

    // Get the blob metadata first to determine content type
    let blobs = db.collection::<crate::storage::Blob>("blobs");
    let blob = blobs
        .find_one(doc! { "_id": &blob_id }, None)
        .await
        .map_err(|e| {
            eprintln!("Failed to query blob: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Get the blob bytes
    let bytes = get_blob_bytes_by_id(&db, blob_id).await.map_err(|e| {
        eprintln!("Failed to get blob bytes: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    println!("=== get_blob_handler SUCCESS: {} bytes ===", bytes.len());

    // Return the blob with proper content type and CORS headers
    Ok((
        [
            (header::CONTENT_TYPE, blob.content_type),
            (
                header::ACCESS_CONTROL_ALLOW_ORIGIN,
                std::env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| "*".to_string()),
            ),
            (header::ACCESS_CONTROL_ALLOW_CREDENTIALS, "true".to_string()),
        ],
        bytes,
    )
        .into_response())
}

async fn list_documents_handler(
    State(state): State<Arc<crate::AppState>>,
    Query(params): Query<ListDocumentsQuery>,
) -> Result<Json<ListDocumentsResponse>, StatusCode> {
    println!("=== list_documents_handler START ===");
    println!("Query params: {:?}", params);

    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Document>("documents");

    // Build filter
    let mut filter = doc! {};
    if let Some(namespace) = params.namespace {
        filter.insert("namespace", namespace);
    }
    if let Some(kind) = params.kind {
        filter.insert("kind", kind);
    }

    // Query with optional limit
    let mut cursor = match params.limit {
        Some(limit) => {
            collection
                .find(
                    filter.clone(),
                    mongodb::options::FindOptions::builder()
                        .limit(limit)
                        .build(),
                )
                .await
        }
        None => collection.find(filter.clone(), None).await,
    }
    .map_err(|e| {
        eprintln!("Failed to query documents: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Collect results
    let mut documents = Vec::new();
    use futures::stream::StreamExt;
    while let Some(result) = cursor.next().await {
        match result {
            Ok(doc) => documents.push(doc),
            Err(e) => {
                eprintln!("Error reading document: {}", e);
                continue;
            }
        }
    }

    let count = documents.len();
    println!(
        "=== list_documents_handler SUCCESS: {} documents ===",
        count
    );

    Ok(Json(ListDocumentsResponse { documents, count }))
}

async fn get_document_handler(
    State(state): State<Arc<crate::AppState>>,
    Path(doc_id): Path<String>,
) -> Result<Json<Document>, StatusCode> {
    println!("=== get_document_handler START ===");
    println!("doc_id: {}", doc_id);

    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Document>("documents");

    // Try to find by doc_id first (string field)
    let filter = doc! { "doc_id": &doc_id };

    match collection.find_one(filter, None).await {
        Ok(Some(doc)) => {
            println!("=== get_document_handler SUCCESS ===");
            Ok(Json(doc))
        }
        Ok(None) => {
            println!("=== get_document_handler NOT FOUND ===");
            Err(StatusCode::NOT_FOUND)
        }
        Err(e) => {
            eprintln!("Failed to query document: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn create_doc_handler(
    State(state): State<Arc<crate::AppState>>,
    Json(req): Json<CreateDocRequest>,
) -> Result<Json<CreateDocResponse>, StatusCode> {
    println!("=== create_doc_handler START ===");
    println!("Request received: {:?}", req);

    let db = state.mongo_client.database("wyat");

    // Parse blob_id
    let blob_id = ObjectId::parse_str(&req.blob_id).map_err(|e| {
        eprintln!("Invalid blob_id: {}", e);
        StatusCode::BAD_REQUEST
    })?;

    // Generate doc_id if not provided
    let doc_id = req
        .doc_id
        .unwrap_or_else(|| format!("doc_{}_{}", req.namespace, blob_id.to_hex()));

    match create_document(
        &db,
        &doc_id,
        &req.namespace,
        &req.kind,
        &req.title,
        blob_id,
        bson::doc! {},
    )
    .await
    {
        Ok(doc) => {
            println!("=== create_doc_handler SUCCESS ===");
            Ok(Json(CreateDocResponse { doc }))
        }
        Err(e) => {
            println!("=== create_doc_handler ERROR ===");
            eprintln!("Create document failed: {}", e);
            Err(StatusCode::UNPROCESSABLE_ENTITY)
        }
    }
}

async fn import_doc_handler(
    State(state): State<Arc<crate::AppState>>,
    Json(req): Json<ImportReq>,
) -> Result<Json<ImportResp>, StatusCode> {
    println!("=== import_doc_handler START ===");
    println!("Request received: {:?}", req);

    let db = state.mongo_client.database("wyat");
    println!("Database connection established");

    match import_bank_statement(&db, req).await {
        Ok(resp) => {
            println!("=== import_doc_handler SUCCESS ===");
            Ok(Json(resp))
        }
        Err(e) => {
            println!("=== import_doc_handler ERROR ===");
            println!("Import failed: {}", e);
            eprintln!("Import failed: {}", e);
            Err(StatusCode::UNPROCESSABLE_ENTITY)
        }
    }
}
