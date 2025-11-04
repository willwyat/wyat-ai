"use client";

import React, { useState, useEffect } from "react";
import {
  formatDate,
  formatAmount,
  formatCryptoAmount,
  getAccountColorClasses,
} from "@/app/capital/utils";
import type { Transaction, Envelope, Leg } from "@/app/capital/types";
import Modal from "@/components/ui/Modal";
import { useCapitalStore } from "@/stores/capital-store";

interface TransactionModalProps {
  transaction: Transaction | null;
  accountMap: Map<string, { name: string; color: string }>;
  envelopes: Envelope[];
  isOpen: boolean;
  onClose: () => void;
  onDelete?: (transactionId: string, payee: string) => void;
  deleting?: Set<string>;
  onRefresh?: () => void;
}

export default function TransactionModal({
  transaction,
  accountMap,
  envelopes,
  isOpen,
  onClose,
  onDelete,
  deleting,
  onRefresh,
}: TransactionModalProps) {
  const updateTransactionLegs = useCapitalStore(
    (state) => state.updateTransactionLegs
  );
  const balanceTransaction = useCapitalStore(
    (state) => state.balanceTransaction
  );
  const accounts = useCapitalStore((state) => state.accounts);

  const [editMode, setEditMode] = useState(false);
  const [editedPayee, setEditedPayee] = useState("");
  const [editedMemo, setEditedMemo] = useState("");
  const [editedLegs, setEditedLegs] = useState<Leg[]>([]);
  const [saving, setSaving] = useState(false);
  const [balancing, setBalancing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // FX rate editing for transfer_fx transactions
  const [fxRate, setFxRate] = useState<string>("");
  const [fxFrom, setFxFrom] = useState<string>("");
  const [fxTo, setFxTo] = useState<string>("");

  useEffect(() => {
    if (transaction && isOpen) {
      setEditedPayee(transaction.payee || "");
      setEditedMemo(transaction.memo || "");
      setEditedLegs(JSON.parse(JSON.stringify(transaction.legs))); // deep copy
      setEditMode(false);
      setActionError(null);
      setActionSuccess(null);

      // Extract FX rate from first leg with FX data
      const legWithFx = transaction.legs.find((leg) => leg.fx);
      if (legWithFx && legWithFx.fx) {
        setFxRate(legWithFx.fx.rate?.toString() || "");
        setFxFrom(legWithFx.fx.from || "");
        setFxTo(legWithFx.fx.to || "");
      } else {
        setFxRate("");
        setFxFrom("");
        setFxTo("");
      }
    }
  }, [transaction, isOpen]);

  if (!transaction) return null;
  const deletingSet = deleting ?? new Set<string>();

  const tx = transaction;

  const balanceLabel = (() => {
    const s = (tx.balance_state || "unknown").toLowerCase();
    if (s === "balanced") return "Balanced";
    if (s === "needs_envelope_offset") return "Needs envelope offset";
    if (s === "awaiting_transfer_match") return "Awaiting transfer match";
    return "Unknown";
  })();

  const balanceClasses = (() => {
    const s = (tx.balance_state || "unknown").toLowerCase();
    if (s === "balanced")
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (s === "needs_envelope_offset")
      return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    if (s === "awaiting_transfer_match")
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  })();

  // Get envelope name by ID
  const getEnvelopeName = (envelopeId: string | null | undefined) => {
    if (!envelopeId) return "Uncategorized";
    const envelope = envelopes.find((e) => e.id === envelopeId);
    return envelope?.name || envelopeId;
  };

  // Get account info
  const getAccountInfo = (accountId: string) => {
    const account = accountMap.get(accountId);
    return {
      name: account?.name || accountId,
      color: account?.color || "gray",
    };
  };

  const handleSaveEdits = async () => {
    if (!tx) return;
    setSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      // Build FX object for transfer_fx transactions
      const buildFxObject = (leg: Leg) => {
        if (tx.tx_type === "transfer_fx" && fxRate) {
          let legIdentifier = "";

          // Get the currency/asset identifier from the leg
          if (leg.amount.kind === "Fiat") {
            legIdentifier = leg.amount.data.ccy;
          } else if (leg.amount.kind === "Crypto" && leg.amount.data?.asset) {
            legIdentifier = leg.amount.data.asset;
          }

          // Add FX if this leg's currency/asset matches the "from" currency/asset
          if (legIdentifier === fxFrom) {
            return {
              from: fxFrom,
              to: fxTo,
              rate: parseFloat(fxRate),
              source: "manual",
              ts: tx.ts,
            };
          }
        }
        return leg.fx || null; // Keep existing FX if not matched
      };

      // Apply FX to legs
      const legsWithFx = editedLegs.map((leg) => ({
        ...leg,
        fx: buildFxObject(leg),
      }));

      await updateTransactionLegs(tx.id, {
        legs: legsWithFx,
        payee: editedPayee || undefined,
        memo: editedMemo || undefined,
      });
      setActionSuccess("Transaction updated successfully");
      setEditMode(false);

      // Refresh data without closing modal
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleBalance = async () => {
    if (!tx) return;
    setBalancing(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await balanceTransaction(tx.id);
      setActionSuccess(result.message);

      // Refresh data without closing modal
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to balance transaction");
    } finally {
      setBalancing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedPayee(tx.payee || "");
    setEditedMemo(tx.memo || "");
    setEditedLegs(JSON.parse(JSON.stringify(tx.legs)));

    // Reset FX rate from transaction
    const legWithFx = tx.legs.find((leg) => leg.fx);
    if (legWithFx && legWithFx.fx) {
      setFxRate(legWithFx.fx.rate?.toString() || "");
      setFxFrom(legWithFx.fx.from || "");
      setFxTo(legWithFx.fx.to || "");
    } else {
      setFxRate("");
      setFxFrom("");
      setFxTo("");
    }

    setEditMode(false);
    setActionError(null);
    setActionSuccess(null);
  };

  const updateLegAmount = (index: number, newAmount: string) => {
    const updated = [...editedLegs];
    if (updated[index].amount.kind === "Fiat") {
      updated[index].amount.data.amount = newAmount;
    }
    setEditedLegs(updated);
  };

  const updateLegDirection = (index: number, direction: "Debit" | "Credit") => {
    const updated = [...editedLegs];
    updated[index].direction = direction;
    setEditedLegs(updated);
  };

  const updateLegCategory = (index: number, categoryId: string) => {
    const updated = [...editedLegs];
    updated[index].category_id = categoryId || undefined;
    setEditedLegs(updated);
  };

  const updateLegAccountId = (index: number, accountId: string) => {
    const updated = [...editedLegs];
    updated[index].account_id = accountId;
    setEditedLegs(updated);
  };

  const addNewLeg = () => {
    const newLeg: Leg = {
      account_id: accounts.length > 0 ? accounts[0].id : "",
      direction: "Debit",
      amount: {
        kind: "Fiat",
        data: {
          amount: "0.00",
          ccy: "USD",
        },
      },
      category_id: undefined,
      notes: undefined,
    };
    setEditedLegs([...editedLegs, newLeg]);
  };

  const removeLeg = (index: number) => {
    if (editedLegs.length <= 1) {
      setActionError("Transaction must have at least one leg");
      return;
    }
    const updated = editedLegs.filter((_, i) => i !== index);
    setEditedLegs(updated);
  };

  return (
    <Modal
      isOpen={isOpen && !!transaction}
      onClose={onClose}
      title={editMode ? "Edit Transaction" : "Transaction Details"}
      size="2xl"
    >
      {/* Error/Success Messages */}
      {actionError && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {actionSuccess}
        </div>
      )}

      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
              Transaction ID
            </label>
            <p className="text-sm text-gray-900 dark:text-white font-mono">
              {tx.id}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
              Date
            </label>
            <p className="text-sm text-gray-900 dark:text-white">
              {formatDate(tx.ts)}
            </p>
          </div>
          {tx.posted_ts && (
            <div>
              <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                Posted Date
              </label>
              <p className="text-sm text-gray-900 dark:text-white">
                {formatDate(tx.posted_ts)}
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
              Source
            </label>
            <p className="text-sm text-gray-900 dark:text-white">{tx.source}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
              Payee
            </label>
            {editMode ? (
              <input
                type="text"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                value={editedPayee}
                onChange={(e) => setEditedPayee(e.target.value)}
              />
            ) : (
              <p className="text-sm text-gray-900 dark:text-white">
                {tx.payee || "N/A"}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
              Memo
            </label>
            {editMode ? (
              <input
                type="text"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                value={editedMemo}
                onChange={(e) => setEditedMemo(e.target.value)}
              />
            ) : (
              <p className="text-sm text-gray-900 dark:text-white">
                {tx.memo || "N/A"}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
              Status
            </label>
            <p className="text-sm text-gray-900 dark:text-white">
              {tx.status || "N/A"}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
              Balance State
            </label>
            <span
              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${balanceClasses}`}
            >
              {balanceLabel}
            </span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
              Reconciled
            </label>
            <span
              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                tx.reconciled
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
              }`}
            >
              {tx.reconciled ? "Yes" : "No"}
            </span>
          </div>
        </div>
      </div>

      {/* External References */}
      {tx.external_refs.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            External References
          </h3>
          <div className="space-y-2">
            {tx.external_refs.map(([key, value], index) => (
              <div
                key={index}
                className="flex justify-between items-center py-2 px-3 bg-gray-50 dark:bg-gray-700 rounded"
              >
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  {key}
                </span>
                <span className="text-sm text-gray-900 dark:text-white font-mono">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FX Rate Section - Only shown for transfer_fx in edit mode */}
      {editMode && tx.tx_type === "transfer_fx" && (
        <div className="mb-8 border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
            Foreign Exchange Rate
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
            Set the exchange rate for this FX transfer (crypto ↔ fiat or fiat ↔
            fiat). The rate will be applied to legs matching the "From"
            currency/asset.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                From Currency/Asset <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={fxFrom}
                onChange={(e) => setFxFrom(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="e.g. USD, HKD, USDC"
              />
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Enter the asset/currency code
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                To Currency/Asset <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={fxTo}
                onChange={(e) => setFxTo(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="e.g. USD, HKD, USDC"
              />
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Enter the asset/currency code
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Exchange Rate <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.000001"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="e.g., 0.127759 or 95000"
              />
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                1 {fxFrom || "FROM"} = {fxRate || "?"} {fxTo || "TO"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Legs */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Transaction Legs ({editMode ? editedLegs.length : tx.legs.length})
          </h3>
          {editMode && (
            <button
              type="button"
              onClick={addNewLeg}
              className="inline-flex items-center px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add Leg
            </button>
          )}
        </div>
        <div className="space-y-4">
          {(editMode ? editedLegs : tx.legs).map((leg, index) => {
            const accountInfo = getAccountInfo(leg.account_id);
            const envelopeName = getEnvelopeName(leg.category_id);

            return (
              <div
                key={index}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-medium text-gray-500 dark:text-gray-400">
                      Leg {index + 1}
                    </span>
                    {editMode && editedLegs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLeg(index)}
                        className="text-red-600 hover:text-red-800 text-xs"
                        title="Remove leg"
                      >
                        <svg
                          className="w-4 h-4"
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
                      </button>
                    )}
                  </div>
                  <div className="text-right">
                    {editMode && leg.amount.kind === "Fiat" ? (
                      <div className="flex items-center gap-2">
                        <select
                          className="rounded border border-gray-300 px-2 py-1 text-sm"
                          value={leg.direction}
                          onChange={(e) =>
                            updateLegDirection(
                              index,
                              e.target.value as "Debit" | "Credit"
                            )
                          }
                        >
                          <option value="Debit">Debit (+)</option>
                          <option value="Credit">Credit (−)</option>
                        </select>
                        <input
                          type="text"
                          className="w-32 rounded border border-gray-300 px-2 py-1 text-sm text-right"
                          value={leg.amount.data.amount}
                          onChange={(e) =>
                            updateLegAmount(index, e.target.value)
                          }
                        />
                        <span className="text-sm">{leg.amount.data.ccy}</span>
                      </div>
                    ) : (
                      <p
                        className={`text-base font-medium ${
                          leg.direction === "Debit"
                            ? "text-green-700 dark:text-green-300"
                            : "text-red-700 dark:text-red-300"
                        }`}
                      >
                        {leg.direction === "Debit" ? "+" : "-"}
                        {leg.amount.kind === "Fiat"
                          ? formatAmount(
                              leg.amount.data.amount,
                              leg.amount.data.ccy
                            )
                          : leg.amount.kind === "Crypto" &&
                            leg.amount.data?.qty &&
                            leg.amount.data?.asset
                          ? `${formatCryptoAmount(
                              leg.amount.data.qty,
                              leg.amount.data.asset
                            )}`
                          : "—"}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Account
                    </label>
                    {editMode ? (
                      <select
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={leg.account_id}
                        onChange={(e) =>
                          updateLegAccountId(index, e.target.value)
                        }
                      >
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name}
                          </option>
                        ))}
                        {/* Add __pnl__ account if not in the list */}
                        {!accounts.find((a) => a.id === "__pnl__") && (
                          <option value="__pnl__">__pnl__ (P&L Account)</option>
                        )}
                      </select>
                    ) : (
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded ${getAccountColorClasses(
                          accountInfo.color
                        )}`}
                      >
                        {accountInfo.name}
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Envelope
                    </label>
                    {editMode ? (
                      <select
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={leg.category_id || ""}
                        onChange={(e) =>
                          updateLegCategory(index, e.target.value)
                        }
                      >
                        <option value="">Uncategorized</option>
                        {envelopes.map((env) => (
                          <option key={env.id} value={env.id}>
                            {env.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm text-gray-900 dark:text-white">
                        {envelopeName}
                      </span>
                    )}
                  </div>
                </div>

                {leg.notes && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Notes
                    </label>
                    <p className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 p-2 rounded">
                      {leg.notes}
                    </p>
                  </div>
                )}

                {leg.fx && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      FX Information
                    </label>
                    <div className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 p-2 rounded">
                      <pre className="text-xs">
                        {JSON.stringify(leg.fx, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {leg.fee_of_leg_idx !== undefined && (
                  <div className="mt-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Fee of leg: {leg.fee_of_leg_idx}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-8 flex justify-between items-center">
        <div className="flex gap-2">
          {!editMode && tx.balance_state !== "balanced" && (
            <button
              type="button"
              onClick={handleBalance}
              disabled={balancing}
              className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
              title="Attempt to balance transaction"
            >
              {balancing ? (
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
              ) : (
                "Balance Transaction"
              )}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {editMode ? (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={saving}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdits}
                disabled={saving}
                className="inline-flex items-center px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-60"
              >
                {saving ? (
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
                ) : null}
                Save Changes
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditMode(true)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                title="Edit transaction"
              >
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
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                Edit
              </button>
              <button
                type="button"
                onClick={() =>
                  onDelete && onDelete(tx.id, tx.payee || "Unknown")
                }
                disabled={deletingSet.has(tx.id)}
                className="inline-flex items-center px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60"
                title="Delete transaction"
              >
                {deletingSet.has(tx.id) ? (
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
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
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
