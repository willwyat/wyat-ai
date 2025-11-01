"use client";

import React, { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";

type CycleList = {
  labels: string[];
  active: string; // YYYY-MM
};

type Period = {
  label: string; // YYYY-MM
  startTs: number; // unix seconds UTC
  endTs: number; // unix seconds UTC
  startIso: string; // ISO string in UTC
  endIso: string; // ISO string in UTC
};

type Currency = "USD" | "HKD" | "BTC";
type Account = { id: string; name: string; currency: Currency };

type Money = { amount: number | string; ccy: Currency };
type BalanceRespSingle = {
  account_id: string;
  opening?: Money;
  closing?: Money;
  delta?: Money;
  balance?: Money; // when as_of query is used (not used here)
  start_ts?: number;
  end_ts?: number;
  label?: string;
};

function computeBoundsUtc(label: string): {
  startTs: number;
  endTs: number;
  startIso: string;
  endIso: string;
} {
  const [yStr, mStr] = label.split("-");
  const y = Number(yStr);
  const m = Number(mStr); // 1..12
  const startMs = Date.UTC(y, m - 1, 10, 0, 0, 0, 0); // 10th 00:00:00 UTC
  const endYear = m === 12 ? y + 1 : y;
  const endMonthIndex = m === 12 ? 0 : m; // JS month index for next month
  const endMs = Date.UTC(endYear, endMonthIndex, 9, 23, 59, 59, 0); // 9th 23:59:59 UTC
  const startTs = Math.floor(startMs / 1000);
  const endTs = Math.floor(endMs / 1000);
  return {
    startTs,
    endTs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

export default function CapitalCheckPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [active, setActive] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [mode, setMode] = useState<"single" | "aggregate">("single");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [balancesByLabel, setBalancesByLabel] = useState<Record<string, any>>(
    {}
  );

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_URL}/capital/cycles`, { credentials: "include" }),
      fetch(`${API_URL}/capital/accounts`, { credentials: "include" }),
    ])
      .then(async ([cyclesRes, accountsRes]) => {
        if (!cyclesRes.ok) throw new Error(await cyclesRes.text());
        if (!accountsRes.ok) throw new Error(await accountsRes.text());
        const cycles = (await cyclesRes.json()) as CycleList;
        const accs = (await accountsRes.json()) as Account[];
        setActive(cycles.active);
        const rows: Period[] = cycles.labels.map((label) => {
          const b = computeBoundsUtc(label);
          return { label, ...b };
        });
        setPeriods(rows);
        setAccounts(accs);
        if (accs.length && !selectedAccountId) {
          setSelectedAccountId(accs[0].id);
          setSelectedIds(new Set([accs[0].id]));
        }
      })
      .catch((e) => setError(e.message || "Failed to load data"))
      .finally(() => setLoading(false));
  }, []);

  // Load balances when selection or periods change
  useEffect(() => {
    const labels = periods.map((p) => p.label);
    if (!labels.length) return;

    const ids =
      mode === "single"
        ? selectedAccountId
          ? [selectedAccountId]
          : []
        : Array.from(selectedIds);
    if (!ids.length) return;

    const controller = new AbortController();
    const load = async () => {
      try {
        // For each label, fetch balances for each selected account, then aggregate if needed
        const resultsByLabel: Record<string, any> = {};
        await Promise.all(
          labels.map(async (label) => {
            const perAccount = await Promise.all(
              ids.map(async (id) => {
                const res = await fetch(
                  `${API_URL}/capital/accounts/${encodeURIComponent(
                    id
                  )}/balance?label=${encodeURIComponent(label)}`,
                  { credentials: "include", signal: controller.signal }
                );
                if (!res.ok) throw new Error(await res.text());
                const data = (await res.json()) as BalanceRespSingle;
                return { id, data };
              })
            );

            if (mode === "single") {
              resultsByLabel[label] = perAccount[0]?.data || null;
            } else {
              // Aggregate by currency
              const sum: Record<
                Currency,
                { opening: number; closing: number; delta: number }
              > = {
                USD: { opening: 0, closing: 0, delta: 0 },
                HKD: { opening: 0, closing: 0, delta: 0 },
                BTC: { opening: 0, closing: 0, delta: 0 },
              };
              for (const { data } of perAccount) {
                if (!data || !data.opening || !data.closing || !data.delta)
                  continue;
                const ccy = data.opening.ccy;
                sum[ccy].opening += toNumber(data.opening.amount);
                sum[ccy].closing += toNumber(data.closing.amount);
                sum[ccy].delta += toNumber(data.delta.amount);
              }
              resultsByLabel[label] = sum;
            }
          })
        );
        setBalancesByLabel(resultsByLabel);
      } catch {
        // ignore errors here; table will just not show balances
      }
    };
    void load();
    return () => controller.abort();
  }, [mode, selectedAccountId, selectedIds, periods]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-red-700">Error: {error}</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold mb-4">Accounting Periods (UTC)</h1>
      {/* Controls */}
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="mode"
              value="single"
              checked={mode === "single"}
              onChange={() => setMode("single")}
            />
            Single account
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="mode"
              value="aggregate"
              checked={mode === "aggregate"}
              onChange={() => setMode("aggregate")}
            />
            Aggregate selected
          </label>
        </div>
        {mode === "single" ? (
          <div className="flex items-center gap-2 text-sm">
            <div>Account:</div>
            <select
              className="border rounded px-2 py-1"
              value={selectedAccountId}
              onChange={(e) => {
                setSelectedAccountId(e.target.value);
                setSelectedIds(new Set([e.target.value]));
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            <div>Select accounts to aggregate:</div>
            <div className="flex flex-wrap gap-3">
              {accounts.map((a) => {
                const checked = selectedIds.has(a.id);
                return (
                  <label key={a.id} className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(a.id);
                        else next.delete(a.id);
                        setSelectedIds(next);
                      }}
                    />
                    {a.name} ({a.currency})
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {active && (
        <div className="mb-3 text-sm text-gray-600">
          Active cycle: <span className="font-medium">{active}</span>
        </div>
      )}
      {periods.length === 0 ? (
        <div className="text-gray-600">No periods found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">Label</th>
                <th className="px-2 py-2 text-left">Start (UTC)</th>
                <th className="px-2 py-2 text-left">End (UTC)</th>
                <th className="px-2 py-2 text-right">Start TS</th>
                <th className="px-2 py-2 text-right">End TS</th>
                {mode === "single" ? (
                  <>
                    <th className="px-2 py-2 text-right">Opening</th>
                    <th className="px-2 py-2 text-right">Closing</th>
                    <th className="px-2 py-2 text-right">Delta</th>
                  </>
                ) : (
                  <>
                    <th className="px-2 py-2 text-left">Opening (by ccy)</th>
                    <th className="px-2 py-2 text-left">Closing (by ccy)</th>
                    <th className="px-2 py-2 text-left">Delta (by ccy)</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {periods.map((p) => (
                <tr
                  key={p.label}
                  className={p.label === active ? "bg-yellow-50" : undefined}
                >
                  <td className="px-2 py-2 font-medium">{p.label}</td>
                  <td className="px-2 py-2">
                    {p.startIso.replace(".000Z", "Z")}
                  </td>
                  <td className="px-2 py-2">
                    {p.endIso.replace(".000Z", "Z")}
                  </td>
                  <td className="px-2 py-2 text-right">{p.startTs}</td>
                  <td className="px-2 py-2 text-right">{p.endTs}</td>
                  {(() => {
                    const b = balancesByLabel[p.label];
                    if (!b) {
                      return (
                        <>
                          <td className="px-2 py-2 text-right">—</td>
                          <td className="px-2 py-2 text-right">—</td>
                          <td className="px-2 py-2 text-right">—</td>
                        </>
                      );
                    }
                    if (mode === "single") {
                      const opening = b.opening as Money | undefined;
                      const closing = b.closing as Money | undefined;
                      const delta = b.delta as Money | undefined;
                      return (
                        <>
                          <td className="px-2 py-2 text-right">
                            {opening
                              ? `${opening.ccy} ${toNumber(
                                  opening.amount
                                ).toLocaleString()}`
                              : "—"}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {closing
                              ? `${closing.ccy} ${toNumber(
                                  closing.amount
                                ).toLocaleString()}`
                              : "—"}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {delta
                              ? `${delta.ccy} ${toNumber(
                                  delta.amount
                                ).toLocaleString()}`
                              : "—"}
                          </td>
                        </>
                      );
                    }
                    // aggregate: b is a map { USD: {opening,closing,delta}, HKD: {...}, BTC: {...} }
                    const fmt = (
                      ccy: Currency,
                      key: "opening" | "closing" | "delta"
                    ) => {
                      const v = b[ccy]?.[key] ?? 0;
                      return v ? `${ccy} ${Number(v).toLocaleString()}` : "";
                    };
                    const join = (key: "opening" | "closing" | "delta") =>
                      [fmt("USD", key), fmt("HKD", key), fmt("BTC", key)]
                        .filter(Boolean)
                        .join("; ");
                    return (
                      <>
                        <td className="px-2 py-2">{join("opening") || "—"}</td>
                        <td className="px-2 py-2">{join("closing") || "—"}</td>
                        <td className="px-2 py-2">{join("delta") || "—"}</td>
                      </>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function toNumber(v: any): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
