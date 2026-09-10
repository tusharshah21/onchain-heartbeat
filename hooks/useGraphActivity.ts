"use client";

import { useEffect, useState } from "react";
import { activityLabel, INITIAL_LEVEL, nextLevel } from "./activity";

// Slower than the RPC poll: a subgraph query costs one of a monthly quota, and
// swap flow does not meaningfully change inside 6 seconds anyway.
const POLL_MS = 15000;
const TIMEOUT_MS = 14000;

/**
 * Live Uniswap-v3-on-Base swap flow via The Graph. Same
 * `{ activityLevel, label }` contract as the other sources, so PulseVisual is
 * untouched — the third data source to drop into that seam.
 */
export function useGraphActivity() {
  const [activityLevel, setActivityLevel] = useState(INITIAL_LEVEL);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/activity", {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled || typeof data.activityLevel !== "number") return;
        console.log(
          `[graph] ${data.swapsPerMin} swaps/min -> level ${data.activityLevel}`,
        );
        setActivityLevel((prev) => nextLevel(prev, data.activityLevel));
      } catch (err) {
        // Hold the last level so the pulse keeps beating through a bad query.
        console.error("[graph] poll failed, holding last level:", err);
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { activityLevel, label: activityLabel(activityLevel) };
}
