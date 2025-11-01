"use client";

import React, { useEffect } from "react";
import { useCapitalStore } from "@/stores/capital-store";

type Currency = "USD" | "HKD" | "BTC";

export default function FundsPage() {
  const {
    funds,
    positionsByFund,
    fundsLoading: loading,
    fundsError: error,
    fetchFunds,
  } = useCapitalStore();

  // Set page title
  useEffect(() => {
    document.title = "Funds - Wyat AI";
  }, []);

  useEffect(() => {
    fetchFunds();
  }, [fetchFunds]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 dark:border-blue-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-700 dark:text-red-400">
        Error loading funds: {error}
      </div>
    );
  }

  const assetPrices = {
    WBTC: 109807.7,
    ETH: 3862.57,
    BTC: 109807.7,
    USDC: 0.9997,
    USDT: 0.9997,
    XPL: 0.3057,
    SOL: 186.34,
    HKD: 1 / 7.78, // HKD to USD conversion rate (7.78 HKD = 1 USD)
    USD: 1.0,
  } as const;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
        Funds
      </h1>
      {funds.length === 0 ? (
        <div className="text-gray-600 dark:text-gray-400">No funds found.</div>
      ) : (
        <>
          {/* Summary Table */}
          {(() => {
            // Calculate total portfolio value and metrics
            const fundMetrics = funds.map((f) => {
              const positions = positionsByFund[f.fund_id] || [];
              const nav = positions.reduce((sum, p) => {
                const qty = toNumber(p.qty);
                const price =
                  (assetPrices as any)[p.asset] ||
                  toNumber(p.price_in_base_ccy);
                return sum + qty * price;
              }, 0);
              return { fund: f, nav };
            });

            const totalPortfolioValue = fundMetrics.reduce(
              (sum, m) => sum + m.nav,
              0
            );
            const totalLiquidValue = fundMetrics
              .filter((m) => m.fund.liquid)
              .reduce((sum, m) => sum + m.nav, 0);

            return (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg mb-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Fund
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        NAV
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Target Max NW
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Actual % NW
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Target Max Liquid
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Actual % Liquid
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {fundMetrics.map(({ fund, nav }) => {
                      const actualPctNW =
                        totalPortfolioValue > 0
                          ? (nav / totalPortfolioValue) * 100
                          : 0;
                      const actualPctLiquid =
                        totalLiquidValue > 0 && fund.liquid
                          ? (nav / totalLiquidValue) * 100
                          : 0;

                      const nwExceeded =
                        actualPctNW > fund.max_pct_networth * 100;
                      const liquidExceeded =
                        fund.liquid &&
                        actualPctLiquid > fund.max_pct_liquid * 100;
                      const needsRebalancing = nwExceeded || liquidExceeded;

                      return (
                        <tr
                          key={fund.id}
                          className={`text-gray-900 dark:text-gray-100 ${
                            needsRebalancing
                              ? "bg-amber-50 dark:bg-amber-900/20"
                              : ""
                          }`}
                        >
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="font-medium">{fund.name}</div>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
                            $
                            {nav.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {(fund.max_pct_networth * 100).toFixed(1)}%
                          </td>
                          <td
                            className={`px-3 py-2 text-right whitespace-nowrap font-medium ${
                              nwExceeded
                                ? "text-amber-700 dark:text-amber-400"
                                : ""
                            }`}
                          >
                            {actualPctNW.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {fund.liquid
                              ? `${(fund.max_pct_liquid * 100).toFixed(1)}%`
                              : "—"}
                          </td>
                          <td
                            className={`px-3 py-2 text-right whitespace-nowrap font-medium ${
                              liquidExceeded
                                ? "text-amber-700 dark:text-amber-400"
                                : ""
                            }`}
                          >
                            {fund.liquid
                              ? `${actualPctLiquid.toFixed(1)}%`
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            {needsRebalancing ? (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                                ⚠️ Rebalance
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                                ✓ OK
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Total Row */}
                    {(() => {
                      // Calculate total target max as sum of all fund targets
                      const totalTargetMaxNW = fundMetrics.reduce(
                        (sum, m) => sum + m.fund.max_pct_networth * 100,
                        0
                      );
                      const totalTargetMaxLiquid = fundMetrics
                        .filter((m) => m.fund.liquid)
                        .reduce(
                          (sum, m) => sum + m.fund.max_pct_liquid * 100,
                          0
                        );

                      return (
                        <tr className="bg-gray-100 dark:bg-gray-700 font-semibold">
                          <td className="px-3 py-2 whitespace-nowrap">Total</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            $
                            {totalPortfolioValue.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {totalTargetMaxNW.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            100.0%
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {totalLiquidValue > 0
                              ? `${totalTargetMaxLiquid.toFixed(1)}%`
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {totalLiquidValue > 0 ? "100.0%" : "—"}
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            —
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* Individual Fund Cards */}
          <div className="grid grid-cols-1 gap-4">
            {funds.map((f) => (
              <div
                key={f.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-medium text-gray-900 dark:text-white">
                      {f.name}{" "}
                      <span className="text-gray-500 dark:text-gray-400">
                        ({f.symbol})
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Status: {f.status} • Denominated in: {f.denominated_in}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Fund ID: {f.fund_id}
                    </div>
                  </div>
                  <div className="text-right">
                    {(() => {
                      const positions = positionsByFund[f.fund_id] || [];
                      const totalValue = positions.reduce((sum, p) => {
                        const qty = toNumber(p.qty);
                        const price =
                          (assetPrices as any)[p.asset] ||
                          toNumber(p.price_in_base_ccy);
                        return sum + qty * price;
                      }, 0);
                      return (
                        <>
                          <div className="text-xl font-bold text-gray-900 dark:text-white">
                            $
                            {totalValue.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Total Value
                          </div>
                        </>
                      );
                    })()}
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Max NW: {(f.max_pct_networth * 100).toFixed(0)}% • Max
                      Liquid: {(f.max_pct_liquid * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">
                      Purpose
                    </div>
                    <div className="text-gray-900 dark:text-white">
                      {f.purpose}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">
                      Horizon
                    </div>
                    <div className="text-gray-900 dark:text-white">
                      {f.horizon_years} years
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">
                      Yield Policy
                    </div>
                    <div className="text-gray-900 dark:text-white">
                      {f.yield_policy || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">
                      Acquisition Policy
                    </div>
                    <div className="text-gray-900 dark:text-white">
                      {f.acquisition_policy || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">
                      Review Cadence
                    </div>
                    <div className="text-gray-900 dark:text-white">
                      {f.review_cadence}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">
                      Discretionary Sales
                    </div>
                    <div className="text-gray-900 dark:text-white">
                      {f.discretionary_sales ? "Yes" : "No"}
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-sm">
                  <div className="text-gray-500 dark:text-gray-400">Assets</div>
                  <div className="text-gray-900 dark:text-white break-words">
                    {f.assets.length ? f.assets.join(", ") : "—"}
                  </div>
                </div>

                {/* Positions */}
                <div className="mt-4">
                  <div className="font-medium text-gray-900 dark:text-white">
                    Positions
                  </div>
                  {(() => {
                    const positions = positionsByFund[f.fund_id] || [];
                    if (!positions.length)
                      return (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          No positions
                        </div>
                      );
                    return (
                      <div className="overflow-x-auto mt-1">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr>
                              <th className="px-2 py-1 text-left text-gray-700 dark:text-gray-300">
                                Asset
                              </th>
                              <th className="px-2 py-1 text-right text-gray-700 dark:text-gray-300">
                                Qty
                              </th>
                              <th className="px-2 py-1 text-right text-gray-700 dark:text-gray-300">
                                Price ({f.denominated_in})
                              </th>
                              <th className="px-2 py-1 text-right text-gray-700 dark:text-gray-300">
                                Value ({f.denominated_in})
                              </th>
                              <th className="px-2 py-1 text-left text-gray-700 dark:text-gray-300">
                                Updated
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {positions.map((p, i) => {
                              const qty = toNumber(p.qty);
                              // Use assetPrices if available, otherwise fall back to stored price
                              const price =
                                (assetPrices as any)[p.asset] ||
                                toNumber(p.price_in_base_ccy);
                              const value = qty * price;
                              return (
                                <tr
                                  key={`${f.fund_id}-${p.asset}-${i}`}
                                  className="text-gray-900 dark:text-gray-100"
                                >
                                  <td className="px-2 py-1">{p.asset}</td>
                                  <td className="px-2 py-1 text-right">
                                    {qty.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 8,
                                    })}
                                  </td>
                                  <td className="px-2 py-1 text-right">
                                    $
                                    {price.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </td>
                                  <td className="px-2 py-1 text-right font-medium">
                                    $
                                    {value.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </td>
                                  <td className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
                                    {new Date(
                                      (p.last_updated || 0) * 1000
                                    ).toLocaleDateString()}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>

                {f.multiplier_rules && f.multiplier_rules.length > 0 && (
                  <div className="mt-3 text-sm">
                    <div className="text-gray-500 dark:text-gray-400">
                      Multiplier Rules
                    </div>
                    <ul className="list-disc pl-5 text-gray-900 dark:text-gray-100">
                      {f.multiplier_rules.map((r, i) => (
                        <li key={`${f.id}-rule-${i}`}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {f.balancing_policy && (
                  <details className="mt-3 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 text-sm">
                    <summary className="cursor-pointer font-medium text-gray-900 dark:text-white">
                      Balancing Policy
                    </summary>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-xs text-gray-800 dark:text-gray-200">
                      {JSON.stringify(f.balancing_policy, null, 2)}
                    </pre>
                  </details>
                )}

                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  Created {new Date(f.created_at * 1000).toLocaleString()} •
                  Updated {new Date(f.updated_at * 1000).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type Position = {
  fund_id: string;
  asset: string;
  qty: number | string;
  price_in_base_ccy: number | string;
  last_updated: number;
};

function toNumber(v: any): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
