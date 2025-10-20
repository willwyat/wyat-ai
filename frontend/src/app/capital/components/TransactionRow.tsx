"use client";

import React from "react";
import { formatDate, formatAmount } from "@/app/capital/utils";
import type { Transaction, Envelope } from "@/app/capital/types";
import { AccountPill } from "./AccountPill";
import {
  getSelectClasses,
  getAmountClasses,
  styles,
} from "@/app/capital/styles";
import { PNL_ACCOUNT_ID, TX_TYPES, ICONS } from "@/app/capital/config";

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

type MoneyLike = { amount: string | number; ccy: string };

/**
 * Determines if a transaction leg is a P&L (profit/loss) leg.
 * A leg is considered P&L if it's linked to the special P&L account or has a category assigned.
 */
function isPnlLeg(l: Transaction["legs"][number]) {
  return l.account_id === PNL_ACCOUNT_ID || l.category_id != null;
}

/**
 * Extracts fiat amount and currency from a transaction leg.
 * Returns null if the leg is missing or has no fiat amount.
 */
function pickFiatAmount(l?: any): MoneyLike | null {
  if (!l) return null;
  if (l.amount?.kind === "Fiat")
    return { amount: l.amount.data.amount, ccy: l.amount.data.ccy };
  const v = l.amount?.data?.amount ?? l.amount?.amount;
  const c = l.amount?.data?.ccy ?? l.amount?.ccy;
  return v != null && c ? { amount: v, ccy: c } : null;
}

/**
 * Derives semantic roles from transaction legs.
 * Identifies P&L leg, asset legs, source (from), destination (to), and FX details.
 */
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

/**
 * Generates a rendering view for a transaction based on its type.
 * Determines display logic: colors, signs, amounts, account visibility, and envelope controls.
 */
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

/**
 * Finds the index of the P&L leg in a transaction.
 * Used for identifying which leg to update when reclassifying transactions to envelopes.
 */
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
          {tx.tx_type === "transfer_fx" ? (
            <div className="flex flex-row gap-1">
              <div className="flex items-center gap-2">
                <AccountPill id={view.accounts.from} accountMap={accountMap} />
                {(() => {
                  const { from, to, pnl } = deriveRoles(tx);
                  const fromAmt = pickFiatAmount(from);
                  const toAmt = pickFiatAmount(to);
                  const feeAmt = pickFiatAmount(pnl);
                  const fxRate = from?.fx?.rate ?? to?.fx?.rate ?? null;
                  return (
                    <>
                      {fromAmt && (
                        <span className="font-medium">
                          {formatAmount(String(fromAmt.amount), fromAmt.ccy)}
                        </span>
                      )}
                      <span className="material-symbols-outlined text-sm text-gray-600 dark:text-gray-400">
                        {ICONS.ARROW_RIGHT_ALT}
                      </span>
                      <AccountPill
                        id={view.accounts.to}
                        accountMap={accountMap}
                      />
                      {toAmt && (
                        <span className="font-medium">
                          {formatAmount(String(toAmt.amount), toAmt.ccy)}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2 font-medium">
                {(() => {
                  const { from, to, pnl } = deriveRoles(tx);
                  const feeAmt = pickFiatAmount(pnl);
                  const fxRate = from?.fx?.rate ?? to?.fx?.rate ?? null;
                  return (
                    <>
                      {fxRate && (
                        <span>
                          @ {fxRate} {from?.amount.data.ccy}/
                          {to?.amount.data.ccy}
                        </span>
                      )}
                      {/* {feeAmt && (
                        <span className="text-amber-600 dark:text-amber-400">
                          Fee: {formatAmount(String(feeAmt.amount), feeAmt.ccy)}
                        </span>
                      )} */}
                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <AccountPill id={view.accounts.from} accountMap={accountMap} />
              <span className="material-symbols-outlined text-sm text-gray-400 dark:text-gray-400">
                {ICONS.ARROW_RIGHT_ALT}
              </span>
              <AccountPill id={view.accounts.to} accountMap={accountMap} />
            </div>
          )}
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
              className={getSelectClasses("small")}
            >
              <option value="">No Type</option>
              {TX_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {updatingType.has(tx.id) && (
              <div className={styles.spinner.small}></div>
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
                className={getSelectClasses("small")}
              >
                <option value="">No Category</option>
                {envelopes.map((envelope) => (
                  <option key={envelope.id} value={envelope.id}>
                    {envelope.name}
                  </option>
                ))}
              </select>
              {reclassifying.has(tx.id) && (
                <div className={styles.spinner.small}></div>
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
          className={styles.button.danger}
          title="Delete transaction"
        >
          {deleting.has(tx.id) ? (
            <div className={styles.spinner.medium}></div>
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
