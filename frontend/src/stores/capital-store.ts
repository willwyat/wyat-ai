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
  Leg,
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
  latest_extraction_run_id?: { $oid: string } | null;
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

// Transaction Update Types
export interface UpdateLegsRequest {
  legs: Leg[];
  payee?: string;
  memo?: string;
}

export interface UpdateLegsResponse {
  success: boolean;
  message: string;
  transaction_id: string;
}

export interface BalanceTransactionResponse {
  success: boolean;
  message: string;
  transaction_id: string;
  balance_state?: string;
}

// Fund Types
export interface Position {
  fund_id: string;
  asset: string;
  qty: number | string;
  price_in_base_ccy: number | string;
  last_updated: number;
}

// Price Data Types
export interface AssetPrice {
  symbol: string;
  price: number;
  change_24h_pct?: number;
  last_updated?: string;
  source?: string;
}

export interface PublicFund {
  id: string;
  fund_id: string;
  name: string;
  symbol: string;
  assets: string[];
  purpose: string;
  horizon_years: number;
  discretionary_sales: boolean;
  acquisition_policy?: string | null;
  yield_policy?: string | null;
  denominated_in: "USD" | "HKD" | "BTC";
  balancing_policy?: any;
  multiplier_rules?: string[] | null;
  max_pct_networth: number;
  max_pct_liquid: number;
  liquid: boolean;
  review_cadence: string;
  status: string;
  created_at: number;
  updated_at: number;
}

interface CapitalState {
  // Data
  transactions: Transaction[];
  envelopes: Envelope[];
  accounts: Account[];
  cycles: CycleList | null;
  envelopeUsage: Map<string, EnvelopeUsage>;
  funds: PublicFund[];
  positionsByFund: Record<string, Position[]>;
  assetPrices: Record<string, AssetPrice>;

  // UI State
  loading: boolean;
  error: string | null;
  filters: TransactionQuery;
  sortOrder: "default" | "asc" | "desc";
  fundsLoading: boolean;
  positionsLoading: boolean;
  fundsError: string | null;
  pricesLoading: boolean;

  // Operation States
  reclassifying: Set<string>;
  deleting: Set<string>;
  updatingType: Set<string>;

  // Modal State
  selectedTransaction: Transaction | null;
  isModalOpen: boolean;

  // Actions - Data Fetching
  fetchTransactions: () => Promise<void>;
  fetchTransactionById: (transactionId: string) => Promise<Transaction>;
  fetchEnvelopes: () => Promise<void>;
  fetchAccounts: () => Promise<void>;
  fetchCycles: () => Promise<void>;
  fetchEnvelopeUsage: (cycle: string) => Promise<void>;
  fetchFunds: () => Promise<void>;
  fetchPositions: (fundIds: string[]) => Promise<void>;
  fetchFundPositions: (fundId: string) => Promise<Position[]>;
  fetchAssetPrices: () => Promise<void>;
  getAssetPrice: (symbol: string) => number | undefined;
  createAccount: (account: Account) => Promise<void>;

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
  updateTransactionLegs: (
    transactionId: string,
    request: UpdateLegsRequest
  ) => Promise<UpdateLegsResponse>;
  balanceTransaction: (
    transactionId: string
  ) => Promise<BalanceTransactionResponse>;
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
      funds: [],
      positionsByFund: {},
      assetPrices: {},
      loading: false,
      error: null,
      filters: {},
      sortOrder: "desc",
      fundsLoading: false,
      positionsLoading: false,
      fundsError: null,
      pricesLoading: false,
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

      fetchTransactionById: async (transactionId: string) => {
        try {
          const response = await fetch(
            `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TRANSACTIONS}/${transactionId}`
          );

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              errorText || `HTTP error! status: ${response.status}`
            );
          }

          const transaction = await response.json();
          return transaction;
        } catch (err) {
          throw err instanceof Error
            ? err
            : new Error("Failed to fetch transaction");
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
        console.log("=== STORE: fetchAccounts START ===");
        set({ loading: true, error: null });

        try {
          const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ACCOUNTS}`;
          console.log("Fetching from:", url);

          const response = await fetch(url);
          console.log("Response status:", response.status);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          console.log("Received accounts:", data.length);
          console.log("First account sample:", data[0]);

          set({ accounts: data, loading: false });
          console.log("=== STORE: fetchAccounts END ===");
        } catch (err) {
          console.error("=== STORE: fetchAccounts ERROR ===", err);
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
        }
      },

      createAccount: async (account: Account) => {
        try {
          const response = await fetch(
            `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ACCOUNTS}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(account),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              errorText || `HTTP error! status: ${response.status}`
            );
          }

          // Refresh accounts list after creation
          await get().fetchAccounts();
        } catch (err) {
          throw err instanceof Error
            ? err
            : new Error("Failed to create account");
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

      fetchFunds: async () => {
        set({ fundsLoading: true, fundsError: null });
        try {
          const response = await fetch(`${API_CONFIG.BASE_URL}/capital/funds`, {
            credentials: "include",
          });
          if (!response.ok) {
            throw new Error(await response.text());
          }
          const data = await response.json();
          set({ funds: data, fundsLoading: false });

          // Auto-fetch positions for all funds
          const fundIds = data.map((f: PublicFund) => f.fund_id);
          if (fundIds.length > 0) {
            get().fetchPositions(fundIds);
          }
        } catch (error) {
          set({
            fundsError:
              error instanceof Error ? error.message : "Failed to load funds",
            fundsLoading: false,
          });
        }
      },

      fetchFundPositions: async (fundId: string): Promise<Position[]> => {
        try {
          const response = await fetch(
            `${API_CONFIG.BASE_URL}/capital/funds/${encodeURIComponent(
              fundId
            )}/positions`,
            { credentials: "include" }
          );
          if (!response.ok) {
            throw new Error(await response.text());
          }
          return await response.json();
        } catch (error) {
          console.error(`Failed to fetch positions for fund ${fundId}:`, error);
          return [];
        }
      },

      fetchPositions: async (fundIds: string[]) => {
        set({ positionsLoading: true });
        try {
          const results = await Promise.all(
            fundIds.map(async (fundId) => {
              const positions = await get().fetchFundPositions(fundId);
              return [fundId, positions] as [string, Position[]];
            })
          );

          const positionsByFund: Record<string, Position[]> = {};
          for (const [fundId, positions] of results) {
            positionsByFund[fundId] = positions;
          }

          set({ positionsByFund, positionsLoading: false });
        } catch (error) {
          console.error("Failed to load positions:", error);
          set({ positionsLoading: false });
        }
      },

      fetchAssetPrices: async () => {
        set({ pricesLoading: true });
        try {
          const response = await fetch(
            `${API_CONFIG.BASE_URL}/capital/data/watchlist`,
            { credentials: "include" }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const watchlist = await response.json();

          // Map watchlist data to asset prices by name from capital_data_feeds
          // e.g., "BTC", "ETH", "SOL" from the name field
          const priceMap: Record<string, AssetPrice> = {};

          for (const item of watchlist) {
            if (item.latest_value != null && item.name) {
              // Use the name field (e.g., "BTC", "ETH") as the key
              // Normalize to uppercase for consistent lookup
              const normalizedName = item.name.toUpperCase();

              priceMap[normalizedName] = {
                symbol: item.symbol, // Keep the CoinGecko ID (e.g., "bitcoin")
                price: item.latest_value,
                change_24h_pct: item.change_24h_pct,
                last_updated: item.last_updated,
                source: item.source,
              };
            }
          }
          console.log("Asset prices:", priceMap);
          set({ assetPrices: priceMap, pricesLoading: false });
        } catch (error) {
          console.error("Failed to fetch asset prices:", error);
          set({ pricesLoading: false });
        }
      },

      getAssetPrice: (symbol: string): number | undefined => {
        const normalizedSymbol = symbol.toUpperCase();
        return get().assetPrices[normalizedSymbol]?.price;
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

      updateTransactionLegs: async (
        transactionId: string,
        request: UpdateLegsRequest
      ): Promise<UpdateLegsResponse> => {
        const response = await fetch(
          `${API_CONFIG.BASE_URL}/capital/transactions/${encodeURIComponent(
            transactionId
          )}/legs`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(request),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(error || "Failed to update transaction legs");
        }

        const data = await response.json();

        // Refresh transactions after successful update
        await get().fetchTransactions();

        return data;
      },

      balanceTransaction: async (
        transactionId: string
      ): Promise<BalanceTransactionResponse> => {
        const response = await fetch(
          `${API_CONFIG.BASE_URL}/capital/transactions/${encodeURIComponent(
            transactionId
          )}/balance`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(error || "Failed to balance transaction");
        }

        const data = await response.json();

        // Refresh transactions after successful balance
        await get().fetchTransactions();

        return data;
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
