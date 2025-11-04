"use client";

import React, { useState } from "react";
import { useCapitalStore } from "@/stores";
import Modal from "@/components/ui/Modal";
import TransactionForm, {
  type TransactionFormData,
  type TransactionFormLeg,
  type FxRateData,
} from "./TransactionForm";
import { getTimezoneIdentifier } from "@/lib/timezone-utils";

interface TransactionCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TransactionCreateModal({
  isOpen,
  onClose,
}: TransactionCreateModalProps) {
  const { createTransaction, accounts } = useCapitalStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<TransactionFormData>({
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

  const [legs, setLegs] = useState<TransactionFormLeg[]>([
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

  // FX rate for transfer_fx transactions
  const [fxRate, setFxRate] = useState<FxRateData>({
    rate: "",
    from: "",
    to: "",
  });

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

      // Build FX object for transfer_fx transactions
      const buildFxObject = (leg: TransactionFormLeg) => {
        if (formData.tx_type === "transfer_fx" && fxRate.rate) {
          let legIdentifier = "";

          // Get the currency/asset identifier from the leg
          if (leg.amount.kind === "Fiat") {
            legIdentifier = leg.amount.data.ccy;
          } else if (leg.amount.kind === "Crypto") {
            legIdentifier = leg.amount.data.asset;
          }

          // Add FX if this leg's currency/asset matches the "from" currency/asset
          if (legIdentifier === fxRate.from) {
            return {
              from: fxRate.from,
              to: fxRate.to,
              rate: parseFloat(fxRate.rate),
              source: "manual",
              ts: utcTimestamp,
            };
          }
        }
        return null;
      };

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
          fx: buildFxObject(leg),
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
    setFxRate({
      rate: "",
      from: "",
      to: "",
    });
    setError(null);
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

      <TransactionForm
        formData={formData}
        setFormData={setFormData}
        legs={legs}
        setLegs={setLegs}
        fxRate={fxRate}
        setFxRate={setFxRate}
        accounts={accounts}
        onSubmit={handleSubmit}
        mode="create"
      />
    </Modal>
  );
}
