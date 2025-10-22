import { create } from "zustand";
import { API_URL } from "@/lib/config";

const API_CONFIG = {
  BASE_URL: API_URL,
};

// ==================
// Types
// ==================

export interface DocumentInfo {
  _id: { $oid: string };
  doc_id: string;
  namespace: string;
  kind: string;
  title: string;
  blob_id: string | { $oid: string };
  sha256: string;
  size_bytes: number;
  content_type: string;
  metadata: Record<string, any>;
  status: {
    ingest: string;
    error: string | null;
  };
  created_at: number;
  updated_at: number;
}

export interface ListDocumentsQuery {
  namespace?: string;
  kind?: string;
  limit?: number;
}

export interface ListDocumentsResponse {
  documents: DocumentInfo[];
  count: number;
}

export interface ImportRequest {
  blob_id: string;
  namespace?: string;
  kind?: string;
  title?: string;
  account_id?: string; // e.g., "acct.chase_w_checking"
}

export interface ImportResponse {
  doc: DocumentInfo;
  csv_blob_id: string;
  audit: any;
  rows_preview: any[];
}

// ==================
// Store
// ==================

interface DocumentState {
  // Data
  documents: DocumentInfo[];

  // UI State
  loading: boolean;
  error: string | null;

  // Actions - Documents
  listDocuments: (query?: ListDocumentsQuery) => Promise<ListDocumentsResponse>;
  getDocument: (docId: string) => Promise<DocumentInfo>;
  createDocument: (request: ImportRequest) => Promise<{ doc: DocumentInfo }>;
  importBankStatement: (request: ImportRequest) => Promise<ImportResponse>;

  // Actions - UI State
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useDocumentStore = create<DocumentState>()((set, get) => ({
  // Initial State
  documents: [],
  loading: false,
  error: null,

  // Documents Actions
  listDocuments: async (query?: ListDocumentsQuery) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (query?.namespace) params.append("namespace", query.namespace);
      if (query?.kind) params.append("kind", query.kind);
      if (query?.limit) params.append("limit", query.limit.toString());

      const url = `${
        API_CONFIG.BASE_URL
      }/capital/documents?${params.toString()}`;
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(
          `Failed to list documents: ${response.status} ${response.statusText}`
        );
      }

      const data: ListDocumentsResponse = await response.json();
      set({ documents: data.documents, loading: false });
      return data;
    } catch (error: any) {
      const errorMsg = error?.message || "Failed to list documents";
      set({ error: errorMsg, loading: false });
      throw error;
    }
  },

  getDocument: async (docId: string) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/capital/documents/${docId}`,
        {
          method: "GET",
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to get document: ${response.status} ${response.statusText}`
        );
      }

      const doc = await response.json();
      set({ loading: false });
      return doc;
    } catch (error: any) {
      const errorMsg = error?.message || "Failed to get document";
      set({ error: errorMsg, loading: false });
      throw error;
    }
  },

  createDocument: async (request: ImportRequest) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/capital/documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          blob_id: request.blob_id,
          namespace: request.namespace || "capital",
          kind: request.kind || "bank_statement",
          title: request.title || "Bank Statement",
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Create document failed (${response.status}): ${text}`);
      }

      const data: { doc: DocumentInfo } = await response.json();
      set({ loading: false });
      return data;
    } catch (error: any) {
      const errorMsg = error?.message || "Failed to create document";
      set({ error: errorMsg, loading: false });
      throw error;
    }
  },

  importBankStatement: async (request: ImportRequest) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/capital/documents/import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            blob_id: request.blob_id,
            namespace: request.namespace || "capital",
            kind: request.kind || "bank_statement",
            title: request.title || "Bank Statement",
            account_id: request.account_id,
          }),
          credentials: "include",
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Import failed (${response.status}): ${text}`);
      }

      const data: ImportResponse = await response.json();
      set({ loading: false });
      return data;
    } catch (error: any) {
      const errorMsg = error?.message || "Failed to import bank statement";
      set({ error: errorMsg, loading: false });
      throw error;
    }
  },

  // UI State Actions
  setLoading: (loading: boolean) => set({ loading }),
  setError: (error: string | null) => set({ error }),
  clearError: () => set({ error: null }),
}));
