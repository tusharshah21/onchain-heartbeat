"use client";

import NarrationBox from "@/components/NarrationBox";
import PulseVisual from "@/components/PulseVisual";
import { useChainActivity } from "@/hooks/useChainActivity";
import { useMockActivity } from "@/hooks/useMockActivity";
import { useNarration } from "@/hooks/useNarration";

// Demo-day escape hatch: set NEXT_PUBLIC_DATA_SOURCE=mock in .env.local
// (then restart dev / rebuild) to fall back to the random walk.
const SOURCE = process.env.NEXT_PUBLIC_DATA_SOURCE === "mock" ? "mock" : "base";
const useActivity = SOURCE === "mock" ? useMockActivity : useChainActivity;
const FEED_LABEL = SOURCE === "mock" ? "mock feed" : "base mainnet";

export default function Home() {
  const { activityLevel, label } = useActivity();
  const { narration, narrator, payment, isLoading, isFetching } = useNarration({
    activityLevel,
    label,
  });

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-between overflow-hidden px-5 py-7">
      <header className="z-10 flex w-full items-center justify-between">
        <h1 className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/45">
          Onchain Heartbeat
        </h1>
        <span className="flex items-center gap-2 font-mono text-[11px] text-white/35">
          <span className="live-dot" aria-hidden />
          {FEED_LABEL}
        </span>
      </header>

      <section className="z-10 flex flex-col items-center">
        <PulseVisual activityLevel={activityLevel} />
        <p
          key={label}
          aria-live="polite"
          className="narration-line mt-2 text-[clamp(1.35rem,3.4vw,2rem)] font-light tracking-wide text-white/90"
        >
          {label}
        </p>
        <p className="mt-2 font-mono text-[11px] tracking-wide text-white/25">
          activity {String(activityLevel).padStart(2, "0")}
          <span className="mx-2 text-white/15">/</span>
          100
        </p>
      </section>

      <NarrationBox
        narration={narration}
        narrator={narrator}
        payment={payment}
        isLoading={isLoading}
        isFetching={isFetching}
      />
    </main>
  );
}
