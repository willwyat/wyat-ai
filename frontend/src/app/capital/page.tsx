"use client";

import React, { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";

type Currency = "USD" | "HKD" | "BTC";

interface Money {
  amount: string;
  ccy: Currency;
}

interface FundingRule {
  amount: Money;
  freq: "Monthly";
}

interface RolloverPolicy {
  ResetToZero?: null;
  CarryOver?: { cap: Money | null };
  SinkingFund?: { cap: Money | null };
  Decay?: { keep_ratio: string; cap: Money | null };
}

interface Envelope {
  id: string;
  name: string;
  kind: "Fixed" | "Variable";
  status: "Active" | "Inactive";
  funding: FundingRule | null;
  rollover: RolloverPolicy;
  balance: Money;
  period_limit: Money | null;
  last_period: string | null;
  allow_negative: boolean;
  min_balance: string | null;
  deficit_policy: "AutoNet" | "RequireTransfer" | null;
}

interface AccountNetwork {
  EVM?: { chain_name: string; chain_id: number };
  Solana?: null;
  Bitcoin?: null;
}

interface AccountMetadata {
  type: "Checking" | "Savings" | "Credit" | "CryptoWallet" | "Cex" | "Trust";
  data:
    | {
        bank_name: string;
        owner_name: string;
        account_number: string;
        routing_number?: string | null;
      }
    | {
        credit_card_name: string;
        owner_name: string;
        account_number: string;
        routing_number?: string | null;
      }
    | {
        address: string;
        network: AccountNetwork;
        is_ledger: boolean;
      }
    | {
        cex_name: string;
        account_id: string;
      }
    | {
        trustee: string;
        jurisdiction: string;
      };
}

interface Account {
  id: string;
  name: string;
  currency: Currency;
  metadata: AccountMetadata;
  group_id?: string;
}

function formatMoney(money: Money): string {
  const amount = parseFloat(money.amount);
  let symbol = "$";
  if (money.ccy === "HKD") symbol = "HK$";
  if (money.ccy === "BTC") symbol = "₿";

  const decimals = money.ccy === "BTC" ? 8 : 2;
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${symbol}${formatted}`;
}

function getRolloverText(rollover: RolloverPolicy): string {
  // Handle the case where rollover might be a string or object
  if (typeof rollover === "string") {
    switch (rollover) {
      case "ResetToZero":
        return "Reset to Zero";
      case "CarryOver":
        return "Carry Over";
      case "SinkingFund":
        return "Sinking Fund";
      case "Decay":
        return "Decay";
      default:
        return rollover;
    }
  }

  // Handle object format
  if (rollover.ResetToZero !== undefined) return "Reset to Zero";
  if (rollover.CarryOver !== undefined) {
    const cap = rollover.CarryOver?.cap;
    return cap ? `Carry Over (cap: ${formatMoney(cap)})` : "Carry Over";
  }
  if (rollover.SinkingFund !== undefined) {
    const cap = rollover.SinkingFund?.cap;
    return cap ? `Sinking Fund (cap: ${formatMoney(cap)})` : "Sinking Fund";
  }
  if (rollover.Decay !== undefined) {
    const ratio = parseFloat(rollover.Decay?.keep_ratio || "0");
    return `Decay (${(ratio * 100).toFixed(0)}%)`;
  }
  return "Unknown";
}

function getNetworkName(net: AccountNetwork): string {
  if (net.EVM) return net.EVM.chain_name;
  if (net.Solana !== undefined) return "Solana";
  if (net.Bitcoin !== undefined) return "Bitcoin";
  return "Unknown";
}

function inferGroupKey(account: Account): string {
  if (account.group_id) return account.group_id;

  const { type, data } = account.metadata;
  if (type === "Checking" || type === "Savings") {
    const d = data as {
      bank_name: string;
      owner_name: string;
      account_number: string;
      routing_number?: string | null;
    };
    return `${d.bank_name} • ${d.owner_name}`;
  }
  if (type === "Credit") {
    const d = data as {
      credit_card_name: string;
      owner_name: string;
      account_number: string;
      routing_number?: string | null;
    };
    return `${d.credit_card_name} • ${d.owner_name}`;
  }
  if (type === "Cex") {
    const d = data as { cex_name: string; account_id: string };
    return d.cex_name;
  }
  if (type === "CryptoWallet") {
    const d = data as {
      address: string;
      network: AccountNetwork;
      is_ledger: boolean;
    };
    return getNetworkName(d.network);
  }
  return account.name;
}

function inferGroupLabel(accounts: Account[], key: string): string {
  if (accounts.length === 0) return key;
  const a = accounts[0];
  const { type, data } = a.metadata;

  if (type === "Checking" || type === "Savings") {
    const d = data as {
      bank_name: string;
      owner_name: string;
      account_number: string;
      routing_number?: string | null;
    };
    return `${d.bank_name} • ${d.owner_name}`;
  }
  if (type === "Credit") {
    const d = data as {
      credit_card_name: string;
      owner_name: string;
      account_number: string;
      routing_number?: string | null;
    };
    return `${d.credit_card_name} • ${d.owner_name}`;
  }
  if (type === "Cex") {
    const d = data as { cex_name: string; account_id: string };
    return d.cex_name;
  }
  if (type === "CryptoWallet") {
    const d = data as {
      address: string;
      network: AccountNetwork;
      is_ledger: boolean;
    };
    const label = getNetworkName(d.network);
    return accounts.length > 1 ? `${label} • Wallets` : label;
  }
  return key;
}

export default function CapitalPage() {
  const [activeTab, setActiveTab] = useState<"envelopes" | "accounts">(
    "envelopes"
  );
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
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
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-8 border dark:border-gray-700">
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
                  {activeEnvelopes.map((envelope) => (
                    <EnvelopeCard key={envelope.id} envelope={envelope} />
                  ))}
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
                  {inactiveEnvelopes.map((envelope) => (
                    <EnvelopeCard key={envelope.id} envelope={envelope} />
                  ))}
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

function EnvelopeCard({ envelope }: { envelope: Envelope }) {
  const isPositive = parseFloat(envelope.balance.amount) >= 0;
  const isActive = envelope.status === "Active";

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border ${
        isActive
          ? "border-gray-200 dark:border-gray-600"
          : "border-gray-100 dark:border-gray-700 opacity-60"
      }`}
    >
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {envelope.name}
        </h3>
        <span
          className={`text-xs px-2 py-1 rounded ${
            isActive
              ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
              : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
          }`}
        >
          {envelope.status}
        </span>
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Balance</p>
        <p
          className={`text-2xl font-bold ${
            isPositive
              ? "text-gray-900 dark:text-white"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {formatMoney(envelope.balance)}
        </p>
      </div>

      <div className="space-y-2 text-sm">
        {envelope.funding && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">
              Monthly Funding:
            </span>
            <span className="text-gray-900 dark:text-white font-medium">
              {formatMoney(envelope.funding.amount)}
            </span>
          </div>
        )}

        {envelope.period_limit && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">
              Period Limit:
            </span>
            <span className="text-gray-900 dark:text-white font-medium">
              {formatMoney(envelope.period_limit)}
            </span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Rollover:</span>
          <span className="text-gray-900 dark:text-white font-medium">
            {getRolloverText(envelope.rollover)}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Type:</span>
          <span className="text-gray-900 dark:text-white font-medium">
            {envelope.kind}
          </span>
        </div>

        {envelope.allow_negative && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">
              Min Balance:
            </span>
            <span className="text-gray-900 dark:text-white font-medium">
              {envelope.min_balance
                ? `$${parseFloat(envelope.min_balance).toFixed(2)}`
                : "No limit"}
            </span>
          </div>
        )}

        {envelope.last_period && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">
              Last Period:
            </span>
            <span className="text-gray-900 dark:text-white font-medium">
              {envelope.last_period}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function AccountCard({ account }: { account: Account }) {
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

function AccountRow({ account }: { account: Account }) {
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
