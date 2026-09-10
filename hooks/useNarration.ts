"use client";

import { useEffect, useRef, useState } from "react";

const NARRATE_MS = 18000; // slower than the activity poll on purpose
const TIMEOUT_MS = 15000; // an LLM round trip is not a 4s RPC call
const BUFFER = 8; // readings kept for trend context

type Reading = { activityLevel: number; label: string };

export type Narrator = {
  name: string;
  address: string | null;
  resolved: boolean;
  description: string | null;
  avatar: string | null;
  url: string | null;
};
export type Post = { name: string; txHash: string };

export type Payment = {
  paid: boolean;
  reason?: string;
  amountHbar?: string;
  txId?: string;
  explorerUrl?: string;
  resource?: string;
  network?: string;
  facilitator?: string;
  payer?: string;
};

/**
 * Narration is deliberately decoupled from where the activity numbers come
 * from — hand it any { activityLevel, label } and it does the rest.
 */
export function useNarration({ activityLevel, label }: Reading) {
  const [narration, setNarration] = useState("");
  const [narrator, setNarrator] = useState<Narrator | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [recent, setRecent] = useState<number[]>([]);
  const [post, setPost] = useState<Post | null>(null);
  const latest = useRef<Reading>({ activityLevel, label });
  const history = useRef<number[]>([]);

  // Feed the rolling buffer through refs so new readings never restart the
  // narration timer — otherwise a 3s activity poll would re-arm it forever.
  useEffect(() => {
    latest.current = { activityLevel, label };
    history.current = [...history.current, activityLevel].slice(-BUFFER);
    setRecent(history.current);
  }, [activityLevel, label]);

  useEffect(() => {
    let cancelled = false;

    const ask = async () => {
      if (!cancelled) setIsFetching(true);
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
        const data = await res.json();
        if (cancelled || typeof data.narration !== "string" || !data.narration) return;
        setNarration(data.narration);
        if (data.narrator) setNarrator(data.narrator);
        // a beat only gets a name when the mood changes, so keep the last one
        if (data.post) setPost(data.post);
        // Each narration is bought separately, so the receipt tracks the line.
        if (data.payment) {
          setPayment(data.payment);
          if (data.payment.paid) {
            console.log(
              `[x402] this narration cost ${data.payment.amountHbar} HBAR — ${data.payment.explorerUrl}`,
            );
          }
        }
      } catch (err) {
        // Hold the last narration rather than blanking the panel.
        console.error("[narrate] failed, keeping last narration:", err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsFetching(false);
        }
      }
    };

    ask();
    const id = setInterval(ask, NARRATE_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { narration, narrator, payment, post, recent, isLoading, isFetching };
}
