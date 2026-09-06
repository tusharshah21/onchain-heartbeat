import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { withX402, x402ResourceServer } from "@x402/next";
import { NextResponse, type NextRequest } from "next/server";
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
 * The metered resource the narrator agent buys before each narration. Paying
 * for it is the demo — the payload itself is just the access receipt.
 */
async function handler(_request: NextRequest) {
  return NextResponse.json({
    licensed: true,
    issuedAt: new Date().toISOString(),
    source: "Base mainnet gas usage, sampled via public RPC",
  });
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
