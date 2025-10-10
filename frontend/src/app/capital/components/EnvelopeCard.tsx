import React from "react";
import type { Envelope } from "../types";
import { formatMoney, getRolloverText } from "../utils";

interface EnvelopeCardProps {
  envelope: Envelope;
}

export function EnvelopeCard({ envelope }: EnvelopeCardProps) {
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
