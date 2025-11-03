"use client";

import React, { useState } from "react";
import Modal from "@/components/ui/Modal";
import type { Account, Currency, AccountNetwork } from "../types";

interface AccountCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (account: Account) => Promise<void>;
}

export default function AccountCreateModal({
  isOpen,
  onClose,
  onSubmit,
}: AccountCreateModalProps) {
  const [accountType, setAccountType] = useState<
    | "Checking"
    | "Savings"
    | "Credit"
    | "CryptoWallet"
    | "Cex"
    | "Trust"
    | "BrokerageAccount"
  >("Checking");
  const [accountId, setAccountId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [color, setColor] = useState<string>("#3B82F6");
  const [txidPrefix, setTxidPrefix] = useState("");

  // Checking/Savings fields
  const [bankName, setBankName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");

  // Credit card fields
  const [creditCardName, setCreditCardName] = useState("");

  // Crypto wallet fields
  const [address, setAddress] = useState("");
  const [networkType, setNetworkType] = useState<"EVM" | "Solana" | "Bitcoin">(
    "EVM"
  );
  const [chainName, setChainName] = useState("Ethereum");
  const [chainId, setChainId] = useState(1);
  const [isLedger, setIsLedger] = useState(false);

  // CEX fields
  const [cexName, setCexName] = useState("");
  const [cexAccountId, setCexAccountId] = useState("");

  // Trust fields
  const [trustee, setTrustee] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");

  // Brokerage account fields
  const [brokerName, setBrokerName] = useState("");
  const [brokerageAccountType, setBrokerageAccountType] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      let metadata: Account["metadata"];

      switch (accountType) {
        case "Checking":
        case "Savings":
          metadata = {
            type: accountType,
            color: "blue",
            data: {
              bank_name: bankName,
              owner_name: ownerName,
              account_number: accountNumber,
              routing_number: routingNumber || undefined,
              color,
              txid_prefix: txidPrefix || undefined,
            },
          };
          break;

        case "Credit":
          metadata = {
            type: "Credit",
            color: "purple",
            data: {
              credit_card_name: creditCardName,
              owner_name: ownerName,
              account_number: accountNumber,
              routing_number: routingNumber || undefined,
              color,
              txid_prefix: txidPrefix || undefined,
            },
          };
          break;

        case "CryptoWallet":
          let network: AccountNetwork;
          if (networkType === "EVM") {
            network = { EVM: { chain_name: chainName, chain_id: chainId } };
          } else if (networkType === "Solana") {
            network = { Solana: null };
          } else {
            network = { Bitcoin: null };
          }

          metadata = {
            type: "CryptoWallet",
            color: "orange",
            data: {
              address,
              network,
              is_ledger: isLedger,
              color,
              txid_prefix: txidPrefix || undefined,
            },
          };
          break;

        case "Cex":
          metadata = {
            type: "Cex",
            color: "yellow",
            data: {
              cex_name: cexName,
              account_id: cexAccountId,
              color,
              txid_prefix: txidPrefix || undefined,
            },
          };
          break;

        case "Trust":
          metadata = {
            type: "Trust",
            color: "indigo",
            data: {
              trustee,
              jurisdiction,
              color,
              txid_prefix: txidPrefix || undefined,
            },
          };
          break;

        case "BrokerageAccount":
          metadata = {
            type: "BrokerageAccount",
            color: "green",
            data: {
              broker_name: brokerName,
              owner_name: ownerName,
              account_number: accountNumber,
              account_type: brokerageAccountType || undefined,
              color,
              txid_prefix: txidPrefix || undefined,
            },
          };
          break;

        default:
          throw new Error("Invalid account type");
      }

      const account: Account = {
        id: accountId,
        name: accountName,
        currency,
        metadata,
      };

      await onSubmit(account);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset form
    setAccountType("Checking");
    setAccountId("");
    setAccountName("");
    setCurrency("USD");
    setColor("#3B82F6");
    setTxidPrefix("");
    setBankName("");
    setOwnerName("");
    setAccountNumber("");
    setRoutingNumber("");
    setCreditCardName("");
    setAddress("");
    setNetworkType("EVM");
    setChainName("Ethereum");
    setChainId(1);
    setIsLedger(false);
    setCexName("");
    setCexAccountId("");
    setTrustee("");
    setJurisdiction("");
    setBrokerName("");
    setBrokerageAccountType("");
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create New Account"
      size="2xl"
      contentClassName="p-6 overflow-y-auto max-h-[calc(90vh-120px)]"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Account Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Account Type *
          </label>
          <select
            value={accountType}
            onChange={(e) =>
              setAccountType(e.target.value as typeof accountType)
            }
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
            required
          >
            <option value="Checking">Checking</option>
            <option value="Savings">Savings</option>
            <option value="Credit">Credit Card</option>
            <option value="CryptoWallet">Crypto Wallet</option>
            <option value="Cex">Centralized Exchange</option>
            <option value="Trust">Trust</option>
            <option value="BrokerageAccount">Brokerage Account</option>
          </select>
        </div>

        {/* Account ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Account ID *
          </label>
          <input
            type="text"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="e.g., acct.chase_checking"
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
            required
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Unique identifier for this account
          </p>
        </div>

        {/* Account Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Account Name *
          </label>
          <input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="e.g., Chase Checking"
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
            required
          />
        </div>

        {/* Currency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Currency *
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
            required
          >
            <option value="USD">USD</option>
            <option value="HKD">HKD</option>
            <option value="BTC">BTC</option>
          </select>
        </div>

        {/* Optional Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Color
            </label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full h-10 rounded border border-gray-300 dark:border-gray-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Transaction ID Prefix
            </label>
            <input
              type="text"
              value={txidPrefix}
              onChange={(e) => setTxidPrefix(e.target.value)}
              placeholder="e.g., chase"
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
            />
          </div>
        </div>

        {/* Type-specific fields */}
        {(accountType === "Checking" || accountType === "Savings") && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Bank Name *
              </label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g., Chase"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Owner Name *
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g., John Doe"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Account Number *
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g., 1234567890"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Routing Number
              </label>
              <input
                type="text"
                value={routingNumber}
                onChange={(e) => setRoutingNumber(e.target.value)}
                placeholder="e.g., 021000021"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
              />
            </div>
          </>
        )}

        {accountType === "Credit" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Credit Card Name *
              </label>
              <input
                type="text"
                value={creditCardName}
                onChange={(e) => setCreditCardName(e.target.value)}
                placeholder="e.g., Chase Sapphire Reserve"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Owner Name *
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g., John Doe"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Card Number (Last 4 digits) *
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g., 1234"
                maxLength={4}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                required
              />
            </div>
          </>
        )}

        {accountType === "CryptoWallet" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Wallet Address *
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g., 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 font-mono text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Network Type *
              </label>
              <select
                value={networkType}
                onChange={(e) =>
                  setNetworkType(e.target.value as typeof networkType)
                }
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                required
              >
                <option value="EVM">EVM (Ethereum, Polygon, etc.)</option>
                <option value="Solana">Solana</option>
                <option value="Bitcoin">Bitcoin</option>
              </select>
            </div>
            {networkType === "EVM" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Chain Name *
                  </label>
                  <input
                    type="text"
                    value={chainName}
                    onChange={(e) => setChainName(e.target.value)}
                    placeholder="e.g., Ethereum, Polygon, Arbitrum"
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Chain ID *
                  </label>
                  <input
                    type="number"
                    value={chainId}
                    onChange={(e) => setChainId(parseInt(e.target.value))}
                    placeholder="e.g., 1 (Ethereum), 137 (Polygon)"
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                    required
                  />
                </div>
              </>
            )}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isLedger"
                checked={isLedger}
                onChange={(e) => setIsLedger(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor="isLedger"
                className="ml-2 text-sm text-gray-700 dark:text-gray-300"
              >
                Hardware wallet (Ledger/Trezor)
              </label>
            </div>
          </>
        )}

        {accountType === "Cex" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Exchange Name *
              </label>
              <input
                type="text"
                value={cexName}
                onChange={(e) => setCexName(e.target.value)}
                placeholder="e.g., Binance, Coinbase"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Account ID *
              </label>
              <input
                type="text"
                value={cexAccountId}
                onChange={(e) => setCexAccountId(e.target.value)}
                placeholder="Your account identifier"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                required
              />
            </div>
          </>
        )}

        {accountType === "Trust" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Trustee *
              </label>
              <input
                type="text"
                value={trustee}
                onChange={(e) => setTrustee(e.target.value)}
                placeholder="e.g., ABC Trust Company"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Jurisdiction *
              </label>
              <input
                type="text"
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                placeholder="e.g., Delaware, Cayman Islands"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                required
              />
            </div>
          </>
        )}

        {accountType === "BrokerageAccount" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Broker Name *
              </label>
              <input
                type="text"
                value={brokerName}
                onChange={(e) => setBrokerName(e.target.value)}
                placeholder="e.g., Fidelity, Charles Schwab, Interactive Brokers"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Owner Name *
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g., John Doe"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Account Number *
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Last 4 digits or full account number"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Account Type
              </label>
              <input
                type="text"
                value={brokerageAccountType}
                onChange={(e) => setBrokerageAccountType(e.target.value)}
                placeholder="e.g., Individual, IRA, 401k, Roth IRA"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Optional: Specify the type of brokerage account
              </p>
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating..." : "Create Account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
