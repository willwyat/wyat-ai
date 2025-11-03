"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  useCapitalDataStore,
  type WatchlistAssetKind,
  type AddWatchlistAssetPayload,
} from "@/stores/capital-data-store";
import { Heading } from "@/components/ui/Heading";

const KIND_OPTIONS: Array<{ value: WatchlistAssetKind; label: string }> = [
  { value: "stock", label: "Stock (Yahoo Finance)" },
  { value: "crypto", label: "Crypto (Coingecko)" },
];

const PRICE_PRECISION: Record<string, number> = {
  USD: 2,
  HKD: 2,
  EUR: 2,
  GBP: 2,
  BTC: 6,
  ETH: 6,
};

function formatPrice(
  value?: number | null,
  unit?: string | null,
  fallback?: string | null
) {
  if (value == null) {
    return fallback ?? "N/A";
  }
  if (unit) {
    const precision = PRICE_PRECISION[unit] ?? 4;
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: unit,
        maximumFractionDigits: precision,
      }).format(value);
    } catch {
      return `${value.toFixed(precision)} ${unit}`;
    }
  }
  return value.toFixed(4);
}

function formatTimestamp(timestamp?: string | null) {
  if (!timestamp) {
    return "—";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function CapitalDataPage() {
  const watchlist = useCapitalDataStore((state) => state.watchlist);
  const loading = useCapitalDataStore((state) => state.loading);
  const addLoading = useCapitalDataStore((state) => state.addLoading);
  const error = useCapitalDataStore((state) => state.error);
  const fetchWatchlist = useCapitalDataStore((state) => state.fetchWatchlist);
  const addWatchlistAsset = useCapitalDataStore(
    (state) => state.addWatchlistAsset
  );
  const updateWatchlistAsset = useCapitalDataStore(
    (state) => state.updateWatchlistAsset
  );
  const removeWatchlistAsset = useCapitalDataStore(
    (state) => state.removeWatchlistAsset
  );
  const clearError = useCapitalDataStore((state) => state.clearError);

  const [form, setForm] = useState<AddWatchlistAssetPayload>({
    symbol: "",
    name: "",
    kind: "stock",
    pair: "",
    unit: "USD",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [removingSymbol, setRemovingSymbol] = useState<string | null>(null);
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");

  useEffect(() => {
    document.title = "Market Data - Wyat AI";
  }, []);

  useEffect(() => {
    fetchWatchlist().catch((err) => {
      console.error("Failed to load watchlist", err);
    });
  }, [fetchWatchlist]);

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log("=== FORM SUBMIT START ===");
    console.log("Raw form data:", form);

    setFormError(null);
    clearError();

    const payload: AddWatchlistAssetPayload = {
      symbol: form.symbol.trim(),
      name: form.name.trim(),
      kind: form.kind,
      pair: form.pair?.trim() || undefined,
      unit: form.unit?.trim() || undefined,
    };

    console.log("Processed payload:", payload);

    if (!payload.symbol) {
      console.error("❌ Validation failed: Symbol is required");
      setFormError("Symbol is required");
      return;
    }
    if (!payload.name) {
      console.error("❌ Validation failed: Name is required");
      setFormError("Name is required");
      return;
    }

    console.log("✅ Validation passed, calling addWatchlistAsset...");
    try {
      await addWatchlistAsset(payload);
      console.log("✅ Successfully added to watchlist, resetting form");
      setForm({
        symbol: "",
        name: "",
        kind: form.kind,
        pair: form.pair,
        unit: form.unit || "USD",
      });
      console.log("=== FORM SUBMIT END (Success) ===");
    } catch (err) {
      console.error("❌ Form submission error:", err);
      if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError("Failed to add asset");
      }
      console.log("=== FORM SUBMIT END (Error) ===");
    }
  };

  const handleRemove = async (symbol: string) => {
    setRemovingSymbol(symbol);
    clearError();
    try {
      await removeWatchlistAsset(symbol);
    } catch (err) {
      console.error(`Failed to remove ${symbol}`, err);
    } finally {
      setRemovingSymbol(null);
    }
  };

  const handleEditStart = (symbol: string, currentName: string) => {
    setEditingSymbol(symbol);
    setEditName(currentName);
    clearError();
  };

  const handleEditCancel = () => {
    setEditingSymbol(null);
    setEditName("");
  };

  const handleEditSave = async (symbol: string) => {
    if (!editName.trim()) {
      return;
    }
    clearError();
    try {
      await updateWatchlistAsset(symbol, editName.trim());
      setEditingSymbol(null);
      setEditName("");
    } catch (err) {
      console.error(`Failed to update ${symbol}`, err);
    }
  };

  const sortedWatchlist = useMemo(() => {
    return [...watchlist].sort((a, b) => a.name.localeCompare(b.name));
  }, [watchlist]);

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-6">
        <header className="h-20 mb-8 flex items-center gap-2">
          <Heading level={1}>Market Data Watchlist</Heading>
        </header>

        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-10">
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {form.kind === "crypto" && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-blue-600 dark:text-blue-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                      Use CoinGecko IDs for Crypto Assets
                    </h3>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                      Enter the CoinGecko ID (not the ticker symbol). Examples:
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <code className="bg-white dark:bg-gray-900 px-2 py-1 rounded border border-blue-200 dark:border-blue-700">
                          bitcoin
                        </code>
                        <span className="text-blue-700 dark:text-blue-300">
                          (not BTC)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="bg-white dark:bg-gray-900 px-2 py-1 rounded border border-blue-200 dark:border-blue-700">
                          ethereum
                        </code>
                        <span className="text-blue-700 dark:text-blue-300">
                          (not ETH)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="bg-white dark:bg-gray-900 px-2 py-1 rounded border border-blue-200 dark:border-blue-700">
                          solana
                        </code>
                        <span className="text-blue-700 dark:text-blue-300">
                          (not SOL)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="bg-white dark:bg-gray-900 px-2 py-1 rounded border border-blue-200 dark:border-blue-700">
                          usd-coin
                        </code>
                        <span className="text-blue-700 dark:text-blue-300">
                          (not USDC)
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                      Find IDs at{" "}
                      <a
                        href="https://www.coingecko.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-blue-900 dark:hover:text-blue-100"
                      >
                        coingecko.com
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Asset Symbol
                  {form.kind === "crypto" && (
                    <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                      (CoinGecko ID)
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  name="symbol"
                  value={form.symbol}
                  onChange={handleInputChange}
                  placeholder={form.kind === "crypto" ? "bitcoin" : "AAPL"}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-blue-500"
                />
                {form.kind === "crypto" && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Use lowercase CoinGecko ID (e.g., "bitcoin", not "BTC")
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Display Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleInputChange}
                  placeholder="Apple Inc."
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Asset Type
                </label>
                <select
                  name="kind"
                  value={form.kind}
                  onChange={handleInputChange}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-blue-500"
                >
                  {KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Pricing Pair (optional)
                </label>
                <input
                  type="text"
                  name="pair"
                  value={form.pair ?? ""}
                  onChange={handleInputChange}
                  placeholder={
                    form.kind === "crypto" ? "BITCOIN/USD" : "AAPL/USD"
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Leave empty to use default pairing
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Quote Currency
                </label>
                <input
                  type="text"
                  name="unit"
                  value={form.unit ?? ""}
                  onChange={handleInputChange}
                  placeholder="USD"
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Default: USD
                </p>
              </div>
            </div>

            {(formError || error) && (
              <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-200">
                <div className="font-semibold mb-1">Error</div>
                <div className="text-sm whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                  {formError || error}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={addLoading}
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {addLoading ? "Adding..." : "Add to Watchlist"}
              </button>
            </div>
          </form>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Watchlist
            </h2>
            {loading && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Loading...
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Symbol
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Source
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Latest Price
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    24h Change
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Last Updated
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sortedWatchlist.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-gray-500 dark:text-gray-400"
                    >
                      {loading
                        ? "Fetching latest prices..."
                        : "No assets tracked yet. Add one above to get started."}
                    </td>
                  </tr>
                ) : (
                  sortedWatchlist.map((asset) => {
                    const isEditing = editingSymbol === asset.symbol;
                    return (
                      <tr key={`${asset.symbol}-${asset.pair ?? "default"}`}>
                        <td className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleEditSave(asset.symbol);
                                } else if (e.key === "Escape") {
                                  handleEditCancel();
                                }
                              }}
                              className="w-full rounded border border-blue-500 dark:border-blue-400 bg-white dark:bg-gray-900 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            />
                          ) : (
                            asset.name
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                          <div className="font-mono uppercase">
                            {asset.symbol}
                          </div>
                          {asset.pair && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {asset.pair}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                          {asset.source ?? "—"}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                          {formatPrice(
                            asset.latest_value,
                            asset.unit,
                            asset.latest_value_text
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          {asset.change_24h_pct != null ? (
                            <span
                              className={`inline-flex items-center gap-1 font-medium ${
                                asset.change_24h_pct >= 0
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-red-600 dark:text-red-400"
                              }`}
                            >
                              {asset.change_24h_pct >= 0 ? "↑" : "↓"}
                              {Math.abs(asset.change_24h_pct).toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                          {formatTimestamp(asset.last_updated)}
                        </td>
                        <td className="px-4 py-4 text-right text-sm">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEditSave(asset.symbol)}
                                className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
                              >
                                Save
                              </button>
                              <button
                                onClick={handleEditCancel}
                                className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() =>
                                  handleEditStart(asset.symbol, asset.name)
                                }
                                className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleRemove(asset.symbol)}
                                disabled={removingSymbol === asset.symbol}
                                className="rounded-lg border border-red-300 dark:border-red-700 px-3 py-1 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {removingSymbol === asset.symbol
                                  ? "Removing..."
                                  : "Remove"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
