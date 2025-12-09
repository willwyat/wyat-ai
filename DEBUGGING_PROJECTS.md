# Debugging Projects Feature - No Data Loading

## Added Debug Logs

### Backend (Rust)

All handlers now have comprehensive `println!` statements:

**Location**: `backend/src/projects.rs`

- `get_all_projects()` - Logs query start, each project found, total count
- `get_project_by_id()` - Logs ID/slug lookup, search method, result
- `get_all_planning()` - Logs planning docs query and results
- `get_projects_with_planning()` - Logs aggregation process

**Output Format**:

```
=== GET /projects START ===
Querying projects collection...
Found project: Wyat AI Platform (slug: wyat-ai-platform)
Found project: Capital Management (slug: capital-management)
=== GET /projects SUCCESS: 2 projects found ===
```

### Frontend (TypeScript)

All store methods now have comprehensive `console.log` statements:

**Location**: `frontend/src/stores/project-store.ts`

- `fetchProjects()` - Logs API URL, response status, data received
- `fetchProjectById()` - Logs lookup details, response
- `fetchProjectsWithPlanning()` - Logs aggregation fetch

**Output Format**:

```
=== fetchProjects START ===
API_URL: http://localhost:3001
WYAT_API_KEY: sk-test123...
Fetching from: http://localhost:3001/projects
Response status: 200
Response ok: true
Projects fetched: 2 projects
=== fetchProjects SUCCESS ===
```

**Component Location**: `frontend/src/app/projects/page.tsx`

- Logs on render
- Logs current state (loading, error, data count)
- Logs when useEffect triggers fetch

## Debugging Checklist

### 1. Check Backend is Running

```bash
cd backend
cargo run
```

Expected output should include:

```
✅ Connected to MongoDB Atlas
✅ Workout indexes initialized
Backend listening on 0.0.0.0:3001
```

### 2. Check MongoDB Collections Exist

**Option A - MongoDB Compass/Atlas UI**:

1. Connect to your MongoDB instance
2. Select `wyat` database
3. Verify collections exist:
   - `projects`
   - `project_planning`

**Option B - mongosh**:

```bash
mongosh "your-mongodb-uri"
use wyat
show collections
# Should show: projects, project_planning

# Check document count
db.projects.countDocuments()
db.project_planning.countDocuments()
```

### 3. Seed Sample Data (if collections are empty)

```bash
mongosh "your-mongodb-uri" --file backend/scripts/seed_projects.js
```

Expected output:

```
✓ Inserted 5 projects
✓ Inserted 4 planning documents
```

### 4. Test Backend API Directly

**Test GET /projects**:

```bash
curl -X GET http://localhost:3001/projects \
  -H "x-wyat-api-key: your-api-key" \
  -H "Content-Type: application/json"
```

Expected: JSON array of projects (or empty array `[]` if no data)

**Check backend console** for:

```
=== GET /projects START ===
Querying projects collection...
=== GET /projects SUCCESS: X projects found ===
```

### 5. Check Frontend Environment Variables

**File**: `frontend/.env.local`

Verify these are set:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WYAT_API_KEY=your-api-key
```

**Restart frontend** after changing:

```bash
cd frontend
npm run dev
```

### 6. Check Browser Console

Open browser DevTools (F12) and navigate to `/projects`

**Look for**:

```
=== ProjectsPage RENDER ===
State: { projectsWithPlanning: 0, loading: true, error: null }
=== ProjectsPage useEffect: Fetching projects ===
=== fetchProjectsWithPlanning START ===
API_URL: http://localhost:3001
Fetching from: http://localhost:3001/projects/with-planning
Response status: 200
Projects with planning fetched: X items
=== fetchProjectsWithPlanning SUCCESS ===
```

### 7. Check Network Tab

In DevTools Network tab:

1. Filter by "Fetch/XHR"
2. Look for request to `/projects/with-planning`
3. Check:
   - Status: Should be `200 OK`
   - Response: Should be JSON array
   - Headers: Should include `x-wyat-api-key`

### 8. Common Issues and Solutions

#### Issue: "Failed to fetch" in browser

**Cause**: CORS or backend not running  
**Solution**:

- Verify backend is running on port 3001
- Check `FRONTEND_ORIGIN` env var in backend
- Check browser console for CORS errors

#### Issue: Backend logs show "0 projects found"

**Cause**: MongoDB collection is empty  
**Solution**: Run seed script (Step 3)

#### Issue: Backend error "Failed to query projects"

**Cause**: MongoDB connection issue  
**Solution**:

- Verify `MONGODB_URI` in backend/.env
- Check MongoDB Atlas IP whitelist
- Check network connectivity

#### Issue: "Project not found" (404)

**Cause**: Slug mismatch or ObjectId invalid  
**Solution**:

- Check slug format (lowercase, hyphenated)
- Verify project exists in database
- Check backend logs for search details

#### Issue: Empty array `[]` returned but data exists

**Cause**: Collection name mismatch or wrong database  
**Solution**:

- Verify using `wyat` database
- Check collection names: `projects` and `project_planning`
- Case-sensitive collection names

#### Issue: "x-wyat-api-key" errors

**Cause**: API key not set or mismatch  
**Solution**:

- Set `NEXT_PUBLIC_WYAT_API_KEY` in frontend
- Set `WYAT_API_KEY` env var (if backend checks it)
- Restart both services

## Step-by-Step Debugging Process

### Step 1: Backend

1. Start backend: `cd backend && cargo run`
2. Watch backend console output
3. Test endpoint directly with curl
4. Confirm backend logs show request and response

### Step 2: Database

1. Check collections exist
2. Check document count
3. Seed data if needed
4. Verify one document manually

### Step 3: Frontend

1. Check `.env.local` file
2. Restart frontend: `npm run dev`
3. Open browser to `/projects`
4. Open DevTools console
5. Watch for fetch logs

### Step 4: Network

1. Check Network tab in DevTools
2. Verify request is sent
3. Check response status and body
4. Verify headers are correct

## Expected Log Flow (Success Case)

### Backend Console:

```
=== GET /projects/with-planning START ===
Fetching all projects...
Processing project: Wyat AI Platform (slug: wyat-ai-platform)
  Looking for planning docs with projects containing: wyat-ai-platform
  Found linked planning doc: Q1 2025 Product Roadmap
  Total planning docs for wyat-ai-platform: 1
Processing project: Capital Management (slug: capital-management)
  Looking for planning docs with projects containing: capital-management
  Found linked planning doc: Q1 2025 Product Roadmap
  Total planning docs for capital-management: 1
=== GET /projects/with-planning SUCCESS: 2 projects with planning ===
```

### Browser Console:

```
=== ProjectsPage RENDER ===
State: { projectsWithPlanning: 0, loading: true, error: null }
=== ProjectsPage useEffect: Fetching projects ===
=== fetchProjectsWithPlanning START ===
API_URL: http://localhost:3001
WYAT_API_KEY: sk-test...
Fetching from: http://localhost:3001/projects/with-planning
Response status: 200
Response ok: true
Projects with planning fetched: 2 items
Projects with planning data: [{ project: {...}, planning_documents: [...] }, ...]
=== fetchProjectsWithPlanning SUCCESS ===
=== ProjectsPage RENDER ===
State: { projectsWithPlanning: 2, loading: false, error: null }
```

## Quick Verification Commands

```bash
# 1. Check backend is responding
curl http://localhost:3001/

# 2. Check projects endpoint
curl http://localhost:3001/projects -H "x-wyat-api-key: test"

# 3. Check MongoDB connection
mongosh "your-uri" --eval "db.projects.countDocuments()"

# 4. Check frontend build
cd frontend && npm run build

# 5. Run integration test
./tests/integration/test_projects_api.sh
```

## Still Having Issues?

1. **Capture all logs**: Save backend console output and browser console output
2. **Check versions**:
   - Rust: `rustc --version`
   - Node: `node --version`
   - MongoDB: Check Atlas version
3. **Try minimal test**: Create a single document manually and fetch it
4. **Check dependencies**: `cd backend && cargo check`

## Contact Info

If issue persists, provide:

- Backend console output (with the new println! logs)
- Browser console output (with the new console.log statements)
- Network tab screenshot
- MongoDB collection document count
- Environment variable values (redacted)
