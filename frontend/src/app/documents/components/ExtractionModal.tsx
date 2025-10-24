"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import Loader from "@/components/Loader";
import { useAiStore, useCapitalStore } from "@/stores";
import type {
  FlatTransaction,
  BatchImportResponse,
} from "@/stores/document-store";
import {
  batchImportTransactions,
  extractBankStatement,
} from "@/app/services/extraction";

interface ExtractionModalProps {
  isOpen: boolean;
  onClose: () => void;
  docId: string;
  blobId: string;
  promptId: string;
  promptVersion: string;
  defaultAccountId: string;
  defaultTxidPrefix: string;
}

type ImportOptions = {
  source?: string;
  status?: string | null;
  debit_tx_type?: string;
  credit_tx_type?: string;
  fallback_account_id?: string;
};

type ExtractionPreview = {
  transactions: FlatTransaction[];
  audit: any;
  inferred_meta: any;
  quality: string;
  confidence: number;
  import_summary?: BatchImportResponse;
};

const DEFAULT_MODEL = "gpt-4o-mini";

export default function ExtractionModal({
  isOpen,
  onClose,
  docId,
  blobId,
  promptId,
  promptVersion,
  defaultAccountId,
  defaultTxidPrefix,
}: ExtractionModalProps) {
  const router = useRouter();
  const getAiPrompt = useAiStore((state) => state.getAiPrompt);
  const fetchTransactions = useCapitalStore((state) => state.fetchTransactions);

  const [promptTemplate, setPromptTemplate] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("");
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [assistantName, setAssistantName] = useState<string>(
    promptId ? `${promptId.replace(/\./g, "_")}_assistant` : ""
  );
  const [resolvedPromptVersion, setResolvedPromptVersion] =
    useState<string>(promptVersion);
  const [submitNow, setSubmitNow] = useState<boolean>(false);
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    source: undefined,
    status: null,
    debit_tx_type: undefined,
    credit_tx_type: undefined,
    fallback_account_id: defaultAccountId || undefined,
  });

  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const [preview, setPreview] = useState<ExtractionPreview | null>(null);
  const [previewJson, setPreviewJson] = useState<string>("");
  const [importSummary, setImportSummary] =
    useState<BatchImportResponse | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      resetState();
      return;
    }

    resetState();
    setLoadingTemplate(true);
    setError(null);

    getAiPrompt(promptId)
      .then((p) => {
        setPromptTemplate(p.prompt_template);
        setPrompt(applyTemplate(p.prompt_template));
        setModel(p.model || DEFAULT_MODEL);
        setAssistantName(`${p.namespace}_${p.task}_assistant`);
        setResolvedPromptVersion(String(p.version ?? promptVersion));
      })
      .catch((err: Error) => {
        console.error(err);
        setPromptTemplate("");
        setPrompt("");
        setError(err.message || "Failed to load prompt template");
      })
      .finally(() => {
        setLoadingTemplate(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, promptId]);

  useEffect(() => {
    if (!isOpen) return;
    setImportOptions((prev) => ({
      ...prev,
      fallback_account_id: defaultAccountId || prev.fallback_account_id,
    }));
  }, [isOpen, defaultAccountId]);

  const warnings = useMemo(() => {
    if (!preview?.transactions?.length) return [] as string[];

    const counts = new Map<string, number>();
    preview.transactions.forEach((txn) => {
      if (defaultTxidPrefix && !txn.txid.startsWith(defaultTxidPrefix)) {
        increment(counts, "Transaction txid does not match expected prefix");
      }
      if (txn.account_id !== defaultAccountId) {
        increment(counts, "Account ID differs from statement default");
      }
      if (txn.direction !== "Debit" && txn.direction !== "Credit") {
        increment(counts, "Direction must be either Debit or Credit");
      }
      if (typeof txn.amount_or_qty !== "number" || txn.amount_or_qty <= 0) {
        increment(counts, "Amount must be a positive number");
      }
    });

    return Array.from(counts.entries()).map(([message, count]) =>
      count > 1 ? `${message} (${count})` : message
    );
  }, [preview, defaultAccountId, defaultTxidPrefix]);

  const auditIssues = preview?.audit?.issues ?? [];
  const auditAssumptions = preview?.audit?.assumptions ?? [];
  const auditSkipped = preview?.audit?.skipped_lines ?? [];

  function applyTemplate(template: string): string {
    return template
      .replace(/\{\{\s*account_id\s*\}\}/g, defaultAccountId || "")
      .replace(/\{\{\s*txid_prefix\s*\}\}/g, defaultTxidPrefix || "");
  }

  function resetState() {
    setPromptTemplate("");
    setPrompt("");
    setModel(DEFAULT_MODEL);
    setAssistantName(
      promptId ? `${promptId.replace(/\./g, "_")}_assistant` : ""
    );
    setResolvedPromptVersion(promptVersion);
    setSubmitNow(false);
    setImportOptions({
      source: undefined,
      status: null,
      debit_tx_type: undefined,
      credit_tx_type: undefined,
      fallback_account_id: defaultAccountId || undefined,
    });
    setError(null);
    setIsExtracting(false);
    setIsSubmitting(false);
    setIsImporting(false);
    setPreview(null);
    setPreviewJson("");
    setImportSummary(null);
    setToastMessage(null);
  }

  async function handleExtract(submit: boolean) {
    if (!prompt.trim()) {
      setError("Prompt cannot be empty");
      return;
    }

    setError(null);
    setImportSummary(null);
    setToastMessage(null);

    try {
      submit ? setIsSubmitting(true) : setIsExtracting(true);

      const response = await extractBankStatement({
        blob_id: blobId,
        doc_id: docId,
        prompt,
        prompt_id: promptId,
        prompt_version: resolvedPromptVersion,
        model,
        assistant_name: assistantName,
        import: submit
          ? {
              submit: true,
              source: importOptions.source,
              status:
                importOptions.status === ""
                  ? null
                  : importOptions.status ?? null,
              debit_tx_type: importOptions.debit_tx_type,
              credit_tx_type: importOptions.credit_tx_type,
              fallback_account_id: importOptions.fallback_account_id,
            }
          : undefined,
      });

      validateResponseShape(response);

      const normalized: ExtractionPreview = {
        transactions: Array.isArray(response.transactions)
          ? response.transactions
          : [],
        audit: response.audit,
        inferred_meta: response.inferred_meta,
        quality: response.quality,
        confidence: response.confidence,
        import_summary: response.import_summary,
      };

      setPreview(normalized);
      setPreviewJson(JSON.stringify(response, null, 2));
      setImportSummary(response.import_summary ?? null);

      if (response.import_summary) {
        setToastMessage(
          `Imported ${response.import_summary.imported} transactions, skipped ${response.import_summary.skipped}`
        );
        void fetchTransactions().catch((err) => {
          console.warn("Failed to refresh transactions", err);
        });
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Extraction failed");
    } finally {
      submit ? setIsSubmitting(false) : setIsExtracting(false);
    }
  }

  async function handleManualImport() {
    if (!preview?.transactions?.length) return;

    setIsImporting(true);
    setError(null);
    setToastMessage(null);
    setImportSummary(null);

    try {
      const result = await batchImportTransactions(preview.transactions);
      setImportSummary(result);
      setToastMessage(
        `Imported ${result.imported} transactions, skipped ${result.skipped}`
      );
      void fetchTransactions().catch((err) => {
        console.warn("Failed to refresh transactions", err);
      });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Import failed");
    } finally {
      setIsImporting(false);
    }
  }

  function closeAndReset() {
    resetState();
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeAndReset}
      title="Extract bank statement"
      subtitle={`doc ${docId}`}
      size="6xl"
    >
      <div className="space-y-6">
        {toastMessage && (
          <div className="rounded border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
            {toastMessage}
            <button
              className="ml-4 text-blue-600 underline"
              onClick={() => router.push("/capital")}
            >
              Open Capital
            </button>
          </div>
        )}

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {loadingTemplate ? (
          <div className="flex justify-center py-10">
            <Loader />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Prompt</span>
                <textarea
                  className="h-48 w-full rounded border border-gray-300 bg-white p-3 font-mono text-xs"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <button
                    type="button"
                    className="text-blue-600 hover:underline"
                    onClick={() => setPrompt(applyTemplate(promptTemplate))}
                    disabled={!promptTemplate}
                  >
                    Reset to template
                  </button>
                  <span>{prompt.length} chars</span>
                </div>
              </label>

              <div className="space-y-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Model</span>
                  <input
                    className="rounded border border-gray-300 p-2"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Assistant name</span>
                  <input
                    className="rounded border border-gray-300 p-2"
                    value={assistantName}
                    onChange={(e) => setAssistantName(e.target.value)}
                  />
                </label>
                <div className="space-y-2 rounded border border-gray-200 p-3 text-sm">
                  <div className="font-medium">Import options</div>
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={submitNow}
                      onChange={(e) => setSubmitNow(e.target.checked)}
                    />
                    Submit immediately after extraction
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      placeholder="source"
                      className="rounded border border-gray-300 p-2 text-xs"
                      value={importOptions.source ?? ""}
                      onChange={(e) =>
                        setImportOptions((prev) => ({
                          ...prev,
                          source: e.target.value || undefined,
                        }))
                      }
                    />
                    <input
                      placeholder="status"
                      className="rounded border border-gray-300 p-2 text-xs"
                      value={importOptions.status ?? ""}
                      onChange={(e) =>
                        setImportOptions((prev) => ({
                          ...prev,
                          status: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="debit_tx_type"
                      className="rounded border border-gray-300 p-2 text-xs"
                      value={importOptions.debit_tx_type ?? ""}
                      onChange={(e) =>
                        setImportOptions((prev) => ({
                          ...prev,
                          debit_tx_type: e.target.value || undefined,
                        }))
                      }
                    />
                    <input
                      placeholder="credit_tx_type"
                      className="rounded border border-gray-300 p-2 text-xs"
                      value={importOptions.credit_tx_type ?? ""}
                      onChange={(e) =>
                        setImportOptions((prev) => ({
                          ...prev,
                          credit_tx_type: e.target.value || undefined,
                        }))
                      }
                    />
                    <input
                      placeholder="fallback_account_id"
                      className="rounded border border-gray-300 p-2 text-xs"
                      value={importOptions.fallback_account_id ?? ""}
                      onChange={(e) =>
                        setImportOptions((prev) => ({
                          ...prev,
                          fallback_account_id: e.target.value || undefined,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                onClick={() => handleExtract(false)}
                disabled={isExtracting || isSubmitting}
              >
                {isExtracting ? "Extracting…" : "Extract"}
              </button>
              <button
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                onClick={() => handleExtract(true)}
                disabled={isExtracting || isSubmitting || !submitNow}
              >
                {isSubmitting ? "Submitting…" : "Submit now"}
              </button>
              <button
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                onClick={handleManualImport}
                disabled={
                  isImporting ||
                  isExtracting ||
                  isSubmitting ||
                  !preview?.transactions?.length
                }
              >
                {isImporting ? "Importing…" : "Import to ledger"}
              </button>
            </div>

            {preview && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                  <span>Transactions: {preview.transactions.length}</span>
                  <span>Quality: {preview.quality}</span>
                  <span>
                    Confidence: {Number(preview.confidence).toFixed(2)}
                  </span>
                </div>

                {warnings.length > 0 && (
                  <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                    <div className="font-semibold">Schema warnings</div>
                    <ul className="list-disc pl-5">
                      {warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <TransactionsTable rows={preview.transactions} />

                <details className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Audit details
                  </summary>
                  <div className="mt-3 space-y-3">
                    <AuditList title="Issues" items={auditIssues} />
                    <AuditList title="Assumptions" items={auditAssumptions} />
                    <AuditList title="Skipped lines" items={auditSkipped} />
                  </div>
                </details>

                <details className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Inferred metadata
                  </summary>
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-3 font-mono text-xs">
                    {JSON.stringify(preview.inferred_meta, null, 2)}
                  </pre>
                </details>

                <details className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Raw response
                  </summary>
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-3 font-mono text-xs">
                    {previewJson}
                  </pre>
                </details>

                {importSummary && (
                  <div className="space-y-2 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                    <div className="font-semibold">Import summary</div>
                    <div>
                      Imported {importSummary.imported}, skipped{" "}
                      {importSummary.skipped}
                    </div>
                    {importSummary.errors.length > 0 && (
                      <details>
                        <summary className="cursor-pointer underline">
                          View errors ({importSummary.errors.length})
                        </summary>
                        <ul className="mt-2 list-disc pl-5">
                          {importSummary.errors.map((err) => (
                            <li key={err}>{err}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button
            className="rounded border border-gray-300 px-4 py-2 text-sm"
            onClick={closeAndReset}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) || 0) + 1);
}

function validateResponseShape(data: any) {
  if (!data || typeof data !== "object") {
    throw new Error("Extraction response missing body");
  }
  if (!Array.isArray(data.transactions)) {
    throw new Error("Extraction response missing transactions array");
  }
  if (
    typeof data.audit === "undefined" ||
    typeof data.inferred_meta === "undefined" ||
    typeof data.quality === "undefined" ||
    typeof data.confidence === "undefined"
  ) {
    throw new Error("Extraction response missing required fields");
  }
}

function TransactionsTable({ rows }: { rows: FlatTransaction[] }) {
  if (!rows.length) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        No transactions returned.
      </div>
    );
  }

  const columns = [
    "txid",
    "date",
    "payee",
    "memo",
    "amount_or_qty",
    "direction",
    "account_id",
    "ccy_or_asset",
  ] as const;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-left font-medium uppercase tracking-wide text-xs text-gray-500"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((row, idx) => (
            <tr
              key={row.txid || idx}
              className={idx % 2 ? "bg-gray-50" : "bg-white"}
            >
              {columns.map((col) => (
                <td
                  key={col}
                  className={`px-3 py-2 ${
                    col === "amount_or_qty" ? "text-right" : "text-left"
                  }`}
                >
                  {renderValue(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderValue(value: any) {
  if (value == null || value === "")
    return <span className="text-gray-400">—</span>;
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function AuditList({ title, items }: { title: string; items: any[] }) {
  if (!items || items.length === 0) {
    return (
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-gray-500">None</div>
      </div>
    );
  }

  return (
    <div>
      <div className="font-semibold">{title}</div>
      <ul className="list-disc pl-5 text-xs text-gray-600">
        {items.map((item, idx) => (
          <li key={`${title}-${idx}`}>{renderAuditValue(item)}</li>
        ))}
      </ul>
    </div>
  );
}

function renderAuditValue(value: any) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
