import React from "react";
import type { Account, Currency, AccountNetwork } from "@/app/capital/types";

interface AccountCardProps {
  account: Account;
}

export function AccountCard({ account }: AccountCardProps) {
  const getCurrencySymbol = (currency: Currency) => {
    if (currency === "USD") return "$";
    if (currency === "HKD") return "HK$";
    if (currency === "BTC") return "₿";
    return "";
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
      default:
        return "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300";
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
          network: AccountNetwork;
          is_ledger: boolean;
        };
        let networkName = "Unknown";
        if (d.network.EVM) {
          networkName = d.network.EVM.chain_name;
        } else if (d.network.Solana !== undefined) {
          networkName = "Solana";
        } else if (d.network.Bitcoin !== undefined) {
          networkName = "Bitcoin";
        }
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

      default:
        return null;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-600">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {account.name}
        </h3>
        <span
          className={`text-xs px-2 py-1 rounded ${getAccountTypeColor(
            account.metadata.type
          )}`}
        >
          {account.metadata.type}
        </span>
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
