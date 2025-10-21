use crate::capital::{ImportReq, ImportResp, import_bank_statement};
use axum::{Json, Router, extract::State, routing::post};
use std::sync::Arc;

// AppState is defined in main.rs, we need to use it from there
pub fn routes(state: Arc<crate::AppState>) -> Router {
    Router::new()
        .route("/capital/documents/import", post(import_doc_handler))
        .with_state(state)
}

async fn import_doc_handler(
    State(state): State<Arc<crate::AppState>>,
    Json(req): Json<ImportReq>,
) -> Result<Json<ImportResp>, axum::http::StatusCode> {
    let db = state.mongo_client.database("wyat");
    import_bank_statement(&db, req)
        .await
        .map(Json)
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)
}
