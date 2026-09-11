import { activityLabel } from "@/hooks/activity";
import { getSwapActivity, graphEnabled } from "@/lib/graph";

/**
 * The activity reading the pulse runs on. Exists so the Graph API key stays
 * server-side; the browser never talks to the gateway.
 */
export async function GET() {
  if (!graphEnabled()) {
    return Response.json({ error: "GRAPH_API_KEY is not set" }, { status: 503 });
  }
  try {
    const reading = await getSwapActivity();
    console.log(
      `[graph] ${reading.swapsPerMin} swaps/min` +
        ` ($${reading.volumeUsdPerMin.toLocaleString()}/min)` +
        ` -> level ${reading.activityLevel}  block ${reading.block}`,
    );
    return Response.json({ ...reading, label: activityLabel(reading.activityLevel) });
  } catch (err) {
    console.error("[graph] query failed:", err);
    // The reason ships with the response so a deployed instance can be
    // diagnosed without shell access to its logs. The key is scrubbed in case
    // it appears in an upstream message.
    const key = process.env.GRAPH_API_KEY?.trim();
    let reason = err instanceof Error ? err.message : "unknown error";
    if (key) reason = reason.split(key).join("<key>");
    return Response.json({ error: "Activity unavailable", reason }, { status: 502 });
  }
}
