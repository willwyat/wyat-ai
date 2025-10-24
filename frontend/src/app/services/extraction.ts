import { API_URL } from "@/lib/config";
import type {
  FlatTransaction,
  BatchImportResponse,
} from "@/stores/document-store";

const BASE_URL = API_URL;

type ExtractImportOptions = {
  submit?: boolean;
  source?: string;
  status?: string | null;
  debit_tx_type?: string;
  credit_tx_type?: string;
  fallback_account_id?: string;
};

export async function extractBankStatement(payload: {
  blob_id: string;
  doc_id: string;
  prompt: string;
  prompt_id: string;
  prompt_version: string;
  model: string;
  assistant_name: string;
  import?: ExtractImportOptions;
}): Promise<{
  transactions: FlatTransaction[];
  audit: any;
  inferred_meta: any;
  quality: string;
  confidence: number;
  import_summary?: BatchImportResponse;
}> {
  const response = await fetch(`${BASE_URL}/ai/extract/bank-statement`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Extraction failed (${response.status})`);
  }

  return response.json();
}

export async function batchImportTransactions(
  transactions: FlatTransaction[]
): Promise<BatchImportResponse> {
  const response = await fetch(`${BASE_URL}/capital/transactions/batch-import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ transactions }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Batch import failed (${response.status})`);
  }

  return response.json();
}
