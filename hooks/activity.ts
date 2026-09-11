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

// Swap flow is multiplicative, not additive: a 2.5-minute daytime sample gave
// 341-652 per minute, and the same chain was doing 121 overnight. Anything
// linear across that spread pins half the day at zero — the first calibration
// did exactly that, and the pulse flatlined after dark.
//
// So the scale is logarithmic between a genuinely dead chain and a genuine
// spike. Observed points land at: 121 -> 23, 246 -> 47, 405 -> 64, 652 -> 80.
// Quiet still reads as a slow pulse rather than a flat line.
const DEAD_SWAPS_PER_MIN = 60; // and below -> 0
const SPIKE_SWAPS_PER_MIN = 1200; // and above -> 100
const LOG_RANGE = Math.log(SPIKE_SWAPS_PER_MIN / DEAD_SWAPS_PER_MIN);

/** Maps Uniswap swaps-per-minute onto the same 0-100 scale. */
export function swapsToLevel(swapsPerMin: number) {
  if (!Number.isFinite(swapsPerMin) || swapsPerMin <= DEAD_SWAPS_PER_MIN) return 0;
  const t = Math.log(swapsPerMin / DEAD_SWAPS_PER_MIN) / LOG_RANGE;
  return Math.round(Math.min(t, 1) * 100);
}

/** Starting level, shared so both sources hydrate identically. */
export const INITIAL_LEVEL = 45;
