use anyhow::{Context as _, Result, bail};
use bytes::Bytes;
use chrono::Utc;
use mongodb::{
    Database,
    bson::{self, Binary, doc, oid::ObjectId},
    error::{ErrorKind, WriteFailure},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blob {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    /// SHA-256 hash of the file bytes; used for deduplication
    pub sha256: String,
    /// Inline bytes (if small file, e.g. < 12–15 MB)
    pub bytes: Option<Binary>,
    /// GridFS file reference (if large file)
    pub gridfs_file_id: Option<ObjectId>,
    /// File size in bytes
    pub size_bytes: i64,
    /// MIME type (e.g., "application/pdf", "text/csv")
    pub content_type: String,
    /// Optional IV for AES-GCM encryption
    pub iv: Option<String>,
    /// Optional key ID (for key rotation or external KMS)
    pub key_id: Option<String>,
    /// Timestamp when this blob was created (Unix seconds)
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    /// Stable string ID, e.g. "doc_chase_2025-10"
    pub doc_id: String,
    /// Logical namespace — e.g. "capital", "journal", "vitals"
    pub namespace: String,
    /// Category of document, e.g. "bank_statement", "invoice", "workout_log"
    pub kind: String,
    /// Display title, e.g. "Chase Statement Oct 2025"
    pub title: String,
    /// Reference to blob in the `blobs` collection
    pub blob_id: ObjectId,
    /// SHA-256 of the blob for quick lookup
    pub sha256: String,
    /// Size and content type copied from blob for convenience
    pub size_bytes: i64,
    pub content_type: String,
    /// Freeform metadata (account_id, statement_month, etc.)
    pub metadata: bson::Document,
    /// Ingestion state tracking
    pub status: DocumentStatus,
    /// Timestamps
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentStatus {
    /// Ingestion phase: "uploaded" | "parsed" | "seeded" | "reconciled" | "failed"
    pub ingest: String,
    /// Error message if failed
    pub error: Option<String>,
}

/// Maximum size for inline storage (15 MB to stay under MongoDB's 16MB limit)
const MAX_INLINE_SIZE_BYTES: usize = 15 * 1024 * 1024;

/// Insert a blob into the `blobs` collection with automatic deduplication.
///
/// # Features
/// - **Deduplication**: Files with identical SHA-256 hashes return the existing blob
/// - **Race-safe**: Handles concurrent inserts of the same file gracefully
/// - **Inline storage**: Files ≤15MB are stored directly as BSON Binary data
/// - **Future-ready**: Prepared for GridFS integration for larger files
///
/// # Arguments
/// * `db` - MongoDB database reference
/// * `bytes` - File contents as bytes
/// * `content_type` - MIME type (e.g., "application/pdf", "text/csv")
///
/// # Returns
/// * `Ok(Blob)` - The inserted blob (or existing if deduplicated)
/// * `Err` - If the file is empty, exceeds size limits, or database error
///
/// # Examples
/// ```ignore
/// let blob = insert_blob(&db, pdf_bytes, "application/pdf").await?;
/// println!("Blob ID: {}, SHA-256: {}", blob.id, blob.sha256);
/// ```
pub async fn insert_blob(db: &Database, bytes: Bytes, content_type: &str) -> Result<Blob> {
    // 0) Validate
    if bytes.is_empty() {
        anyhow::bail!("Empty file not allowed");
    }
    // Optional: enforce PDF-only here
    // if content_type != "application/pdf" { anyhow::bail!("Only PDF uploads allowed"); }

    // 1) Hash
    let sha256 = format!("{:x}", Sha256::digest(&bytes));
    let size_bytes = bytes.len() as i64;
    println!(
        "insert_blob: sha256: {}, size_bytes: {}",
        sha256, size_bytes
    );

    // 2) Fast path: existing
    let coll = db.collection::<Blob>("blobs");
    if let Some(existing) = coll.find_one(doc! {"sha256": &sha256}, None).await? {
        println!("insert_blob: found existing blob with sha256: {}", sha256);
        return Ok(existing);
    }
    println!("insert_blob: no existing blob found, creating new one");

    // 3) Decide storage
    if bytes.len() > MAX_INLINE_SIZE_BYTES {
        // TODO: implement GridFS; for now, typed error for HTTP 413
        anyhow::bail!(
            "File size {} exceeds inline limit {} (GridFS not implemented)",
            bytes.len(),
            MAX_INLINE_SIZE_BYTES
        );
    }
    println!("insert_blob: bytes: {:?}", bytes);

    let blob = Blob {
        id: ObjectId::new(),
        sha256: sha256.clone(),
        bytes: Some(Binary {
            subtype: bson::spec::BinarySubtype::Generic,
            bytes: bytes.to_vec(),
        }),
        gridfs_file_id: None,
        size_bytes,
        content_type: content_type.to_string(),
        iv: None,
        key_id: None,
        created_at: chrono::Utc::now().timestamp(),
    };

    println!("insert_blob: blob: {:?}", blob);

    // 4) Insert with race-safe fallback
    match coll.insert_one(&blob, None).await {
        Ok(_) => {
            println!("insert_blob: successfully inserted blob");
            Ok(blob)
        }
        Err(e) => {
            // If another request inserted the same sha256 in between, return that one
            let dup = matches!(e.kind.as_ref(),
                ErrorKind::Write(WriteFailure::WriteError(we)) if we.code == 11000
            );
            if dup {
                println!("insert_blob: duplicate key error, fetching existing blob");
                if let Some(existing) = coll.find_one(doc! {"sha256": &sha256}, None).await? {
                    return Ok(existing);
                }
            }
            eprintln!("insert_blob: error: {:?}", e);
            Err(e.into())
        }
    }
}

/// Retrieve the raw bytes of a blob by its ObjectId.
///
/// # Arguments
/// * `db` - MongoDB database reference
/// * `id` - The blob's ObjectId (from `Blob.id` field)
///
/// # Returns
/// * `Ok(Bytes)` - The file contents
/// * `Err` - If blob not found, or stored in GridFS (not yet implemented)
///
/// # Examples
/// ```ignore
/// let bytes = get_blob_bytes_by_id(&db, blob_id).await?;
/// // Use bytes for download, processing, etc.
/// ```
pub async fn get_blob_bytes_by_id(db: &Database, id: ObjectId) -> Result<Bytes> {
    let coll = db.collection::<Blob>("blobs");

    let blob = coll
        .find_one(doc! { "_id": &id }, None)
        .await?
        .context("blob not found")?;

    if let Some(bin) = blob.bytes {
        return Ok(Bytes::from(bin.bytes));
    }

    if let Some(_file_id) = blob.gridfs_file_id {
        // TODO: implement GridFS read path
        bail!("blob stored in GridFS (read path not implemented)");
    }

    bail!("blob has neither inline bytes nor gridfs_file_id");
}

/// Retrieve the raw bytes of a blob by its SHA-256 hash.
///
/// Useful for content-addressed retrieval when you have the hash but not the ObjectId.
///
/// # Arguments
/// * `db` - MongoDB database reference
/// * `sha256` - Hex-encoded SHA-256 hash of the blob content
///
/// # Returns
/// * `Ok(Bytes)` - The file contents
/// * `Err` - If blob not found, or stored in GridFS (not yet implemented)
///
/// # Examples
/// ```ignore
/// let bytes = get_blob_bytes_by_sha(&db, "a3f8c9...").await?;
/// ```
pub async fn get_blob_bytes_by_sha(db: &Database, sha256: &str) -> Result<Bytes> {
    let coll = db.collection::<Blob>("blobs");
    let blob = coll
        .find_one(doc! { "sha256": sha256 }, None)
        .await?
        .context("blob not found")?;
    if let Some(bin) = blob.bytes {
        Ok(Bytes::from(bin.bytes))
    } else if let Some(_fid) = blob.gridfs_file_id {
        anyhow::bail!("GridFS path not implemented");
    } else {
        anyhow::bail!("blob empty");
    }
}

/// Create a Document that references an existing Blob.
///
/// # Features
/// - **Idempotent**: Multiple calls with same (namespace, doc_id) return the existing document
/// - **Race-safe**: Handles concurrent creates gracefully with unique index on (namespace, doc_id)
/// - **Conflict detection**: Returns error if doc_id exists but points to different blob
/// - **Automatic metadata**: Copies size, content_type, and SHA-256 from the blob
///
/// # Arguments
/// * `db` - MongoDB database reference
/// * `doc_id` - Stable document identifier (e.g., "doc_chase_2025-10")
/// * `namespace` - Logical namespace (e.g., "capital", "journal", "vitals")
/// * `kind` - Document category (e.g., "bank_statement", "invoice", "workout_log")
/// * `title` - Human-readable display title
/// * `blob_id` - ObjectId of the blob in the `blobs` collection
/// * `metadata` - Freeform BSON document for additional fields (account_id, statement_month, etc.)
///
/// # Returns
/// * `Ok(Document)` - The created document (or existing if idempotent)
/// * `Err` - If blob not found, or doc_id exists with different blob (conflict)
///
/// # Examples
/// ```ignore
/// let metadata = doc! {
///     "account_id": "chase_checking",
///     "statement_month": "2025-10"
/// };
/// let document = create_document(
///     &db,
///     "doc_chase_2025-10",
///     "capital",
///     "bank_statement",
///     "Chase Statement Oct 2025",
///     blob.id,
///     metadata
/// ).await?;
/// ```
pub async fn create_document(
    db: &Database,
    doc_id: &str,
    namespace: &str,
    kind: &str,
    title: &str,
    blob_id: ObjectId,
    metadata: bson::Document,
) -> Result<Document> {
    let blobs = db.collection::<Blob>("blobs");
    let docs = db.collection::<Document>("documents");

    // 1) Load and verify the blob; derive immutable fields from it
    let blob = blobs
        .find_one(doc! { "_id": &blob_id }, None)
        .await?
        .context("blob not found")?;

    let now = Utc::now().timestamp();

    // 2) Idempotency: if a doc with same (namespace, doc_id) exists, return it
    if let Some(existing) = docs
        .find_one(doc! { "namespace": namespace, "doc_id": doc_id }, None)
        .await?
    {
        // If it points to the same blob (or same sha), treat as idempotent create
        if existing.blob_id == blob_id || existing.sha256 == blob.sha256 {
            return Ok(existing);
        } else {
            bail!(
                "document '{}' in namespace '{}' already exists but points to a different blob (conflict)",
                doc_id,
                namespace
            );
        }
    }

    // 3) Build the new Document
    let docu = Document {
        id: ObjectId::new(),
        doc_id: doc_id.to_string(),
        namespace: namespace.to_string(),
        kind: kind.to_string(),
        title: title.to_string(),
        blob_id,
        sha256: blob.sha256.clone(),
        size_bytes: blob.size_bytes,
        content_type: blob.content_type.clone(),
        metadata,
        status: DocumentStatus {
            ingest: "uploaded".to_string(),
            error: None,
        },
        created_at: now,
        updated_at: now,
    };

    // 4) Insert with race-safe fallback on unique (namespace, doc_id)
    match docs.insert_one(&docu, None).await {
        Ok(_) => Ok(docu),
        Err(e) => {
            let dup = matches!(e.kind.as_ref(),
                ErrorKind::Write(WriteFailure::WriteError(we)) if we.code == 11000
            );
            if dup {
                // Another writer inserted it; fetch and return
                if let Some(existing) = docs
                    .find_one(doc! { "namespace": namespace, "doc_id": doc_id }, None)
                    .await?
                {
                    // Same conflict rule as above
                    if existing.sha256 != blob.sha256 {
                        bail!(
                            "document '{}' in namespace '{}' exists with different blob (conflict)",
                            doc_id,
                            namespace
                        );
                    }
                    return Ok(existing);
                }
            }
            Err(e.into())
        }
    }
}
