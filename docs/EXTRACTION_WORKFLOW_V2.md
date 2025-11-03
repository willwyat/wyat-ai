# PDF Extraction Workflow V2 - Separated Flow

## Overview

The extraction process is now separated into distinct steps for better debugging and transparency:

1. **Get AI Prompt** - Retrieve prompt template from database
2. **Preview & Confirm** - Display prompt, PDF, account_id on frontend
3. **Extract** - Run actual extraction with confirmed parameters

## Backend Changes

### 1. New Module: `backend/src/services/ai_prompts.rs`

```rust
pub struct AiPrompt {
    pub _id: ObjectId,
    pub id: String,
    pub namespace: String,
    pub task: String,
    pub version: i32,
    pub description: Option<String>,
    pub model: Option<String>,
    pub prompt_template: String,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub calls: Vec<Value>,
}

// Get prompt by ID
pub async fn get_prompt_by_id(db: &Database, prompt_id: &str) -> Result<AiPrompt>

// List all prompts (optionally filtered by namespace)
pub async fn list_prompts(db: &Database, namespace: Option<&str>) -> Result<Vec<AiPrompt>>
```

### 2. New HTTP Endpoints

```
GET  /ai/prompts                      - List all prompts (optional ?namespace=capital)
GET  /ai/prompts/:prompt_id           - Get specific prompt (e.g., capital.extract_bank_statement)
```

### 3. Existing Endpoints (Updated)

```
POST /blobs                           - Upload PDF, get blob_id
POST /capital/documents/import        - Extract with account_id parameter
```

## New Workflow

### Step 1: Upload PDF

```bash
curl -X POST http://localhost:3001/blobs \
  -H "Content-Type: application/pdf" \
  --data-binary "@statement.pdf"
```

Response:

```json
{
  "blob_id": "68f7eb8c1010e952eac2a0d0",
  "sha256": "f9d95c...",
  "size_bytes": 152386,
  "content_type": "application/pdf"
}
```

### Step 2: Get AI Prompt

```bash
curl -s http://localhost:3001/ai/prompts/capital.extract_bank_statement
```

Response:

```json
{
  "_id": { "$oid": "68f6bba8bf551db316f2fca2" },
  "id": "capital.extract_bank_statement",
  "namespace": "capital",
  "task": "extract_statement",
  "version": 1,
  "model": "gpt-4o-mini",
  "prompt_template": "You are a financial statement extractor...",
  "description": "Extract transactions from PDF bank statement and return CSV + audit."
}
```

### Step 3: Preview on Frontend

Display:

- ✅ PDF (using PDFViewer component)
- ✅ Prompt template (truncated with "show more")
- ✅ Account ID input field (user confirms: `acct.chase_w_checking`)
- ✅ Model name (e.g., `gpt-4o-mini`)

User confirms all parameters are correct.

### Step 4: Execute Extraction

```bash
curl -X POST http://localhost:3001/capital/documents/import \
  -H "Content-Type: application/json" \
  -d '{
    "blob_id": "68f7eb8c1010e952eac2a0d0",
    "namespace": "capital",
    "kind": "bank_statement",
    "title": "Chase Checking Oct 2025",
    "account_id": "acct.chase_w_checking"
  }'
```

Response:

```json
{
  "doc": { "doc_id": "...", "status": {"ingest": "parsed"} },
  "csv_blob_id": "...",
  "audit": { ... },
  "rows_preview": [
    {
      "txid": "CHK5306-2025-09-08-001",
      "account_id": "acct.chase_w_checking",
      "date": "2025-09-08",
      ...
    }
  ]
}
```

## Frontend Implementation Plan

### 1. Add Types (`frontend/src/stores/capital-store.ts`)

```typescript
export interface AiPrompt {
  _id: { $oid: string };
  id: string;
  namespace: string;
  task: string;
  version: number;
  description?: string;
  model?: string;
  prompt_template: string;
  created_at?: string;
  updated_at?: string;
  calls?: any[];
}

// Add to CapitalState
export interface CapitalState {
  // ... existing fields

  // New: Prompt fetching
  getAiPrompt: (promptId: string) => Promise<AiPrompt>;
  listAiPrompts: (namespace?: string) => Promise<AiPrompt[]>;
}
```

### 2. Add API Functions

```typescript
getAiPrompt: async (promptId: string) => {
  const response = await fetch(
    `${API_CONFIG.BASE_URL}/ai/prompts/${promptId}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch prompt: ${response.statusText}`);
  }

  return await response.json();
},

listAiPrompts: async (namespace?: string) => {
  const url = namespace
    ? `${API_CONFIG.BASE_URL}/ai/prompts?namespace=${namespace}`
    : `${API_CONFIG.BASE_URL}/ai/prompts`;

  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch prompts: ${response.statusText}`);
  }

  return await response.json();
},
```

### 3. Update Documents Page UI

Add new workflow section in `/app/documents/page.tsx`:

```tsx
// State for extraction preview
const [extractionPreview, setExtractionPreview] = useState<{
  blob_id: string;
  prompt: AiPrompt;
  account_id: string;
  pdf_url: string;
} | null>(null);

// After PDF upload, fetch prompt and show preview
async function prepareExtraction(blobId: string) {
  try {
    const prompt = await getAiPrompt("capital.extract_bank_statement");

    setExtractionPreview({
      blob_id: blobId,
      prompt,
      account_id: "", // User will fill this in
      pdf_url: `${BACKEND_URL}/blobs/${blobId}`,
    });
  } catch (e) {
    console.error("Failed to fetch prompt:", e);
  }
}

// Preview component
{
  extractionPreview && (
    <div className="space-y-4 border p-4 rounded">
      <h3 className="font-bold">Extraction Preview</h3>

      {/* PDF Preview */}
      <div>
        <label className="block text-sm font-medium mb-2">PDF Document</label>
        <PDFViewer url={extractionPreview.pdf_url} />
      </div>

      {/* Account ID Input */}
      <div>
        <label className="block text-sm font-medium mb-2">Account ID</label>
        <input
          type="text"
          value={extractionPreview.account_id}
          onChange={(e) =>
            setExtractionPreview({
              ...extractionPreview,
              account_id: e.target.value,
            })
          }
          placeholder="e.g., acct.chase_w_checking"
          className="w-full border rounded px-3 py-2"
        />
      </div>

      {/* Prompt Template */}
      <div>
        <label className="block text-sm font-medium mb-2">
          AI Prompt ({extractionPreview.prompt.model || "default"})
        </label>
        <details>
          <summary className="cursor-pointer text-blue-600">
            Show prompt template (
            {extractionPreview.prompt.prompt_template.length} chars)
          </summary>
          <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto max-h-64">
            {extractionPreview.prompt.prompt_template}
          </pre>
        </details>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => executeExtraction(extractionPreview)}
          disabled={!extractionPreview.account_id}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          Extract Transactions
        </button>
        <button
          onClick={() => setExtractionPreview(null)}
          className="px-4 py-2 border rounded"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

## Benefits of Separated Flow

1. **Transparency**: User sees exactly what will be sent to OpenAI
2. **Verification**: Confirm PDF, account_id, and prompt before expensive API call
3. **Debugging**: If extraction fails, you know all inputs were correct
4. **Flexibility**: Can edit account_id or even prompt before extraction
5. **Cost Control**: Don't accidentally extract wrong document

## Testing

Once backend is restarted:

```bash
# Test prompt endpoint
curl -s http://localhost:3001/ai/prompts/capital.extract_bank_statement | jq '{id, model, prompt_length: (.prompt_template | length)}'

# Test list prompts
curl -s 'http://localhost:3001/ai/prompts?namespace=capital' | jq '.[] | {id, task}'
```

Expected output:

```json
{
  "id": "capital.extract_bank_statement",
  "model": "gpt-4o-mini",
  "prompt_length": 1234
}
```

## Next Steps

1. ✅ Backend API for prompts - DONE
2. ⏳ Restart backend - USER ACTION
3. ⏳ Test prompt endpoint
4. ⏳ Implement frontend preview UI
5. ⏳ Test full flow with real PDF
