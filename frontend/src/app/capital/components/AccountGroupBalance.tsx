"use client";

import React, { useState, useEffect } from "react";
import type { Account, Currency } from "@/app/capital/types";
import { API_URL } from "@/lib/config";
import { Balance } from "@/components/ui/Balance";

interface AccountGroupBalanceProps {
  accounts: Account[];
  groupId: string;
}

interface AccountBalance {
  account_id: string;
  balance: {
    amount: string;
    ccy: string;
  };
  as_of: number;
}

export function AccountGroupBalance({
  accounts,
  groupId,
}: AccountGroupBalanceProps) {
  const [balances, setBalances] = useState<Map<string, AccountBalance>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only fetch balances for Checking, Savings, Credit, and BrokerageAccount
    const accountsToFetch = accounts.filter(
      (acc) =>
        acc.metadata.type === "Checking" ||
        acc.metadata.type === "Savings" ||
        acc.metadata.type === "Credit" ||
        acc.metadata.type === "BrokerageAccount"
    );

    if (accountsToFetch.length === 0) return;

    setLoading(true);

    // Fetch all balances in parallel
    Promise.all(
      accountsToFetch.map((account) =>
        fetch(`${API_URL}/capital/accounts/${account.id}/balance`, {
          credentials: "include",
        })
          .then((res) => res.json())
          .then((data: AccountBalance) => [account.id, data] as const)
          .catch((err) => {
            console.error(`Failed to fetch balance for ${account.id}:`, err);
            return null;
          })
      )
    )
      .then((results) => {
        const newBalances = new Map<string, AccountBalance>();
        results.forEach((result) => {
          if (result) {
            newBalances.set(result[0], result[1]);
          }
        });
        setBalances(newBalances);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [accounts]);

  // Calculate aggregate balances by currency
  const aggregateBalances = new Map<string, number>();
  balances.forEach((balance) => {
    const ccy = balance.balance.ccy;
    const amount = parseFloat(balance.balance.amount);
    if (!isNaN(amount)) {
      aggregateBalances.set(ccy, (aggregateBalances.get(ccy) || 0) + amount);
    }
  });

  if (loading) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Loading balances...
      </div>
    );
  }

  if (aggregateBalances.size === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-4">
      {Array.from(aggregateBalances.entries()).map(([ccy, total]) => (
        <div key={ccy} className="text-right">
          <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">
            Total
          </div>
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            <Balance amount={total} ccy={ccy} />
          </div>
        </div>
      ))}
    </div>
  );
}
