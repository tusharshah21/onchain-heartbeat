import { decodePaymentResponseHeader } from "@x402/core/http";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";

// ── Shared x402 / Hedera configuration ──────────────────────────────────────
// The payer and the resource server both read from here so they can never
// drift apart.

export const NETWORK = "hedera:testnet" as const;
export const HBAR = "0.0.0"; // native HBAR, amounts are in tinybars
export const PRICE_TINYBARS = "100000"; // 0.001 HBAR per narration
export const PRICE_HBAR = "0.001";

// The Hedera x402 scheme has the facilitator pay gas and submit the signed
// transfer, so this account id has to match the live facilitator's.
// Check with: curl -s https://x402.org/facilitator/supported
export const FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";
export const FEE_PAYER = process.env.X402_FEE_PAYER ?? "0.0.9185802";

export const PAY_TO = process.env.HEDERA_PAY_TO;
const PAYER_ID = process.env.HEDERA_ACCOUNT_ID;
const PAYER_KEY = process.env.HEDERA_PRIVATE_KEY;
const PAY_TIMEOUT_MS = 12000;

/** Both halves switch off together, so an unconfigured demo still narrates. */
export function paymentsEnabled() {
  return Boolean(PAYER_ID && PAYER_KEY && PAY_TO);
}

export function hashscanUrl(txId: string) {
  return `https://hashscan.io/testnet/transaction/${encodeURIComponent(txId)}`;
}

export type PaymentReceipt = {
  paid: boolean;
  reason?: string;
  amountHbar?: string;
  txId?: string;
  explorerUrl?: string;
};

let payingFetch: typeof fetch | null = null;

function getPayingFetch() {
  if (payingFetch) return payingFetch;
  const signer = createClientHederaSigner(
    PAYER_ID!,
    PrivateKey.fromString(PAYER_KEY!),
    { network: NETWORK },
  );
  payingFetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: NETWORK, client: new ExactHederaScheme(signer) }],
  }) as typeof fetch;
  return payingFetch;
}

/**
 * Buys access to the metered chain-data resource: the GET comes back 402 with
 * payment requirements, the wrapped fetch signs a transfer, the facilitator
 * settles it on Hedera testnet, and the retry returns the data.
 *
 * Never throws — payment is a value-add, so a failure logs and the caller
 * carries on unpaid.
 */
export async function payForReading(resourceUrl: URL): Promise<PaymentReceipt> {
  if (!paymentsEnabled()) {
    const reason =
      "payer not configured (set HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, HEDERA_PAY_TO)";
    console.log(`[x402] skipped — ${reason}`);
    return { paid: false, reason };
  }

  try {
    console.log(
      `[x402] buying ${resourceUrl.pathname} for ${PRICE_HBAR} HBAR on ${NETWORK} …`,
    );
    const res = await getPayingFetch()(resourceUrl, {
      method: "GET",
      signal: AbortSignal.timeout(PAY_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`resource returned HTTP ${res.status}`);

    const header = res.headers.get("X-PAYMENT-RESPONSE");
    if (!header) throw new Error("no X-PAYMENT-RESPONSE header on the paid response");

    const settlement = decodePaymentResponseHeader(header);
    if (!settlement.success) {
      throw new Error(settlement.errorMessage ?? settlement.errorReason ?? "settle failed");
    }

    const txId = settlement.transaction;
    const explorerUrl = hashscanUrl(txId);
    console.log(
      `[x402] PAID ${PRICE_HBAR} HBAR  payer=${settlement.payer ?? PAYER_ID}  tx=${txId}`,
    );
    console.log(`[x402] ${explorerUrl}`);
    return { paid: true, amountHbar: PRICE_HBAR, txId, explorerUrl };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    console.error(`[x402] payment failed, narrating unpaid: ${reason}`);
    return { paid: false, reason };
  }
}
