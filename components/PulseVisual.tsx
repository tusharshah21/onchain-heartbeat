import type { CSSProperties } from "react";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Purely presentational: give it 0-100, it beats accordingly. */
export default function PulseVisual({ activityLevel }: { activityLevel: number }) {
  const t = Math.min(Math.max(activityLevel, 0), 100) / 100;

  const style = {
    "--beat": `${lerp(2.4, 0.5, t).toFixed(2)}s`, // seconds per heartbeat cycle
    "--amp": lerp(0.05, 0.34, t).toFixed(3), // how far it swells
    "--hue": Math.round(lerp(190, 352, t)), // calm cyan -> hot crimson
  } as CSSProperties;

  return (
    <div
      aria-hidden
      style={style}
      className="pulse relative size-[min(56vw,52vh)]"
    >
      <div className="pulse-glow absolute inset-0 rounded-full" />
      <div className="pulse-core absolute inset-[16%] rounded-full" />
    </div>
  );
}
