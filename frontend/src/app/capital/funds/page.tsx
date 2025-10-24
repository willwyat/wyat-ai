"use client";

import React, { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";

type Currency = "USD" | "HKD" | "BTC";

type PublicFund = {
  id: string;
  fund_id: string;
  name: string;
  symbol: string;
  assets: string[];
  purpose: string;
  horizon_years: number;
  discretionary_sales: boolean;
  acquisition_policy?: string | null;
  yield_policy?: string | null;
  denominated_in: Currency;
  balancing_policy?: any;
  multiplier_rules?: string[] | null;
  max_pct_networth: number;
  max_pct_liquid: number;
  liquid: boolean;
  review_cadence: string;
  status: string;
  created_at: number; // unix seconds
  updated_at: number; // unix seconds
};

export default function FundsPage() {
  const [funds, setFunds] = useState<PublicFund[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/capital/funds`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data: PublicFund[]) => setFunds(data))
      .catch((e) => setError(e.message || "Failed to load funds"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-red-700">Error loading funds: {error}</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold mb-4">Funds</h1>
      {funds.length === 0 ? (
        <div className="text-gray-600">No funds found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {funds.map((f) => (
            <div
              key={f.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-medium">
                    {f.name} <span className="text-gray-500">({f.symbol})</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    Status: {f.status} • Denominated in: {f.denominated_in}
                  </div>
                  <div className="text-xs text-gray-500">
                    Fund ID: {f.fund_id}
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  Max NW: {(f.max_pct_networth * 100).toFixed(0)}% • Max Liquid:{" "}
                  {(f.max_pct_liquid * 100).toFixed(0)}%
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-gray-500">Purpose</div>
                  <div className="text-gray-900">{f.purpose}</div>
                </div>
                <div>
                  <div className="text-gray-500">Horizon</div>
                  <div className="text-gray-900">{f.horizon_years} years</div>
                </div>
                <div>
                  <div className="text-gray-500">Yield Policy</div>
                  <div className="text-gray-900">{f.yield_policy || "—"}</div>
                </div>
                <div>
                  <div className="text-gray-500">Acquisition Policy</div>
                  <div className="text-gray-900">
                    {f.acquisition_policy || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Review Cadence</div>
                  <div className="text-gray-900">{f.review_cadence}</div>
                </div>
                <div>
                  <div className="text-gray-500">Discretionary Sales</div>
                  <div className="text-gray-900">
                    {f.discretionary_sales ? "Yes" : "No"}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-sm">
                <div className="text-gray-500">Assets</div>
                <div className="text-gray-900 break-words">
                  {f.assets.length ? f.assets.join(", ") : "—"}
                </div>
              </div>

              {f.multiplier_rules && f.multiplier_rules.length > 0 && (
                <div className="mt-3 text-sm">
                  <div className="text-gray-500">Multiplier Rules</div>
                  <ul className="list-disc pl-5">
                    {f.multiplier_rules.map((r, i) => (
                      <li key={`${f.id}-rule-${i}`}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {f.balancing_policy && (
                <details className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Balancing Policy
                  </summary>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-xs">
                    {JSON.stringify(f.balancing_policy, null, 2)}
                  </pre>
                </details>
              )}

              <div className="mt-3 text-xs text-gray-500">
                Created {new Date(f.created_at * 1000).toLocaleString()} •
                Updated {new Date(f.updated_at * 1000).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
