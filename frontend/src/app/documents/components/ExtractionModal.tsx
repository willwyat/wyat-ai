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
  listExtractionRuns,
  getExtractionRun,
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

  // Editable draft of transactions + live reconciliation
  const [draftRows, setDraftRows] = useState<FlatTransaction[]>([]);
  const [confirmed, setConfirmed] = useState<boolean[]>([]);
  const [recon, setRecon] = useState<{
    sumCredits: number;
    sumDebits: number;
    net: number;
    expected: number;
    diff: number;
  }>({ sumCredits: 0, sumDebits: 0, net: 0, expected: 0, diff: 0 });

  // Previous extraction runs
  const [runs, setRuns] = useState<
    Array<{
      _id: string;
      created_at: number;
      status: string;
      quality?: string;
      confidence?: number;
    }>
  >([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

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

  // Bulk append input state
  const [bulkText, setBulkText] = useState<string>("");
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Fetch previous runs on open
  useEffect(() => {
    if (!isOpen) return;
    setRunsLoading(true);
    listExtractionRuns(docId)
      .then(async (r) => {
        setRuns(r || []);
        if (r && r.length > 0) {
          setSelectedRunId(r[0]._id);
          try {
            const detail = await getExtractionRun(r[0]._id);
            const parsed = JSON.parse(detail.response_text || "{}");
            const normalized: ExtractionPreview = {
              transactions: parsed.transactions ?? [],
              audit: parsed.audit ?? {},
              inferred_meta: parsed.inferred_meta ?? {},
              quality: detail.quality ?? "unknown",
              confidence: detail.confidence ?? 0,
            };
            setPreview(normalized);
            setPreviewJson(JSON.stringify(parsed, null, 2));
            setDraftRows(normalized.transactions);
            setConfirmed(
              new Array((normalized.transactions || []).length).fill(false)
            );
          } catch (err) {
            console.warn("Failed to load latest extraction run", err);
          }
        }
      })
      .finally(() => setRunsLoading(false));
  }, [isOpen, docId]);

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
    setDraftRows([]);
    setRecon({ sumCredits: 0, sumDebits: 0, net: 0, expected: 0, diff: 0 });
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

      console.log("Raw extraction response:", response);

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

      console.log("Normalized preview:", normalized);
      console.log("Setting draftRows to:", normalized.transactions);

      setPreview(normalized);
      setPreviewJson(JSON.stringify(response, null, 2));
      setImportSummary(response.import_summary ?? null);
      setDraftRows(normalized.transactions);
      setConfirmed(
        new Array((normalized.transactions || []).length).fill(false)
      );

      console.log("State updated - preview:", normalized);
      console.log(
        "State updated - previewJson length:",
        JSON.stringify(response, null, 2).length
      );
      console.log(
        "State updated - draftRows count:",
        normalized.transactions.length
      );

      // Refresh the runs list to include the new extraction
      listExtractionRuns(docId)
        .then((r) => {
          setRuns(r || []);
          if (r && r.length > 0) {
            setSelectedRunId(r[0]._id);
          }
        })
        .catch((err) => {
          console.warn("Failed to refresh extraction runs", err);
        });

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

  // Recompute reconciliation whenever draftRows or inferred_meta change
  useEffect(() => {
    if (!preview) return;
    const opening = Number(preview.inferred_meta?.opening_balance ?? 0);
    const closing = Number(preview.inferred_meta?.closing_balance ?? 0);
    const expected = closing - opening;
    let sumCredits = 0;
    let sumDebits = 0;
    for (const r of draftRows) {
      const amt = Number((r as any)?.amount_or_qty ?? 0);
      const dir = String((r as any)?.direction ?? "").toLowerCase();
      if (dir === "credit") sumCredits += amt;
      if (dir === "debit") sumDebits += amt;
    }
    const net = sumCredits - sumDebits;
    setRecon({
      sumCredits,
      sumDebits,
      net,
      expected,
      diff: Math.abs(net - expected),
    });
  }, [draftRows, preview]);

  async function handleManualImport() {
    if (!draftRows?.length) return;

    setIsImporting(true);
    setError(null);
    setToastMessage(null);
    setImportSummary(null);

    try {
      const result = await batchImportTransactions(draftRows);
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

  // Note: The ExtractionModal is for extracting and importing transactions from documents.
  // For editing existing transactions in the system, use the TransactionModal in the Capital page.
  // The endpoints PATCH /capital/transactions/:id/legs and POST /capital/transactions/:id/balance
  // are available for transaction editing and balancing in other parts of the application.

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

            {/* Previous runs */}
            <div className="rounded border border-gray-200 p-3">
              <div className="mb-2 text-sm font-medium">Previous runs</div>
              {runsLoading ? (
                <div className="text-sm text-gray-500">Loading runs…</div>
              ) : runs.length === 0 ? (
                <div className="text-sm text-gray-500">No previous runs</div>
              ) : (
                <div className="max-h-40 overflow-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left">Created</th>
                        <th className="px-2 py-1 text-left">Quality</th>
                        <th className="px-2 py-1 text-left">Conf.</th>
                        <th className="px-2 py-1 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {runs.map((r) => (
                        <tr
                          key={r._id}
                          className={`cursor-pointer ${
                            selectedRunId === r._id ? "bg-blue-50" : ""
                          }`}
                          onClick={async () => {
                            setSelectedRunId(r._id);
                            const detail = await getExtractionRun(r._id);
                            const parsed = JSON.parse(
                              detail.response_text || "{}"
                            );
                            const normalized: ExtractionPreview = {
                              transactions: parsed.transactions ?? [],
                              audit: parsed.audit ?? {},
                              inferred_meta: parsed.inferred_meta ?? {},
                              quality: detail.quality ?? "unknown",
                              confidence: detail.confidence ?? 0,
                            };
                            setPreview(normalized);
                            setPreviewJson(JSON.stringify(parsed, null, 2));
                            setDraftRows(normalized.transactions);
                          }}
                        >
                          <td>
                            {new Date(
                              (r.created_at || 0) * 1000
                            ).toLocaleString()}
                          </td>
                          <td>{r.quality ?? "—"}</td>
                          <td>
                            {typeof r.confidence === "number"
                              ? r.confidence.toFixed(2)
                              : "—"}
                          </td>
                          <td>{r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
                  !draftRows?.length
                  // || recon.diff > 0.01  // Temporarily disabled for partial-period statements
                }
              >
                {isImporting ? "Importing…" : "Import edited rows"}
              </button>
              <button
                className="rounded border border-gray-300 px-3 py-2 text-xs"
                onClick={() => {
                  const rows = preview?.transactions || [];
                  setDraftRows(rows);
                  setConfirmed(new Array(rows.length).fill(false));
                }}
                disabled={!preview?.transactions?.length}
              >
                Reset to extracted
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

                {/* Bulk append helper */}
                <details className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Append transactions (JSON array or CSV)
                  </summary>
                  <div className="mt-2 space-y-2">
                    <textarea
                      className="w-full h-28 rounded border border-gray-300 bg-white p-2 font-mono text-xs"
                      placeholder="CSV example: txid,date,account_id,direction,kind,ccy_or_asset,amount_or_qty\nTX-1,2025-09-01,acct.id,Debit,Fiat,USD,12.34"
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                    />
                    {bulkError && (
                      <div className="text-xs text-red-600">{bulkError}</div>
                    )}
                    <button
                      className="rounded bg-gray-800 px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                      onClick={() => {
                        try {
                          setBulkError(null);
                          const parsed = parseBulkTransactions(bulkText);
                          if (!parsed.length) {
                            setBulkError("No valid rows parsed");
                            return;
                          }
                          setDraftRows((prev) => [...prev, ...parsed]);
                          setConfirmed((prev) => [
                            ...prev,
                            ...new Array(parsed.length).fill(false),
                          ]);
                          setBulkText("");
                        } catch (e: any) {
                          setBulkError(e?.message || "Failed to parse input");
                        }
                      }}
                      disabled={!bulkText.trim()}
                    >
                      Parse & Append
                    </button>
                  </div>
                </details>

                {/* Editable transactions + reconciliation */}
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
                  <span>Credits: {recon.sumCredits.toFixed(2)}</span>
                  <span>Debits: {recon.sumDebits.toFixed(2)}</span>
                  <span>Net: {recon.net.toFixed(2)}</span>
                  <span>Expected: {recon.expected.toFixed(2)}</span>
                  <span
                    className={
                      recon.diff <= 0.01 ? "text-green-600" : "text-red-600"
                    }
                  >
                    Difference: {recon.diff.toFixed(2)}
                  </span>
                </div>
                <EditableTransactionsTable
                  rows={draftRows}
                  confirmed={confirmed}
                  onChange={(idx, patch) =>
                    setDraftRows((prev) => {
                      const next = [...prev];
                      next[idx] = { ...next[idx], ...patch } as FlatTransaction;
                      return next;
                    })
                  }
                  onToggleConfirmed={(idx, value) =>
                    setConfirmed((prev) => {
                      const next = [...prev];
                      next[idx] = value;
                      return next;
                    })
                  }
                  onAdd={() => {
                    setDraftRows((prev) => [
                      ...prev,
                      {
                        txid: "",
                        date: "",
                        payee: "",
                        memo: "",
                        amount_or_qty: 0,
                        direction: "Debit",
                        account_id: preview?.inferred_meta?.account_id || "",
                        kind: "Fiat",
                        ccy_or_asset: "USD",
                      } as FlatTransaction,
                    ]);
                    setConfirmed((prev) => [...prev, false]);
                  }}
                  onDelete={(idx) => {
                    setDraftRows((prev) => prev.filter((_, i) => i !== idx));
                    setConfirmed((prev) => prev.filter((_, i) => i !== idx));
                  }}
                />

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
  console.log("Validating response shape:", data);

  if (!data || typeof data !== "object") {
    console.error("Response is not an object:", data);
    throw new Error("Extraction response missing body");
  }

  if (!Array.isArray(data.transactions)) {
    console.error("Transactions is not an array:", data.transactions);
    throw new Error("Extraction response missing transactions array");
  }

  // Make these fields optional with defaults
  if (typeof data.audit === "undefined") {
    console.warn("Missing audit field, using empty object");
    data.audit = {};
  }
  if (typeof data.inferred_meta === "undefined") {
    console.warn("Missing inferred_meta field, using empty object");
    data.inferred_meta = {};
  }
  if (typeof data.quality === "undefined") {
    console.warn("Missing quality field, using 'unknown'");
    data.quality = "unknown";
  }
  if (typeof data.confidence === "undefined") {
    console.warn("Missing confidence field, using 0");
    data.confidence = 0;
  }

  console.log("Validation passed");
}

function EditableTransactionsTable({
  rows,
  confirmed,
  onChange,
  onToggleConfirmed,
  onAdd,
  onDelete,
}: {
  rows: FlatTransaction[];
  confirmed: boolean[];
  onChange: (idx: number, patch: Partial<FlatTransaction>) => void;
  onToggleConfirmed: (idx: number, value: boolean) => void;
  onAdd: () => void;
  onDelete: (idx: number) => void;
}) {
  const cols = [
    { key: "txid", type: "text" },
    { key: "date", type: "text" },
    { key: "payee", type: "text" },
    { key: "memo", type: "text" },
    { key: "amount_or_qty", type: "number" },
    { key: "direction", type: "select", options: ["Debit", "Credit"] },
    { key: "account_id", type: "text" },
    { key: "ccy_or_asset", type: "text" },
    { key: "tx_type", type: "text" },
  ] as const;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium uppercase tracking-wide text-xs text-gray-500 sticky left-0 bg-gray-50 z-10">
              Confirmed
            </th>
            {cols.map((c) => (
              <th
                key={String(c.key)}
                className="px-3 py-2 text-left font-medium uppercase tracking-wide text-xs text-gray-500"
              >
                {String(c.key)}
              </th>
            ))}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((r, i) => (
            <tr key={r.txid || i}>
              <td className="px-3 py-2 sticky left-0 bg-white z-10">
                <input
                  type="checkbox"
                  checked={!!confirmed[i]}
                  onChange={(e) => onToggleConfirmed(i, e.target.checked)}
                />
              </td>
              {cols.map((c) => (
                <td key={String(c.key)} className="px-3 py-2">
                  {c.type === "select" ? (
                    <select
                      className="border rounded px-2 py-1 text-xs"
                      value={(r as any)[c.key] ?? ""}
                      onChange={(e) =>
                        onChange(i, { [c.key]: e.target.value } as any)
                      }
                      disabled={!!confirmed[i]}
                    >
                      <option value="" />
                      {c.options?.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="border rounded px-2 py-1 text-xs w-40"
                      type={c.type}
                      value={
                        c.type === "number"
                          ? String((r as any)[c.key] ?? "")
                          : (r as any)[c.key] ?? ""
                      }
                      onChange={(e) =>
                        onChange(i, {
                          [c.key]:
                            c.type === "number"
                              ? Number(e.target.value || 0)
                              : e.target.value,
                        } as any)
                      }
                      disabled={!!confirmed[i]}
                    />
                  )}
                </td>
              ))}
              <td className="px-3 py-2">
                <button
                  className="text-red-600 text-xs"
                  onClick={() => onDelete(i)}
                  disabled={!!confirmed[i]}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2">
        <button className="text-blue-600 text-xs" onClick={onAdd}>
          + Add row
        </button>
      </div>
    </div>
  );
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
  if (typeof value === "number") return value.toLocaleString();
  return JSON.stringify(value);
}

// Accept JSON array of FlatTransaction or minimal CSV with header
function parseBulkTransactions(input: string): FlatTransaction[] {
  const text = input.trim();
  if (!text) return [];
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json)) {
      return json
        .map((r: any) => sanitizeFlat(r))
        .filter((r: any) => r && typeof r.txid === "string");
    }
  } catch {}

  // CSV path
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const required = [
    "txid",
    "date",
    "account_id",
    "direction",
    "kind",
    "ccy_or_asset",
    "amount_or_qty",
  ];
  const hasAll = required.every((k) => header.includes(k));
  if (!hasAll) {
    throw new Error(`CSV header must include: ${required.join(", ")}`);
  }
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows: FlatTransaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < header.length) continue;
    const row = sanitizeFlat({
      txid: cols[idx["txid"]] || "",
      date: cols[idx["date"]] || "",
      account_id: cols[idx["account_id"]] || "",
      direction: cols[idx["direction"]] || "",
      kind: cols[idx["kind"]] || "",
      ccy_or_asset: cols[idx["ccy_or_asset"]] || "USD",
      amount_or_qty: Number(cols[idx["amount_or_qty"]] || 0),
      payee: cols[idx["payee"]] || undefined,
      memo: cols[idx["memo"]] || undefined,
    });
    rows.push(row);
  }
  return rows;
}

function sanitizeFlat(anyRow: any): FlatTransaction {
  return {
    txid: String(anyRow.txid ?? ""),
    date: String(anyRow.date ?? ""),
    posted_ts:
      typeof anyRow.posted_ts === "number" ? anyRow.posted_ts : undefined,
    source: String(anyRow.source ?? "assistant_extraction"),
    payee:
      typeof anyRow.payee === "string" && anyRow.payee.trim() !== ""
        ? anyRow.payee
        : undefined,
    memo:
      typeof anyRow.memo === "string" && anyRow.memo.trim() !== ""
        ? anyRow.memo
        : undefined,
    account_id: String(anyRow.account_id ?? ""),
    direction:
      String(anyRow.direction ?? "Debit").toLowerCase() === "credit"
        ? "Credit"
        : "Debit",
    kind:
      String(anyRow.kind ?? "Fiat").toLowerCase() === "crypto"
        ? "Crypto"
        : "Fiat",
    ccy_or_asset: String(anyRow.ccy_or_asset ?? "USD"),
    amount_or_qty: Number(anyRow.amount_or_qty ?? 0),
    price: typeof anyRow.price === "number" ? Number(anyRow.price) : undefined,
    price_ccy:
      typeof anyRow.price_ccy === "string" && anyRow.price_ccy.trim() !== ""
        ? anyRow.price_ccy
        : undefined,
    category_id:
      typeof anyRow.category_id === "string" && anyRow.category_id.trim() !== ""
        ? anyRow.category_id
        : undefined,
    status:
      typeof anyRow.status === "string" && anyRow.status.trim() !== ""
        ? anyRow.status
        : undefined,
    tx_type:
      typeof anyRow.tx_type === "string" && anyRow.tx_type.trim() !== ""
        ? anyRow.tx_type
        : undefined,
    ext1_kind:
      typeof anyRow.ext1_kind === "string" && anyRow.ext1_kind.trim() !== ""
        ? anyRow.ext1_kind
        : undefined,
    ext1_val:
      typeof anyRow.ext1_val === "string" && anyRow.ext1_val.trim() !== ""
        ? anyRow.ext1_val
        : undefined,
  } as FlatTransaction;
}

// Simple CSV splitter handling quoted commas
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result.map((s) => s.trim());
}
