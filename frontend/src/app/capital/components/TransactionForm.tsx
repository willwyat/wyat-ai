"use client";

import React, { useState } from "react";
import type { LegAmount, Account } from "@/app/capital/types";
import { TimezoneSelect } from "@/components/ui/TimezoneSelect";
import AccountSearchDropdown from "./AccountSearchDropdown";

export interface TransactionFormLeg {
  account_id: string;
  direction: "Debit" | "Credit";
  amount: LegAmount;
  category_id?: string;
  notes?: string;
}

export interface TransactionFormData {
  id: string;
  ts: number;
  posted_ts: number;
  source: string;
  payee: string;
  memo: string;
  status: string;
  reconciled: boolean;
  tx_type: string;
  tx_hash: string;
  timezone: string;
}

export interface FxRateData {
  rate: string;
  from: string;
  to: string;
}

interface TransactionFormProps {
  formData: TransactionFormData;
  setFormData: React.Dispatch<React.SetStateAction<TransactionFormData>>;
  legs: TransactionFormLeg[];
  setLegs: React.Dispatch<React.SetStateAction<TransactionFormLeg[]>>;
  fxRate: FxRateData;
  setFxRate: React.Dispatch<React.SetStateAction<FxRateData>>;
  accounts: Account[];
  onSubmit: (e: React.FormEvent) => void;
  mode: "create" | "edit";
}

export default function TransactionForm({
  formData,
  setFormData,
  legs,
  setLegs,
  fxRate,
  setFxRate,
  accounts,
  onSubmit,
  mode,
}: TransactionFormProps) {
  const [useUnixInput, setUseUnixInput] = useState(false);

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

  const updateLeg = (
    index: number,
    field: keyof TransactionFormLeg,
    value: any
  ) => {
    const updatedLegs = [...legs];
    if (field === "amount") {
      if (typeof value === "object" && value.kind) {
        // Full amount object replacement
        updatedLegs[index].amount = value;
      } else {
        // Partial update - need to handle based on current kind
        const currentAmount = updatedLegs[index].amount;
        if (currentAmount.kind === "Fiat") {
          updatedLegs[index].amount = {
            kind: "Fiat",
            data: { ...currentAmount.data, ...value },
          };
        } else {
          updatedLegs[index].amount = {
            kind: "Crypto",
            data: { ...currentAmount.data, ...value },
          };
        }
      }
    } else {
      (updatedLegs[index] as any)[field] = value;
    }
    setLegs(updatedLegs);
  };

  return (
    <form id="transaction-form" onSubmit={onSubmit} className="space-y-6">
      {/* Basic Transaction Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Transaction ID {mode === "create" && "(optional)"}
          </label>
          <input
            type="text"
            value={formData.id}
            onChange={(e) => setFormData({ ...formData, id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder={mode === "create" ? "Auto-generated if empty" : ""}
            disabled={mode === "edit"}
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
            onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
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

      {/* FX Rate Section - Only shown for transfer_fx */}
      {formData.tx_type === "transfer_fx" && (
        <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
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
                value={fxRate.from}
                onChange={(e) =>
                  setFxRate({ ...fxRate, from: e.target.value.toUpperCase() })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="e.g. USD, HKD, USDC"
                required
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
                value={fxRate.to}
                onChange={(e) =>
                  setFxRate({ ...fxRate, to: e.target.value.toUpperCase() })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="e.g. USD, HKD, USDC"
                required
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
                value={fxRate.rate}
                onChange={(e) => setFxRate({ ...fxRate, rate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="e.g., 0.127759 or 95000"
                required
              />
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                1 {fxRate.from || "FROM"} = {fxRate.rate || "?"}{" "}
                {fxRate.to || "TO"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Hash and Time */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Transaction Hash (optional)
          </label>
          <input
            type="text"
            value={formData.tx_hash}
            onChange={(e) =>
              setFormData({ ...formData, tx_hash: e.target.value })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="e.g., 0x1234...abcd"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Date & Time
            </label>
            <button
              type="button"
              onClick={() => setUseUnixInput(!useUnixInput)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              {useUnixInput ? "Use Date Picker" : "Use Unix Timestamp"}
            </button>
          </div>

          {useUnixInput ? (
            <>
              <input
                type="number"
                value={formData.ts}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value)) {
                    setFormData({
                      ...formData,
                      ts: value,
                    });
                  }
                }}
                placeholder="e.g., 1234567890"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white font-mono"
              />
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Unix timestamp (seconds since epoch)
              </div>
            </>
          ) : (
            <>
              <input
                type="datetime-local"
                value={(() => {
                  try {
                    const timestamp =
                      formData.ts || Math.floor(Date.now() / 1000);
                    const date = new Date(timestamp * 1000);
                    if (isNaN(date.getTime())) {
                      const now = new Date();
                      const year = now.getFullYear();
                      const month = String(now.getMonth() + 1).padStart(2, "0");
                      const day = String(now.getDate()).padStart(2, "0");
                      const hours = String(now.getHours()).padStart(2, "0");
                      const minutes = String(now.getMinutes()).padStart(2, "0");
                      return `${year}-${month}-${day}T${hours}:${minutes}`;
                    }
                    // Format as local time for datetime-local input
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, "0");
                    const day = String(date.getDate()).padStart(2, "0");
                    const hours = String(date.getHours()).padStart(2, "0");
                    const minutes = String(date.getMinutes()).padStart(2, "0");
                    return `${year}-${month}-${day}T${hours}:${minutes}`;
                  } catch (e) {
                    console.error("Error formatting date:", e);
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, "0");
                    const day = String(now.getDate()).padStart(2, "0");
                    const hours = String(now.getHours()).padStart(2, "0");
                    const minutes = String(now.getMinutes()).padStart(2, "0");
                    return `${year}-${month}-${day}T${hours}:${minutes}`;
                  }
                })()}
                onChange={(e) => {
                  try {
                    // datetime-local value is in local time, convert to UTC unix timestamp
                    const localDateTime = new Date(e.target.value);
                    if (!isNaN(localDateTime.getTime())) {
                      setFormData({
                        ...formData,
                        ts: Math.floor(localDateTime.getTime() / 1000),
                      });
                    }
                  } catch (e) {
                    console.error("Error parsing date:", e);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />

              <TimezoneSelect
                value={formData.timezone}
                onChange={(value) => {
                  setFormData({
                    ...formData,
                    timezone: value,
                  });
                }}
                label="Timezone"
                helperText="Select the timezone for the datetime above"
                className="mt-2"
              />
            </>
          )}

          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Timezone: {formData.timezone}
          </div>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            UTC:{" "}
            {new Date(formData.ts * 1000)
              .toISOString()
              .replace("T", " ")
              .slice(0, 19)}
          </div>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Unix: {formData.ts}
          </div>
        </div>
      </div>

      {/* Transaction Legs */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Transaction Legs <span className="text-red-500">*</span>
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              At least one leg is required. Fields marked with{" "}
              <span className="text-red-500">*</span> are mandatory.
            </p>
          </div>
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

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Amount Type
                </label>
                <select
                  value={leg.amount.kind}
                  onChange={(e) => {
                    const newKind = e.target.value as "Fiat" | "Crypto";
                    updateLeg(index, "amount", {
                      kind: newKind,
                      data:
                        newKind === "Fiat"
                          ? { amount: "", ccy: "USD" }
                          : { qty: "", asset: "" },
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                >
                  <option value="Fiat">Fiat Currency</option>
                  <option value="Crypto">Crypto Asset</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Account ID <span className="text-red-500">*</span>
                </label>
                <AccountSearchDropdown
                  value={leg.account_id}
                  onChange={(value) => updateLeg(index, "account_id", value)}
                  accounts={accounts}
                  placeholder="e.g., acct.chase_credit"
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
                  Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={
                    leg.amount.kind === "Fiat"
                      ? leg.amount.data.amount || ""
                      : leg.amount.data?.qty || ""
                  }
                  onChange={(e) =>
                    updateLeg(
                      index,
                      "amount",
                      leg.amount.kind === "Fiat"
                        ? { amount: e.target.value }
                        : { qty: e.target.value }
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {leg.amount.kind === "Fiat" ? "Currency" : "Asset"}
                </label>
                {leg.amount.kind === "Fiat" ? (
                  <select
                    value={leg.amount.data.ccy}
                    onChange={(e) =>
                      updateLeg(index, "amount", {
                        ccy: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="USD">USD</option>
                    <option value="HKD">HKD</option>
                    <option value="BTC">BTC</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={leg.amount.data?.asset || ""}
                    onChange={(e) =>
                      updateLeg(index, "amount", {
                        asset: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="e.g., USDC, ETH, BTC"
                  />
                )}
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
                  onChange={(e) => updateLeg(index, "notes", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Leg-specific notes"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </form>
  );
}
