import React from "react";
import type { Account, Currency, AccountNetwork } from "../types";
import { getNetworkName } from "../utils";

interface AccountRowProps {
  account: Account;
}

export function AccountRow({ account }: AccountRowProps) {
  const badge = (t: string) => {
    const map: Record<string, string> = {
      Checking: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
      Savings:
        "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300",
      Credit:
        "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300",
      CryptoWallet:
        "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300",
      Cex: "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300",
      Trust:
        "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300",
    };
    return (
      map[t] || "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
    );
  };

  const currencySymbol = (c: Currency) =>
    c === "USD" ? "$" : c === "HKD" ? "HK$" : "₿";

  const { type, data } = account.metadata;

  // compact, one-line-ish detail renderer
  let details: React.ReactNode = null;

  if (type === "Checking" || type === "Savings") {
    const d = data as {
      bank_name: string;
      owner_name: string;
      account_number: string;
      routing_number?: string | null;
    };
    const masked = d.account_number
      .slice(-4)
      .padStart(d.account_number.length, "•");
    details = (
      <div className="flex gap-6 text-sm">
        <span className="text-gray-500 dark:text-gray-400">
          Bank:{" "}
          <span className="text-gray-900 dark:text-white">{d.bank_name}</span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          Owner:{" "}
          <span className="text-gray-900 dark:text-white">{d.owner_name}</span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          Acct:{" "}
          <span className="text-gray-900 dark:text-white font-mono text-xs">
            {masked}
          </span>
        </span>
      </div>
    );
  } else if (type === "Credit") {
    const d = data as {
      credit_card_name: string;
      owner_name: string;
      account_number: string;
      routing_number?: string | null;
    };
    const masked = d.account_number
      .slice(-4)
      .padStart(d.account_number.length, "•");
    details = (
      <div className="flex gap-6 text-sm">
        <span className="text-gray-500 dark:text-gray-400">
          Card:{" "}
          <span className="text-gray-900 dark:text-white">
            {d.credit_card_name}
          </span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          Owner:{" "}
          <span className="text-gray-900 dark:text-white">{d.owner_name}</span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          No.:{" "}
          <span className="text-gray-900 dark:text-white font-mono text-xs">
            {masked}
          </span>
        </span>
      </div>
    );
  } else if (type === "CryptoWallet") {
    const d = data as {
      address: string;
      network: AccountNetwork;
      is_ledger: boolean;
    };
    const short = `${d.address.slice(0, 6)}…${d.address.slice(-4)}`;
    const net = getNetworkName(d.network);
    details = (
      <div className="flex gap-6 text-sm">
        <span className="text-gray-500 dark:text-gray-400">
          Network: <span className="text-gray-900 dark:text-white">{net}</span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          Address:{" "}
          <span className="text-gray-900 dark:text-white font-mono text-xs">
            {short}
          </span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          Ledger:{" "}
          <span className="text-gray-900 dark:text-white">
            {d.is_ledger ? "Yes" : "No"}
          </span>
        </span>
      </div>
    );
  } else if (type === "Cex") {
    const d = data as { cex_name: string; account_id: string };
    details = (
      <div className="flex gap-6 text-sm">
        <span className="text-gray-500 dark:text-gray-400">
          Exchange:{" "}
          <span className="text-gray-900 dark:text-white">{d.cex_name}</span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          Account ID:{" "}
          <span className="text-gray-900 dark:text-white font-mono text-xs">
            {d.account_id}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-3 flex items-center justify-between bg-white dark:bg-gray-800">
      <div className="flex items-center gap-3">
        <span
          className={`text-xs px-2 py-1 rounded ${badge(type)}`}
          title={type}
        >
          {type}
        </span>
        <span className="text-gray-900 dark:text-white font-medium">
          {account.name}
        </span>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Currency:{" "}
          <span className="text-gray-900 dark:text-white font-semibold">
            {currencySymbol(account.currency)} {account.currency}
          </span>
        </div>
        {details}
      </div>
    </div>
  );
}
