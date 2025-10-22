# OpenAI PDF Extraction Implementation

## Summary

Successfully implemented account context support for OpenAI-based PDF bank statement extraction with automatic post-processing to fix formatting issues.

## Changes Made

### 1. Backend - `backend/src/services/openai.rs`

#### Updated `extract_bank_statement` function signature:

```rust
pub async fn extract_bank_statement(
    db: Option<&Database>,
    pdf_bytes: &Bytes,
    prompt_override: Option<String>,
    account_id: Option<&str>,  // NEW: Account context
) -> Result<ExtractResult>
```

#### Key Features:

- **Account Context Injection**: If `account_id` is provided, it's added to the prompt with clear instructions:
  ```
  IMPORTANT: The account_id for ALL transactions in this statement is: {account_id}
  Use this exact account_id in the account_id field for every transaction.
  ```
- **Literal `\n` Fix**: Added post-processing to convert OpenAI's literal `\n` strings to actual newlines:
  ```rust
  let csv_text = v["csv_text"]
      .as_str()
      .unwrap_or_default()
      .replace("\\n", "\n")
      .to_string();
  ```

### 2. Backend - `backend/src/capital.rs`

#### Updated `ImportReq` struct:

```rust
pub struct ImportReq {
    pub blob_id: ObjectId,
    pub title: Option<String>,
    pub namespace: String,
    pub kind: String,
    pub account_id: Option<String>,  // NEW
}
```

#### Updated `import_bank_statement` call:

```rust
let account_id_ref = req.account_id.as_deref();
let ExtractResult { ... } = extract_bank_statement(
    Some(db),
    &pdf_bytes,
    None,
    account_id_ref  // Pass account context
).await?;
```

### 3. Frontend - `frontend/src/stores/capital-store.ts`

#### Updated `ImportRequest` interface:

```typescript
export interface ImportRequest {
  blob_id: string;
  namespace?: string;
  kind?: string;
  title?: string;
  account_id?: string; // NEW: e.g., "acct.chase_w_checking"
}
```

#### Updated API call:

```typescript
body: JSON.stringify({
  blob_id: request.blob_id,
  namespace: request.namespace || "capital",
  kind: request.kind || "bank_statement",
  title: request.title || "Bank Statement",
  account_id: request.account_id,  // NEW
}),
```

## Current Architecture

### Extraction Flow:

1. **PDF Upload** → Blob storage
2. **Text Extraction** → `lopdf` extracts text locally (fast, free)
3. **Prompt Enrichment** → Adds account context if provided
4. **OpenAI Parsing** → GPT-4o-mini structures data into CSV + metadata
5. **Post-Processing** → Fixes `\n` formatting
6. **Storage** → CSV and audit JSON saved as blobs

### Why This Approach?

✅ **Pragmatic**: Keeps fast local PDF extraction, uses OpenAI for structuring  
✅ **Cost-Effective**: Single OpenAI call, no complex Assistants API  
✅ **Accurate**: Account context ensures correct account_id in all transactions  
✅ **Flexible**: Account_id is optional, maintains backward compatibility

## ChatGPT Code Evaluation

The originally suggested code had these issues:

- ❌ Uses deprecated Assistants API with file upload
- ❌ Requires multiple API calls + polling loop
- ❌ More expensive than direct chat completions
- ❌ Overly complex for simple extraction needs
- ❌ Incomplete error handling for RunStatus enum

## Testing

### Test Script: `test_pdf_extraction.sh`

```bash
./test_pdf_extraction.sh <blob_id> <account_id>
```

### Example API Call:

```bash
curl -X POST http://localhost:8080/capital/documents/import \
  -H "Content-Type: application/json" \
  -d '{
    "blob_id": "507f1f77bcf86cd799439011",
    "namespace": "capital",
    "kind": "bank_statement",
    "title": "Chase Checking Oct 2025",
    "account_id": "acct.chase_w_checking"
  }'
```

### Expected Output:

```json
{
  "doc": { ... },
  "csv_blob_id": "...",
  "audit": { ... },
  "rows_preview": [
    {
      "txid": "CHK5306-2025-09-08-001",
      "account_id": "acct.chase_w_checking",  // ✓ Correct account
      ...
    }
  ]
}
```

## Known Issues from Previous Extraction

**Before**: OpenAI returned literal `\n` characters:

```
txid,date,...\nCHK5306-2025-09-08-001,2025-09-08,...\n...
```

**After**: Post-processing converts to actual newlines:

```
txid,date,...
CHK5306-2025-09-08-001,2025-09-08,...
...
```

## Future Improvements

1. **Vision API Option**: Add GPT-4o Vision as fallback for complex layouts
2. **Quality Checks**: Validate CSV structure before saving
3. **Batch Processing**: Support multiple PDFs in one request
4. **Account Auto-Detection**: Infer account from PDF metadata/title

## Database Prompt

The extraction prompt is stored in MongoDB:

- **Database**: `wyat`
- **Collection**: `ai_prompts`
- **Document ID**: `capital.extract_bank_statement`

The prompt should specify the exact CSV schema with account_id field.

## Build Status

✅ Backend compiled successfully  
✅ Frontend types updated  
✅ No new linter errors introduced

## Files Modified

1. `backend/src/services/openai.rs` - Added account context + \n fix
2. `backend/src/capital.rs` - Updated ImportReq + function call
3. `frontend/src/stores/capital-store.ts` - Updated interface + API call
4. `test_pdf_extraction.sh` - New test script (created)
5. `OPENAI_PDF_EXTRACTION_IMPLEMENTATION.md` - This document (created)
