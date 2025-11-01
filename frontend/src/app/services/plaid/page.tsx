"use client";

import { PlaidLink } from "react-plaid-link";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";

export default function PlaidPage() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connectedItems, setConnectedItems] = useState<
    Array<{ item_id: string; access_token: string }>
  >([]);
  const [selectedItem, setSelectedItem] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("acct.chase_checking");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  useEffect(() => {
    // Call your backend to create a new link token
    fetch(`${API_URL}/plaid/link-token/create`)
      .then((res) => res.json())
      .then((data) => setLinkToken(data.link_token))
      .catch((err) => console.error("Failed to create link token:", err));

    // Set default date range (last 30 days)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setEndDate(end.toISOString().split("T")[0]);
    setStartDate(start.toISOString().split("T")[0]);
  }, []);

  const handleSync = async () => {
    if (!selectedItem || !accountId || !startDate || !endDate) {
      alert("Please fill in all fields");
      return;
    }

    setSyncing(true);
    setSyncResult(null);

    try {
      const response = await fetch(`${API_URL}/plaid/sync-transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: selectedItem,
          account_id: accountId,
          start_date: startDate,
          end_date: endDate,
        }),
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.statusText}`);
      }

      const data = await response.json();
      setSyncResult(data);
    } catch (err: any) {
      console.error("Sync error:", err);
      alert(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (!linkToken) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Plaid Integration</h1>

      {/* Connect Bank Section */}
      <div className="mb-8 p-6 border rounded-lg bg-white shadow">
        <h2 className="text-xl font-semibold mb-4">
          Step 1: Connect Your Bank
        </h2>
        <PlaidLink
          token={linkToken}
          onSuccess={(public_token, metadata) => {
            fetch(`${API_URL}/plaid/exchange-public-token`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ public_token }),
            })
              .then((res) => res.json())
              .then((data) => {
                console.log("Access Token Response", data);
                setConnectedItems([...connectedItems, data]);
                setSelectedItem(data.item_id);
                alert(`Successfully connected! Item ID: ${data.item_id}`);
              })
              .catch((err) => {
                console.error("Exchange token error:", err);
                alert("Failed to exchange token");
              });
          }}
          onExit={(err) => {
            if (err) console.error("Plaid exited with error", err);
          }}
        >
          <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            Connect your bank
          </button>
        </PlaidLink>
      </div>

      {/* Sync Transactions Section */}
      {connectedItems.length > 0 && (
        <div className="p-6 border rounded-lg bg-white shadow">
          <h2 className="text-xl font-semibold mb-4">
            Step 2: Sync Transactions
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Plaid Item
              </label>
              <select
                value={selectedItem}
                onChange={(e) => setSelectedItem(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Select an item...</option>
                {connectedItems.map((item) => (
                  <option key={item.item_id} value={item.item_id}>
                    {item.item_id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Your Account ID
              </label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="e.g., acct.chase_checking"
                className="w-full px-3 py-2 border rounded-md"
              />
              <p className="text-xs text-gray-500 mt-1">
                This should match an account ID in your capital_accounts
                collection
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
            </div>

            <button
              onClick={handleSync}
              disabled={syncing}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "Sync Transactions"}
            </button>
          </div>

          {syncResult && (
            <div className="mt-4 p-4 border rounded-md bg-gray-50">
              <h3 className="font-semibold mb-2">Sync Results:</h3>
              <p className="text-sm">✅ Imported: {syncResult.imported}</p>
              <p className="text-sm">⏭️ Skipped: {syncResult.skipped}</p>
              {syncResult.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-red-600">Errors:</p>
                  <ul className="text-xs text-red-600 list-disc pl-5">
                    {syncResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
