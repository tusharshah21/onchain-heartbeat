import type { CSSProperties } from "react";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const TICKS = 64;

/** Purely presentational: give it 0-100, it beats accordingly. */
export default function PulseVisual({ activityLevel }: { activityLevel: number }) {
  const t = Math.min(Math.max(activityLevel, 0), 100) / 100;

  const style = {
    "--beat": `${lerp(2.4, 0.5, t).toFixed(2)}s`, // seconds per heartbeat cycle
    "--amp": lerp(0.05, 0.34, t).toFixed(3), // how far it swells
    // Cyan at rest through blue and violet to crimson. Eased rather than
    // linear so the cool end holds: a quiet chain reads cyan, and crimson is
    // reserved for activity that has actually earned it.
    "--hue": Math.round(190 + 162 * Math.pow(t, 2.5)),
    "--fill": t.toFixed(3),
  } as CSSProperties;

  // A graduated ring, like the bezel on an instrument: ticks up to the current
  // reading are lit, the rest sit dark. Gives the number a scale to sit on.
  const lit = Math.round(t * TICKS);

  return (
    <div aria-hidden style={style} className="pulse relative size-[min(54vw,50vh)]">
      <div className="pulse-glow absolute inset-0 rounded-full" />

      <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 200 200">
        {Array.from({ length: TICKS }, (_, i) => {
          const angle = (i / TICKS) * Math.PI * 2;
          const on = i < lit;
          const r1 = on ? 92 : 94;
          const r2 = 98;
          return (
            <line
              key={i}
              x1={100 + Math.cos(angle) * r1}
              y1={100 + Math.sin(angle) * r1}
              x2={100 + Math.cos(angle) * r2}
              y2={100 + Math.sin(angle) * r2}
              stroke={on ? "hsl(var(--hue) 90% 62%)" : "hsl(var(--hue) 30% 26%)"}
              strokeWidth={on ? 1.6 : 1}
              strokeLinecap="round"
              opacity={on ? 0.85 : 0.5}
            />
          );
        })}
      </svg>

      <div className="pulse-core absolute inset-[17%] rounded-full" />
    </div>
  );
}
