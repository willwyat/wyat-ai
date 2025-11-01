"use client";

import React, { useEffect } from "react";
import { useCapitalStore } from "@/stores";
import TransactionRow from "@/app/capital/components/TransactionRow";
import { EnvelopeCard } from "@/app/capital/components/EnvelopeCard";
import TransactionModal from "@/app/capital/components/TransactionModal";
import TransactionCreateModal from "@/app/capital/components/TransactionCreateModal";
import { getSelectClasses, styles } from "@/app/capital/styles";
import { UI_CONFIG } from "@/app/capital/config";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";

export default function TransactionsPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);

  const {
    // Data
    transactions,
    envelopes,
    accounts,
    cycles,
    envelopeUsage,

    // UI State
    loading,
    error,
    filters,
    sortOrder,

    // Operation States
    reclassifying,
    deleting,
    updatingType,

    // Modal State
    selectedTransaction,
    isModalOpen,

    // Actions
    fetchTransactions,
    fetchEnvelopes,
    fetchAccounts,
    fetchCycles,
    fetchEnvelopeUsage,
    reclassifyTransaction,
    updateTransactionType,
    deleteTransaction,
    setFilters,
    setSortOrder,
    setSelectedTransaction,
    setIsModalOpen,
    clearError,
  } = useCapitalStore();

  // Create a map of account IDs to account info
  const accountMap = new Map(
    accounts.map((account) => [
      account.id,
      {
        name: account.name,
        color: account.metadata.data.color || "gray",
      },
    ])
  );

  // Load data on component mount
  useEffect(() => {
    fetchEnvelopes();
    fetchAccounts();
    fetchCycles();
  }, [fetchEnvelopes, fetchAccounts, fetchCycles]);

  // Set default cycle to active cycle once cycles are loaded
  useEffect(() => {
    if (cycles && !filters.label) {
      setFilters({ label: cycles.active });
    }
  }, [cycles, filters.label, setFilters]);

  // Fetch transactions when filters change
  useEffect(() => {
    fetchTransactions();
  }, [filters, fetchTransactions]);

  // Fetch envelope usage when cycle changes or envelopes are loaded
  useEffect(() => {
    if (filters.label && envelopes.length > 0) {
      fetchEnvelopeUsage(filters.label);
    }
  }, [filters.label, envelopes.length, fetchEnvelopeUsage]);

  const handleReclassify = (
    transactionId: string,
    legIndex: number,
    categoryId: string | null
  ) => {
    reclassifyTransaction(transactionId, legIndex, categoryId);
  };

  const handleUpdateType = (transactionId: string, txType: string | null) => {
    updateTransactionType(transactionId, txType);
  };

  const handleDelete = (transactionId: string, payee: string) => {
    deleteTransaction(transactionId, payee);
  };

  const handleOpenModal = (transaction: any) => {
    setSelectedTransaction(transaction);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTransaction(null);
  };

  const handleCyclePrev = () => {
    if (!cycles || !filters.label) return;
    const currentIndex = cycles.labels.indexOf(filters.label);
    if (currentIndex > 0) {
      setFilters({ label: cycles.labels[currentIndex - 1] });
    }
  };

  const handleCycleNext = () => {
    if (!cycles || !filters.label) return;
    const currentIndex = cycles.labels.indexOf(filters.label);
    if (currentIndex < cycles.labels.length - 1) {
      setFilters({ label: cycles.labels[currentIndex + 1] });
    }
  };

  const handleSortByDate = () => {
    setSortOrder(
      sortOrder === "default"
        ? "desc"
        : sortOrder === "desc"
        ? "asc"
        : "default"
    );
  };

  const getSortedTransactions = () => {
    if (sortOrder === "default") {
      return transactions;
    }
    return [...transactions].sort((a, b) => {
      const comparison = a.ts - b.ts;
      return sortOrder === "asc" ? comparison : -comparison;
    });
  };

  if (loading && transactions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
              Error
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">{error}</p>
            <button
              onClick={clearError}
              className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto">
        {/* Header

        <div className="py-16 sm:px-3 lg:px-8 bg-red-500 flex justify-between items-start">
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white font-serif">
              Capital
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              View and filter transaction history
            </p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-rounded text-lg">add</span>
            Create Transaction
          </button>
        </div> */}
        <div className="px-3 sm:px-3 lg:px-8 py-4">
          {/* Actions */}
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-rounded text-lg">add</span>
              Create Transaction
            </button>
          </div>
          {/* Cycle Navigation */}

          <div className="py-4 flex items-center justify-center gap-12">
            <button
              onClick={handleCyclePrev}
              disabled={
                !cycles ||
                !filters.label ||
                cycles.labels.indexOf(filters.label) === 0
              }
              className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              title="Previous cycle"
            >
              <ChevronLeftIcon className="w-9 h-9 pr-1" />
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
              className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Next cycle"
            >
              <ChevronRightIcon className="w-9 h-9 pl-1" />
            </button>
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

          {/* Transactions Table */}
          {!loading && !error && (
            <div className="bg-white dark:bg-gray-800 md:rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="px-3 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className={styles.text.subheading}>
                  Transactions ({getSortedTransactions().length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th
                        className="pl-6 pr-3 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
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
                      <th className="px-3 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        <div className="flex flex-col gap-1">
                          <span>Account</span>
                          <select
                            id="account-filter"
                            value={filters.account_id || ""}
                            onChange={(e) =>
                              setFilters({
                                account_id: e.target.value || undefined,
                              })
                            }
                            className={getSelectClasses("small")}
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
                      <th className="px-3 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider max-w-xs">
                        Payee
                      </th>
                      <th className="px-3 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">
                        Amount
                      </th>
                      <th className="px-3 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Rate
                      </th>
                      <th className="px-3 py-3 text-left text-sm text-gray-500 dark:text-gray-400 uppercase">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium tracking-wider">
                            Type & Envelope
                          </span>
                          <div className="flex gap-2">
                            <select
                              id="tx-type-filter"
                              value={filters.tx_type || ""}
                              onChange={(e) =>
                                setFilters({
                                  tx_type: e.target.value || undefined,
                                })
                              }
                              className={getSelectClasses("small")}
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
                                setFilters({
                                  envelope_id: e.target.value || undefined,
                                })
                              }
                              className={getSelectClasses("small")}
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
                      <th className="px-3 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" />
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
        </div>

        {/* Transaction Modal */}
        <TransactionModal
          isOpen={isModalOpen}
          transaction={selectedTransaction}
          onClose={handleCloseModal}
          accountMap={accountMap}
          envelopes={envelopes}
          onDelete={handleDelete}
          deleting={deleting}
          onRefresh={async () => {
            const currentTxId = selectedTransaction?.id;
            await fetchTransactions();
            await fetchEnvelopes();

            // Update the selected transaction with fresh data
            if (currentTxId) {
              const updatedTx = transactions.find(
                (tx) => tx.id === currentTxId
              );
              if (updatedTx) {
                setSelectedTransaction(updatedTx);
              }
            }
          }}
        />

        {/* Transaction Create Modal */}
        <TransactionCreateModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
        />
      </div>
    </div>
  );
}
