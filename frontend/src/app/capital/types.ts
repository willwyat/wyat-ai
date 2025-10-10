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
  type: "Checking" | "Savings" | "Credit" | "CryptoWallet" | "Cex" | "Trust";
  data:
    | {
        bank_name: string;
        owner_name: string;
        account_number: string;
        routing_number?: string | null;
      }
    | {
        credit_card_name: string;
        owner_name: string;
        account_number: string;
        routing_number?: string | null;
      }
    | {
        address: string;
        network: AccountNetwork;
        is_ledger: boolean;
      }
    | {
        cex_name: string;
        account_id: string;
      }
    | {
        trustee: string;
        jurisdiction: string;
      };
}

export interface Account {
  id: string;
  name: string;
  currency: Currency;
  metadata: AccountMetadata;
  group_id?: string;
}
