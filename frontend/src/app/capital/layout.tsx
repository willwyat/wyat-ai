"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePreferencesStore } from "@/stores/preferences-store";
import { useCapitalStore } from "@/stores/capital-store";

interface CapitalLayoutProps {
  children: React.ReactNode;
}

export default function CapitalLayout({ children }: CapitalLayoutProps) {
  const pathname = usePathname();
  const { isDarkMode } = usePreferencesStore();
  const { assetPrices, pricesLoading, fetchAssetPrices } = useCapitalStore();

  // Fetch asset prices on mount
  useEffect(() => {
    fetchAssetPrices();
    // Refresh prices every 5 minutes
    const interval = setInterval(() => {
      fetchAssetPrices();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAssetPrices]);

  const navItems = [
    { href: "/capital", label: "Transactions", exact: true },
    { href: "/capital/accounts", label: "Accounts" },
    { href: "/capital/funds", label: "Funds" },
    // { href: "/capital/check", label: "Check" },
    { href: "/capital/data", label: "Data" },
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen">
      {/* Top Navigation Bar */}
      <nav className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="mx-auto w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center gap-8 h-16 lg:h-18">
            {/* <div className="text-xl font-semibold">Capital</div> */}
            {/* Navigation Links */}
            <div className="flex space-x-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(item.href, item.exact)
                      ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {/* Crypto Prices */}
            <div className="flex items-center space-x-4">
              {pricesLoading ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Loading prices...
                </div>
              ) : (
                <>
                  {["BTC", "ETH", "SOL"].map((symbol) => {
                    const priceData = assetPrices[symbol];
                    if (!priceData) return null;

                    const change24h = priceData.change_24h_pct || 0;
                    const isPositive = change24h >= 0;

                    return (
                      <div
                        key={symbol}
                        className="flex items-center space-x-2 text-sm"
                      >
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          {symbol}
                        </span>
                        <span className="text-gray-900 dark:text-white font-semibold">
                          $
                          {priceData.price.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <span
                          className={`text-sm font-medium ${
                            isPositive
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {isPositive ? "+" : ""}
                          {change24h.toFixed(2)}%
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Page Content */}
      <main>{children}</main>
    </div>
  );
}
