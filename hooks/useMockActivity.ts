"use client";

import { useEffect, useState } from "react";
import { activityLabel, INITIAL_LEVEL, nextLevel } from "./activity";

const UPDATE_MS = 3000;

/**
 * Random-walk stand-in for real chain data. Same shape as useChainActivity,
 * so either can drive the page without PulseVisual noticing.
 */
export function useMockActivity() {
  const [activityLevel, setActivityLevel] = useState(INITIAL_LEVEL);

  useEffect(() => {
    const id = setInterval(() => setActivityLevel(nextLevel), UPDATE_MS);
    return () => clearInterval(id);
  }, []);

  return { activityLevel, label: activityLabel(activityLevel) };
}
