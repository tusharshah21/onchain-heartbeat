"use client";

import NarrationBox from "@/components/NarrationBox";
import PulseVisual from "@/components/PulseVisual";
import Sparkline from "@/components/Sparkline";
import { useChainActivity } from "@/hooks/useChainActivity";
import { useGraphActivity } from "@/hooks/useGraphActivity";
import { useMockActivity } from "@/hooks/useMockActivity";
import { useNarration } from "@/hooks/useNarration";

// Demo-day escape hatch: set NEXT_PUBLIC_DATA_SOURCE=mock in .env.local
// (then restart dev / rebuild) to fall back to the random walk.
// Three interchangeable sources behind one { activityLevel, label } contract:
//   graph (default) - Uniswap v3 swap flow on Base, via The Graph
//   rpc             - Base block gas usage, straight from a public RPC
//   mock            - a random walk, for demos when a feed is unavailable
const SOURCE = (process.env.NEXT_PUBLIC_DATA_SOURCE ?? "graph") as
  | "graph"
  | "rpc"
  | "mock";
const useActivity =
  SOURCE === "mock"
    ? useMockActivity
    : SOURCE === "rpc"
      ? useChainActivity
      : useGraphActivity;
const FEED_LABEL = {
  graph: "uniswap v3 · base · the graph",
  rpc: "base mainnet gas",
  mock: "mock feed",
}[SOURCE];

export default function Home() {
  const { activityLevel, label } = useActivity();
  const { narration, narrator, payment, post, recent, isLoading, isFetching } =
    useNarration({ activityLevel, label });

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
        {/* The reading sits in the middle of the pulse but outside the animated
            element, so it stays put while the circle beats around it. */}
        <div className="relative grid place-items-center">
          <PulseVisual activityLevel={activityLevel} />
          <div className="pointer-events-none absolute grid place-items-center text-center">
            <span className="reading-scrim grid place-items-center rounded-full px-6 py-4">
              <span className="block font-mono text-[clamp(2.2rem,7vw,3.6rem)] font-light leading-none tabular-nums text-white">
                {activityLevel}
              </span>
              <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.28em] text-white/55">
                of 100
              </span>
            </span>
          </div>
        </div>

        <p
          key={label}
          aria-live="polite"
          className="narration-line mt-1 text-[clamp(1.2rem,3vw,1.7rem)] font-light tracking-wide text-white/90"
        >
          {label}
        </p>

        <div className="mt-1 flex flex-col items-center">
          <Sparkline values={recent} />
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/20">
            last {Math.max(recent.length, 1)} readings
          </span>
        </div>
      </section>

      <NarrationBox
        narration={narration}
        narrator={narrator}
        payment={payment}
        post={post}
        isLoading={isLoading}
        isFetching={isFetching}
      />
    </main>
  );
}
