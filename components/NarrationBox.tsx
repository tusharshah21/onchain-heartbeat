import type { Narrator, Payment } from "@/hooks/useNarration";

export default function NarrationBox({
  narration,
  narrator,
  payment,
  isLoading,
  isFetching,
}: {
  narration: string;
  narrator: Narrator | null;
  payment: Payment | null;
  isLoading: boolean;
  isFetching: boolean;
}) {
  return (
    <section
      aria-live="polite"
      className="z-10 mb-1 w-[min(52ch,92vw)] rounded-2xl border border-white/[0.09] bg-white/[0.035] px-6 py-5 text-center backdrop-blur-sm"
    >
      <p className="mb-3 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-white/30">
        Narrator
        {/* only signals work in flight once there is already a line on screen */}
        {isFetching && !isLoading && <span className="live-dot" aria-hidden />}
      </p>

      {isLoading ? (
        <span className="skeleton mx-auto block h-4 w-3/4 rounded" aria-label="Loading narration" />
      ) : (
        <p
          key={narration}
          className={`narration-line text-[15px] leading-relaxed ${
            narration ? "text-white/75" : "italic text-white/35"
          }`}
        >
          {narration || "Waiting for the next reading…"}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-t border-white/[0.07] pt-3 font-mono text-[10px] text-white/30">
        {narrator && (
          <span title={narrator.address ?? "not registered in the hackathon ENS deployment yet"}>
            <span className="text-white/20">narrated by </span>
            <span className={narrator.resolved ? "text-white/60" : "text-white/35"}>
              {narrator.name}
            </span>
            {narrator.resolved ? (
              <span className="ml-1 text-emerald-400/70">verified</span>
            ) : (
              <span className="ml-1 text-white/20">unregistered</span>
            )}
          </span>
        )}

        {payment?.paid && payment.explorerUrl ? (
          <a
            href={payment.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2 py-0.5 text-emerald-300/80 transition-colors hover:border-emerald-400/40 hover:text-emerald-200"
            title={`Hedera testnet tx ${payment.txId}`}
          >
            paid {payment.amountHbar} HBAR
          </a>
        ) : (
          payment && (
            <span className="text-white/20" title={payment.reason}>
              unpaid
            </span>
          )
        )}
      </div>
    </section>
  );
}
