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

type MoneyLike = { amount: string | number; ccy: string };

function isPnlLeg(l: Transaction["legs"][number]) {
  return l.account_id === PNL_ACCOUNT_ID || l.category_id != null;
}

function pickFiatAmount(l?: any): MoneyLike | null {
  if (!l) return null;
  if (l.amount?.kind === "Fiat")
    return { amount: l.amount.data.amount, ccy: l.amount.data.ccy };
  const v = l.amount?.data?.amount ?? l.amount?.amount;
  const c = l.amount?.data?.ccy ?? l.amount?.ccy;
  return v != null && c ? { amount: v, ccy: c } : null;
}

function deriveRoles(tx: Transaction) {
  const pnl = tx.legs.find(isPnlLeg);
  const assets = tx.legs.filter((l) => !isPnlLeg(l));
  const from = assets.find((l) => l.direction === "Credit");
  const to = assets.find((l) => l.direction === "Debit");
  const hasFx = !!(from?.fx || to?.fx);
  const fxRate = from?.fx?.rate ?? to?.fx?.rate ?? null;
  return { pnl, assets, from, to, hasFx, fxRate };
}

type RowView = {
  showEnvelope: boolean;
  amount: MoneyLike | null;
  sign: "" | "+" | "-";
  colorClass: string;
  accounts: { from?: string; to?: string; single?: string };
  subtitle?: string | null;
};

function viewFor(tx: Transaction): RowView {
  const { pnl, from, to, hasFx, fxRate } = deriveRoles(tx);
  const type = tx.tx_type || "adjustment";

  const red = "text-red-700 dark:text-red-300";
  const green = "text-green-700 dark:text-green-300";
  const neutral = "text-gray-800 dark:text-gray-100";

  switch (type) {
    case "spending": {
      const amt = pickFiatAmount(pnl);
      return {
        showEnvelope: true,
        amount: amt,
        sign: "-",
        colorClass: red,
        accounts: { single: from?.account_id || to?.account_id },
      };
    }
    case "refund": {
      const amt = pickFiatAmount(pnl);
      return {
        showEnvelope: true,
        amount: amt,
        sign: "+",
        colorClass: green,
        accounts: { single: to?.account_id || from?.account_id },
      };
    }
    case "income": {
      const amt = pickFiatAmount(pnl);
      return {
        showEnvelope: false,
        amount: amt,
        sign: "+",
        colorClass: green,
        accounts: { single: to?.account_id },
      };
    }
    case "transfer": {
      // Show destination amount if present; otherwise source
      const amt = pickFiatAmount(to) || pickFiatAmount(from);
      return {
        showEnvelope: false,
        amount: amt,
        sign: "",
        colorClass: neutral,
        accounts: { from: from?.account_id, to: to?.account_id },
      };
    }
    case "transfer_fx": {
      const amt = pickFiatAmount(to) || pickFiatAmount(from);
      const rateStr = fxRate ? `${fxRate}` : null;
      return {
        showEnvelope: false,
        amount: amt,
        sign: "",
        colorClass: neutral,
        accounts: { from: from?.account_id, to: to?.account_id },
      };
    }
    case "fee_only": {
      const amt = pickFiatAmount(pnl) || pickFiatAmount(from);
      return {
        showEnvelope: false,
        amount: amt,
        sign: "-",
        colorClass: red,
        accounts: { single: from?.account_id },
      };
    }
    case "trade": {
      // Neutral row; amount can be valued leg if present—leave neutral
      const amt =
        pickFiatAmount(to) || pickFiatAmount(from) || pickFiatAmount(pnl);
      return {
        showEnvelope: false,
        amount: amt,
        sign: "",
        colorClass: neutral,
        accounts: { from: from?.account_id, to: to?.account_id },
      };
    }
    default: {
      const amt =
        pickFiatAmount(pnl) || pickFiatAmount(to) || pickFiatAmount(from);
      return {
        showEnvelope: false,
        amount: amt,
        sign: "",
        colorClass: neutral,
        accounts: { single: from?.account_id || to?.account_id },
      };
    }
  }
}

const TypeBadge: React.FC<{ kind?: string | null }> = ({ kind }) => {
  if (!kind) return null;
  const map: Record<string, string> = {
    spending: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300",
    refund:
      "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300",
    income:
      "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300",
    transfer: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
    transfer_fx:
      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
    fee_only:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
    trade: "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
    adjustment:
      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${map[kind] || ""}`}>
      {kind.replace("_", " ")}
    </span>
  );
};

const AccountPill: React.FC<{
  id?: string | null;
  accountMap: Map<string, { name: string; color: string }>;
}> = ({ id, accountMap }) => {
  if (!id) return <span className="text-xs text-gray-400">N/A</span>;
  const meta = accountMap.get(id) || { name: id, color: "gray" };
  return (
    <span
      className={`text-sm font-medium rounded px-2 py-1 ${getAccountColorClasses(
        meta.color
      )}`}
    >
      {meta.name}
    </span>
  );
};

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
  const view = viewFor(tx);
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
      <td className="px-6 py-4 whitespace-nowrap text-base text-gray-900 dark:text-white">
        {formatDate(tx.ts)}
      </td>
      {/* Account / Transfer merged cell */}
      {view.accounts.from && view.accounts.to ? (
        <td className="px-6 py-4 whitespace-nowrap" colSpan={2}>
          <div className="flex items-center gap-3">
            <AccountPill id={view.accounts.from} accountMap={accountMap} />
            <span className="material-symbols-outlined text-sm text-gray-400 dark:text-gray-400">
              arrow_right_alt
            </span>
            <AccountPill id={view.accounts.to} accountMap={accountMap} />
          </div>
        </td>
      ) : (
        <>
          {/* Account */}
          <td className="px-6 py-4 whitespace-nowrap">
            <AccountPill id={view.accounts.single} accountMap={accountMap} />
          </td>
          {/* Payee */}
          <td className="px-6 py-4 whitespace-nowrap text-base text-gray-900 dark:text-white">
            {tx.payee || "N/A"}
          </td>
        </>
      )}
      {/* Amount */}
      <td
        className={`px-6 py-3 whitespace-nowrap text-right text-base font-medium ${view.colorClass}`}
      >
        {view.sign}
        {view.amount
          ? formatAmount(String(view.amount.amount), view.amount.ccy)
          : "—"}
      </td>
      {/* Envelope */}
      <td className="px-6 py-4 whitespace-nowrap text-base align-middle">
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
          {view.showEnvelope && (
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <select
                value={currentCategory}
                onChange={(e) =>
                  onReclassify(tx.id, pnlLegIdx, e.target.value || null)
                }
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
      <td className="px-6 py-4 whitespace-nowrap text-base">
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
