"use client";

import React, { useState } from "react";
import { useCapitalStore } from "@/stores";

interface TransactionCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Leg {
  account_id: string;
  direction: "Debit" | "Credit";
  amount: {
    kind: "Fiat";
    data: {
      amount: string;
      ccy: "USD" | "HKD" | "BTC";
    };
  };
  category_id?: string;
  notes?: string;
}

export default function TransactionCreateModal({
  isOpen,
  onClose,
}: TransactionCreateModalProps) {
  const { createTransaction } = useCapitalStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    id: "",
    ts: Math.floor(Date.now() / 1000),
    posted_ts: Math.floor(Date.now() / 1000),
    source: "manual",
    payee: "",
    memo: "",
    status: "posted",
    reconciled: false,
    tx_type: "spending",
  });

  const [legs, setLegs] = useState<Leg[]>([
    {
      account_id: "",
      direction: "Debit",
      amount: {
        kind: "Fiat",
        data: {
          amount: "",
          ccy: "USD",
        },
      },
      category_id: "",
      notes: "",
    },
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Generate ID if not provided
      const transactionId = formData.id || `tx_${Date.now()}`;

      const transactionData = {
        id: transactionId,
        ts: formData.ts,
        posted_ts: formData.posted_ts,
        source: formData.source,
        payee: formData.payee || null,
        memo: formData.memo || null,
        status: formData.status || null,
        reconciled: formData.reconciled,
        external_refs: [],
        legs: legs.map((leg) => ({
          ...leg,
          fx: null,
          fee_of_leg_idx: null,
          notes: leg.notes || null,
        })),
        tx_type: formData.tx_type || null,
      };

      await createTransaction(transactionData);
      onClose();
      resetForm();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create transaction"
      );
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      id: "",
      ts: Math.floor(Date.now() / 1000),
      posted_ts: Math.floor(Date.now() / 1000),
      source: "manual",
      payee: "",
      memo: "",
      status: "posted",
      reconciled: false,
      tx_type: "spending",
    });
    setLegs([
      {
        account_id: "",
        direction: "Debit",
        amount: {
          kind: "Fiat",
          data: {
            amount: "",
            ccy: "USD",
          },
        },
        category_id: "",
        notes: "",
      },
    ]);
    setError(null);
  };

  const addLeg = () => {
    setLegs([
      ...legs,
      {
        account_id: "",
        direction: "Credit",
        amount: {
          kind: "Fiat",
          data: {
            amount: "",
            ccy: "USD",
          },
        },
        category_id: "",
        notes: "",
      },
    ]);
  };

  const removeLeg = (index: number) => {
    if (legs.length > 1) {
      setLegs(legs.filter((_, i) => i !== index));
    }
  };

  const updateLeg = (index: number, field: keyof Leg, value: any) => {
    const updatedLegs = [...legs];
    if (field === "amount") {
      updatedLegs[index].amount = { ...updatedLegs[index].amount, ...value };
    } else {
      (updatedLegs[index] as any)[field] = value;
    }
    setLegs(updatedLegs);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Create Transaction
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Transaction Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Transaction ID (optional)
              </label>
              <input
                type="text"
                value={formData.id}
                onChange={(e) =>
                  setFormData({ ...formData, id: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Auto-generated if empty"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Payee
              </label>
              <input
                type="text"
                value={formData.payee}
                onChange={(e) =>
                  setFormData({ ...formData, payee: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="e.g., Starbucks"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Memo
              </label>
              <input
                type="text"
                value={formData.memo}
                onChange={(e) =>
                  setFormData({ ...formData, memo: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Additional notes"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Transaction Type
              </label>
              <select
                value={formData.tx_type}
                onChange={(e) =>
                  setFormData({ ...formData, tx_type: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="spending">Spending</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
                <option value="transfer_fx">Transfer (FX)</option>
                <option value="trade">Trade</option>
                <option value="adjustment">Adjustment</option>
                <option value="refund">Refund</option>
              </select>
            </div>
          </div>

          {/* Transaction Legs */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Transaction Legs
              </h3>
              <button
                type="button"
                onClick={addLeg}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Add Leg
              </button>
            </div>

            {legs.map((leg, index) => (
              <div
                key={index}
                className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 mb-4"
              >
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Leg {index + 1}
                  </h4>
                  {legs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLeg(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Account ID
                    </label>
                    <input
                      type="text"
                      value={leg.account_id}
                      onChange={(e) =>
                        updateLeg(index, "account_id", e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="e.g., acct.chase_credit"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Direction
                    </label>
                    <select
                      value={leg.direction}
                      onChange={(e) =>
                        updateLeg(index, "direction", e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    >
                      <option value="Debit">Debit</option>
                      <option value="Credit">Credit</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Amount
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={leg.amount.data.amount}
                      onChange={(e) =>
                        updateLeg(index, "amount", {
                          ...leg.amount,
                          data: { ...leg.amount.data, amount: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Currency
                    </label>
                    <select
                      value={leg.amount.data.ccy}
                      onChange={(e) =>
                        updateLeg(index, "amount", {
                          ...leg.amount,
                          data: { ...leg.amount.data, ccy: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    >
                      <option value="USD">USD</option>
                      <option value="HKD">HKD</option>
                      <option value="BTC">BTC</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Category ID
                    </label>
                    <input
                      type="text"
                      value={leg.category_id || ""}
                      onChange={(e) =>
                        updateLeg(index, "category_id", e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="e.g., env_groceries"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Notes
                    </label>
                    <input
                      type="text"
                      value={leg.notes || ""}
                      onChange={(e) =>
                        updateLeg(index, "notes", e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="Leg-specific notes"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Transaction"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
