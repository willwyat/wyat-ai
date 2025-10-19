"use client";

import React, { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";
import type {
  Envelope,
  Account,
  Transaction,
  TransactionQuery,
  CycleList,
  EnvelopeUsage,
} from "@/app/capital/types";
import TransactionRow from "@/app/capital/components/TransactionRow";
import { EnvelopeCard } from "@/app/capital/components/EnvelopeCard";
import TransactionModal from "@/app/capital/components/TransactionModal";

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cycles, setCycles] = useState<CycleList | null>(null);
  const [envelopeUsage, setEnvelopeUsage] = useState<
    Map<string, EnvelopeUsage>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TransactionQuery>({});
  const [reclassifying, setReclassifying] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<"default" | "asc" | "desc">(
    "default"
  );
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Create a map of account IDs to account info
  const accountMap = new Map(
    accounts.map((account) => [
      account.id,
      { name: account.name, color: account.metadata.data.color || "gray" },
    ])
  );

  const fetchTransactions = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.account_id) params.append("account_id", filters.account_id);
      if (filters.envelope_id)
        params.append("envelope_id", filters.envelope_id);
      if (filters.label) {
        // Cycle label takes precedence over from/to timestamps
        params.append("label", filters.label);
      } else {
        if (filters.from) params.append("from", filters.from.toString());
        if (filters.to) params.append("to", filters.to.toString());
      }

      const response = await fetch(`${API_URL}/capital/transactions?${params}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setTransactions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const fetchCycles = async () => {
    try {
      const response = await fetch(`${API_URL}/capital/cycles`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log("Cycles data:", data);
      console.log("Available cycles:", data.labels);
      console.log("Active cycle:", data.active);
      setCycles(data);
    } catch (err) {
      console.error("Failed to fetch cycles:", err);
    }
  };

  const fetchEnvelopeUsage = async (cycle: string) => {
    if (!cycle || envelopes.length === 0) return;

    try {
      const usagePromises = envelopes.map(async (envelope) => {
        try {
          const res = await fetch(
            `${API_URL}/capital/envelopes/${envelope.id}/usage?label=${cycle}`
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
      setEnvelopeUsage(usageMap);
    } catch (err) {
      console.error("Failed to fetch envelope usage:", err);
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

  const fetchAccounts = async () => {
    try {
      const response = await fetch(`${API_URL}/capital/accounts`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setAccounts(data);
    } catch (err) {
      console.error("Failed to fetch accounts:", err);
    }
  };

  useEffect(() => {
    fetchEnvelopes();
    fetchAccounts();
    fetchCycles();
  }, []);

  // Set default cycle to active cycle once cycles are loaded
  useEffect(() => {
    if (cycles && !filters.label) {
      setFilters((prev) => ({
        ...prev,
        label: cycles.active,
      }));
    }
  }, [cycles]);

  // Fetch transactions when filters change
  useEffect(() => {
    if (filters.label) {
      // Only fetch if we have a cycle selected
      fetchTransactions();
    }
  }, [filters]);

  // Fetch envelope usage when cycle changes or envelopes are loaded
  useEffect(() => {
    if (filters.label && envelopes.length > 0) {
      fetchEnvelopeUsage(filters.label);
    }
  }, [filters.label, envelopes]);

  const handleSortByDate = () => {
    setSortOrder((prev) => {
      switch (prev) {
        case "default":
          return "desc";
        case "desc":
          return "asc";
        case "asc":
          return "default";
        default:
          return "default";
      }
    });
  };

  const getSortedTransactions = () => {
    if (sortOrder === "default") {
      return transactions;
    }

    return [...transactions].sort((a, b) => {
      if (sortOrder === "asc") {
        return a.ts - b.ts;
      } else {
        return b.ts - a.ts;
      }
    });
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

  const handleOpenModal = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTransaction(null);
  };

  const handleDelete = async (transactionId: string, payee: string) => {
    // Confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete the transaction "${payee}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    setDeleting((prev) => new Set(prev).add(transactionId));

    try {
      const response = await fetch(
        `${API_URL}/capital/transactions/${transactionId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Remove the transaction from the local state
      setTransactions((prev) => prev.filter((tx) => tx.id !== transactionId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete transaction"
      );
    } finally {
      setDeleting((prev) => {
        const newSet = new Set(prev);
        newSet.delete(transactionId);
        return newSet;
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 md:p-4 lg:p-8">
      <div className="mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Transactions
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            View and filter transaction history
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 md:rounded-lg p-6 mb-8 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Filters
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Cycle
              </label>
              <select
                value={filters.label || cycles?.active || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setFilters((prev) => ({
                    ...prev,
                    label: value,
                    // Clear from/to when selecting a cycle
                    from: undefined,
                    to: undefined,
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                {cycles?.labels
                  .slice()
                  .reverse()
                  .map((label) => (
                    <option key={label} value={label}>
                      {label} {label === cycles.active ? "(Active)" : ""}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Account
              </label>
              <select
                value={filters.account_id || ""}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    account_id: e.target.value || undefined,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="">All Accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Envelope
              </label>
              <select
                value={filters.envelope_id || ""}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    envelope_id: e.target.value || undefined,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="">All Envelopes</option>
                {envelopes.map((envelope) => (
                  <option key={envelope.id} value={envelope.id}>
                    {envelope.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={fetchTransactions}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Apply Filters
            </button>
            {(filters.account_id || filters.envelope_id) && (
              <>
                <button
                  onClick={() => {
                    setFilters({ label: filters.label });
                    setTimeout(fetchTransactions, 0);
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  Clear Filters
                </button>
                <div className="flex gap-1 ml-2">
                  {filters.account_id && (
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-sm">
                      Account:{" "}
                      {accountMap.get(filters.account_id)?.name ||
                        filters.account_id}
                    </span>
                  )}
                  {filters.envelope_id && (
                    <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 rounded text-sm">
                      Envelope:{" "}
                      {envelopes.find((e) => e.id === filters.envelope_id)
                        ?.name || filters.envelope_id}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Envelopes */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
            Envelopes
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
            {envelopes
              .filter((envelope) => envelope.status === "Active")
              .map((envelope) => {
                const usage = envelopeUsage.get(envelope.id);
                return (
                  <EnvelopeCard
                    key={envelope.id}
                    envelope={envelope}
                    totalSpent={usage?.spent}
                    budget={usage?.budget}
                    percent={usage?.percent}
                  />
                );
              })}
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
          <div className="bg-white dark:bg-gray-800 md:rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Transactions ({getSortedTransactions().length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th
                      className="px-6 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                      onClick={handleSortByDate}
                      title={`Sort by date (current: ${sortOrder})`}
                    >
                      <div className="flex items-center gap-1">
                        Date
                        {sortOrder === "asc" && (
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 15l7-7 7 7"
                            />
                          </svg>
                        )}
                        {sortOrder === "desc" && (
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        )}
                        {sortOrder === "default" && (
                          <svg
                            className="w-3 h-3 opacity-50"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                            />
                          </svg>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Account
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Payee
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Envelope
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" />
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {getSortedTransactions().map((tx) => (
                    <TransactionRow
                      key={tx.id}
                      transaction={tx}
                      accountMap={accountMap}
                      envelopes={envelopes}
                      reclassifying={reclassifying}
                      deleting={deleting}
                      onReclassify={handleReclassify}
                      onDelete={handleDelete}
                      onOpenModal={handleOpenModal}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Transaction Modal */}
        <TransactionModal
          transaction={selectedTransaction}
          accountMap={accountMap}
          envelopes={envelopes}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      </div>
    </div>
  );
}
