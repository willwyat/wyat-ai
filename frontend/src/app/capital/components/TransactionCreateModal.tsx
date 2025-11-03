"use client";

import React, { useState } from "react";
import { useCapitalStore } from "@/stores";
import Modal from "@/components/ui/Modal";
import type { LegAmount, Account } from "@/app/capital/types";
import { getTimezoneIdentifier } from "@/lib/timezone-utils";
import { TimezoneSelect } from "@/components/ui/TimezoneSelect";

interface TransactionCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AccountSearchDropdownProps {
  value: string;
  onChange: (value: string) => void;
  accounts: Account[];
  placeholder?: string;
}

const AccountSearchDropdown: React.FC<AccountSearchDropdownProps> = ({
  value,
  onChange,
  accounts,
  placeholder = "e.g., acct.chase_credit",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredAccounts = accounts.filter(
    (account) =>
      account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (account: Account) => {
    onChange(account.id);
    setSearchTerm("");
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSearchTerm(newValue);
    setIsOpen(true);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleInputBlur = () => {
    // Delay closing to allow for click events on dropdown items
    setTimeout(() => setIsOpen(false), 150);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
        placeholder={placeholder}
        required
      />

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredAccounts.length > 0 ? (
            filteredAccounts.map((account) => (
              <div
                key={account.id}
                className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer border-b border-gray-200 dark:border-gray-600 last:border-b-0"
                onClick={() => handleSelect(account)}
              >
                <div className="font-medium text-gray-900 dark:text-white">
                  {account.name}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {account.id}
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
              No accounts found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface Leg {
  account_id: string;
  direction: "Debit" | "Credit";
  amount: LegAmount;
  category_id?: string;
  notes?: string;
}

export default function TransactionCreateModal({
  isOpen,
  onClose,
}: TransactionCreateModalProps) {
  const { createTransaction, accounts } = useCapitalStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useUnixInput, setUseUnixInput] = useState(false);

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
    tx_hash: "",
    timezone: getTimezoneIdentifier(),
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

      // Convert local datetime to Unix timestamp
      const localDateTime = new Date(formData.ts * 1000);
      const utcTimestamp = Math.floor(localDateTime.getTime() / 1000);

      // Build external_refs array
      const externalRefs: Array<[string, string]> = [];
      if (formData.tx_hash.trim()) {
        externalRefs.push(["tx_hash", formData.tx_hash.trim()]);
      }

      const transactionData = {
        id: transactionId,
        ts: utcTimestamp,
        posted_ts: utcTimestamp,
        source: formData.source,
        payee: formData.payee || null,
        memo: formData.memo || null,
        status: formData.status || null,
        reconciled: formData.reconciled,
        external_refs: externalRefs,
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
      tx_hash: "",
      timezone: getTimezoneIdentifier(),
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

  const footer = (
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
        form="transaction-form"
      >
        {loading ? "Creating..." : "Create Transaction"}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Transaction"
      size="4xl"
      footer={footer}
    >
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <form id="transaction-form" onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Transaction Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Transaction ID (optional)
            </label>
            <input
              type="text"
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
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
                        const month = String(now.getMonth() + 1).padStart(
                          2,
                          "0"
                        );
                        const day = String(now.getDate()).padStart(2, "0");
                        const hours = String(now.getHours()).padStart(2, "0");
                        const minutes = String(now.getMinutes()).padStart(
                          2,
                          "0"
                        );
                        return `${year}-${month}-${day}T${hours}:${minutes}`;
                      }
                      // Format as local time for datetime-local input
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(
                        2,
                        "0"
                      );
                      const day = String(date.getDate()).padStart(2, "0");
                      const hours = String(date.getHours()).padStart(2, "0");
                      const minutes = String(date.getMinutes()).padStart(
                        2,
                        "0"
                      );
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
    </Modal>
  );
}
