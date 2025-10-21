"use client";

import React, { useMemo, useState } from "react";
import { useCapitalStore, type ImportResponse } from "@/stores/capital-store";

type BlobResponse = {
  id?: string;
  _id?: string;
  sha256?: string;
  size_bytes?: number;
  content_type?: string;
};

type ImportResp = ImportResponse;

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ||
  "http://localhost:3001";

function classNames(...xs: (string | false | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

export default function DocumentPage() {
  const { importBankStatement } = useCapitalStore();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 – file upload
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [blob, setBlob] = useState<BlobResponse | null>(null);
  const [manualBlobId, setManualBlobId] = useState("");

  // Step 2 – document details
  const [namespace, setNamespace] = useState("capital");
  const [kind, setKind] = useState("bank_statement");
  const [title, setTitle] = useState("");

  // Step 3 – import preview
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResp, setImportResp] = useState<ImportResp | null>(null);

  const blobId = useMemo(
    () => (blob?.id || (blob as any)?._id) as string | undefined,
    [blob]
  );

  function filenameBase(name: string) {
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(0, i) : name;
  }

  async function handleUpload() {
    setUploadError(null);
    if (!file) {
      setUploadError("Please choose a PDF to upload.");
      return;
    }
    setUploading(true);
    try {
      // POST /blobs expects the raw file bytes with Content-Type set to the file type.
      const res = await fetch(`${BACKEND_URL}/blobs`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/pdf",
          Accept: "application/json",
        },
        body: file,
        credentials: "include",
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upload failed (${res.status}): ${text}`);
      }

      const data: BlobResponse = await res.json();
      setBlob(data);
      if (!title) {
        setTitle(filenameBase(file.name));
      }
      setStep(2);
    } catch (e: any) {
      setUploadError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleSkipToDetails() {
    if (!manualBlobId.trim()) {
      setUploadError("Please enter a blob ID");
      return;
    }
    setBlob({ id: manualBlobId.trim() });
    setStep(2);
  }

  async function handleImport() {
    if (!blobId) {
      setImportError("Missing blob_id");
      return;
    }
    setImportError(null);
    setImporting(true);
    try {
      const data = await importBankStatement({
        blob_id: blobId,
        namespace,
        kind,
        title: title || "Bank Statement",
      });

      setImportResp(data);
      setStep(3);
    } catch (e: any) {
      setImportError(e?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function resetFlow() {
    setStep(1);
    setFile(null);
    setBlob(null);
    setManualBlobId("");
    setImportResp(null);
    setUploadError(null);
    setImportError(null);
    setTitle("");
    setNamespace("capital");
    setKind("bank_statement");
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-6">Documents</h1>

      <ol className="flex items-center w-full mb-8">
        {[1, 2, 3].map((n) => (
          <li key={n} className="flex-1">
            <div
              className={classNames(
                "h-1 rounded",
                step >= (n as 1 | 2 | 3) ? "bg-blue-600" : "bg-gray-200"
              )}
            />
            <div className="text-xs text-gray-600 mt-2 text-center">
              {n === 1 ? "Upload PDF" : n === 2 ? "Details" : "Preview"}
            </div>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="rounded border p-4 space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Bank statement PDF
            </label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setFile(f);
                if (f && !title) setTitle(filenameBase(f.name));
              }}
              className="block w-full border border-gray-300 rounded p-2"
            />
            {uploadError && (
              <p className="text-red-600 text-sm mt-2">{uploadError}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className={classNames(
                  "px-4 py-2 rounded text-white",
                  uploading ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"
                )}
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
              {blob && (
                <span className="text-sm text-gray-600">
                  Uploaded blob: {(blob.id || (blob as any)?._id) as string}
                </span>
              )}
            </div>
          </div>

          <div className="border-t pt-6">
            <p className="text-sm font-medium mb-2 text-gray-700">
              Or use an existing blob ID
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Enter blob ID (e.g., 67a1b2c3d4e5f6789abcdef0)"
                value={manualBlobId}
                onChange={(e) => setManualBlobId(e.target.value)}
                className="flex-1 border border-gray-300 rounded p-2 text-sm font-mono"
              />
              <button
                onClick={handleSkipToDetails}
                disabled={!manualBlobId.trim()}
                className={classNames(
                  "px-4 py-2 rounded text-white",
                  !manualBlobId.trim()
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                )}
              >
                Skip to Details
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="rounded border p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Namespace
              </label>
              <input
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                className="w-full border border-gray-300 rounded p-2"
              />
              <p className="text-xs text-gray-500 mt-1">Usually "capital"</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Kind</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full border border-gray-300 rounded p-2"
              >
                <option value="bank_statement">bank_statement</option>
                <option value="invoice">invoice</option>
                <option value="receipt">receipt</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Chase Statement Oct 2025"
                className="w-full border border-gray-300 rounded p-2"
              />
            </div>
          </div>

          {importError && <p className="text-red-600 text-sm">{importError}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 rounded border border-gray-300"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={!blobId || importing}
              className={classNames(
                "px-4 py-2 rounded text-white",
                importing ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"
              )}
            >
              {importing ? "Processing…" : "Next: Extract & Preview"}
            </button>
          </div>

          {blob && (
            <div className="text-xs text-gray-600 mt-2">
              Blob ID: {blobId} • SHA256: {blob.sha256}
            </div>
          )}
        </div>
      )}

      {step === 3 && importResp && (
        <div className="space-y-6">
          <div className="rounded border p-4">
            <h2 className="font-medium mb-2">Document</h2>
            <div className="text-sm text-gray-700">
              <div>
                <span className="font-semibold">doc_id:</span>{" "}
                {importResp.doc.doc_id}
              </div>
              <div>
                <span className="font-semibold">status:</span>{" "}
                {importResp.doc.status.ingest}
              </div>
              {importResp.doc.status.error && (
                <div className="text-red-600">
                  Error: {importResp.doc.status.error}
                </div>
              )}
            </div>
          </div>

          <div className="rounded border p-4 overflow-x-auto">
            <h2 className="font-medium mb-3">Preview (first rows)</h2>
            {importResp.rows_preview.length === 0 ? (
              <p className="text-sm text-gray-600">No rows returned.</p>
            ) : (
              <PreviewTable rows={importResp.rows_preview} />
            )}
          </div>

          <div className="rounded border p-4">
            <h2 className="font-medium mb-2">Audit</h2>
            <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
              {JSON.stringify(importResp.audit, null, 2)}
            </pre>
          </div>

          <div className="flex gap-3">
            <button
              onClick={resetFlow}
              className="px-4 py-2 rounded border border-gray-300"
            >
              Upload another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewTable({ rows }: { rows: Record<string, any>[] }) {
  // Build dynamic columns from union of keys in the first few rows
  const cols = useMemo(() => {
    const set = new Set<string>();
    rows.slice(0, 5).forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
    return Array.from(set);
  }, [rows]);

  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr className="bg-gray-50 text-left">
          {cols.map((c) => (
            <th
              key={c}
              className="px-3 py-2 font-medium text-gray-700 border-b"
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={i % 2 ? "bg-white" : "bg-gray-50"}>
            {cols.map((c) => (
              <td key={c} className="px-3 py-2 border-b align-top">
                {renderCell(r[c])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderCell(v: any) {
  if (v == null) return <span className="text-gray-400">—</span>;
  if (typeof v === "object")
    return <code className="text-xs">{JSON.stringify(v)}</code>;
  return String(v);
}
