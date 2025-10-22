import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { API_CONFIG } from "@/app/capital/config";
import type {
  Transaction,
  Envelope,
  Account,
  TransactionQuery,
  CycleList,
  EnvelopeUsage,
} from "@/app/capital/types";

// AI Prompt Types
export interface AiPrompt {
  _id: { $oid: string };
  id: string;
  namespace: string;
  task: string;
  version: number;
  description?: string;
  model?: string;
  prompt_template: string;
  prompt_variables?: string[];
  created_at?: { $date: { $numberLong: string } };
  updated_at?: { $date: { $numberLong: string } };
}

// Document Import Types
export interface ImportRequest {
  blob_id: string;
  namespace?: string;
  kind?: string;
  title?: string;
  account_id?: string; // e.g., "acct.chase_w_checking"
}

export interface DocumentInfo {
  id: string;
  doc_id: string;
  namespace: string;
  kind: string;
  title: string;
  blob_id: string | { $oid: string };
  sha256: string;
  size_bytes: number;
  content_type: string;
  status: { ingest: string; error?: string | null };
  metadata?: Record<string, any>;
  created_at: number;
  updated_at: number;
}

export interface ImportResponse {
  doc: DocumentInfo;
  csv_blob_id: string;
  audit: Record<string, any>;
  rows_preview: Record<string, any>[];
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

interface CapitalState {
  // Data
  transactions: Transaction[];
  envelopes: Envelope[];
  accounts: Account[];
  cycles: CycleList | null;
  envelopeUsage: Map<string, EnvelopeUsage>;

  // UI State
  loading: boolean;
  error: string | null;
  filters: TransactionQuery;
  sortOrder: "default" | "asc" | "desc";

  // Operation States
  reclassifying: Set<string>;
  deleting: Set<string>;
  updatingType: Set<string>;

  // Modal State
  selectedTransaction: Transaction | null;
  isModalOpen: boolean;

  // Actions - Data Fetching
  fetchTransactions: () => Promise<void>;
  fetchEnvelopes: () => Promise<void>;
  fetchAccounts: () => Promise<void>;
  fetchCycles: () => Promise<void>;
  fetchEnvelopeUsage: (cycle: string) => Promise<void>;

  // Actions - Transactions
  reclassifyTransaction: (
    transactionId: string,
    legIndex: number,
    categoryId: string | null
  ) => Promise<void>;
  updateTransactionType: (
    transactionId: string,
    txType: string | null
  ) => Promise<void>;
  deleteTransaction: (transactionId: string, payee: string) => Promise<void>;
  createTransaction: (transactionData: any) => Promise<any>;

  // Actions - UI
  setFilters: (filters: Partial<TransactionQuery>) => void;
  setSortOrder: (order: "default" | "asc" | "desc") => void;
  setSelectedTransaction: (transaction: Transaction | null) => void;
  setIsModalOpen: (open: boolean) => void;
  clearError: () => void;

  // Actions - Operation States
  setReclassifying: (transactionId: string, isReclassifying: boolean) => void;
  setDeleting: (transactionId: string, isDeleting: boolean) => void;
  setUpdatingType: (transactionId: string, isUpdating: boolean) => void;
}

export const useCapitalStore = create<CapitalState>()(
  devtools(
    (set, get) => ({
      // Initial State
      transactions: [],
      envelopes: [],
      accounts: [],
      cycles: null,
      envelopeUsage: new Map(),
      loading: false,
      error: null,
      filters: {},
      sortOrder: "default",
      reclassifying: new Set(),
      deleting: new Set(),
      updatingType: new Set(),
      selectedTransaction: null,
      isModalOpen: false,

      // Data Fetching Actions
      fetchTransactions: async () => {
        const { filters } = get();
        set({ loading: true, error: null });

        try {
          const params = new URLSearchParams();

          if (filters.account_id)
            params.append("account_id", filters.account_id);
          if (filters.envelope_id)
            params.append("envelope_id", filters.envelope_id);
          if (filters.tx_type) params.append("tx_type", filters.tx_type);

          if (filters.label) {
            params.append("label", filters.label);
          } else {
            if (filters.from) params.append("from", filters.from.toString());
            if (filters.to) params.append("to", filters.to.toString());
          }

          const response = await fetch(
            `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TRANSACTIONS}?${params}`
          );

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              errorText || `HTTP error! status: ${response.status}`
            );
          }

          const data = await response.json();
          console.log("Transactions data:", data);
          set({ transactions: data, loading: false });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
        }
      },

      fetchEnvelopes: async () => {
        set({ loading: true, error: null });

        try {
          const response = await fetch(
            `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ENVELOPES}`
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          set({ envelopes: data, loading: false });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
        }
      },

      fetchAccounts: async () => {
        set({ loading: true, error: null });

        try {
          const response = await fetch(
            `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ACCOUNTS}`
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          set({ accounts: data, loading: false });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
        }
      },

      fetchCycles: async () => {
        try {
          const response = await fetch(
            `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CYCLES}`
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          console.log("Cycles data:", data);
          console.log("Available cycles:", data.labels);
          console.log("Active cycle:", data.active);
          set({ cycles: data });
        } catch (err) {
          console.error("Failed to fetch cycles:", err);
        }
      },

      fetchEnvelopeUsage: async (cycle: string) => {
        const { envelopes } = get();
        if (!cycle || envelopes.length === 0) return;

        try {
          const usagePromises = envelopes.map(async (envelope) => {
            try {
              const res = await fetch(
                `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ENVELOPE_USAGE(
                  envelope.id
                )}?label=${cycle}`
              );
              if (res.ok) {
                const usage: EnvelopeUsage = await res.json();
                return [envelope.id, usage] as [string, EnvelopeUsage];
              }
            } catch (err) {
              console.error(`Failed to fetch usage for ${envelope.id}:`, err);
            }
            return null;
          });

          const usageResults = await Promise.all(usagePromises);
          const usageMap = new Map<string, EnvelopeUsage>();
          usageResults.forEach((result) => {
            if (result) {
              usageMap.set(result[0], result[1]);
            }
          });
          set({ envelopeUsage: usageMap });
        } catch (err) {
          console.error("Failed to fetch envelope usage:", err);
        }
      },

      // Transaction Actions
      reclassifyTransaction: async (
        transactionId: string,
        legIndex: number,
        categoryId: string | null
      ) => {
        set((state) => ({
          reclassifying: new Set(state.reclassifying).add(transactionId),
        }));

        try {
          const response = await fetch(
            `${API_CONFIG.BASE_URL}/capital/transactions/reclassify`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                transaction_id: transactionId,
                leg_index: legIndex,
                category_id: categoryId,
              }),
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          // Update the transaction in the store
          set((state) => ({
            transactions: state.transactions.map((tx) =>
              tx.id === transactionId
                ? {
                    ...tx,
                    legs: tx.legs.map((leg, idx) =>
                      idx === legIndex
                        ? { ...leg, category_id: categoryId }
                        : leg
                    ),
                  }
                : tx
            ),
          }));
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
          });
        } finally {
          set((state) => {
            const newSet = new Set(state.reclassifying);
            newSet.delete(transactionId);
            return { reclassifying: newSet };
          });
        }
      },

      updateTransactionType: async (
        transactionId: string,
        txType: string | null
      ) => {
        set((state) => ({
          updatingType: new Set(state.updatingType).add(transactionId),
        }));

        try {
          const response = await fetch(
            `${
              API_CONFIG.BASE_URL
            }${API_CONFIG.ENDPOINTS.UPDATE_TRANSACTION_TYPE(transactionId)}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ tx_type: txType }),
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          // Update the transaction in the store
          set((state) => ({
            transactions: state.transactions.map((tx) =>
              tx.id === transactionId
                ? { ...tx, tx_type: txType || undefined }
                : tx
            ),
          }));
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
          });
        } finally {
          set((state) => {
            const newSet = new Set(state.updatingType);
            newSet.delete(transactionId);
            return { updatingType: newSet };
          });
        }
      },

      deleteTransaction: async (transactionId: string, payee: string) => {
        set((state) => ({
          deleting: new Set(state.deleting).add(transactionId),
        }));

        try {
          const response = await fetch(
            `${API_CONFIG.BASE_URL}/capital/transactions/${transactionId}`,
            {
              method: "DELETE",
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          // Remove the transaction from the store
          set((state) => ({
            transactions: state.transactions.filter(
              (tx) => tx.id !== transactionId
            ),
          }));
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
          });
        } finally {
          set((state) => {
            const newSet = new Set(state.deleting);
            newSet.delete(transactionId);
            return { deleting: newSet };
          });
        }
      },

      // Transaction Creation Actions
      createTransaction: async (transactionData: any) => {
        const response = await fetch(
          `${API_CONFIG.BASE_URL}/capital/transactions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(transactionData),
            credentials: "include",
          }
        );

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Create transaction failed (${response.status}): ${text}`
          );
        }

        const data = await response.json();

        // Refresh transactions after successful creation
        get().fetchTransactions();

        return data;
      },

      // UI Actions
      setFilters: (newFilters) => {
        set((state) => ({
          filters: { ...state.filters, ...newFilters },
        }));
      },

      setSortOrder: (order) => {
        set({ sortOrder: order });
      },

      setSelectedTransaction: (transaction) => {
        set({ selectedTransaction: transaction });
      },

      setIsModalOpen: (open) => {
        set({ isModalOpen: open });
      },

      clearError: () => {
        set({ error: null });
      },

      // Operation State Actions
      setReclassifying: (transactionId, isReclassifying) => {
        set((state) => {
          const newSet = new Set(state.reclassifying);
          if (isReclassifying) {
            newSet.add(transactionId);
          } else {
            newSet.delete(transactionId);
          }
          return { reclassifying: newSet };
        });
      },

      setDeleting: (transactionId, isDeleting) => {
        set((state) => {
          const newSet = new Set(state.deleting);
          if (isDeleting) {
            newSet.add(transactionId);
          } else {
            newSet.delete(transactionId);
          }
          return { deleting: newSet };
        });
      },

      setUpdatingType: (transactionId, isUpdating) => {
        set((state) => {
          const newSet = new Set(state.updatingType);
          if (isUpdating) {
            newSet.add(transactionId);
          } else {
            newSet.delete(transactionId);
          }
          return { updatingType: newSet };
        });
      },
    }),
    {
      name: "capital-store",
    }
  )
);
