import { swapsToLevel } from "@/hooks/activity";

/**
 * The activity feed: live Uniswap v3 swap flow on Base, read from a
 * Messari standardized subgraph through The Graph's gateway.
 *
 * Server-side only — the API key must never reach the browser, which is why
 * the client polls /api/activity rather than the gateway directly.
 */

const SUBGRAPH =
  process.env.GRAPH_SUBGRAPH_ID ?? "FUbEPQw1oMghy39fwWBFY5fE6MXPXZQtjncQy2cXdrNS";
const KEY = process.env.GRAPH_API_KEY;
const TIMEOUT_MS = 12000;

// 500 swaps spans roughly a minute at current rates. A wider window matters:
// with only 100 swaps the span is a handful of integer seconds, which
// quantises the derived rate into coarse jumps.
const WINDOW = 500;

const QUERY = `{
  swaps(first: ${WINDOW}, orderBy: timestamp, orderDirection: desc) {
    timestamp
    amountInUSD
  }
  _meta { block { number } }
}`;

export type GraphReading = {
  activityLevel: number;
  swapsPerMin: number;
  volumeUsdPerMin: number;
  block: number;
  /** Where the number came from, so the UI can say so honestly. */
  source: "the-graph";
  subgraph: string;
};

export function graphEnabled() {
  return Boolean(KEY);
}

/** Reads live swap flow and normalises it onto the 0-100 activity scale. */
export async function getSwapActivity(): Promise<GraphReading> {
  if (!KEY) throw new Error("GRAPH_API_KEY is not set");

  const res = await fetch(
    `https://gateway.thegraph.com/api/${KEY}/subgraphs/id/${SUBGRAPH}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`gateway HTTP ${res.status}`);

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message ?? "query error");

  const swaps: { timestamp: string; amountInUSD: string }[] = json.data.swaps ?? [];
  if (swaps.length < 2) throw new Error("not enough swaps returned");

  const newest = Number(swaps[0].timestamp);
  const oldest = Number(swaps[swaps.length - 1].timestamp);
  const span = newest - oldest;
  if (span <= 0) throw new Error("degenerate time span");

  const swapsPerMin = (swaps.length / span) * 60;
  const volume = swaps.reduce((a, s) => a + (Number(s.amountInUSD) || 0), 0);

  return {
    activityLevel: swapsToLevel(swapsPerMin),
    swapsPerMin: Math.round(swapsPerMin),
    volumeUsdPerMin: Math.round((volume / span) * 60),
    block: Number(json.data._meta?.block?.number ?? 0),
    source: "the-graph",
    subgraph: SUBGRAPH,
  };
}
