import type { Money, RolloverPolicy, Account, AccountNetwork } from "./types";

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
