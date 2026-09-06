"use client";

import { useEffect, useState } from "react";
import { activityLabel, gasToLevel, INITIAL_LEVEL, nextLevel } from "./activity";

// Base mainnet public RPC: no API key, sends `access-control-allow-origin: *`,
// and 2s blocks keep the pulse visibly alive.
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://mainnet.base.org";
const POLL_MS = 6000;
const TIMEOUT_MS = 4000;

async function latestBlockGas() {
  const res = await fetch(RPC_URL, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBlockByNumber",
      params: ["latest", false], // false = hashes only, we just need the header
    }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const { result, error } = await res.json();
  if (error) throw new Error(error.message ?? "RPC error");
  return Number(result.gasUsed);
}

/**
 * Live Base mainnet activity. Drop-in replacement for useMockActivity:
 * same `{ activityLevel, label }`, same easing, so PulseVisual is untouched.
 */
export function useChainActivity() {
  const [activityLevel, setActivityLevel] = useState(INITIAL_LEVEL);

  useEffect(() => {
    let cancelled = false;

    // ponytail: samples one block per poll rather than averaging the ~3 blocks
    // mined in between; the easing absorbs the noise. Average them if the
    // pulse ever looks jittery.
    const poll = async () => {
      try {
        const gasUsed = await latestBlockGas();
        if (cancelled) return;
        const target = gasToLevel(gasUsed);
        console.log(
          `[chain] gasUsed ${(gasUsed / 1e6).toFixed(1)}M -> level ${target}`,
        );
        setActivityLevel((prev) => nextLevel(prev, target));
      } catch (err) {
        // Hold the last known level so the pulse keeps beating through a bad poll.
        console.error("[chain] poll failed, holding last level:", err);
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
