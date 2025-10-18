"use client";

import React from "react";

interface Transaction {
  id: string;
  ts: number;
  posted_ts?: number;
  source: string;
  payee?: string;
  memo?: string;
  status?: string;
  reconciled: boolean;
  external_refs: Array<[string, string]>;
  legs: Array<{
    account_id: string;
    direction: "Debit" | "Credit";
    amount: {
      kind: "Fiat";
      data: {
        amount: string;
        ccy: string;
      };
    };
    fx?: any;
    category_id?: string | null;
    fee_of_leg_idx?: number;
    notes?: string;
  }>;
}

interface Envelope {
  id: string;
  name: string;
  kind: "Fixed" | "Variable";
  status: "Active" | "Inactive";
  funding: any;
  rollover: any;
  balance: any;
  period_limit: any;
  last_period: string | null;
  allow_negative: boolean;
  min_balance: string | null;
  deficit_policy: string | null;
}

interface TransactionRowProps {
  transaction: Transaction;
  accountMap: Map<string, string>;
  envelopes: Envelope[];
  reclassifying: Set<string>;
  deleting: Set<string>;
  onReclassify: (
    transactionId: string,
    legIndex: number,
    categoryId: string | null
  ) => void;
  onDelete: (transactionId: string, payee: string) => void;
}

const PNL_ACCOUNT_ID = "__pnl__";

function getPnlLegIndex(tx: Transaction): number {
  const idx = tx.legs.findIndex((l) => l.account_id === PNL_ACCOUNT_ID);
  return idx >= 0 ? idx : tx.legs.findIndex((l) => l.category_id != null);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}

function formatAmount(amount: string, ccy: string): string {
  const num = parseFloat(amount);
  const symbol =
    ccy === "USD" ? "$" : ccy === "HKD" ? "HK$" : ccy === "BTC" ? "₿" : "";
  return `${symbol}${num.toFixed(2)}`;
}

export default function TransactionRow({
  transaction: tx,
  accountMap,
  envelopes,
  reclassifying,
  deleting,
  onReclassify,
  onDelete,
}: TransactionRowProps) {
  const pnlLegIdx = getPnlLegIndex(tx);
  const currentCategory =
    pnlLegIdx >= 0 ? tx.legs[pnlLegIdx]?.category_id ?? "" : "";

  return (
    <tr
      key={tx.id}
      className="transition-color duration-200 hover:bg-gray-50 dark:hover:bg-gray-700"
    >
      {/* Date */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
        {formatDate(tx.ts)}
      </td>
      {/* Account */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
        {accountMap.get(tx.legs[0]?.account_id || "") ||
          tx.legs[0]?.account_id ||
          "N/A"}
      </td>
      {/* Payee */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
        {tx.payee || "N/A"}
      </td>
      {/* Amount */}
      <td
        className={`px-6 py-4 whitespace-nowrap text-right text-sm ${
          tx.legs[0]?.direction === "Credit"
            ? "text-red-800 dark:text-red-300"
            : "text-green-800 dark:text-green-300"
        }`}
      >
        {tx.legs[0]?.direction === "Credit" ? "-" : "+"}
        {formatAmount(
          tx.legs[0].amount.data.amount,
          tx.legs[0].amount.data.ccy
        )}
      </td>
      {/* Envelope or Category */}
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <div className="flex items-center gap-2">
          <select
            value={currentCategory}
            onChange={(e) => {
              const newCategoryId = e.target.value || null;
              onReclassify(tx.id, pnlLegIdx, newCategoryId);
            }}
            disabled={reclassifying.has(tx.id)}
            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          >
            <option value="">No Category</option>
            {envelopes.map((envelope) => (
              <option key={envelope.id} value={envelope.id}>
                {envelope.name}
              </option>
            ))}
          </select>
          {reclassifying.has(tx.id) && (
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          )}
        </div>
      </td>
      {/* Actions */}
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <button
          onClick={() => onDelete(tx.id, tx.payee || "Unknown")}
          disabled={deleting.has(tx.id)}
          className="inline-flex items-center px-3 py-1 border border-red-300 dark:border-red-600 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-sm font-medium transition-colors"
          title="Delete transaction"
        >
          {deleting.has(tx.id) ? (
            <div className="animate-spin h-4 w-4 border-2 border-red-500 border-t-transparent rounded-full"></div>
          ) : (
            <>
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Delete
            </>
          )}
        </button>
      </td>
    </tr>
  );
}
