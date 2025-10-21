"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  useCapitalStore,
  type ImportResponse,
  type DocumentInfo,
  type ListDocumentsResponse,
} from "@/stores/capital-store";
import { Document as PDFDocument, Page as PDFPage, pdfjs } from "react-pdf";
import Modal from "@/components/Modal";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Set up PDF.js worker - use a CDN that works better with modern bundlers
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

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

function getBlobId(blobId: string | { $oid: string }): string {
  return typeof blobId === "string" ? blobId : blobId.$oid;
}

export default function DocumentPage() {
  const { createDocument, listDocuments } = useCapitalStore();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Document list state
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  // PDF viewer modal state
  const [viewingDoc, setViewingDoc] = useState<DocumentInfo | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);

  // Memoize PDF options to prevent unnecessary reloads
  const pdfOptions = useMemo(() => ({ withCredentials: true }), []);

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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);

  // Step 3 – import preview (not used in refactored flow)
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResp, setImportResp] = useState<ImportResp | null>(null);

  const blobId = useMemo(
    () => (blob?.id || (blob as any)?._id) as string | undefined,
    [blob]
  );

  // Fetch documents on mount and after creation
  async function fetchDocuments() {
    setLoadingDocs(true);
    setDocsError(null);
    try {
      const result = await listDocuments({ namespace: "capital" });
      setDocuments(result.documents);
    } catch (e: any) {
      setDocsError(e?.message || "Failed to load documents");
    } finally {
      setLoadingDocs(false);
    }
  }

  useEffect(() => {
    fetchDocuments();
  }, []);

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

  async function handleCreateDocument() {
    if (!blobId) {
      setCreateError("Missing blob_id");
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      const data = await createDocument({
        blob_id: blobId,
        namespace,
        kind,
        title: title || "Bank Statement",
      });

      setDocId(data.doc.doc_id);
      setStep(3);

      // Refresh the documents list
      await fetchDocuments();
    } catch (e: any) {
      setCreateError(e?.message || "Create document failed");
    } finally {
      setCreating(false);
    }
  }

  function resetFlow() {
    setStep(1);
    setFile(null);
    setBlob(null);
    setManualBlobId("");
    setImportResp(null);
    setDocId(null);
    setUploadError(null);
    setImportError(null);
    setCreateError(null);
    setTitle("");
    setNamespace("capital");
    setKind("bank_statement");
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
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
              {n === 1 ? "Upload PDF" : n === 2 ? "Details" : "Created"}
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

          {createError && <p className="text-red-600 text-sm">{createError}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 rounded border border-gray-300"
            >
              Back
            </button>
            <button
              onClick={handleCreateDocument}
              disabled={!blobId || creating}
              className={classNames(
                "px-4 py-2 rounded text-white",
                creating ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"
              )}
            >
              {creating ? "Creating…" : "Create Document"}
            </button>
          </div>

          {blob && (
            <div className="text-xs text-gray-600 mt-2">
              Blob ID: {blobId} • SHA256: {blob.sha256}
            </div>
          )}
        </div>
      )}

      {step === 3 && docId && (
        <div className="space-y-6">
          <div className="rounded border p-4">
            <h2 className="font-medium mb-2">Document Created</h2>
            <div className="text-sm text-gray-700">
              <div>
                <span className="font-semibold">doc_id:</span> {docId}
              </div>
              <div>
                <span className="font-semibold">namespace:</span> {namespace}
              </div>
              <div>
                <span className="font-semibold">kind:</span> {kind}
              </div>
              <div>
                <span className="font-semibold">title:</span> {title}
              </div>
              <div>
                <span className="font-semibold">status:</span> uploaded
              </div>
            </div>
          </div>

          <div className="rounded border p-4 bg-blue-50 dark:bg-blue-900/20">
            <h2 className="font-medium mb-2 text-blue-900 dark:text-blue-100">
              Next Steps
            </h2>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Document has been created successfully. To extract and import
              transactions, you can now use the import endpoint separately with
              doc_id:{" "}
              <code className="font-mono bg-white dark:bg-gray-800 px-1 py-0.5 rounded">
                {docId}
              </code>
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={resetFlow}
              className="px-4 py-2 rounded border border-gray-300"
            >
              Create another document
            </button>
          </div>
        </div>
      )}

      {/* Document List */}
      <div className="mt-12">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Documents</h2>
          <button
            onClick={fetchDocuments}
            disabled={loadingDocs}
            className="px-3 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingDocs ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {docsError && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {docsError}
          </div>
        )}

        {loadingDocs && documents.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Loading documents...
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-8 text-gray-500 border border-gray-200 rounded">
            No documents found. Upload a PDF above to get started.
          </div>
        ) : (
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Kind
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Doc ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {documents.map((doc) => (
                  <tr key={doc.doc_id || doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {doc.title}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{doc.kind}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={classNames(
                          "px-2 inline-flex text-xs leading-5 font-semibold rounded-full",
                          doc.status.ingest === "parsed"
                            ? "bg-green-100 text-green-800"
                            : doc.status.ingest === "uploaded"
                            ? "bg-yellow-100 text-yellow-800"
                            : doc.status.error
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-800"
                        )}
                      >
                        {doc.status.ingest}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {new Date(doc.created_at * 1000).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs font-mono text-gray-500">
                        {doc.doc_id}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setViewingDoc(doc);
                            setPageNumber(1);
                          }}
                          className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          <svg
                            className="w-4 h-4 mr-1"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                          View
                        </button>
                        <a
                          href={`${BACKEND_URL}/blobs/${getBlobId(
                            doc.blob_id
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={`${doc.title}.pdf`}
                          className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          <svg
                            className="w-4 h-4 mr-1"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                          Download
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 text-sm text-gray-500">
          Showing {documents.length} document{documents.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* PDF Viewer Modal */}
      <Modal
        isOpen={!!viewingDoc}
        onClose={() => setViewingDoc(null)}
        title={viewingDoc?.title}
        subtitle={
          viewingDoc ? `${viewingDoc.kind} • ${viewingDoc.doc_id}` : undefined
        }
        size="4xl"
        fullHeight
        contentClassName="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900 p-4"
      >
        <div className="flex justify-center">
          {viewingDoc && (
            <PDFDocument
              file={`${BACKEND_URL}/blobs/${getBlobId(viewingDoc.blob_id)}`}
              options={pdfOptions}
              onLoadSuccess={({ numPages }: { numPages: number }) =>
                setNumPages(numPages)
              }
              loading={
                <div className="text-center py-8 text-gray-500">
                  Loading PDF...
                </div>
              }
              error={
                <div className="text-center py-8 text-red-600">
                  Failed to load PDF. Please try again.
                </div>
              }
            >
              <PDFPage
                pageNumber={pageNumber}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="shadow-lg"
              />
            </PDFDocument>
          )}
        </div>
      </Modal>
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
