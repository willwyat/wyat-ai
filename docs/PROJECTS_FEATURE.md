# Projects & Project Planning Feature

## Overview

This feature adds comprehensive project management and planning capabilities to Wyat AI, allowing you to track projects, milestones, artifacts, and associated planning documents.

## Architecture

### Backend (Rust)

**Module:** `backend/src/projects.rs`

The backend provides a RESTful API using Axum framework with MongoDB integration.

#### Data Models

- **Project**: Main project entity with milestones, artifacts, status tracking
- **ProjectPlanning**: Planning documents that can be linked to multiple projects
- **Milestone**: Project milestone with status, dates, and descriptions
- **Artifact**: Project deliverables (documents, links, files)

#### API Endpoints

1. **GET /projects**

   - Returns all projects
   - Response: `Array<ProjectResponse>`

2. **GET /projects/:id_or_slug**

   - Returns a single project by ObjectId or slug
   - Response: `ProjectResponse`
   - Error: 404 if not found

3. **GET /project-planning**

   - Returns all planning documents
   - Response: `Array<ProjectPlanningResponse>`

4. **GET /project-planning/:id_or_slug**

   - Returns a single planning document by ObjectId or slug
   - Response: `ProjectPlanningResponse`
   - Error: 404 if not found

5. **GET /projects/with-planning**
   - Returns all projects with their associated planning documents
   - Response: `Array<ProjectWithPlanningResponse>`
   - Uses intelligent matching: planning docs reference project slugs

### Frontend (Next.js)

#### TypeScript Types

**File:** `frontend/src/types/projects.ts`

Defines all TypeScript interfaces:

- `Project`
- `ProjectPlanning`
- `Milestone`
- `Artifact`
- `ProjectWithPlanning`

#### Zustand Store

**File:** `frontend/src/stores/project-store.ts`

State management for projects with actions:

- `fetchProjects()` - Load all projects
- `fetchProjectById(id)` - Load single project
- `fetchPlanning()` - Load all planning docs
- `fetchPlanningById(id)` - Load single planning doc
- `fetchProjectsWithPlanning()` - Load projects with planning

#### Pages

1. **Projects List Page**

   - **Route:** `/projects`
   - **File:** `frontend/src/app/projects/page.tsx`
   - **Features:**
     - Grid view of all projects
     - Status badges (active, paused, completed, archived)
     - Priority indicators (high, medium, low)
     - Milestone progress visualization
     - Planning document count
     - Click to navigate to detail page

2. **Project Detail Page**

   - **Route:** `/projects/[slug]`
   - **File:** `frontend/src/app/projects/[slug]/page.tsx`
   - **Features:**
     - Complete project information
     - Milestone list with status tracking
     - Artifacts with external links
     - Related planning documents
     - Breadcrumb navigation

3. **Planning Document Page**
   - **Route:** `/planning/[slug]`
   - **File:** `frontend/src/app/planning/[slug]/page.tsx`
   - **Features:**
     - Markdown rendering with custom styling
     - Linked projects display
     - Version tracking
     - Full dark mode support

## MongoDB Collections

### `projects` Collection

```javascript
{
  _id: ObjectId,
  slug: String,           // Unique identifier (URL-friendly)
  type: String,           // Project type/category
  title: String,
  status: String,         // "active", "paused", "completed", "archived"
  priority: String,       // "high", "medium", "low" (optional)
  milestones: [
    {
      title: String,
      status: String,     // "pending", "in_progress", "completed", "cancelled"
      due_date: String,   // ISO date
      completed_date: String,
      description: String
    }
  ],
  artifacts: [
    {
      name: String,
      artifact_type: String,  // "document", "link", "file"
      url: String,
      description: String,
      created_at: String
    }
  ],
  createdAt: DateTime,
  updatedAt: DateTime
}
```

### `project_planning` Collection

```javascript
{
  _id: ObjectId,
  slug: String,           // Unique identifier (URL-friendly)
  title: String,
  projects: [String],     // Array of project slugs this planning relates to
  version: String,        // Version number (e.g., "1.0", "2.1")
  content: String,        // Markdown content
  createdAt: DateTime,
  updatedAt: DateTime
}
```

## Usage Examples

### Creating Sample Data

```javascript
// MongoDB Shell - Insert a project
db.projects.insertOne({
  slug: "ai-assistant",
  type: "software",
  title: "AI Assistant Development",
  status: "active",
  priority: "high",
  milestones: [
    {
      title: "Phase 1: Research",
      status: "completed",
      due_date: "2025-01-15",
      completed_date: "2025-01-10",
      description: "Complete market research and requirements",
    },
    {
      title: "Phase 2: Development",
      status: "in_progress",
      due_date: "2025-03-01",
      description: "Build core functionality",
    },
  ],
  artifacts: [
    {
      name: "Requirements Document",
      artifact_type: "document",
      url: "https://docs.example.com/requirements",
      description: "Detailed requirements specification",
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Insert a planning document
db.project_planning.insertOne({
  slug: "q1-2025-roadmap",
  title: "Q1 2025 Product Roadmap",
  projects: ["ai-assistant", "mobile-app"], // Links to project slugs
  version: "1.0",
  content: `# Q1 2025 Roadmap

## Overview
This roadmap outlines our priorities for Q1 2025.

## Key Initiatives
- AI Assistant MVP
- Mobile App Beta
- User Testing Program

## Timeline
...markdown content...`,
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

### Frontend Usage

```typescript
// In a React component
import { useProjectStore } from "@/stores";

export default function MyComponent() {
  const { projects, fetchProjects } = useProjectStore();

  useEffect(() => {
    fetchProjects();
  }, []);

  return (
    <div>
      {projects.map((project) => (
        <div key={project._id}>{project.title}</div>
      ))}
    </div>
  );
}
```

### Backend Curl Examples

```bash
# Get all projects
curl -X GET http://localhost:3001/projects \
  -H "x-wyat-api-key: your-api-key"

# Get specific project by slug
curl -X GET http://localhost:3001/projects/ai-assistant \
  -H "x-wyat-api-key: your-api-key"

# Get projects with planning
curl -X GET http://localhost:3001/projects/with-planning \
  -H "x-wyat-api-key: your-api-key"
```

## Design Decisions

1. **Slug-based Routing**: Both projects and planning docs use slugs for cleaner URLs and better SEO
2. **Flexible ID Resolution**: Backend accepts both ObjectId and slug for maximum flexibility
3. **Relationship Model**: Planning docs reference projects via slug arrays (many-to-many)
4. **Server Components**: Frontend uses client components with Zustand for reactive state
5. **Dark Mode**: Full dark mode support across all UI components
6. **Markdown Rendering**: react-markdown with custom styling for planning documents

## Future Enhancements

Potential areas for expansion:

- CRUD operations (Create, Update, Delete)
- Project templates
- Gantt chart visualization
- Team member assignments
- Comments and discussions
- File uploads for artifacts
- Search and filtering
- Project analytics dashboard
- Export to PDF/CSV
- Integration with external tools (GitHub, Jira, etc.)

## Testing

### Backend Testing

```bash
# Test project endpoints
curl http://localhost:3001/projects
curl http://localhost:3001/projects/test-slug
curl http://localhost:3001/project-planning
curl http://localhost:3001/projects/with-planning
```

### Frontend Testing

1. Navigate to http://localhost:3000/projects
2. Click on a project card
3. Verify milestone and artifact display
4. Click on planning document links
5. Test navigation and breadcrumbs

## Dependencies

### Backend

- axum (web framework)
- mongodb (database driver)
- serde (serialization)
- tokio (async runtime)

### Frontend

- next.js (React framework)
- zustand (state management)
- react-markdown (markdown rendering)
- tailwindcss (styling)

## Environment Variables

Ensure these are set:

- `MONGODB_URI` - MongoDB connection string
- `NEXT_PUBLIC_API_URL` - Backend API URL (default: http://localhost:3001)
- `NEXT_PUBLIC_WYAT_API_KEY` - API key for authentication

## Troubleshooting

### Backend Issues

**Problem:** Projects not loading

- Check MongoDB connection
- Verify collections exist: `projects` and `project_planning`
- Check backend logs for errors

**Problem:** 404 on slug lookups

- Ensure slugs are unique
- Verify slug format (lowercase, hyphenated)

### Frontend Issues

**Problem:** Blank page or loading forever

- Check browser console for errors
- Verify API_URL environment variable
- Check network tab for failed requests

**Problem:** Markdown not rendering

- Verify react-markdown is installed
- Check content field has valid markdown

## Related Documentation

- [MongoDB Schema Design](./README.md)
- [API Authentication](./SECURITY.md)
- [Frontend Architecture](../frontend/README.md)

## Maintenance

Regular tasks:

- Monitor database indexes performance
- Archive completed projects periodically
- Backup project and planning collections
- Update planning document versions

---

**Created:** December 2025  
**Last Updated:** December 2025  
**Status:** Production Ready
