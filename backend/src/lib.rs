//! Wyat AI Backend Library
//!
//! This library exposes core modules for use by binaries and the main application.

pub mod capital;
pub mod journal;
pub mod services;

// Re-export commonly used types
pub use journal::AppState;
