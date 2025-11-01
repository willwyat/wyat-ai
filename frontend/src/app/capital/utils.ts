import type { Money, RolloverPolicy, Account, AccountNetwork } from "./types";
import { CURRENCY_CONFIG, ACCOUNT_COLORS, DEFAULTS } from "./config";

export function formatMoney(money: Money): string {
  const amount = parseFloat(money.amount);
  let symbol = "$";
  if (money.ccy === "HKD") symbol = "HK$";
  if (money.ccy === "BTC") symbol = "₿";

  const decimals = money.ccy === "BTC" ? 8 : 2;
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${symbol}${formatted}`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}

export function formatAmount(amount: string, ccy: string): string {
  const num = parseFloat(amount);
  const symbol =
    ccy === "USD" ? "$" : ccy === "HKD" ? "HK$" : ccy === "BTC" ? "₿" : "";

  const decimals =
    CURRENCY_CONFIG.DECIMAL_PLACES[
      ccy as keyof typeof CURRENCY_CONFIG.DECIMAL_PLACES
    ] || 2;
  const formatted = num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${symbol}${formatted}`;
}

export function formatCryptoAmount(qty: string, asset: string): string {
  const num = parseFloat(qty);

  // Determine decimal places based on asset
  let decimals = 2; // Default for stablecoins like USDC, USDT
  if (asset.includes("BTC")) {
    decimals = 5;
  } else if (asset.includes("ETH") || asset.includes("SOL")) {
    decimals = 3;
  } else if (asset.includes("USD")) {
    decimals = 2;
  }

  return `${num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ${asset}`;
}

export function getAccountColorClasses(color: string): string {
  const colorMap: Record<string, string> = {
    red: "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300",
    orange:
      "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300",
    amber: "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
    yellow:
      "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300",
    lime: "bg-lime-100 dark:bg-lime-900 text-lime-700 dark:text-lime-300",
    green: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300",
    emerald:
      "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300",
    teal: "bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300",
    cyan: "bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300",
    sky: "bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300",
    blue: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
    indigo:
      "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300",
    violet:
      "bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300",
    purple:
      "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300",
    fuschia:
      "bg-fuchsia-100 dark:bg-fuchsia-900 text-fuchsia-700 dark:text-fuchsia-300",
    pink: "bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300",
    rose: "bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300",
    slate: "bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300",
    gray: "bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300",
    zinc: "bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300",
    neutral:
      "bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300",
    stone: "bg-stone-100 dark:bg-stone-900 text-stone-700 dark:text-stone-300",
  };
  return colorMap[color] || colorMap[DEFAULTS.ACCOUNT_COLOR];
}

export function getRolloverText(rollover: RolloverPolicy): string {
  // Handle the case where rollover might be a string or object
  if (typeof rollover === "string") {
    switch (rollover) {
      case "ResetToZero":
        return "Reset to Zero";
      case "CarryOver":
        return "Carry Over";
      case "SinkingFund":
        return "Sinking Fund";
      case "Decay":
        return "Decay";
      default:
        return rollover;
    }
  }

  // Handle object format
  if (rollover.ResetToZero !== undefined) return "Reset to Zero";
  if (rollover.CarryOver !== undefined) {
    const cap = rollover.CarryOver?.cap;
    return cap ? `Carry Over (cap: ${formatMoney(cap)})` : "Carry Over";
  }
  if (rollover.SinkingFund !== undefined) {
    const cap = rollover.SinkingFund?.cap;
    return cap ? `Sinking Fund (cap: ${formatMoney(cap)})` : "Sinking Fund";
  }
  if (rollover.Decay !== undefined) {
    const ratio = parseFloat(rollover.Decay?.keep_ratio || "0");
    return `Decay (${(ratio * 100).toFixed(0)}%)`;
  }
  return "Unknown";
}

export function getNetworkName(net: AccountNetwork): string {
  if (net.EVM) return net.EVM.chain_name;
  if (net.Solana !== undefined) return "Solana";
  if (net.Bitcoin !== undefined) return "Bitcoin";
  return "Unknown";
}

export function inferGroupKey(account: Account): string {
  if (account.group_id) return account.group_id;

  const { type, data } = account.metadata;
  if (type === "Checking" || type === "Savings") {
    const d = data as {
      bank_name: string;
      owner_name: string;
      account_number: string;
      routing_number?: string | null;
    };
    return `${d.bank_name} • ${d.owner_name}`;
  }
  if (type === "Credit") {
    const d = data as {
      credit_card_name: string;
      owner_name: string;
      account_number: string;
      routing_number?: string | null;
    };
    return `${d.credit_card_name} • ${d.owner_name}`;
  }
  if (type === "Cex") {
    const d = data as { cex_name: string; account_id: string };
    return d.cex_name;
  }
  if (type === "CryptoWallet") {
    const d = data as {
      address: string;
      network: AccountNetwork;
      is_ledger: boolean;
    };
    return getNetworkName(d.network);
  }
  return account.name;
}

export function inferGroupLabel(accounts: Account[], key: string): string {
  if (accounts.length === 0) return key;
  const a = accounts[0];
  const { type, data } = a.metadata;

  if (type === "Checking" || type === "Savings") {
    const d = data as {
      bank_name: string;
      owner_name: string;
      account_number: string;
      routing_number?: string | null;
    };
    return `${d.bank_name} • ${d.owner_name}`;
  }
  if (type === "Credit") {
    const d = data as {
      credit_card_name: string;
      owner_name: string;
      account_number: string;
      routing_number?: string | null;
    };
    return `${d.credit_card_name} • ${d.owner_name}`;
  }
  if (type === "Cex") {
    const d = data as { cex_name: string; account_id: string };
    return d.cex_name;
  }
  if (type === "CryptoWallet") {
    const d = data as {
      address: string;
      network: AccountNetwork;
      is_ledger: boolean;
    };
    const label = getNetworkName(d.network);
    return accounts.length > 1 ? `${label} • Wallets` : label;
  }
  return key;
}
