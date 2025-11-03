"use client";

import React, { useState, useEffect } from "react";
import type { Account, Currency, AccountNetwork } from "@/app/capital/types";
import { API_URL } from "@/lib/config";
import { Balance } from "@/components/ui/Balance";

interface AccountCardProps {
  account: Account;
  isInGroup?: boolean;
}

interface AccountBalance {
  account_id: string;
  balance: {
    amount: string;
    ccy: string;
  };
  as_of: number;
}

export function AccountCard({ account, isInGroup = false }: AccountCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [balance, setBalance] = useState<AccountBalance | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Fetch balance for Checking, Savings, Credit, and BrokerageAccount
  useEffect(() => {
    const shouldFetchBalance =
      account.metadata.type === "Checking" ||
      account.metadata.type === "Savings" ||
      account.metadata.type === "Credit" ||
      account.metadata.type === "BrokerageAccount";

    if (shouldFetchBalance) {
      setLoadingBalance(true);
      fetch(`${API_URL}/capital/accounts/${account.id}/balance`, {
        credentials: "include",
      })
        .then((res) => res.json())
        .then((data) => {
          setBalance(data);
        })
        .catch((err) => {
          console.error(`Failed to fetch balance for ${account.id}:`, err);
        })
        .finally(() => {
          setLoadingBalance(false);
        });
    }
  }, [account.id, account.metadata.type]);
  const getCurrencySymbol = (currency: Currency) => {
    if (currency === "USD") return "$";
    if (currency === "HKD") return "HK$";
    if (currency === "BTC") return "₿";
    return "";
  };

  const formatBalance = (amount: string): string => {
    const num = parseFloat(amount);
    if (isNaN(num)) return amount;
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const getAccountTypeColor = (type: string) => {
    switch (type) {
      case "Checking":
        return "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300";
      case "Savings":
        return "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300";
      case "Credit":
        return "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300";
      case "CryptoWallet":
        return "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300";
      case "Cex":
        return "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300";
      case "Trust":
        return "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300";
      case "BrokerageAccount":
        return "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300";
      default:
        return "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300";
    }
  };

  const getBlockchainExplorerUrl = (
    address: string,
    network: AccountNetwork | string
  ): string | null => {
    const evmExplorer =
      process.env.NEXT_PUBLIC_EVM_EXPLORER || "https://etherscan.io";
    const solanaExplorer =
      process.env.NEXT_PUBLIC_SOLANA_EXPLORER || "https://solscan.io";
    const bitcoinExplorer =
      process.env.NEXT_PUBLIC_BITCOIN_EXPLORER ||
      "https://blockchain.com/bitcoin";

    // Handle legacy string format
    if (typeof network === "string") {
      const networkLower = network.toLowerCase();
      if (networkLower === "solana") {
        return `${solanaExplorer}/account/${address}`;
      } else if (networkLower === "bitcoin") {
        return `${bitcoinExplorer}/address/${address}`;
      }
      // Assume EVM for other strings
      return `${evmExplorer}/address/${address}`;
    }

    // Handle object format
    if (network.EVM) {
      return `${evmExplorer}/address/${address}`;
    } else if (network.Solana !== undefined) {
      return `${solanaExplorer}/account/${address}`;
    } else if (network.Bitcoin !== undefined) {
      return `${bitcoinExplorer}/address/${address}`;
    }
    return null;
  };

  const getNetworkName = (network: AccountNetwork | string): string => {
    // Handle legacy string format
    if (typeof network === "string") {
      return network;
    }

    // Handle object format
    if (network.EVM) {
      return network.EVM.chain_name;
    } else if (network.Solana !== undefined) {
      return "Solana";
    } else if (network.Bitcoin !== undefined) {
      return "Bitcoin";
    }
    return "Unknown";
  };

  const getCompactInfo = () => {
    const { type, data } = account.metadata;

    switch (type) {
      case "Checking":
      case "Savings": {
        const d = data as { account_number: string };
        return `(${d.account_number.slice(-4)})`;
      }
      case "Credit": {
        const d = data as { credit_card_name: string; account_number: string };
        return `${d.credit_card_name} •••${d.account_number.slice(-4)}`;
      }
      case "CryptoWallet": {
        const d = data as { address: string; network: AccountNetwork | string };
        const network = getNetworkName(d.network);
        return `${network} • ${d.address.slice(0, 6)}...${d.address.slice(-4)}`;
      }
      case "Cex": {
        const d = data as { cex_name: string };
        return d.cex_name;
      }
      case "Trust": {
        const d = data as { trustee: string };
        return d.trustee;
      }
      case "BrokerageAccount": {
        const d = data as { broker_name: string; account_number: string };
        return `${d.broker_name} •••${d.account_number.slice(-4)}`;
      }
      default:
        return "";
    }
  };

  const renderAccountDetails = () => {
    const { type, data } = account.metadata;

    switch (type) {
      case "Checking":
      case "Savings": {
        const d = data as {
          bank_name: string;
          owner_name: string;
          account_number: string;
          routing_number?: string | null;
        };
        return (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Bank:</span>
              <span className="text-gray-900 dark:text-white font-medium">
                {d.bank_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Owner:</span>
              <span className="text-gray-900 dark:text-white font-medium">
                {d.owner_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Account:</span>
              <span className="text-gray-900 dark:text-white font-medium font-mono text-xs">
                {d.account_number
                  .slice(-4)
                  .padStart(d.account_number.length, "•")}
              </span>
            </div>
          </>
        );
      }

      case "Credit": {
        const d = data as {
          credit_card_name: string;
          owner_name: string;
          account_number: string;
          routing_number?: string | null;
        };
        return (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Card:</span>
              <span className="text-gray-900 dark:text-white font-medium">
                {d.credit_card_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Owner:</span>
              <span className="text-gray-900 dark:text-white font-medium">
                {d.owner_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Number:</span>
              <span className="text-gray-900 dark:text-white font-medium font-mono text-xs">
                {d.account_number
                  .slice(-4)
                  .padStart(d.account_number.length, "•")}
              </span>
            </div>
          </>
        );
      }

      case "CryptoWallet": {
        const d = data as {
          address: string;
          network: AccountNetwork | string;
          is_ledger: boolean;
        };
        const networkName = getNetworkName(d.network);
        return (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Network:</span>
              <span className="text-gray-900 dark:text-white font-medium">
                {networkName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Address:</span>
              <span className="text-gray-900 dark:text-white font-medium font-mono text-xs">
                {d.address.slice(0, 6)}...{d.address.slice(-4)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Ledger:</span>
              <span className="text-gray-900 dark:text-white font-medium">
                {d.is_ledger ? "Yes" : "No"}
              </span>
            </div>
          </>
        );
      }

      case "Cex": {
        const d = data as {
          cex_name: string;
          account_id: string;
        };
        return (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">
                Exchange:
              </span>
              <span className="text-gray-900 dark:text-white font-medium">
                {d.cex_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">
                Account ID:
              </span>
              <span className="text-gray-900 dark:text-white font-medium font-mono text-xs">
                {d.account_id}
              </span>
            </div>
          </>
        );
      }

      case "Trust": {
        const d = data as {
          trustee: string;
          jurisdiction: string;
        };
        return (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Trustee:</span>
              <span className="text-gray-900 dark:text-white font-medium">
                {d.trustee}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">
                Jurisdiction:
              </span>
              <span className="text-gray-900 dark:text-white font-medium">
                {d.jurisdiction}
              </span>
            </div>
          </>
        );
      }

      case "BrokerageAccount": {
        const d = data as {
          broker_name: string;
          owner_name: string;
          account_number: string;
          account_type?: string | null;
        };
        return (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Broker:</span>
              <span className="text-gray-900 dark:text-white font-medium">
                {d.broker_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Owner:</span>
              <span className="text-gray-900 dark:text-white font-medium">
                {d.owner_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">
                Account Number:
              </span>
              <span className="text-gray-900 dark:text-white font-medium font-mono text-xs">
                •••{d.account_number.slice(-4)}
              </span>
            </div>
            {d.account_type && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Type:</span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {d.account_type}
                </span>
              </div>
            )}
          </>
        );
      }

      default:
        return null;
    }
  };

  // For crypto wallets, get explorer URL
  const { type, data } = account.metadata;
  let explorerUrl: string | null = null;
  if (type === "CryptoWallet") {
    const d = data as { address: string; network: AccountNetwork | string };
    explorerUrl = getBlockchainExplorerUrl(d.address, d.network);
  }

  if (isInGroup) {
    // Compact full-width card for grouped accounts
    return (
      <div
        className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-all ${
          isExpanded ? "shadow-md" : "shadow-sm"
        }`}
      >
        {/* Compact Header - Always Visible */}
        <div
          className="px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* <span
                className={`text-xs px-2 py-1 rounded whitespace-nowrap ${getAccountTypeColor(
                  account.metadata.type
                )}`}
              >
                {account.metadata.type}
              </span> */}
              <div className="flex-1 flex flex-row items-center gap-1 min-w-0">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                  {account.name}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 truncate">
                  {getCompactInfo()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Balance display for Checking, Savings, Credit, BrokerageAccount */}
              {balance && (
                <div className="text-right">
                  <div className="text-base font-semibold text-gray-900 dark:text-white">
                    <Balance
                      amount={balance.balance.amount}
                      ccy={account.currency}
                    />
                  </div>
                </div>
              )}
              {loadingBalance && (
                <div className="text-sm text-gray-400 dark:text-gray-500">
                  Loading...
                </div>
              )}
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                  title="View on blockchain explorer"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              )}
              <svg
                className={`w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform ${
                  isExpanded ? "rotate-180" : ""
                }`}
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
            </div>
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="px-4 pb-4 pt-2 border-t border-gray-200 dark:border-gray-700">
            {/* <div className="mb-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                Currency
              </p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {getCurrencySymbol(account.currency)} {account.currency}
              </p>
            </div> */}
            <div className="space-y-2 text-sm">{renderAccountDetails()}</div>
          </div>
        )}
      </div>
    );
  }

  // Original card design for non-grouped accounts
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-600">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {account.name}
        </h3>
        <div className="flex items-center gap-2">
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              title="View on blockchain explorer"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}
          <span
            className={`text-xs px-2 py-1 rounded ${getAccountTypeColor(
              account.metadata.type
            )}`}
          >
            {account.metadata.type}
          </span>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
          Currency
        </p>
        <p className="text-xl font-bold text-gray-900 dark:text-white">
          {getCurrencySymbol(account.currency)} {account.currency}
        </p>
      </div>

      <div className="space-y-2 text-sm">{renderAccountDetails()}</div>
    </div>
  );
}
