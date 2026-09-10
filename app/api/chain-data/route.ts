import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { withX402, x402ResourceServer } from "@x402/next";
import { NextResponse, type NextRequest } from "next/server";

import { getSwapActivity, graphEnabled } from "@/lib/graph";
import {
  FACILITATOR_URL,
  FEE_PAYER,
  HBAR,
  NETWORK,
  PAY_TO,
  PRICE_TINYBARS,
  paymentsEnabled,
} from "@/lib/x402";

/**
 * The metered resource the narrator agent buys before each narration: a live
 * reading of Uniswap v3 swap flow on Base, read from a Messari standardized
 * subgraph through The Graph.
 *
 * So the payment actually buys something — the agent pays for indexed data,
 * rather than for a receipt.
 */
async function handler(_request: NextRequest) {
  const base = { licensed: true, issuedAt: new Date().toISOString() };
  if (!graphEnabled()) {
    return NextResponse.json({
      ...base,
      source: "unavailable — GRAPH_API_KEY is not set",
    });
  }
  try {
    const reading = await getSwapActivity();
    return NextResponse.json({
      ...base,
      ...reading,
      source: "Uniswap v3 on Base, via The Graph",
    });
  } catch (err) {
    console.error("[chain-data] subgraph query failed:", err);
    // Still honour the purchase rather than charging for an error.
    return NextResponse.json({ ...base, source: "subgraph unavailable" });
  }
}

function protectedHandler() {
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const server = new x402ResourceServer(facilitator).register(
    NETWORK,
    new ExactHederaScheme({
      defaultAssets: { [NETWORK]: { asset: HBAR, decimals: 8 } },
    }),
  );

  return withX402(
    handler,
    {
      accepts: {
        scheme: "exact",
        network: NETWORK,
        payTo: PAY_TO!,
        price: { asset: HBAR, amount: PRICE_TINYBARS },
        // Hedera's x402 scheme has the facilitator submit and pay gas.
        extra: { feePayer: FEE_PAYER },
      },
      description: "One Onchain Heartbeat activity reading",
    },
    server,
  );
}

// Unconfigured demo: the resource is simply free, matching the payer side,
// which skips for the same reason. Nothing 500s just because there are no keys.
export const GET = paymentsEnabled() ? protectedHandler() : handler;
