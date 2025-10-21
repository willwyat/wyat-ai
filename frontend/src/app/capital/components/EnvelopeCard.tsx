import React from "react";
import { formatAmount } from "../utils";
import type { Envelope } from "../types";
import { formatMoney, getRolloverText } from "../utils";

interface EnvelopeCardProps {
  envelope: Envelope;
  totalSpent?: {
    amount: string;
    ccy: string;
  };
  budget?: {
    amount: string;
    ccy: string;
  };
  percent?: number;
}

export function EnvelopeCard({
  envelope,
  totalSpent,
  budget,
  percent,
}: EnvelopeCardProps) {
  console.log("EnvelopeCard", envelope, totalSpent, budget, percent);
  const isPositive = parseFloat(envelope.balance.amount) >= 0;
  const isActive = envelope.status === "Active";

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg p-6 border ${
        isActive
          ? "border-gray-200 dark:border-gray-600"
          : "border-gray-100 dark:border-gray-700 opacity-60"
      }`}
    >
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {envelope.name}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded px-2 py-1">
            {getRolloverText(envelope.rollover)}
          </span>
        </div>
      </div>

      {/* Spending Summary */}
      {totalSpent && budget && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Cycle Spending
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-400">
              {(percent! * 100).toFixed(1)}%
            </p>
          </div>
          <div className="flex justify-between items-baseline">
            <div>
              <p className="text-3xl font-bold text-blue-900 dark:text-blue-50">
                {formatAmount(totalSpent.amount, totalSpent.ccy)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
                of {formatAmount(budget.amount, budget.ccy)}
              </p>
            </div>
            {/* Progress bar */}
            <div className="w-24 h-2 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${
                  percent! > 1
                    ? "bg-red-500"
                    : percent! > 0.8
                    ? "bg-amber-500"
                    : "bg-blue-500"
                }`}
                style={{ width: `${Math.min(percent! * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2 text-sm">
        {envelope.period_limit && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">
              Period Limit
            </span>
            <span className="text-gray-900 dark:text-white font-medium">
              {formatMoney(envelope.period_limit)}
            </span>
          </div>
        )}

        {envelope.allow_negative && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">
              Min Balance
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
              Last Period
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
