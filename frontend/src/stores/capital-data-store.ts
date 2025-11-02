import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { API_CONFIG } from "@/app/capital/config";

export type WatchlistAssetKind = "stock" | "crypto";

export interface WatchlistAsset {
  symbol: string;
  name: string;
  kind: WatchlistAssetKind;
  pair?: string | null;
  unit?: string | null;
  source?: string | null;
  latest_value?: number | null;
  latest_value_text?: string | null;
  last_updated?: string | null;
}

export interface AddWatchlistAssetPayload {
  symbol: string;
  name: string;
  kind: WatchlistAssetKind;
  pair?: string;
  unit?: string;
}

interface CapitalDataState {
  watchlist: WatchlistAsset[];
  loading: boolean;
  addLoading: boolean;
  error: string | null;
  fetchWatchlist: () => Promise<void>;
  addWatchlistAsset: (payload: AddWatchlistAssetPayload) => Promise<void>;
  updateWatchlistAsset: (symbol: string, name: string) => Promise<void>;
  removeWatchlistAsset: (symbol: string) => Promise<void>;
  clearError: () => void;
}

const endpoint = API_CONFIG.ENDPOINTS.DATA_WATCHLIST;

export const useCapitalDataStore = create<CapitalDataState>()(
  devtools((set) => ({
    watchlist: [],
    loading: false,
    addLoading: false,
    error: null,

    clearError: () => set({ error: null }),

    fetchWatchlist: async () => {
      set({ loading: true, error: null });
      try {
        const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch watchlist: ${response.statusText}`);
        }
        const data: WatchlistAsset[] = await response.json();
        set({ watchlist: data, loading: false });
      } catch (error) {
        set({
          loading: false,
          error:
            error instanceof Error ? error.message : "Failed to load watchlist",
        });
        throw error;
      }
    },

    addWatchlistAsset: async (payload: AddWatchlistAssetPayload) => {
      console.log("=== ADD WATCHLIST ASSET START (Frontend) ===");
      console.log("Payload:", payload);

      set({ addLoading: true, error: null });
      try {
        const url = `${API_CONFIG.BASE_URL}${endpoint}`;
        console.log("Request URL:", url);
        console.log("Request body:", JSON.stringify(payload, null, 2));

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        console.log("Response status:", response.status);
        console.log("Response ok:", response.ok);

        if (!response.ok) {
          const message = await response.text();
          console.error("❌ Server error:", message);
          throw new Error(message || "Failed to add asset to watchlist");
        }

        const asset: WatchlistAsset = await response.json();
        console.log("✅ Received asset:", asset);

        set((state) => ({
          watchlist: [...state.watchlist, asset],
          addLoading: false,
        }));

        console.log("✅ Successfully added to watchlist");
        console.log("=== ADD WATCHLIST ASSET END (Frontend) ===");
      } catch (error) {
        console.error("❌ Error adding to watchlist:", error);
        set({
          addLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to add asset to watchlist",
        });
        throw error;
      }
    },

    updateWatchlistAsset: async (symbol: string, name: string) => {
      console.log("=== UPDATE WATCHLIST ASSET START (Frontend) ===");
      console.log("Symbol:", symbol, "New name:", name);

      const encoded = encodeURIComponent(symbol);
      try {
        const response = await fetch(
          `${API_CONFIG.BASE_URL}${endpoint}/${encoded}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({ name }),
          }
        );

        console.log("Response status:", response.status);

        if (!response.ok) {
          const message = await response.text();
          console.error("❌ Server error:", message);
          throw new Error(message || "Failed to update asset");
        }

        const updatedAsset: WatchlistAsset = await response.json();
        console.log("✅ Received updated asset:", updatedAsset);

        set((state) => ({
          watchlist: state.watchlist.map((asset) =>
            asset.symbol.toLowerCase() === symbol.toLowerCase()
              ? updatedAsset
              : asset
          ),
        }));

        console.log("✅ Successfully updated watchlist");
        console.log("=== UPDATE WATCHLIST ASSET END (Frontend) ===");
      } catch (error) {
        console.error("❌ Error updating watchlist:", error);
        set({
          error:
            error instanceof Error ? error.message : "Failed to update asset",
        });
        throw error;
      }
    },

    removeWatchlistAsset: async (symbol: string) => {
      const encoded = encodeURIComponent(symbol);
      try {
        const response = await fetch(
          `${API_CONFIG.BASE_URL}${endpoint}/${encoded}`,
          {
            method: "DELETE",
            credentials: "include",
          }
        );
        if (response.status !== 204 && response.status !== 404) {
          const message = await response.text();
          throw new Error(message || "Failed to remove asset");
        }
        set((state) => ({
          watchlist: state.watchlist.filter(
            (asset) => asset.symbol.toLowerCase() !== symbol.toLowerCase()
          ),
        }));
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to remove asset from watchlist",
        });
        throw error;
      }
    },
  }))
);
