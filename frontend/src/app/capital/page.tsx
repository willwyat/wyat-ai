"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";

interface Money {
  amount: string;
  ccy: "USD" | "HKD";
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

function formatMoney(money: Money): string {
  const amount = parseFloat(money.amount);
  const symbol = money.ccy === "USD" ? "$" : "HK$";
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

export default function CapitalPage() {
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEnvelopes() {
      try {
        const response = await fetch(`${API_URL}/capital/envelopes`);
        if (!response.ok) {
          throw new Error("Failed to fetch envelopes");
        }
        const data = await response.json();
        setEnvelopes(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchEnvelopes();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-500 dark:text-gray-400">
            Loading envelopes...
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
            Family budget envelopes
          </p>
        </div>

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
