"use client";

import React from "react";
import {
  formatDate,
  formatAmount,
  getAccountColorClasses,
} from "@/app/capital/utils";
import type { Transaction, Envelope } from "@/app/capital/types";

interface TransactionRowProps {
  transaction: Transaction;
  accountMap: Map<string, { name: string; color: string }>;
  envelopes: Envelope[];
  reclassifying: Set<string>;
  deleting: Set<string>;
  updatingType: Set<string>;
  onReclassify: (
    transactionId: string,
    legIndex: number,
    categoryId: string | null
  ) => void;
  onUpdateType: (transactionId: string, txType: string | null) => void;
  onDelete: (transactionId: string, payee: string) => void;
  onOpenModal: (transaction: Transaction) => void;
}

const PNL_ACCOUNT_ID = "__pnl__";

function getPnlLegIndex(tx: Transaction): number {
  const idx = tx.legs.findIndex((l) => l.account_id === PNL_ACCOUNT_ID);
  return idx >= 0 ? idx : tx.legs.findIndex((l) => l.category_id != null);
}

export default function TransactionRow({
  transaction: tx,
  accountMap,
  envelopes,
  reclassifying,
  deleting,
  updatingType,
  onReclassify,
  onUpdateType,
  onDelete,
  onOpenModal,
}: TransactionRowProps) {
  const pnlLegIdx = getPnlLegIndex(tx);
  const currentCategory =
    pnlLegIdx >= 0 ? tx.legs[pnlLegIdx]?.category_id ?? "" : "";

  const TX_TYPES = [
    { value: "spending", label: "Spending" },
    { value: "income", label: "Income" },
    { value: "fee_only", label: "Fee Only" },
    { value: "transfer", label: "Transfer" },
    { value: "transfer_fx", label: "Transfer (FX)" },
    { value: "trade", label: "Trade" },
    { value: "adjustment", label: "Adjustment" },
    { value: "refund", label: "Refund" },
  ];

  // if (tx.tx_type == "spending" || tx.tx_type == "refund")
  return (
    <tr
      key={tx.id}
      className="transition-color duration-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
      onClick={() => onOpenModal(tx)}
    >
      {/* Date */}
      <td className="px-6 py-3 whitespace-nowrap text-base text-gray-900 dark:text-white">
        {formatDate(tx.ts)}
      </td>
      {/* Account */}
      <td className="px-6 py-3 whitespace-nowrap">
        <div className="flex gap-2 items-center h-full">
          <span
            className={`text-sm font-medium rounded px-2 py-1 ${getAccountColorClasses(
              accountMap.get(tx.legs[0]?.account_id || "")?.color || "gray"
            )}`}
          >
            {accountMap.get(tx.legs[0]?.account_id || "")?.name ||
              tx.legs[0]?.account_id ||
              "N/A"}
          </span>

          {(tx.tx_type == "transfer" || tx.tx_type == "transfer_fx") && (
            <span
              className={`text-sm font-medium rounded px-2 py-1 ${getAccountColorClasses(
                accountMap.get(tx.legs[1]?.account_id || "")?.color || "gray"
              )}`}
            >
              {accountMap.get(tx.legs[1]?.account_id || "")?.name ||
                tx.legs[0]?.account_id ||
                "N/A"}
            </span>
          )}
        </div>
      </td>
      {/* Payee */}
      <td className="px-6 py-3 whitespace-nowrap text-base text-gray-900 dark:text-white">
        <div className="flex flex-col gap-1">
          <div>{tx.payee || "N/A"}</div>
        </div>
      </td>
      {/* Amount */}
      <td
        className={`px-6 py-3 whitespace-nowrap text-right text-base font-medium ${
          tx.legs[0]?.direction === "Credit"
            ? "text-red-700 dark:text-red-300"
            : "text-green-700 dark:text-green-300"
        }`}
      >
        {tx.legs[0]?.direction === "Credit" ? "-" : "+"}
        {formatAmount(
          tx.legs[0].amount.data.amount,
          tx.legs[0].amount.data.ccy
        )}
      </td>
      {/* Envelope */}
      <td className="px-6 py-3 whitespace-nowrap text-base align-middle">
        <div className="flex gap-4 items-center h-full">
          {/* Type */}
          <div
            className="flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <select
              value={tx.tx_type || ""}
              onChange={(e) => {
                const newType = e.target.value || null;
                onUpdateType(tx.id, newType);
              }}
              disabled={updatingType.has(tx.id)}
              className="px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
            >
              <option value="">No Type</option>
              {TX_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {updatingType.has(tx.id) && (
              <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            )}
          </div>
          {/* Envelope */}
          {(tx.tx_type == "spending" || tx.tx_type == "refund") && (
            <div className="flex items-center gap-2">
              <select
                value={currentCategory}
                onChange={(e) => {
                  const newCategoryId = e.target.value || null;
                  onReclassify(tx.id, pnlLegIdx, newCategoryId);
                }}
                disabled={reclassifying.has(tx.id)}
                className="px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              >
                <option value="">No Category</option>
                {envelopes.map((envelope) => (
                  <option key={envelope.id} value={envelope.id}>
                    {envelope.name}
                  </option>
                ))}
              </select>
              {reclassifying.has(tx.id) && (
                <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              )}
            </div>
          )}
        </div>
      </td>
      {/* Actions */}
      <td className="px-6 py-3 whitespace-nowrap text-base">
        <button
          onClick={() => onDelete(tx.id, tx.payee || "Unknown")}
          disabled={deleting.has(tx.id)}
          className="inline-flex items-center px-3 py-1 border border-red-300 dark:border-red-600 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-base font-medium transition-colors"
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
