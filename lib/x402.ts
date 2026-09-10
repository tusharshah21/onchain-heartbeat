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
// Hard ceiling for a single automated payment. HBAR is not one of the client's
// recognised default assets, so without an allowedAssets entry every payment is
// rejected before it is signed — and an agent paying on a timer should have a
// cap regardless.
const MAX_TINYBARS_PER_PAYMENT = "1000000"; // 0.01 HBAR

// Blocky402 (BlockyDevs), the facilitator the Hedera agentic-payments track
// requires. Its testnet host is separate from the mainnet one, and it is a
// different service from Coinbase's x402.org facilitator — same protocol,
// different operator and a different fee payer account.
//
// The Hedera scheme has the facilitator submit the signed transfer and pay gas,
// so FEE_PAYER must match whatever the live facilitator advertises:
//   curl -s https://api.testnet.blocky402.com/supported
export const FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL ?? "https://api.testnet.blocky402.com";
export const FEE_PAYER = process.env.X402_FEE_PAYER ?? "0.0.7162784";

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
  /** Enough to render the trail: what was bought, who settled it, where. */
  resource?: string;
  network?: string;
  facilitator?: string;
  payer?: string;
};

/**
 * The portal hands out ECDSA keys as raw hex and ED25519 keys DER-encoded, and
 * PrivateKey.fromString() guesses ED25519 for bare hex — which silently yields
 * the wrong public key and a signature the network rejects. So pick explicitly,
 * and say which was picked.
 */
function parsePayerKey(raw: string) {
  const key = raw.trim();
  const isDer = key.replace(/^0x/, "").toLowerCase().startsWith("30");
  const parsed = isDer
    ? PrivateKey.fromStringDer(key)
    : PrivateKey.fromStringECDSA(key);
  console.log(`[x402] payer key parsed as ${isDer ? "DER" : "raw-hex ECDSA"}`);
  return parsed;
}

let payingFetch: typeof fetch | null = null;

function getPayingFetch() {
  if (payingFetch) return payingFetch;
  const signer = createClientHederaSigner(
    PAYER_ID!,
    parsePayerKey(PAYER_KEY!),
    { network: NETWORK },
  );
  payingFetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: NETWORK, client: new ExactHederaScheme(signer) }],
    spendControls: {
      allowedAssets: [
        {
          network: NETWORK,
          asset: HBAR,
          maxAmountPerPayment: MAX_TINYBARS_PER_PAYMENT,
        },
      ],
    },
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
    return { paid: false, reason, resource: resourceUrl.pathname };
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

    // v2 names the settlement header `payment-response`; `X-PAYMENT-RESPONSE`
    // is the v1 spelling, kept as a fallback.
    const header =
      res.headers.get("payment-response") ?? res.headers.get("X-PAYMENT-RESPONSE");
    if (!header) {
      throw new Error(
        `paid response carried no settlement header (saw: ${[...res.headers.keys()].join(", ")})`,
      );
    }

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
    return {
      paid: true,
      amountHbar: PRICE_HBAR,
      txId,
      explorerUrl,
      resource: resourceUrl.pathname,
      network: NETWORK,
      facilitator: new URL(FACILITATOR_URL).host,
      payer: settlement.payer ?? PAYER_ID,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    console.error(`[x402] payment failed, narrating unpaid: ${reason}`);
    return { paid: false, reason, resource: resourceUrl.pathname };
  }
}
