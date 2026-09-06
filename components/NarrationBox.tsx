export default function NarrationBox({
  narration,
  isLoading,
}: {
  narration: string;
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
      <span className="sr-only">{isLoading ? "Loading narration" : ""}</span>
    </section>
  );
}
