use crate::capital::{ImportReq, ImportResp, import_bank_statement};
use crate::storage::insert_blob;
use axum::{Json, Router, body::Bytes, extract::State, http::StatusCode, routing::post};
use serde::Serialize;
use std::sync::Arc;

// AppState is defined in main.rs, we need to use it from there
pub fn routes(state: Arc<crate::AppState>) -> Router {
    Router::new()
        .route("/blobs", post(upload_blob_handler))
        .route("/capital/documents/import", post(import_doc_handler))
        .with_state(state)
}

#[derive(Serialize)]
struct BlobResponse {
    blob_id: String,
    sha256: String,
    size_bytes: i64,
    content_type: String,
}

async fn upload_blob_handler(
    State(state): State<Arc<crate::AppState>>,
    body: Bytes,
) -> Result<Json<BlobResponse>, StatusCode> {
    let db = state.mongo_client.database("wyat");

    // For now, assume PDF - in production, parse Content-Type header
    let content_type = "application/pdf";

    let blob = insert_blob(&db, body, content_type)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(BlobResponse {
        blob_id: blob.id.to_hex(),
        sha256: blob.sha256,
        size_bytes: blob.size_bytes,
        content_type: blob.content_type,
    }))
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
