import React, { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import { API_URL } from "@/lib/config";
import {
  useAiStore,
  useCapitalStore,
  type DocumentInfo,
  type AiPrompt,
} from "@/stores";
import Loader from "@/components/Loader";

interface ExtractionModalProps {
  document: DocumentInfo | null;
  onClose: () => void;
  onExtract: (doc: DocumentInfo, prompt: string, accountId?: string) => void;
}

export default function ExtractionModal({
  document,
  onClose,
  onExtract,
}: ExtractionModalProps) {
  const { getAiPrompt } = useAiStore();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [prompt, setPrompt] = useState<AiPrompt | null>(null);
  const [editedPrompt, setEditedPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractionResult, setExtractionResult] = useState<string | null>(null);
  const [extractionData, setExtractionData] = useState<any | null>(null);
  const [editableRows, setEditableRows] = useState<Record<string, any>[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string>("");

  // Fake progress messages while extracting
  const progressSteps = [
    "Uploading document to analyzer…",
    "Creating assistant…",
    "Creating thread…",
    "Sending message with prompt…",
    "Running assistant…",
    "Analyzing pages…",
    "Parsing structured data…",
    "Verifying totals…",
    "Cleaning up resources…",
  ];

  useEffect(() => {
    if (step === 2 && extracting) {
      setProgressMessage(progressSteps[0]);
      let idx = 0;
      const id = window.setInterval(() => {
        idx = (idx + 1) % progressSteps.length;
        setProgressMessage(progressSteps[idx]);
      }, 20000);
      return () => window.clearInterval(id);
    } else {
      setProgressMessage("");
    }
  }, [step, extracting]);

  // Fetch prompt when document changes
  useEffect(() => {
    if (!document) return;

    const promptId = `${document.namespace}.extract_${document.kind}`;
    setLoading(true);
    setError(null);

    getAiPrompt(promptId)
      .then((p) => {
        setPrompt(p);
        setEditedPrompt(p.prompt_template);
        // Pre-fill the template with DB variables using fillTemplateWithDBVars
        try {
          const required = p.prompt_variables ?? [];
          const vars = {
            account_id: document.metadata?.account_id ?? "",
            txid_prefix: document.metadata?.txid_prefix ?? "",
          };
          const filled = fillTemplateWithDBVars(
            p.prompt_template,
            vars,
            required
          );
          setEditedPrompt(filled);
        } catch (e) {
          // If variables are missing, keep the raw template and show a gentle hint
          console.warn("Prompt interpolation skipped:", (e as Error).message);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load prompt");
        setLoading(false);
      });
  }, [document, getAiPrompt]);

  // Reset state when modal closes
  useEffect(() => {
    if (!document) {
      setStep(1);
      setPrompt(null);
      setEditedPrompt("");
      setError(null);
      setExtractionResult(null);
      setExtracting(false);
    }
  }, [document]);

  if (!document) return null;

  // Build editable table columns from transactions
  function inferColumns(rows: Record<string, any>[]): string[] {
    const keys = new Set<string>();
    for (const r of rows) {
      Object.keys(r || {}).forEach((k) => keys.add(k));
    }
    return Array.from(keys);
  }

  function normalizeRows(rows: any[]): Record<string, any>[] {
    return (rows || []).map((r) => {
      const out: Record<string, any> = {};
      if (r && typeof r === "object") {
        for (const [k, v] of Object.entries(r)) {
          out[k] = typeof v === "object" ? JSON.stringify(v) : v;
        }
      }
      return out;
    });
  }

  const handleCellChange = (rowIdx: number, key: string, value: string) => {
    setEditableRows((prev) => {
      const copy = prev.map((r) => ({ ...r }));
      copy[rowIdx][key] = value;
      return copy;
    });
  };

  function fillTemplateWithDBVars(
    template: string,
    vars: Record<string, string>,
    requiredVars: string[]
  ): string {
    // Normalize DB-declared variable names (store them without {{ }}, but support legacy)
    const normalize = (s: string) => s.replace(/\{|\}/g, "").trim();
    const required = new Set(requiredVars.map(normalize));

    const found = new Set<string>();
    const missingValues: string[] = [];
    const unknownPlaceholders: string[] = [];

    const filled = template.replace(
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
      (m, keyRaw) => {
        const key = normalize(keyRaw);
        found.add(key);

        // If the template has a placeholder that's not declared in prompt_variables, flag it
        if (!required.has(key)) {
          unknownPlaceholders.push(key);
          return m; // leave it as-is so it's obvious in the UI
        }

        const val = vars[key];
        if (val == null || val === "") {
          missingValues.push(key);
          return m; // keep placeholder visible
        }

        return String(val);
      }
    );

    // Any required vars missing from the template at all?
    const missingInTemplate = [...required].filter((k) => !found.has(k));

    const problems: string[] = [];
    if (unknownPlaceholders.length) {
      problems.push(
        `Unknown placeholders in template: ${unknownPlaceholders.join(", ")}`
      );
    }
    if (missingInTemplate.length) {
      problems.push(
        `Template is missing required variables: ${missingInTemplate.join(
          ", "
        )}`
      );
    }
    if (missingValues.length) {
      problems.push(`Missing values for: ${missingValues.join(", ")}`);
    }
    if (problems.length) {
      throw new Error(problems.join(" | "));
    }

    return filled;
  }

  const handleExtract = async () => {
    if (!prompt || !document) return;
    setStep(2);

    // Optional soft warning if placeholders remain (no blocking)
    const leftover = editedPrompt.match(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g);
    if (leftover && leftover.length) {
      console.warn("Prompt still contains placeholders:", leftover);
    }

    setExtracting(true);
    setError(null);

    try {
      // Get blob_id and doc_id from document
      const blobId =
        typeof document.blob_id === "string"
          ? document.blob_id
          : document.blob_id.$oid;

      const docId =
        typeof document._id === "string" ? document._id : document._id.$oid;

      // Call the extraction endpoint
      const response = await fetch(`${API_URL}/ai/extract/bank-statement`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          blob_id: blobId,
          doc_id: docId,
          prompt: editedPrompt,
          prompt_id: prompt.id,
          prompt_version: String(prompt.version || "1"),
          model: prompt.model || "gpt-4o-mini",
          assistant_name: `${document.namespace}_${document.kind}_extractor`,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Extraction failed (${response.status}): ${text}`);
      }

      // Prefer JSON response
      let json: any | null = null;
      try {
        json = await response.json();
      } catch {
        const raw = await response.text();
        try {
          json = JSON.parse(raw);
        } catch {
          json = { raw };
        }
      }

      setExtractionData(json);
      setExtractionResult(JSON.stringify(json, null, 2));
      // Prepare editable rows from transactions if present
      const txns = Array.isArray(json?.transactions) ? json.transactions : [];
      setEditableRows(normalizeRows(txns));
      setStep(3);
    } catch (err: any) {
      setError(err.message || "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <Modal
      isOpen={!!document}
      onClose={onClose}
      title="Extract from document"
      subtitle={`${document.title} - Step ${step} of 4`}
      size="4xl"
    >
      <div className="space-y-4">
        {/* Step indicator */}
        <div className="min-h-20 flex items-center gap-2 pb-8 max-w-2xl mx-auto">
          <div
            className={`relative flex items-center justify-center w-8 h-8 rounded-full font-medium ${
              step >= 1 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
            }`}
          >
            1
            <span
              className={`absolute top-10 text-center font-medium text-xs ${
                step >= 1
                  ? "text-blue-800 dark:text-blue-200"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              Prompting
            </span>
          </div>
          <div className="flex-1 h-1 bg-gray-200 rounded">
            <div
              className={`h-full rounded transition-all ${
                step >= 2 ? "bg-blue-600 w-full" : "bg-gray-200 w-0"
              }`}
            />
          </div>
          <div
            className={`relative flex items-center justify-center w-8 h-8 rounded-full font-medium ${
              step >= 2 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
            }`}
          >
            2
            <span
              className={`absolute top-10 text-center font-medium text-xs ${
                step >= 2
                  ? "text-blue-800 dark:text-blue-200"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              Extraction
            </span>
          </div>
          <div className="flex-1 h-1 bg-gray-200 rounded">
            <div
              className={`h-full rounded transition-all ${
                step >= 3 ? "bg-blue-600 w-full" : "bg-gray-200 w-0"
              }`}
            />
          </div>
          <div
            className={`relative flex items-center justify-center w-8 h-8 rounded-full font-medium ${
              step >= 3 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
            }`}
          >
            3
            <span
              className={`absolute top-10 text-center font-medium text-xs ${
                step >= 3
                  ? "text-blue-800 dark:text-blue-200"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              Review
            </span>
          </div>
          <div className="flex-1 h-1 bg-gray-200 rounded">
            <div
              className={`h-full rounded transition-all ${
                step >= 4 ? "bg-blue-600 w-full" : "bg-gray-200 w-0"
              }`}
            />
          </div>
          <div
            className={`relative flex items-center justify-center w-8 h-8 rounded-full font-medium ${
              step >= 4 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
            }`}
          >
            4
            <span
              className={`absolute top-10 text-center font-medium text-xs ${
                step >= 4
                  ? "text-blue-800 dark:text-blue-200"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              Import
            </span>
          </div>
        </div>

        {/* Step 1: Configure Prompt */}
        {step === 1 && (
          <div className="space-y-4">
            {loading && (
              <div className="p-4 bg-blue-50 rounded border border-blue-200">
                <p className="text-sm text-blue-800">Loading AI prompt...</p>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 rounded border border-red-200">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {prompt && !loading && (
              <>
                <div className="rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                  <div className="text-sm space-y-2">
                    <div>
                      <span className="font-semibold">Document:</span>{" "}
                      {document.title}
                    </div>
                    <div>
                      <span className="font-semibold">Type:</span>{" "}
                      {document.kind}
                    </div>
                    <div>
                      <span className="font-semibold">Task:</span> {prompt.task}
                    </div>
                    <div>
                      <span className="font-semibold">Model:</span>{" "}
                      {prompt.model || "default"}
                    </div>
                  </div>
                </div>

                {/* Show account info if it's a bank statement */}
                {document.kind === "bank_statement" &&
                  document.metadata?.account_id && (
                    <div className="rounded-lg p-3 bg-blue-50 border border-blue-200">
                      <p className="text-sm">
                        <span className="font-semibold">Account:</span>{" "}
                        {document.metadata.account_id}
                        {document.metadata.txid_prefix && (
                          <span className="ml-2 text-gray-600">
                            (Prefix: {document.metadata.txid_prefix})
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                <div>
                  <label className="block text-sm font-medium mb-2">
                    AI Prompt Template
                    <span className="ml-2 text-xs text-gray-500">
                      (editable)
                    </span>
                  </label>
                  <textarea
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    rows={12}
                    className="w-full border border-gray-300 rounded-lg p-4 font-mono text-xs resize-y"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {editedPrompt.length} characters
                  </p>
                </div>
              </>
            )}

            {error && (
              <div className="p-4 bg-red-50 rounded border border-red-200">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                disabled={extracting}
              >
                Cancel
              </button>
              <button
                onClick={handleExtract}
                disabled={loading || !prompt || extracting}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {extracting ? "Extracting..." : "Extract"}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Extraction in Progress */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="min-h-64 p-4 bg-blue-50 dark:bg-blue-900 rounded border border-blue-200 flex flex-col gap-4 items-center justify-center">
              <Loader />
              {progressMessage && (
                <p className="text-sm text-blue-800">{progressMessage}</p>
              )}
            </div>
          </div>
        )}

        {/* Step 3: View Results */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Extraction Result
              </label>
              <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 overflow-auto max-h-96">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {extractionResult || "No result"}
                </pre>
              </div>
            </div>

            <div className="flex justify-between gap-3 pt-4">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Back to Prompt
              </button>
              <button
                onClick={() => setStep(4)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                disabled={!editableRows.length}
              >
                Continue to Import
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Import (Editable Table) */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Review & Edit Transactions
              </label>
              <div className="font-mono border border-gray-300 rounded-lg overflow-auto max-h-[480px]">
                {editableRows.length === 0 ? (
                  <div className="p-4 text-sm text-gray-600">
                    No transactions to import.
                  </div>
                ) : (
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {inferColumns(editableRows).map((col) => (
                          <th
                            key={col}
                            className={`px-4 py-2 ${
                              col === "amount_or_qty" || col === "price"
                                ? "text-right"
                                : "text-left"
                            } font-semibold text-gray-700 border-b border-gray-200 min-w-[160px]`}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {editableRows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className={rIdx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                        >
                          {inferColumns(editableRows).map((col) => (
                            <td
                              key={col}
                              className={`px-0.5 py-1 border-b border-gray-200 align-top min-w-[160px] ${
                                col === "amount_or_qty" || col === "price"
                                  ? "text-right"
                                  : ""
                              }`}
                            >
                              <input
                                className={`w-full min-w-[160px] px-2 py-1 bg-white ${
                                  col === "amount_or_qty" || col === "price"
                                    ? "text-right"
                                    : ""
                                }`}
                                value={row[col] ?? ""}
                                onChange={(e) =>
                                  handleCellChange(rIdx, col, e.target.value)
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Back to JSON
              </button>
              <button
                onClick={() => {
                  // stub import; wire to backend later
                  console.log("Importing transactions:", editableRows);
                  onClose();
                }}
                disabled={!editableRows.length}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Import Transactions
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
