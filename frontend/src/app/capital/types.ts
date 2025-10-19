export type Currency = "USD" | "HKD" | "BTC";

export interface Money {
  amount: string;
  ccy: Currency;
}

export interface FundingRule {
  amount: Money;
  freq: "Monthly";
}

export interface RolloverPolicy {
  ResetToZero?: null;
  CarryOver?: { cap: Money | null };
  SinkingFund?: { cap: Money | null };
  Decay?: { keep_ratio: string; cap: Money | null };
}

export interface Transaction {
  id: string;
  ts: number;
  posted_ts?: number;
  source: string;
  payee?: string;
  memo?: string;
  status?: string;
  reconciled: boolean;
  external_refs: Array<[string, string]>;
  legs: Array<{
    account_id: string;
    direction: "Debit" | "Credit";
    amount: {
      kind: "Fiat";
      data: {
        amount: string;
        ccy: string;
      };
    };
    fx?: any;
    category_id?: string | null;
    fee_of_leg_idx?: number;
    notes?: string;
  }>;
}

export interface Envelope {
  id: string;
  name: string;
  kind: "Fixed" | "Variable";
  status: "Active" | "Inactive";
  funding: FundingRule | null;
  rollover: RolloverPolicy;
  balance: Money;
  period_limit: Money | null;
  last_period: string | null;
  allow_negative: boolean;
  min_balance: string | null;
  deficit_policy: "AutoNet" | "RequireTransfer" | null;
}

export interface AccountNetwork {
  EVM?: { chain_name: string; chain_id: number };
  Solana?: null;
  Bitcoin?: null;
}

export interface AccountMetadata {
  color:
    | "red"
    | "orange"
    | "amber"
    | "yellow"
    | "lime"
    | "green"
    | "emerald"
    | "teal"
    | "cyan"
    | "sky"
    | "blue"
    | "indigo"
    | "violet"
    | "purple"
    | "fuschia"
    | "pink"
    | "rose"
    | "slate"
    | "gray"
    | "zinc"
    | "neutral"
    | "stone";
  type: "Checking" | "Savings" | "Credit" | "CryptoWallet" | "Cex" | "Trust";
  data:
    | {
        bank_name: string;
        owner_name: string;
        account_number: string;
        routing_number?: string | null;
        color?: string;
      }
    | {
        credit_card_name: string;
        owner_name: string;
        account_number: string;
        routing_number?: string | null;
        color?: string;
      }
    | {
        address: string;
        network: AccountNetwork;
        is_ledger: boolean;
        color?: string;
      }
    | {
        cex_name: string;
        account_id: string;
        color?: string;
      }
    | {
        trustee: string;
        jurisdiction: string;
        color?: string;
      };
}

export interface Account {
  id: string;
  name: string;
  currency: Currency;
  metadata: AccountMetadata;
  group_id?: string;
}

export interface TransactionQuery {
  account_id?: string;
  envelope_id?: string;
  from?: number;
  to?: number;
  label?: string;
}

export interface CycleList {
  labels: string[];
  active: string;
}

export interface EnvelopeUsage {
  envelope_id: string;
  label: string;
  budget: { amount: string; ccy: string };
  spent: { amount: string; ccy: string };
  remaining: { amount: string; ccy: string };
  percent: number;
}
