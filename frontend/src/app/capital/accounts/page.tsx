"use client";

import React, { useEffect, useState } from "react";
import { useCapitalStore } from "@/stores/capital-store";
import { AccountCard } from "@/app/capital/components/AccountCard";
import { AccountGroupBalance } from "@/app/capital/components/AccountGroupBalance";
import AccountCreateModal from "@/app/capital/components/AccountCreateModal";
import type { Account } from "@/app/capital/types";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";
import { usePreferencesStore } from "@/stores/preferences-store";

export default function AccountsPage() {
  const { accounts, loading, error, fetchAccounts, createAccount } =
    useCapitalStore();
  const { hideBalances, toggleHideBalances } = usePreferencesStore();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Set page title
  useEffect(() => {
    document.title = "Accounts - Wyat AI";
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleCreateAccount = async (account: Account) => {
    setCreating(true);
    setCreateError(null);
    try {
      await createAccount(account);
      setIsCreateModalOpen(false);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create account"
      );
      throw err; // Re-throw to let modal handle it
    } finally {
      setCreating(false);
    }
  };

  const getAccountGroupName = (groupId: string) => {
    switch (groupId) {
      case "grp.hsbc_joint":
        return "HSBC Joint";
      case "grp.chase_william":
        return "Chase William";
      case "grp.sofi_william":
        return "SoFi William";
      case "grp.fund_altcoins":
        return "Altcoins Fund";
      case "grp.fund_btc_accum":
        return "BTC Accumulation Fund";
    }
  };

  // Separate accounts into grouped and ungrouped
  const groupedAccountsMap = new Map<string, Account[]>();
  const ungroupedAccounts: Account[] = [];

  console.log("=== ACCOUNTS PAGE DEBUG ===");
  console.log("Total accounts:", accounts.length);

  accounts.forEach((account) => {
    console.log(
      `Account: ${account.id}, group_id: ${account.group_id}, group_order: ${account.group_order}`
    );

    if (account.group_id) {
      console.log(`  -> Adding to group: ${account.group_id}`);
      if (!groupedAccountsMap.has(account.group_id)) {
        groupedAccountsMap.set(account.group_id, []);
      }
      groupedAccountsMap.get(account.group_id)!.push(account);
    } else {
      console.log(`  -> Adding to ungrouped (type: ${account.metadata.type})`);
      ungroupedAccounts.push(account);
    }
  });

  console.log("Grouped accounts map size:", groupedAccountsMap.size);
  console.log("Ungrouped accounts count:", ungroupedAccounts.length);
  console.log("=========================");

  // Sort accounts within each group by group_order if present
  groupedAccountsMap.forEach((accounts) => {
    accounts.sort((a, b) => {
      const orderA = a.group_order ?? 999;
      const orderB = b.group_order ?? 999;
      return orderA - orderB;
    });
  });

  // Group ungrouped accounts by type
  const ungroupedByType = ungroupedAccounts.reduce((acc, account) => {
    const type = account.metadata.type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(account);
    return acc;
  }, {} as Record<string, Account[]>);

  const typeOrder = [
    "Checking",
    "Savings",
    "Credit",
    "CryptoWallet",
    "Cex",
    "Trust",
  ];
  const sortedTypes = typeOrder.filter((type) => ungroupedByType[type]);

  // Count total accounts including grouped ones
  const totalAccountCount = accounts.length;
  const groupedCount = Array.from(groupedAccountsMap.values()).reduce(
    (sum, group) => sum + group.length,
    0
  );
  const ungroupedCount = ungroupedAccounts.length;

  if (loading && accounts.length === 0) {
    return (
      <div className="p-6">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 dark:border-blue-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <header className="h-20 mb-8 flex justify-between items-center">
        <Heading level={1}>Accounts</Heading>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          + Create Account
        </button>
      </header>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {createError && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
          {createError}
        </div>
      )}

      {/* Accounts Summary */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-600">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Total Accounts
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {totalAccountCount}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-600">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Account Groups
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {groupedAccountsMap.size}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-600">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Traditional Banking
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {
              accounts.filter((a) =>
                ["Checking", "Savings", "Credit"].includes(a.metadata.type)
              ).length
            }
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-600">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Crypto & Digital
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {
              accounts.filter((a) =>
                ["CryptoWallet", "Cex"].includes(a.metadata.type)
              ).length
            }
          </div>
        </div>
      </div>

      {/* Accounts by Type */}
      {accounts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-12 text-center border border-gray-200 dark:border-gray-600">
          <div className="text-gray-400 dark:text-gray-500 mb-4">
            <svg
              className="mx-auto h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No accounts yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Get started by creating your first account
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Create Account
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Grouped Accounts Section */}
          {groupedAccountsMap.size > 0 && (
            <div>
              {/* <div className="flex items-center justify-between">
                <Text variant="h2">Account Groups</Text>
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({groupedAccountsMap.size} groups, {groupedCount} accounts)
                </span>
              </div> */}
              <div className="space-y-6">
                {Array.from(groupedAccountsMap.entries()).map(
                  ([groupId, groupAccounts]) => (
                    <div key={groupId}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-4">
                          <Heading level={3}>
                            {getAccountGroupName(groupId)}
                          </Heading>

                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {groupAccounts.length} account
                            {groupAccounts.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <AccountGroupBalance
                          accounts={groupAccounts}
                          groupId={groupId}
                        />
                      </div>
                      <div className="space-y-2">
                        {groupAccounts.map((account) => (
                          <AccountCard
                            key={account.id}
                            account={account}
                            isInGroup={true}
                          />
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Ungrouped Accounts by Type */}
          {sortedTypes.map((type) => (
            <div key={type}>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                {type === "CryptoWallet"
                  ? "Crypto Wallets"
                  : type === "Cex"
                  ? "Centralized Exchanges"
                  : type === "Credit"
                  ? "Credit Cards"
                  : `${type} Accounts`}
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({ungroupedByType[type].length})
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 gap-4">
                {ungroupedByType[type].map((account) => (
                  <AccountCard key={account.id} account={account} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Account Modal */}
      <AccountCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setCreateError(null);
        }}
        onSubmit={handleCreateAccount}
      />
    </div>
  );
}
