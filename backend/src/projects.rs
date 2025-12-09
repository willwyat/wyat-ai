use axum::{
    Json,
    extract::{Path as AxumPath, State as AxumState},
    http::StatusCode,
};
use mongodb::bson::{DateTime, doc, oid::ObjectId};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::AppState;

// ==========================================
// DATA STRUCTURES
// ==========================================

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Milestone {
    pub title: String,
    pub status: String, // "pending", "in_progress", "completed", "cancelled"
    #[serde(rename = "dueDate")]
    pub due_date: Option<DateTime>,
    #[serde(rename = "completedDate")]
    pub completed_date: Option<DateTime>,
    pub description: Option<String>,
    pub id: Option<String>,
}

impl Default for Milestone {
    fn default() -> Self {
        Milestone {
            title: String::new(),
            status: "pending".to_string(),
            due_date: None,
            completed_date: None,
            description: None,
            id: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Artifact {
    pub name: String,
    pub artifact_type: String, // "document", "link", "file", etc.
    pub url: Option<String>,
    pub description: Option<String>,
    pub created_at: Option<String>,
}

impl Default for Artifact {
    fn default() -> Self {
        Artifact {
            name: String::new(),
            artifact_type: String::new(),
            url: None,
            description: None,
            created_at: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Project {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub slug: String,
    #[serde(rename = "type")]
    pub project_type: String,
    pub title: String,
    pub status: String,           // "active", "paused", "completed", "archived"
    pub priority: Option<String>, // "high", "medium", "low"
    #[serde(default)]
    pub milestones: Vec<Milestone>,
    #[serde(default)]
    pub artifacts: Vec<Artifact>,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime,
    #[serde(rename = "updatedAt")]
    pub updated_at: DateTime,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProjectPlanning {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub slug: String,
    pub title: String,
    pub projects: Vec<String>, // Array of project slugs
    pub version: String,
    pub content: String, // Markdown content
    #[serde(rename = "createdAt")]
    pub created_at: DateTime,
    #[serde(rename = "updatedAt")]
    pub updated_at: DateTime,
}

// Response Milestone with string dates
#[derive(Serialize, Clone, Debug)]
pub struct MilestoneResponse {
    pub title: String,
    pub status: String,
    pub due_date: Option<String>,
    pub completed_date: Option<String>,
    pub description: Option<String>,
    pub id: Option<String>,
}

// Response structures for cleaner JSON output
#[derive(Serialize)]
pub struct ProjectResponse {
    pub _id: String,
    pub slug: String,
    #[serde(rename = "type")]
    pub project_type: String,
    pub title: String,
    pub status: String,
    pub priority: Option<String>,
    pub milestones: Vec<MilestoneResponse>,
    pub artifacts: Vec<Artifact>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct ProjectPlanningResponse {
    pub _id: String,
    pub slug: String,
    pub title: String,
    pub projects: Vec<String>,
    pub version: String,
    pub content: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct ProjectWithPlanningResponse {
    pub project: ProjectResponse,
    pub planning_documents: Vec<ProjectPlanningResponse>,
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

fn project_to_response(project: Project) -> ProjectResponse {
    // Convert BSON DateTime to ISO 8601 string format
    let created_at = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(
        project.created_at.timestamp_millis(),
    )
    .map(|dt| dt.to_rfc3339())
    .unwrap_or_else(|| project.created_at.to_string());

    let updated_at = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(
        project.updated_at.timestamp_millis(),
    )
    .map(|dt| dt.to_rfc3339())
    .unwrap_or_else(|| project.updated_at.to_string());

    // Convert milestones with DateTime to MilestoneResponse with String dates
    let milestones_response: Vec<MilestoneResponse> = project
        .milestones
        .iter()
        .map(|m| {
            let due_date = m.due_date.as_ref().map(|dt| {
                chrono::DateTime::<chrono::Utc>::from_timestamp_millis(dt.timestamp_millis())
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_else(|| dt.to_string())
            });

            let completed_date = m.completed_date.as_ref().map(|dt| {
                chrono::DateTime::<chrono::Utc>::from_timestamp_millis(dt.timestamp_millis())
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_else(|| dt.to_string())
            });

            MilestoneResponse {
                title: m.title.clone(),
                status: m.status.clone(),
                due_date,
                completed_date,
                description: m.description.clone(),
                id: m.id.clone(),
            }
        })
        .collect();

    // Debug: Log milestone data
    println!("Project '{}' milestones:", project.title);
    for (i, milestone) in milestones_response.iter().enumerate() {
        println!("  Milestone {}: {}", i, milestone.title);
        println!("    Status: {}", milestone.status);
        println!("    Due date: {:?}", milestone.due_date);
        println!("    Completed date: {:?}", milestone.completed_date);
    }

    ProjectResponse {
        _id: project.id.to_hex(),
        slug: project.slug.clone(),
        project_type: project.project_type,
        title: project.title.clone(),
        status: project.status,
        priority: project.priority,
        milestones: milestones_response,
        artifacts: project.artifacts,
        created_at,
        updated_at,
    }
}

fn planning_to_response(planning: ProjectPlanning) -> ProjectPlanningResponse {
    // Convert BSON DateTime to ISO 8601 string format
    let created_at = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(
        planning.created_at.timestamp_millis(),
    )
    .map(|dt| dt.to_rfc3339())
    .unwrap_or_else(|| planning.created_at.to_string());

    let updated_at = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(
        planning.updated_at.timestamp_millis(),
    )
    .map(|dt| dt.to_rfc3339())
    .unwrap_or_else(|| planning.updated_at.to_string());

    ProjectPlanningResponse {
        _id: planning.id.to_hex(),
        slug: planning.slug,
        title: planning.title,
        projects: planning.projects,
        version: planning.version,
        content: planning.content,
        created_at,
        updated_at,
    }
}

// ==========================================
// ROUTE HANDLERS
// ==========================================

/// GET /projects
/// Fetch all projects
pub async fn get_all_projects(
    AxumState(state): AxumState<Arc<AppState>>,
) -> Result<Json<Vec<ProjectResponse>>, StatusCode> {
    println!("=== GET /projects START ===");

    let db = state.mongo_client.database("wyat");

    // First, let's try to get raw BSON documents to see what we're working with
    println!("Querying projects collection for raw documents...");
    let raw_collection = db.collection::<mongodb::bson::Document>("projects");
    let count = raw_collection
        .count_documents(None, None)
        .await
        .map_err(|e| {
            eprintln!("ERROR: Failed to count documents: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    println!("Total documents in collection: {}", count);

    let collection = db.collection::<Project>("projects");

    println!("Querying projects collection for typed objects...");
    let mut cursor = collection.find(None, None).await.map_err(|e| {
        eprintln!("ERROR: Failed to query projects: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // First, let's look at raw documents to debug
    println!("Fetching raw BSON documents to inspect structure...");
    let mut raw_cursor = raw_collection.find(None, None).await.map_err(|e| {
        eprintln!("ERROR: Failed to query raw documents: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut doc_count = 0;
    while let Ok(Some(doc)) = raw_cursor.try_next().await {
        doc_count += 1;
        println!(
            "Raw document {} fields: {:?}",
            doc_count,
            doc.keys().collect::<Vec<_>>()
        );
        if let Some(slug) = doc.get_str("slug").ok() {
            println!("  Slug: {}", slug);
        }
        if let Some(title) = doc.get_str("title").ok() {
            println!("  Title: {}", title);
        }
        // Check milestones structure
        if let Ok(milestones) = doc.get_array("milestones") {
            println!("  Milestones array length: {}", milestones.len());
            for (i, milestone) in milestones.iter().enumerate() {
                if let mongodb::bson::Bson::Document(m_doc) = milestone {
                    println!(
                        "    Milestone {} fields: {:?}",
                        i,
                        m_doc.keys().collect::<Vec<_>>()
                    );
                    if let Ok(title) = m_doc.get_str("title") {
                        println!("      title: {}", title);
                    }

                    // Check all possible date field names and types
                    println!("      Checking due date variants:");
                    if let Ok(val) = m_doc.get_str("due_date") {
                        println!("        ✓ due_date (string): {}", val);
                    }
                    if let Ok(val) = m_doc.get_str("dueDate") {
                        println!("        ✓ dueDate (string): {}", val);
                    }
                    if let Ok(val) = m_doc.get_datetime("due_date") {
                        println!("        ✓ due_date (DateTime): {:?}", val);
                    }
                    if let Ok(val) = m_doc.get_datetime("dueDate") {
                        println!("        ✓ dueDate (DateTime): {:?}", val);
                    }

                    // Print the raw value for debugging
                    if let Some(raw_val) = m_doc.get("due_date") {
                        println!("        Raw due_date value: {:?}", raw_val);
                    }
                    if let Some(raw_val) = m_doc.get("dueDate") {
                        println!("        Raw dueDate value: {:?}", raw_val);
                    }
                }
            }
        }
    }
    println!("Total raw documents fetched: {}", doc_count);

    let mut projects = Vec::new();
    loop {
        match cursor.try_next().await {
            Ok(Some(project)) => {
                println!(
                    "✓ Deserialized project: {} (slug: {})",
                    project.title, project.slug
                );
                projects.push(project_to_response(project));
            }
            Ok(None) => {
                println!("Reached end of cursor");
                break;
            }
            Err(e) => {
                eprintln!("✗ ERROR deserializing project document: {:?}", e);
                eprintln!("This likely means a field mismatch between MongoDB and Rust struct");
                // Break on error to report it
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        }
    }

    println!(
        "=== GET /projects SUCCESS: {} projects found ===",
        projects.len()
    );
    Ok(Json(projects))
}

/// GET /projects/:id_or_slug
/// Fetch a single project by ObjectId or slug
pub async fn get_project_by_id(
    AxumState(state): AxumState<Arc<AppState>>,
    AxumPath(id_or_slug): AxumPath<String>,
) -> Result<Json<ProjectResponse>, StatusCode> {
    println!("=== GET /projects/{} START ===", id_or_slug);

    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<Project>("projects");
    println!("Collection: {:?}", collection);
    // Try parsing as ObjectId first, otherwise search by slug
    let filter = if let Ok(oid) = ObjectId::parse_str(&id_or_slug) {
        println!("Searching by ObjectId: {}", oid);
        doc! { "_id": oid }
    } else {
        println!("Searching by slug: {}", id_or_slug);
        doc! { "slug": &id_or_slug }
    };

    let project = collection
        .find_one(filter, None)
        .await
        .map_err(|e| {
            eprintln!("ERROR: Failed to query project: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or_else(|| {
            eprintln!("ERROR: Project not found: {}", id_or_slug);
            StatusCode::NOT_FOUND
        })?;

    println!(
        "=== GET /projects/{} SUCCESS: {} ===",
        id_or_slug, project.title
    );
    Ok(Json(project_to_response(project)))
}

/// GET /project-planning
/// Fetch all planning documents
pub async fn get_all_planning(
    AxumState(state): AxumState<Arc<AppState>>,
) -> Result<Json<Vec<ProjectPlanningResponse>>, StatusCode> {
    println!("=== GET /project-planning START ===");

    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<ProjectPlanning>("project_planning");

    println!("Querying project_planning collection...");
    let mut cursor = collection.find(None, None).await.map_err(|e| {
        eprintln!("ERROR: Failed to query planning docs: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut planning_docs = Vec::new();
    while let Ok(Some(planning)) = cursor.try_next().await {
        println!(
            "Found planning doc: {} (slug: {})",
            planning.title, planning.slug
        );
        planning_docs.push(planning_to_response(planning));
    }

    println!(
        "=== GET /project-planning SUCCESS: {} docs found ===",
        planning_docs.len()
    );
    Ok(Json(planning_docs))
}

/// GET /project-planning/:id_or_slug
/// Fetch a single planning document by ObjectId or slug
pub async fn get_planning_by_id(
    AxumState(state): AxumState<Arc<AppState>>,
    AxumPath(id_or_slug): AxumPath<String>,
) -> Result<Json<ProjectPlanningResponse>, StatusCode> {
    let db = state.mongo_client.database("wyat");
    let collection = db.collection::<ProjectPlanning>("project_planning");

    // Try parsing as ObjectId first, otherwise search by slug
    let filter = if let Ok(oid) = ObjectId::parse_str(&id_or_slug) {
        doc! { "_id": oid }
    } else {
        doc! { "slug": &id_or_slug }
    };

    let planning = collection
        .find_one(filter, None)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(planning_to_response(planning)))
}

/// GET /projects/with-planning
/// Fetch all projects with their associated planning documents
pub async fn get_projects_with_planning(
    AxumState(state): AxumState<Arc<AppState>>,
) -> Result<Json<Vec<ProjectWithPlanningResponse>>, StatusCode> {
    println!("=== GET /projects/with-planning START ===");

    let db = state.mongo_client.database("wyat");
    let projects_collection = db.collection::<Project>("projects");
    let planning_collection = db.collection::<ProjectPlanning>("project_planning");

    // Fetch all projects
    println!("Fetching all projects...");
    let mut projects_cursor = projects_collection.find(None, None).await.map_err(|e| {
        eprintln!("ERROR: Failed to fetch projects: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut results = Vec::new();

    while let Ok(Some(project)) = projects_cursor.try_next().await {
        let project_slug = project.slug.clone();
        println!(
            "Processing project: {} (slug: {})",
            project.title, project_slug
        );

        // Find all planning documents that reference this project's slug
        let planning_filter = doc! { "projects": &project_slug };
        println!(
            "  Looking for planning docs with projects containing: {}",
            project_slug
        );

        let mut planning_cursor = planning_collection
            .find(planning_filter, None)
            .await
            .map_err(|e| {
                eprintln!(
                    "ERROR: Failed to fetch planning docs for {}: {}",
                    project_slug, e
                );
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        let mut planning_docs = Vec::new();
        while let Ok(Some(planning)) = planning_cursor.try_next().await {
            println!("  Found linked planning doc: {}", planning.title);
            planning_docs.push(planning_to_response(planning));
        }

        println!(
            "  Total planning docs for {}: {}",
            project_slug,
            planning_docs.len()
        );

        results.push(ProjectWithPlanningResponse {
            project: project_to_response(project),
            planning_documents: planning_docs,
        });
    }

    println!(
        "=== GET /projects/with-planning SUCCESS: {} projects with planning ===",
        results.len()
    );
    Ok(Json(results))
}

// Re-export for cursor trait
use futures::stream::TryStreamExt;
