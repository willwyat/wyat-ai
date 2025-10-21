"use client";

import React, { useState } from "react";
import {
  formatDate,
  formatAmount,
  formatCryptoAmount,
} from "@/app/capital/utils";
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
type CryptoLike = { qty: string | number; asset: string };
type AmountLike =
  | { kind: "Fiat"; data: MoneyLike }
  | { kind: "Crypto"; data: CryptoLike };

/**
 * Determines if a transaction leg is a P&L (profit/loss) leg.
 * A leg is considered P&L if it's linked to the special P&L account or has a category assigned.
 */
function isPnlLeg(l: Transaction["legs"][number]) {
  return l.account_id === PNL_ACCOUNT_ID;
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
 * Extracts any amount (Fiat or Crypto) from a transaction leg.
 * Returns null if the leg is missing or has no amount.
 */
function pickAmount(l?: any): AmountLike | null {
  if (!l) return null;
  if (l.amount?.kind === "Fiat") {
    return {
      kind: "Fiat",
      data: { amount: l.amount.data.amount, ccy: l.amount.data.ccy },
    };
  }
  if (l.amount?.kind === "Crypto") {
    return {
      kind: "Crypto",
      data: { qty: l.amount.data.qty, asset: l.amount.data.asset },
    };
  }
  // Fallback for legacy data
  const v = l.amount?.data?.amount ?? l.amount?.amount;
  const c = l.amount?.data?.ccy ?? l.amount?.ccy;
  return v != null && c ? { kind: "Fiat", data: { amount: v, ccy: c } } : null;
}

/**
 * Finds legs with "acct." prefix (actual asset accounts)
 */
function findAssetLegs(tx: Transaction) {
  return tx.legs.filter((l) => l.account_id.startsWith("acct."));
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
  amount: AmountLike | null;
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
  const assetLegs = findAssetLegs(tx);

  const red = "text-red-700 dark:text-red-300";
  const green = "text-green-700 dark:text-green-300";
  const neutral = "text-gray-800 dark:text-gray-100";

  switch (type) {
    case "spending": {
      // For spending: one asset account (usually Debit - money going out)
      const assetLeg =
        assetLegs.find((l) => l.direction === "Debit") || assetLegs[0];
      const amt = pickAmount(assetLeg) || pickAmount(pnl);
      return {
        showEnvelope: true,
        amount: amt,
        sign: "-",
        colorClass: red,
        accounts: { single: assetLeg?.account_id },
      };
    }
    case "refund": {
      // For refund: one asset account (usually Credit - money coming in)
      const assetLeg =
        assetLegs.find((l) => l.direction === "Credit") || assetLegs[0];
      const amt = pickAmount(assetLeg) || pickAmount(pnl);
      return {
        showEnvelope: true,
        amount: amt,
        sign: "+",
        colorClass: green,
        accounts: { single: assetLeg?.account_id },
      };
    }
    case "income": {
      // For income: one asset account (usually Debit - money coming in)
      const assetLeg =
        assetLegs.find((l) => l.direction === "Debit") || assetLegs[0];
      const amt = pickAmount(assetLeg) || pickAmount(pnl);
      return {
        showEnvelope: false,
        amount: amt,
        sign: "+",
        colorClass: green,
        accounts: { single: assetLeg?.account_id },
      };
    }
    case "transfer": {
      // For transfer: two asset accounts
      const fromAsset = assetLegs.find((l) => l.direction === "Credit");
      const toAsset = assetLegs.find((l) => l.direction === "Debit");
      const amt = pickAmount(toAsset) || pickAmount(fromAsset);
      return {
        showEnvelope: false,
        amount: amt,
        sign: "",
        colorClass: neutral,
        accounts: { from: fromAsset?.account_id, to: toAsset?.account_id },
      };
    }
    case "transfer_fx": {
      // For transfer_fx: two asset accounts with FX
      const fromAsset = assetLegs.find((l) => l.direction === "Credit");
      const toAsset = assetLegs.find((l) => l.direction === "Debit");
      const amt = pickAmount(toAsset) || pickAmount(fromAsset);
      return {
        showEnvelope: false,
        amount: amt,
        sign: "",
        colorClass: neutral,
        accounts: { from: fromAsset?.account_id, to: toAsset?.account_id },
      };
    }
    case "fee_only": {
      // For fee_only: one asset account (usually Debit - fee being paid)
      const assetLeg =
        assetLegs.find((l) => l.direction === "Debit") || assetLegs[0];
      const amt = pickAmount(assetLeg) || pickAmount(pnl);
      return {
        showEnvelope: false,
        amount: amt,
        sign: "-",
        colorClass: red,
        accounts: { single: assetLeg?.account_id },
      };
    }
    case "trade": {
      // For trade: two asset accounts (buy/sell)
      const fromAsset = assetLegs.find((l) => l.direction === "Credit");
      const toAsset = assetLegs.find((l) => l.direction === "Debit");
      const amt = pickAmount(toAsset) || pickAmount(fromAsset);
      return {
        showEnvelope: false,
        amount: amt,
        sign: "",
        colorClass: neutral,
        accounts: { from: fromAsset?.account_id, to: toAsset?.account_id },
      };
    }
    default: {
      // For unknown types: try to find one asset account
      const assetLeg = assetLegs[0];
      const amt = pickAmount(assetLeg) || pickAmount(pnl);
      return {
        showEnvelope: false,
        amount: amt,
        sign: "",
        colorClass: neutral,
        accounts: { single: assetLeg?.account_id },
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
  const [toggleAmounts, setToggleAmounts] = useState(false);
  const view = viewFor(tx);
  const pnlLegIdx = getPnlLegIndex(tx);
  const currentCategory =
    pnlLegIdx >= 0 ? tx.legs[pnlLegIdx]?.category_id ?? "" : "";

  // if (tx.tx_type == "spending" || tx.tx_type == "refund")
  return (
    <tr
      key={tx.id}
      className="transition-colors duration-200 hover:bg-gray-50 dark:hover:bg-gray-700 "
      onClick={() => onOpenModal(tx)}
    >
      {/* Date */}
      <td className="pl-6 pr-3 py-4 whitespace-nowrap text-base text-gray-900 dark:text-white">
        {formatDate(tx.ts)}
      </td>
      {/* Account / Transfer merged cell */}
      {view.accounts.from && view.accounts.to ? (
        <td className="px-3 py-4 whitespace-nowrap" colSpan={2}>
          {tx.tx_type === "transfer_fx" ? (
            <div className="flex flex-row gap-1">
              <div className="flex items-center gap-3">
                {/* <AccountPill id={view.accounts.from} accountMap={accountMap} /> */}
                {(() => {
                  const { from, to, pnl } = deriveRoles(tx);
                  console.log("### from", from);
                  console.log("### to", to);
                  console.log("### pnl", pnl);
                  const fromAmt = pickAmount(from);
                  console.log("### fromAmt", fromAmt);
                  const toAmt = pickAmount(to);
                  console.log("### toAmt", toAmt);
                  const feeAmt = pickAmount(pnl);
                  const fxRate = from?.fx?.rate ?? to?.fx?.rate ?? null;

                  // Safely extract and format FROM amount
                  const fromAmtDisplay = fromAmt
                    ? fromAmt.kind === "Fiat"
                      ? formatAmount(
                          String(fromAmt.data.amount),
                          fromAmt.data.ccy
                        )
                      : formatCryptoAmount(
                          String(fromAmt.data.qty),
                          fromAmt.data.asset
                        )
                    : null;

                  // Safely extract and format TO amount
                  const toAmtDisplay = toAmt
                    ? toAmt.kind === "Fiat"
                      ? formatAmount(String(toAmt.data.amount), toAmt.data.ccy)
                      : formatCryptoAmount(
                          String(toAmt.data.qty),
                          toAmt.data.asset
                        )
                    : null;
                  return (
                    <>
                      <div className="flex items-center gap-3">
                        <AccountPill
                          id={view.accounts.from}
                          accountMap={accountMap}
                        />
                        {toAmtDisplay && (
                          <span className="font-medium">{fromAmtDisplay}</span>
                        )}
                      </div>
                      <span className="material-symbols-outlined text-sm text-gray-600 dark:text-gray-400">
                        {ICONS.ARROW_RIGHT_ALT}
                      </span>
                      <div className="flex items-center gap-3">
                        <AccountPill
                          id={view.accounts.to}
                          accountMap={accountMap}
                        />
                        {toAmtDisplay && (
                          <span className="font-medium">{toAmtDisplay}</span>
                        )}
                      </div>
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
                      {/* {fxRate && from && to && (
                        <span>
                          @ {fxRate}{" "}
                          {from.amount.kind === "Fiat" &&
                          to.amount.kind === "Fiat"
                            ? `${from.amount.data.ccy}/${to.amount.data.ccy}`
                            : from.amount.kind === "Crypto" &&
                              to.amount.kind === "Crypto" &&
                              from.amount.data?.asset &&
                              to.amount.data?.asset
                            ? `${from.amount.data.asset}/${to.amount.data.asset}`
                            : ""}
                        </span>
                      )} */}
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
            <div className="flex flex-row gap-1">
              <div className="flex items-center gap-3">
                {(() => {
                  const { from, to, pnl } = deriveRoles(tx);
                  const fromAmt = pickAmount(from);
                  const toAmt = pickAmount(to);
                  const feeAmt = pickAmount(pnl);

                  // Safely extract and format FROM amount
                  const fromAmtDisplay = fromAmt
                    ? fromAmt.kind === "Fiat"
                      ? formatAmount(
                          String(fromAmt.data.amount),
                          fromAmt.data.ccy
                        )
                      : formatCryptoAmount(
                          String(fromAmt.data.qty),
                          fromAmt.data.asset
                        )
                    : null;

                  // Safely extract and format TO amount
                  const toAmtDisplay = toAmt
                    ? toAmt.kind === "Fiat"
                      ? formatAmount(String(toAmt.data.amount), toAmt.data.ccy)
                      : formatCryptoAmount(
                          String(toAmt.data.qty),
                          toAmt.data.asset
                        )
                    : null;
                  return (
                    <>
                      <div className="flex items-center gap-3">
                        <AccountPill
                          id={view.accounts.from}
                          accountMap={accountMap}
                        />
                        {fromAmtDisplay && (
                          <span className="font-medium">{fromAmtDisplay}</span>
                        )}
                      </div>
                      <span className="material-symbols-outlined text-sm text-gray-600 dark:text-gray-400">
                        {ICONS.ARROW_RIGHT_ALT}
                      </span>
                      <div className="flex items-center gap-3">
                        <AccountPill
                          id={view.accounts.to}
                          accountMap={accountMap}
                        />
                        {toAmtDisplay && (
                          <span className="font-medium ">{toAmtDisplay}</span>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2 font-medium">
                {(() => {
                  const { from, to, pnl } = deriveRoles(tx);
                  const feeAmt = pickFiatAmount(pnl);
                  return (
                    <>
                      {/* No FX rate display for regular transfers */}
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
          )}
        </td>
      ) : (
        <>
          {/* Account */}
          <td className="px-3 py-4 whitespace-nowrap">
            <AccountPill id={view.accounts.single} accountMap={accountMap} />
          </td>
          {/* Payee */}
          <td className="px-3 py-4 whitespace-nowrap text-base text-gray-900 dark:text-white">
            {tx.payee || "N/A"}
          </td>
        </>
      )}
      {/* Amount */}
      <td
        className={`px-3 py-3 whitespace-nowrap text-right text-base font-medium ${view.colorClass}`}
      >
        <span
          className="cursor-pointer rounded-sm px-1 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-600 active:bg-gray-200 dark:active:bg-gray-500 ease-in-out transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            if (
              tx.tx_type === "transfer_fx" ||
              tx.tx_type === "transfer" ||
              tx.tx_type === "trade"
            ) {
              setToggleAmounts(!toggleAmounts);
            }
          }}
        >
          {view.sign}
          {(() => {
            if (!view.amount) return "—";

            const { from, to } = deriveRoles(tx);
            if (!from?.amount || !to?.amount) {
              // Fallback to original amount display
              return view.amount.kind === "Fiat"
                ? formatAmount(
                    String(view.amount.data.amount),
                    view.amount.data.ccy
                  )
                : view.amount.kind === "Crypto" &&
                  view.amount.data?.qty &&
                  view.amount.data?.asset
                ? formatCryptoAmount(
                    String(view.amount.data.qty),
                    view.amount.data.asset
                  )
                : "—";
            }

            // Use toggle state to show from or to amount
            const displayAmount = toggleAmounts ? from.amount : to.amount;

            if (displayAmount.kind === "Fiat") {
              return formatAmount(
                String(displayAmount.data.amount),
                displayAmount.data.ccy
              );
            } else if (displayAmount.kind === "Crypto") {
              return formatCryptoAmount(
                String(displayAmount.data.qty),
                displayAmount.data.asset
              );
            }

            return "—";
          })()}
        </span>
      </td>
      <td
        className={`px-3 py-3 whitespace-nowrap text-base font-medium ${view.colorClass} text-left`}
      >
        {view.accounts.from && view.accounts.to
          ? (() => {
              const { from, to } = deriveRoles(tx);
              if (!from?.amount || !to?.amount) return null;

              let fromValue: number;
              let toValue: number;

              if (from.amount.kind === "Fiat" && to.amount.kind === "Fiat") {
                fromValue = parseFloat(from.amount.data.amount);
                toValue = parseFloat(to.amount.data.amount);
              } else if (
                from.amount.kind === "Crypto" &&
                to.amount.kind === "Crypto"
              ) {
                fromValue = parseFloat(from.amount.data.qty);
                toValue = parseFloat(to.amount.data.qty);
              } else if (
                from.amount.kind === "Crypto" &&
                to.amount.kind === "Fiat"
              ) {
                // Crypto to Fiat conversion
                fromValue = parseFloat(from.amount.data.qty);
                toValue = parseFloat(to.amount.data.amount);
              } else if (
                from.amount.kind === "Fiat" &&
                to.amount.kind === "Crypto"
              ) {
                // Fiat to Crypto conversion
                fromValue = parseFloat(from.amount.data.amount);
                toValue = parseFloat(to.amount.data.qty);
              } else {
                return null; // Should not reach here
              }

              const fxRate =
                toValue !== 0
                  ? toggleAmounts
                    ? toValue / fromValue
                    : fromValue / toValue
                  : null;
              return fxRate ? (
                <span
                  className="cursor-pointer rounded-sm px-1 py-0.5 hover:bg-gray-100 active:bg-gray-200 dark:hover:bg-gray-600 dark:active:bg-gray-500 ease-in-out transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      tx.tx_type === "transfer_fx" ||
                      tx.tx_type === "transfer" ||
                      tx.tx_type === "trade"
                    ) {
                      setToggleAmounts(!toggleAmounts);
                    }
                  }}
                >
                  @{" "}
                  {formatAmount(
                    String(fxRate),
                    (toggleAmounts ? to.amount : from.amount).kind === "Fiat"
                      ? (
                          (toggleAmounts ? to.amount : from.amount).data as {
                            amount: string;
                            ccy: string;
                          }
                        ).ccy
                      : (
                          (toggleAmounts ? to.amount : from.amount).data as {
                            qty: string;
                            asset: string;
                          }
                        ).asset
                  )}
                </span>
              ) : null;
            })()
          : null}
      </td>
      {/* Envelope */}
      <td className="px-3 py-4 whitespace-nowrap text-base align-middle">
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
      <td className="px-3 py-4 whitespace-nowrap text-base">
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
