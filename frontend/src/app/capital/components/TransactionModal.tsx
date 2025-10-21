"use client";

import React from "react";
import {
  formatDate,
  formatAmount,
  formatCryptoAmount,
  getAccountColorClasses,
} from "@/app/capital/utils";
import type { Transaction, Envelope } from "@/app/capital/types";
import Modal from "@/components/Modal";

interface TransactionModalProps {
  transaction: Transaction | null;
  accountMap: Map<string, { name: string; color: string }>;
  envelopes: Envelope[];
  isOpen: boolean;
  onClose: () => void;
}

export default function TransactionModal({
  transaction,
  accountMap,
  envelopes,
  isOpen,
  onClose,
}: TransactionModalProps) {
  if (!transaction) return null;

  const tx = transaction;

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

  return (
    <Modal
      isOpen={isOpen && !!transaction}
      onClose={onClose}
      title="Transaction Details"
      size="2xl"
    >
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
            <p className="text-sm text-gray-900 dark:text-white">
              {tx.payee || "N/A"}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
              Memo
            </label>
            <p className="text-sm text-gray-900 dark:text-white">
              {tx.memo || "N/A"}
            </p>
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

      {/* Transaction Legs */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Transaction Legs ({tx.legs.length})
        </h3>
        <div className="space-y-4">
          {tx.legs.map((leg, index) => {
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
                  </div>
                  <div className="text-right">
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
                    {/* <p className="text-xs text-gray-500 dark:text-gray-400">
                          {leg.amount.kind}
                        </p> */}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Account
                    </label>
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded ${getAccountColorClasses(
                        accountInfo.color
                      )}`}
                    >
                      {accountInfo.name}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Envelope
                    </label>
                    <span className="text-sm text-gray-900 dark:text-white">
                      {envelopeName}
                    </span>
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
    </Modal>
  );
}
