"use client";

import React, { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";
import type { Envelope, Account } from "@/app/capital/types";
import { inferGroupKey, inferGroupLabel } from "@/app/capital/utils";
import { EnvelopeCard } from "@/app/capital/components/EnvelopeCard";
import { AccountRow } from "@/app/capital/components/AccountRow";

interface EnvelopeUsage {
  envelope_id: string;
  label: string;
  budget: { amount: string; ccy: string };
  spent: { amount: string; ccy: string };
  remaining: { amount: string; ccy: string };
  percent: number;
}

export default function CapitalPage() {
  const [activeTab, setActiveTab] = useState<"envelopes" | "accounts">(
    "envelopes"
  );
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [envelopeUsage, setEnvelopeUsage] = useState<
    Map<string, EnvelopeUsage>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [envelopesRes, accountsRes] = await Promise.all([
          fetch(`${API_URL}/capital/envelopes`),
          fetch(`${API_URL}/capital/accounts`),
        ]);

        if (!envelopesRes.ok || !accountsRes.ok) {
          throw new Error("Failed to fetch data");
        }

        const [envelopesData, accountsData] = await Promise.all([
          envelopesRes.json(),
          accountsRes.json(),
        ]);

        setEnvelopes(envelopesData);
        setAccounts(accountsData);

        // Fetch usage data for each envelope
        const usagePromises = envelopesData.map(async (env: Envelope) => {
          try {
            const res = await fetch(
              `${API_URL}/capital/envelopes/${env.id}/usage`
            );
            if (res.ok) {
              const usage: EnvelopeUsage = await res.json();
              return [env.id, usage] as [string, EnvelopeUsage];
            }
          } catch (err) {
            console.error(`Failed to fetch usage for ${env.id}:`, err);
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
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const grouped = accounts.reduce((map, acct) => {
    const key = inferGroupKey(acct);
    (map[key] ||= []).push(acct);
    return map;
  }, {} as Record<string, Account[]>);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (k: string) =>
    setOpenGroups((prev) => ({ ...prev, [k]: !prev[k] }));

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-500 dark:text-gray-400">
            Loading capital data...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-red-500 dark:text-red-400">Error: {error}</p>
        </div>
      </div>
    );
  }

  const totalBalance = envelopes.reduce((sum, env) => {
    const amount = parseFloat(env.balance.amount);
    if (env.balance.ccy === "USD") {
      return sum + amount;
    }
    return sum;
  }, 0);

  const activeEnvelopes = envelopes.filter((e) => e.status === "Active");
  const inactiveEnvelopes = envelopes.filter((e) => e.status === "Inactive");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Capital
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Family budget envelopes & accounts
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("envelopes")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "envelopes"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              Envelopes ({envelopes.length})
            </button>
            <button
              onClick={() => setActiveTab("accounts")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "accounts"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              Accounts ({accounts.length})
            </button>
          </nav>
        </div>

        {/* Envelopes Tab */}
        {activeTab === "envelopes" && (
          <>
            {/* Summary Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-8 border border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Total Balance (USD)
                  </p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    $
                    {totalBalance.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Active Envelopes
                  </p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {activeEnvelopes.length}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Inactive Envelopes
                  </p>
                  <p className="text-3xl font-bold text-gray-400 dark:text-gray-300">
                    {inactiveEnvelopes.length}
                  </p>
                </div>
              </div>
            </div>

            {/* Active Envelopes */}
            {activeEnvelopes.length > 0 && (
              <div className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  Active Envelopes
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeEnvelopes.map((envelope) => {
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
            )}

            {/* Inactive Envelopes */}
            {inactiveEnvelopes.length > 0 && (
              <div>
                <h2 className="text-2xl font-semibold text-gray-400 dark:text-gray-500 mb-4">
                  Inactive Envelopes
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {inactiveEnvelopes.map((envelope) => {
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
            )}
          </>
        )}

        {/* Accounts Tab */}
        {activeTab === "accounts" && (
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              All Accounts
            </h2>
            {Object.entries(grouped).map(([key, list]) => {
              const label = inferGroupLabel(list, key);
              const isOpen = !!openGroups[key];

              return (
                <div
                  key={key}
                  className="mb-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden"
                >
                  <button
                    onClick={() => toggleGroup(key)}
                    className="w-full px-4 py-3 flex items-center justify-between"
                  >
                    <span className="text-base font-semibold text-gray-900 dark:text-white">
                      {label}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        isOpen
                          ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {list.length} {list.length === 1 ? "account" : "accounts"}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {list.map((acct) => (
                        <AccountRow key={acct.id} account={acct} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {accounts.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400">
                No accounts found.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
