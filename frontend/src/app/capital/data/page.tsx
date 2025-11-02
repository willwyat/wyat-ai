"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  useCapitalDataStore,
  type WatchlistAssetKind,
  type AddWatchlistAssetPayload,
} from "@/stores/capital-data-store";

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
  const addWatchlistAsset = useCapitalDataStore((state) => state.addWatchlistAsset);
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
    setFormError(null);
    clearError();

    const payload: AddWatchlistAssetPayload = {
      symbol: form.symbol.trim(),
      name: form.name.trim(),
      kind: form.kind,
      pair: form.pair?.trim() || undefined,
      unit: form.unit?.trim() || undefined,
    };

    if (!payload.symbol) {
      setFormError("Symbol is required");
      return;
    }
    if (!payload.name) {
      setFormError("Name is required");
      return;
    }

    try {
      await addWatchlistAsset(payload);
      setForm({
        symbol: "",
        name: "",
        kind: form.kind,
        pair: form.pair,
        unit: form.unit || "USD",
      });
    } catch (err) {
      if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError("Failed to add asset");
      }
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

  const sortedWatchlist = useMemo(() => {
    return [...watchlist].sort((a, b) => a.name.localeCompare(b.name));
  }, [watchlist]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <header className="mb-8 flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Market Data Watchlist
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Track real-time prices for your most important assets.
          </p>
        </header>

        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-10">
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Asset Symbol
                </label>
                <input
                  type="text"
                  name="symbol"
                  value={form.symbol}
                  onChange={handleInputChange}
                  placeholder={form.kind === "crypto" ? "btc" : "AAPL"}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-blue-500"
                />
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
                  placeholder={form.kind === "crypto" ? "btc/usd" : "AAPL/USD"}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-blue-500"
                />
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
              </div>
            </div>

            {(formError || error) && (
              <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-200">
                {formError || error}
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
                      colSpan={6}
                      className="px-4 py-10 text-center text-gray-500 dark:text-gray-400"
                    >
                      {loading
                        ? "Fetching latest prices..."
                        : "No assets tracked yet. Add one above to get started."}
                    </td>
                  </tr>
                ) : (
                  sortedWatchlist.map((asset) => (
                    <tr key={`${asset.symbol}-${asset.pair ?? "default"}`}>
                      <td className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {asset.name}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                        <div className="font-mono uppercase">{asset.symbol}</div>
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
                      <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                        {formatTimestamp(asset.last_updated)}
                      </td>
                      <td className="px-4 py-4 text-right text-sm">
                        <button
                          onClick={() => handleRemove(asset.symbol)}
                          disabled={removingSymbol === asset.symbol}
                          className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {removingSymbol === asset.symbol ? "Removing..." : "Remove"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
