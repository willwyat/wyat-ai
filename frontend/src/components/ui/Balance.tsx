"use client";
import React from "react";
import { usePreferencesStore } from "@/stores/preferences-store";
import { formatAmount, getCurrencySymbol } from "@/app/capital/utils";

interface BalanceProps {
  amount: number | string;
  ccy: string;
}

export function Balance({ amount, ccy }: BalanceProps) {
  const { hideBalances } = usePreferencesStore();

  return (
    <span>
      {ccy && getCurrencySymbol(ccy)}
      {hideBalances ? " *****" : formatAmount(String(amount), ccy, false)}
    </span>
  );
}
