/**
 * Buys one activity reading from the metered endpoint, as any third party
 * would. This is the answer to "the agent only pays its own endpoint" - the
 * resource is a real x402 resource and anyone with a funded Hedera testnet
 * account can pay for it.
 *
 *   HEDERA_ACCOUNT_ID=0.0.x HEDERA_PRIVATE_KEY=0x... node scripts/buy-reading.mjs
 *   URL=https://your-deployment/api/chain-data node scripts/buy-reading.mjs
 *
 * A plain curl cannot do this: x402 requires a signed payment, so the payment
 * header has to be produced by a client that holds a key.
 */
import { decodePaymentResponseHeader } from "@x402/core/http";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";

const URL_ = process.env.URL ?? "http://localhost:3000/api/chain-data";
const NETWORK = "hedera:testnet";
const HBAR = "0.0.0";
const MAX_TINYBARS = "1000000"; // 0.01 HBAR ceiling

const id = process.env.HEDERA_ACCOUNT_ID;
const key = process.env.HEDERA_PRIVATE_KEY;
if (!id || !key) {
  console.error("Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY (testnet).");
  console.error("Get a funded testnet account at https://portal.hedera.com");
  process.exit(1);
}

// Portal hands out ECDSA keys as raw hex and ED25519 keys DER-encoded, and
// fromString() guesses ED25519 for bare hex - so pick explicitly.
const trimmed = key.trim();
const isDer = trimmed.replace(/^0x/, "").toLowerCase().startsWith("30");
const signer = createClientHederaSigner(
  id,
  isDer ? PrivateKey.fromStringDer(trimmed) : PrivateKey.fromStringECDSA(trimmed),
  { network: NETWORK },
);

const payingFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: NETWORK, client: new ExactHederaScheme(signer) }],
  spendControls: {
    allowedAssets: [{ network: NETWORK, asset: HBAR, maxAmountPerPayment: MAX_TINYBARS }],
  },
});

console.log(`buying   ${URL_}`);
console.log(`payer    ${id} (${isDer ? "DER" : "raw-hex ECDSA"} key)\n`);

// Show the 402 challenge first, so the price is visible before paying.
const challenge = await fetch(URL_).catch(() => null);
if (challenge?.status === 402) {
  const header = challenge.headers.get("payment-required");
  if (header) {
    const req = JSON.parse(Buffer.from(header, "base64").toString());
    const a = req.accepts?.[0];
    console.log("402 Payment Required");
    console.log(`  price      ${Number(a.amount) / 1e8} HBAR (${a.amount} tinybars)`);
    console.log(`  asset      ${a.asset}`);
    console.log(`  payTo      ${a.payTo}`);
    console.log(`  network    ${a.network}`);
    console.log(`  feePayer   ${a.extra?.feePayer}\n`);
  }
} else if (challenge) {
  console.log(`endpoint returned ${challenge.status} without a paywall (payments may be off)\n`);
}

const res = await payingFetch(URL_, { method: "GET", signal: AbortSignal.timeout(20000) });
if (!res.ok) {
  console.error(`failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}

const settlementHeader =
  res.headers.get("payment-response") ?? res.headers.get("X-PAYMENT-RESPONSE");
if (settlementHeader) {
  const s = decodePaymentResponseHeader(settlementHeader);
  console.log("settled");
  console.log(`  success    ${s.success}`);
  console.log(`  payer      ${s.payer}`);
  console.log(`  tx         ${s.transaction}`);
  console.log(`  hashscan   https://hashscan.io/testnet/transaction/${encodeURIComponent(s.transaction)}\n`);
}

console.log("reading");
console.log(JSON.stringify(await res.json(), null, 2));
