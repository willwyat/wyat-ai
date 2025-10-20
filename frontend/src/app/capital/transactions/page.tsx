"use client";

import React, { useEffect, useState } from "react";
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
import { getSelectClasses, styles } from "@/app/capital/styles";
import { API_CONFIG, UI_CONFIG, ICONS } from "@/app/capital/config";

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
  const [updatingType, setUpdatingType] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<"default" | "asc" | "desc">(
    UI_CONFIG.TABLE.DEFAULT_SORT_ORDER
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
      if (filters.tx_type) params.append("tx_type", filters.tx_type);
      if (filters.label) {
        // Cycle label takes precedence over from/to timestamps
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
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Transactions data:", data);
      setTransactions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const fetchCycles = async () => {
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
      setEnvelopeUsage(usageMap);
    } catch (err) {
      console.error("Failed to fetch envelope usage:", err);
    }
  };

  const fetchEnvelopes = async () => {
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ENVELOPES}`
      );
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
      const response = await fetch(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ACCOUNTS}`
      );
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

  const handleUpdateType = async (
    transactionId: string,
    txType: string | null
  ) => {
    setUpdatingType((prev) => new Set(prev).add(transactionId));

    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.UPDATE_TRANSACTION_TYPE(
          transactionId
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tx_type: txType }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      // Update the transaction in the local state
      setTransactions((prev) =>
        prev.map((tx) =>
          tx.id === transactionId ? { ...tx, tx_type: txType || undefined } : tx
        )
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update transaction type"
      );
    } finally {
      setUpdatingType((prev) => {
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
        `${API_CONFIG.BASE_URL}/capital/transactions/${transactionId}`,
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

  const handleCyclePrev = () => {
    if (!cycles || !filters.label) return;
    const currentIndex = cycles.labels.indexOf(filters.label);
    if (currentIndex > 0) {
      setFilters((prev) => ({
        ...prev,
        label: cycles.labels[currentIndex - 1],
      }));
    }
  };

  const handleCycleNext = () => {
    if (!cycles || !filters.label) return;
    const currentIndex = cycles.labels.indexOf(filters.label);
    if (currentIndex < cycles.labels.length - 1) {
      setFilters((prev) => ({
        ...prev,
        label: cycles.labels[currentIndex + 1],
      }));
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

        {/* Cycle Navigation */}
        <div className={`${styles.card.padded}`}>
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={handleCyclePrev}
              disabled={
                !cycles ||
                !filters.label ||
                cycles.labels.indexOf(filters.label) === 0
              }
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-colors w-8"
              title="Previous cycle"
            >
              <span className="material-symbols-rounded text-2xl">
                {ICONS.CHEVRON_LEFT}
              </span>
            </button>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {filters.label || cycles?.active || "—"}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {filters.label === cycles?.active && "(Active Cycle)"}
              </div>
            </div>
            <button
              onClick={handleCycleNext}
              disabled={
                !cycles ||
                !filters.label ||
                cycles.labels.indexOf(filters.label) ===
                  cycles.labels.length - 1
              }
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-colors w-8"
              title="Next cycle"
            >
              <span className="material-symbols-rounded text-2xl">
                {ICONS.CHEVRON_RIGHT}
              </span>
            </button>
          </div>
        </div>

        {/* Envelopes */}
        <div className="mb-8">
          <h2 className={styles.text.heading}>Envelopes</h2>
          <div className={UI_CONFIG.ENVELOPE_GRID}>
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
              <h2 className={styles.text.subheading}>
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
                      <div className="flex flex-col gap-1">
                        <span>Account</span>
                        <select
                          id="account-filter"
                          value={filters.account_id || ""}
                          onChange={(e) =>
                            setFilters((prev) => ({
                              ...prev,
                              account_id: e.target.value || undefined,
                            }))
                          }
                          className={getSelectClasses("compact")}
                        >
                          <option value="">All</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Payee
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-sm text-gray-500 dark:text-gray-400 uppercase">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium tracking-wider">
                          Type & Envelope
                        </span>
                        <div className="flex gap-2">
                          <select
                            id="tx-type-filter"
                            value={filters.tx_type || ""}
                            onChange={(e) =>
                              setFilters((prev) => ({
                                ...prev,
                                tx_type: e.target.value || undefined,
                              }))
                            }
                            className={getSelectClasses("compact")}
                          >
                            <option value="">All Types</option>
                            <option value="spending">Spending</option>
                            <option value="income">Income</option>
                            <option value="refund">Refund</option>
                            <option value="transfer">Transfer</option>
                            <option value="transfer_fx">Transfer (FX)</option>
                            <option value="fee_only">Fee</option>
                            <option value="trade">Trade</option>
                            <option value="adjustment">Adjustment</option>
                          </select>
                          <select
                            id="envelope-filter"
                            value={filters.envelope_id || ""}
                            onChange={(e) =>
                              setFilters((prev) => ({
                                ...prev,
                                envelope_id: e.target.value || undefined,
                              }))
                            }
                            className={getSelectClasses("compact")}
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
                      updatingType={updatingType}
                      onReclassify={handleReclassify}
                      onUpdateType={handleUpdateType}
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
