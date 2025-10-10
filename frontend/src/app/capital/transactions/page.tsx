"use client";

import React, { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";
import type { Envelope } from "@/app/capital/types";

interface TransactionQuery {
  account_id?: string;
  from?: number;
  to?: number;
}

interface Transaction {
  id: string;
  ts: number;
  posted_ts?: number;
  source: string;
  payee?: string;
  memo?: string;
  status?: string;
  reconciled: boolean;
  external_refs: Array<[string, string]>;
  legs: Array<{
    account_id: string;
    direction: "Debit" | "Credit";
    amount: {
      kind: "Fiat";
      data: {
        amount: string;
        ccy: string;
      };
    };
    fx?: any;
    category_id?: string | null;
    fee_of_leg_idx?: number;
    notes?: string;
  }>;
}

const PNL_ACCOUNT_ID = "__pnl__";

function getPnlLegIndex(tx: Transaction): number {
  const idx = tx.legs.findIndex((l) => l.account_id === PNL_ACCOUNT_ID);
  return idx >= 0 ? idx : tx.legs.findIndex((l) => l.category_id != null);
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TransactionQuery>({});
  const [reclassifying, setReclassifying] = useState<Set<string>>(new Set());

  const fetchTransactions = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.account_id) params.append("account_id", filters.account_id);
      if (filters.from) params.append("from", filters.from.toString());
      if (filters.to) params.append("to", filters.to.toString());

      const response = await fetch(`${API_URL}/capital/transactions?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setTransactions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const fetchEnvelopes = async () => {
    try {
      const response = await fetch(`${API_URL}/capital/envelopes`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setEnvelopes(data);
    } catch (err) {
      console.error("Failed to fetch envelopes:", err);
    }
  };

  useEffect(() => {
    fetchTransactions();
    fetchEnvelopes();
  }, []);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const formatAmount = (amount: string, ccy: string) => {
    const num = parseFloat(amount);
    const symbol =
      ccy === "USD" ? "$" : ccy === "HKD" ? "HK$" : ccy === "BTC" ? "₿" : "";
    return `${symbol}${num.toFixed(2)}`;
  };

  const handleFilterChange = (key: keyof TransactionQuery, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value
        ? key === "account_id"
          ? value
          : parseInt(value)
        : undefined,
    }));
  };

  const handleReclassify = async (
    transactionId: string,
    legIndex: number,
    categoryId: string | null
  ) => {
    setReclassifying((prev) => new Set(prev).add(transactionId));

    try {
      const response = await fetch(
        `${API_URL}/capital/transactions/reclassify`,
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

      // Update the transaction in the local state
      setTransactions((prev) =>
        prev.map((tx) =>
          tx.id === transactionId
            ? {
                ...tx,
                legs: tx.legs.map((leg, index) =>
                  index === legIndex ? { ...leg, category_id: categoryId } : leg
                ),
              }
            : tx
        )
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reclassify transaction"
      );
    } finally {
      setReclassifying((prev) => {
        const newSet = new Set(prev);
        newSet.delete(transactionId);
        return newSet;
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Transactions
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            View and filter transaction history
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-8 border dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Filters
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Account ID
              </label>
              <input
                type="text"
                placeholder="e.g., acct.chase_credit"
                value={filters.account_id || ""}
                onChange={(e) =>
                  handleFilterChange("account_id", e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                From (Unix timestamp)
              </label>
              <input
                type="number"
                placeholder="e.g., 1696000000"
                value={filters.from || ""}
                onChange={(e) => handleFilterChange("from", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                To (Unix timestamp)
              </label>
              <input
                type="number"
                placeholder="e.g., 1698591999"
                value={filters.to || ""}
                onChange={(e) => handleFilterChange("to", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={fetchTransactions}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Apply Filters
            </button>
          </div>
        </div>

        {/* Results */}
        {loading && (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">
              Loading transactions...
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-600 dark:text-red-400">Error: {error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Transactions ({transactions.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Payee
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Account
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Direction
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Category
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {transactions.map((tx) => {
                    const pnlLegIdx = getPnlLegIndex(tx);
                    const currentCategory =
                      pnlLegIdx >= 0
                        ? tx.legs[pnlLegIdx]?.category_id ?? ""
                        : "";

                    return (
                      <tr key={tx.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {formatDate(tx.ts)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {tx.payee || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {tx.legs[0]?.account_id || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              tx.legs[0]?.direction === "Credit"
                                ? "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300"
                                : "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300"
                            }`}
                          >
                            {tx.legs[0]?.direction || "N/A"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {tx.legs[0]?.amount?.kind === "Fiat" &&
                          tx.legs[0]?.amount?.data
                            ? formatAmount(
                                tx.legs[0].amount.data.amount,
                                tx.legs[0].amount.data.ccy
                              )
                            : "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              tx.status === "posted"
                                ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300"
                                : "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300"
                            }`}
                          >
                            {tx.status || "N/A"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-2">
                            <select
                              value={currentCategory}
                              onChange={(e) => {
                                const newCategoryId = e.target.value || null;
                                handleReclassify(
                                  tx.id,
                                  pnlLegIdx,
                                  newCategoryId
                                );
                              }}
                              disabled={reclassifying.has(tx.id)}
                              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                            >
                              <option value="">No Category</option>
                              {envelopes.map((envelope) => (
                                <option key={envelope.id} value={envelope.id}>
                                  {envelope.name}
                                </option>
                              ))}
                            </select>
                            {reclassifying.has(tx.id) && (
                              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
