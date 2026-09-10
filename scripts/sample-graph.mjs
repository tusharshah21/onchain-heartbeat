/**
 * Probes candidate Base subgraphs and samples real values, so the activity
 * thresholds are calibrated from data rather than guessed - same approach used
 * for the gas thresholds in hooks/activity.ts.
 *
 *   GRAPH_API_KEY=... node scripts/sample-graph.mjs
 *
 * Free tier: 100,000 queries/month from Subgraph Studio (thegraph.com/studio).
 */
const KEY = process.env.GRAPH_API_KEY;
if (!KEY) {
  console.error("GRAPH_API_KEY is not set. Create one free at https://thegraph.com/studio");
  process.exit(1);
}

const SUBGRAPHS = {
  "messari-univ3-base": "FUbEPQw1oMghy39fwWBFY5fE6MXPXZQtjncQy2cXdrNS",
  "buildersdao-univ3-base": "HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1",
};

const url = (id) => `https://gateway.thegraph.com/api/${KEY}/subgraphs/id/${id}`;

async function q(id, query) {
  const res = await fetch(url(id), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await res.json();
  if (j.errors) return { error: j.errors[0]?.message ?? "unknown" };
  return { data: j.data };
}

// Candidate query shapes. Whichever returns data decides the schema we target.
const PROBES = {
  meta: "{ _meta { block { number timestamp } } }",
  messariSwaps: `{
    swaps(first: 100, orderBy: timestamp, orderDirection: desc) {
      timestamp
      amountInUSD
      amountOutUSD
    }
  }`,
  messariUsage: `{
    usageMetricsHourlySnapshots(first: 3, orderBy: timestamp, orderDirection: desc) {
      timestamp
      hourlyActiveUsers
      hourlyTransactionCount
      cumulativeUniqueUsers
    }
  }`,
  uniswapSwaps: `{
    swaps(first: 100, orderBy: timestamp, orderDirection: desc) {
      timestamp
      amountUSD
    }
  }`,
};

for (const [name, id] of Object.entries(SUBGRAPHS)) {
  console.log(`\n===== ${name} =====`);
  console.log(`  ${id}`);
  for (const [probe, query] of Object.entries(PROBES)) {
    const r = await q(id, query);
    if (r.error) {
      console.log(`  ${probe.padEnd(14)} ERR  ${r.error.slice(0, 90)}`);
      continue;
    }
    const key = Object.keys(r.data)[0];
    const rows = r.data[key];
    if (Array.isArray(rows)) {
      console.log(`  ${probe.padEnd(14)} OK   ${rows.length} rows`);
      if (rows.length) console.log(`  ${"".padEnd(14)}      sample ${JSON.stringify(rows[0])}`);
      // derive an activity figure from swap timestamps
      if (rows.length > 1 && rows[0].timestamp) {
        const ts = rows.map((x) => Number(x.timestamp));
        const span = ts[0] - ts[ts.length - 1];
        if (span > 0) {
          const perMin = (rows.length / span) * 60;
          console.log(`  ${"".padEnd(14)}      ${rows.length} swaps over ${span}s = ${perMin.toFixed(1)} swaps/min`);
        }
        const usd = rows
          .map((x) => Number(x.amountUSD ?? x.amountInUSD ?? 0))
          .filter((n) => Number.isFinite(n) && n > 0);
        if (usd.length) {
          const total = usd.reduce((a, b) => a + b, 0);
          console.log(`  ${"".padEnd(14)}      volume across sample: $${total.toFixed(0)}`);
        }
      }
    } else {
      console.log(`  ${probe.padEnd(14)} OK   ${JSON.stringify(rows)}`);
    }
  }
}

console.log("\nNext: whichever probe returns usable rows becomes the query in");
console.log("hooks/useGraphActivity.ts, and repeated samples set the 0-100 thresholds.");
