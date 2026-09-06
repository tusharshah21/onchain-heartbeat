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

export default function Home() {
  const { activityLevel, label } = useActivity();
  const { narration, narrator, payment, isLoading } = useNarration({
    activityLevel,
    label,
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3">
      <h1 className="sr-only">Onchain Heartbeat</h1>
      <PulseVisual activityLevel={activityLevel} />
      <p aria-live="polite" className="text-2xl font-light tracking-wide">
        {label}
      </p>
      <p className="font-mono text-xs text-white/30">
        {SOURCE} · activityLevel {activityLevel}
      </p>
      <NarrationBox
        narration={narration}
        narrator={narrator}
        payment={payment}
        isLoading={isLoading}
      />
    </main>
  );
}
