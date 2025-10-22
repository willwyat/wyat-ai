# Testing Document Store

## Summary

Successfully separated document and AI prompt operations into a dedicated `document-store.ts`.

## Changes Made

### ✅ Created: `frontend/src/stores/document-store.ts`

**State:**

- `documents: DocumentInfo[]`
- `currentPrompt: AiPrompt | null`
- `loading: boolean`
- `error: string | null`

**AI Prompt Actions:**

- `getAiPrompt(promptId)` - Fetch specific prompt
- `listAiPrompts(namespace?)` - List all prompts

**Document Actions:**

- `listDocuments(query?)` - List documents
- `getDocument(docId)` - Get single document
- `createDocument(request)` - Create document entry
- `importBankStatement(request)` - Import and extract

### ✅ Updated: `frontend/src/stores/index.ts`

- Exported `useDocumentStore`
- Exported types: `AiPrompt`, `DocumentInfo`, `ImportRequest`, etc.

### ✅ Cleaned: `frontend/src/stores/capital-store.ts`

- Removed duplicate types and functions
- Capital store now focuses only on transactions, envelopes, accounts, cycles

## Testing

### 1. Test in Browser Console

```javascript
// Import the store
import { useDocumentStore } from "@/stores";

// Get the store instance
const documentStore = useDocumentStore.getState();

// Test 1: Fetch AI prompt
const prompt = await documentStore.getAiPrompt(
  "capital.extract_bank_statement"
);
console.log("Prompt:", prompt);
console.log("Model:", prompt.model);
console.log("Template length:", prompt.prompt_template.length);

// Test 2: List all capital prompts
const prompts = await documentStore.listAiPrompts("capital");
console.log("Capital prompts:", prompts);

// Test 3: List documents
const docs = await documentStore.listDocuments({ namespace: "capital" });
console.log("Documents:", docs);
```

### 2. Use in Components

```tsx
import { useDocumentStore } from "@/stores";

function MyComponent() {
  const { getAiPrompt, currentPrompt, loading, error } = useDocumentStore();

  useEffect(() => {
    getAiPrompt("capital.extract_bank_statement");
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!currentPrompt) return null;

  return (
    <div>
      <h3>Prompt: {currentPrompt.id}</h3>
      <p>Model: {currentPrompt.model}</p>
      <pre>{currentPrompt.prompt_template}</pre>
    </div>
  );
}
```

### 3. Quick CLI Test

```bash
# From frontend directory
npm run dev

# Then in browser console:
await useDocumentStore.getState().getAiPrompt('capital.extract_bank_statement')
```

## Expected Response

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

## Next Steps

1. ✅ Backend API working
2. ✅ Frontend store created
3. ⏳ Update `documents/page.tsx` to use `useDocumentStore`
4. ⏳ Implement extraction preview UI
5. ⏳ Test full flow

## Files Changed

- ✅ `/frontend/src/stores/document-store.ts` (NEW)
- ✅ `/frontend/src/stores/index.ts` (UPDATED)
- ✅ `/frontend/src/stores/capital-store.ts` (CLEANED)
