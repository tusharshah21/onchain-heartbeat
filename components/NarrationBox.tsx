import type { Narrator, Payment } from "@/hooks/useNarration";

export default function NarrationBox({
  narration,
  narrator,
  payment,
  isLoading,
}: {
  narration: string;
  narrator: Narrator | null;
  payment: Payment | null;
  isLoading: boolean;
}) {
  const text = narration || "Listening to the chain…";

  return (
    <section
      aria-live="polite"
      className="mt-6 w-[min(46ch,86vw)] rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 text-center"
    >
      <p className="mb-2 font-mono text-[10px] tracking-[0.2em] text-white/25">
        NARRATOR
      </p>
      {/* keyed so each new line remounts and replays the fade */}
      <p
        key={text}
        className={`narration-line text-sm leading-relaxed text-white/70 ${
          narration ? "" : "italic text-white/40"
        }`}
      >
        {text}
      </p>

      {(narrator || payment?.paid) && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-white/[0.07] pt-3 font-mono text-[10px] text-white/30">
          {narrator && (
            <span title={narrator.address ?? "not registered on Sepolia yet"}>
              narrated by{" "}
              <span className={narrator.resolved ? "text-white/55" : "text-white/30"}>
                {narrator.name}
              </span>
              {narrator.resolved ? " ✓" : " (unregistered)"}
            </span>
          )}
          {payment?.paid && payment.explorerUrl && (
            <a
              href={payment.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-white/40 underline decoration-white/20 underline-offset-2 hover:text-white/70"
            >
              paid {payment.amountHbar} ℏ ↗
            </a>
          )}
        </div>
      )}
      <span className="sr-only">{isLoading ? "Loading narration" : ""}</span>
    </section>
  );
}
