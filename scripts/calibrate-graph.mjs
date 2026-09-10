/**
 * Samples the Messari Uniswap-v3-Base subgraph repeatedly so the 0-100
 * activity thresholds come from observed values, not guesses.
 *
 *   GRAPH_API_KEY=... node scripts/calibrate-graph.mjs
 */
const KEY = process.env.GRAPH_API_KEY;
if (!KEY) { console.error("GRAPH_API_KEY is not set."); process.exit(1); }

const SUBGRAPH = "FUbEPQw1oMghy39fwWBFY5fE6MXPXZQtjncQy2cXdrNS";
const URL = `https://gateway.thegraph.com/api/${KEY}/subgraphs/id/${SUBGRAPH}`;
const SAMPLES = Number(process.env.SAMPLES ?? 10);
const EVERY_MS = Number(process.env.EVERY_MS ?? 18000);
const WINDOW = Number(process.env.WINDOW ?? 500); // swaps per query;
// a wider window means a longer time span, so the derived rate is not quantised
// into coarse steps by an integer-second span

const QUERY = `{
  swaps(first: ${WINDOW}, orderBy: timestamp, orderDirection: desc) {
    timestamp
    amountInUSD
  }
}`;

async function sample() {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await res.json();
  if (j.errors) throw new Error(j.errors[0]?.message ?? "query error");
  const rows = j.data.swaps;
  const ts = rows.map((r) => Number(r.timestamp));
  const span = ts[0] - ts[ts.length - 1];
  const perMin = span > 0 ? (rows.length / span) * 60 : 0;
  const volume = rows.reduce((a, r) => a + Number(r.amountInUSD || 0), 0);
  return { perMin, volume, span, usdPerMin: span > 0 ? (volume / span) * 60 : 0 };
}

const swapRates = [];
const volRates = [];
console.log(`sampling ${SAMPLES}x every ${EVERY_MS / 1000}s (${WINDOW} swaps per query)\n`);
for (let i = 0; i < SAMPLES; i++) {
  try {
    const s = await sample();
    swapRates.push(s.perMin);
    volRates.push(s.usdPerMin);
    console.log(
      `  ${String(i + 1).padStart(2)}  ${s.perMin.toFixed(0).padStart(4)} swaps/min` +
        `   $${Math.round(s.usdPerMin).toLocaleString().padStart(9)}/min` +
        `   (window ${s.span}s)`,
    );
  } catch (e) {
    console.log(`  ${String(i + 1).padStart(2)}  ERR ${e.message.slice(0, 60)}`);
  }
  if (i < SAMPLES - 1) await new Promise((r) => setTimeout(r, EVERY_MS));
}

const stats = (a, label, unit) => {
  const s = [...a].sort((x, y) => x - y);
  const p = (q) => s[Math.floor((s.length - 1) * q)];
  console.log(
    `\n${label}\n  min ${s[0].toFixed(0)}  p10 ${p(0.1).toFixed(0)}  p50 ${p(0.5).toFixed(0)}` +
      `  p90 ${p(0.9).toFixed(0)}  max ${s.at(-1).toFixed(0)}  ${unit}`,
  );
  return { p10: p(0.1), p50: p(0.5), p90: p(0.9) };
};

if (swapRates.length > 1) {
  const sw = stats(swapRates, "swaps per minute", "swaps/min");
  stats(volRates, "volume per minute", "USD/min");
  // Mirror the gas calibration: quiet a little under p10, busy a little over p90.
  const quiet = Math.round(sw.p10 * 0.8);
  const busy = Math.round(sw.p90 * 1.2);
  console.log(
    `\nsuggested thresholds (median lands at ` +
      `${Math.round(((sw.p50 - quiet) / (busy - quiet)) * 100)}/100):\n` +
      `  QUIET_SWAPS_PER_MIN = ${quiet}\n  BUSY_SWAPS_PER_MIN  = ${busy}`,
  );
}
