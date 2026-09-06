"use client";

import { useEffect, useRef, useState } from "react";

const NARRATE_MS = 18000; // slower than the activity poll on purpose
const TIMEOUT_MS = 15000; // an LLM round trip is not a 4s RPC call
const BUFFER = 8; // readings kept for trend context

type Reading = { activityLevel: number; label: string };

/**
 * Narration is deliberately decoupled from where the activity numbers come
 * from — hand it any { activityLevel, label } and it does the rest.
 */
export function useNarration({ activityLevel, label }: Reading) {
  const [narration, setNarration] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const latest = useRef<Reading>({ activityLevel, label });
  const history = useRef<number[]>([]);

  // Feed the rolling buffer through refs so new readings never restart the
  // narration timer — otherwise a 3s activity poll would re-arm it forever.
  useEffect(() => {
    latest.current = { activityLevel, label };
    history.current = [...history.current, activityLevel].slice(-BUFFER);
  }, [activityLevel, label]);

  useEffect(() => {
    let cancelled = false;

    const ask = async () => {
      try {
        const res = await fetch("/api/narrate", {
          method: "POST",
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...latest.current,
            recentValues: history.current,
          }),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        }
        const { narration } = await res.json();
        if (cancelled || typeof narration !== "string" || !narration) return;
        setNarration(narration);
      } catch (err) {
        // Hold the last narration rather than blanking the panel.
        console.error("[narrate] failed, keeping last narration:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    ask();
    const id = setInterval(ask, NARRATE_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { narration, isLoading };
}
