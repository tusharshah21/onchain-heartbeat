// Everything that turns raw numbers into a 0-100 activityLevel lives here,
// so both the mock and the live source stay on the same scale.

const SMOOTHING = 0.45; // 0 = frozen, 1 = jump straight to the new target

/** Eases the current level toward a target instead of snapping to it. */
export function nextLevel(current: number, target = Math.random() * 100) {
  return Math.round(current + (target - current) * SMOOTHING);
}

export function activityLabel(level: number) {
  if (level >= 70) return "High activity";
  if (level >= 35) return "Moderate activity";
  return "Quiet";
}

// Calibrated from 50 consecutive Base blocks sampled 2026-09-06:
// gasUsed p10 18.9M, p50 26.5M, p90 41.2M, max 57.2M.
// These two are the tuning knobs — widen the gap for a calmer pulse,
// narrow it for a twitchier one.
const QUIET_GAS = 12_000_000; // and below -> 0
const BUSY_GAS = 45_000_000; // and above -> 100

/** Maps a block's gasUsed onto the same 0-100 scale the mock hook produced. */
export function gasToLevel(gasUsed: number) {
  const t = (gasUsed - QUIET_GAS) / (BUSY_GAS - QUIET_GAS);
  return Math.round(Math.min(Math.max(t, 0), 1) * 100);
}

// Calibrated from the Messari Uniswap-v3-Base subgraph, sampled 2026-09-10:
// 341 / 405 / 577 / 652 swaps-per-minute at p10 / p50 / p90 / max. The floor is
// set below that sample's minimum because flow was observed at 246/min shortly
// afterwards — a two-minute sample understates the real range, so leave the
// quiet end room. Same two-knob shape as the gas thresholds above.
const QUIET_SWAPS_PER_MIN = 150; // and below -> 0
const BUSY_SWAPS_PER_MIN = 600; // and above -> 100

/** Maps Uniswap swaps-per-minute onto the same 0-100 scale. */
export function swapsToLevel(swapsPerMin: number) {
  const t =
    (swapsPerMin - QUIET_SWAPS_PER_MIN) /
    (BUSY_SWAPS_PER_MIN - QUIET_SWAPS_PER_MIN);
  return Math.round(Math.min(Math.max(t, 0), 1) * 100);
}

/** Starting level, shared so both sources hydrate identically. */
export const INITIAL_LEVEL = 45;
