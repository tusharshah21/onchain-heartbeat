"use client";

import { useEffect, useState } from "react";

const UPDATE_MS = 3000;
const SMOOTHING = 0.45; // 0 = frozen, 1 = jump straight to the new random target

/** Eases the current level toward a fresh random target instead of snapping to it. */
export function nextLevel(current: number, target = Math.random() * 100) {
  return Math.round(current + (target - current) * SMOOTHING);
}

export function activityLabel(level: number) {
  if (level >= 70) return "High activity";
  if (level >= 35) return "Moderate activity";
  return "Quiet";
}

/**
 * Phase 1 stand-in for real chain data. Anything that returns
 * `{ activityLevel, label }` can replace it without touching PulseVisual.
 */
export function useMockActivity() {
  const [activityLevel, setActivityLevel] = useState(45);

  useEffect(() => {
    const id = setInterval(() => setActivityLevel(nextLevel), UPDATE_MS);
    return () => clearInterval(id);
  }, []);

  return { activityLevel, label: activityLabel(activityLevel) };
}
