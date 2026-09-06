"use client";

import PulseVisual from "@/components/PulseVisual";
import { useMockActivity } from "@/hooks/useMockActivity";

export default function Home() {
  const { activityLevel, label } = useMockActivity();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3">
      <h1 className="sr-only">Onchain Heartbeat</h1>
      <PulseVisual activityLevel={activityLevel} />
      <p aria-live="polite" className="text-2xl font-light tracking-wide">
        {label}
      </p>
      <p className="font-mono text-xs text-white/30">
        activityLevel {activityLevel}
      </p>
    </main>
  );
}
