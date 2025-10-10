//! Wyat AI Backend Library
//!
//! This library exposes core modules for use by binaries and the main application.

use mongodb::Client as MongoClient;

pub mod capital;
pub mod journal;
pub mod services;

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub mongo_client: MongoClient,
}
