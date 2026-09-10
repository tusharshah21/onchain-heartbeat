/* eslint-disable @next/next/no-img-element */
import type { Narrator, Payment, Post } from "@/hooks/useNarration";

/**
 * The narrator's ENS profile: avatar, name, description. Records come from the
 * name itself, so what you see is what the chain says about this agent.
 */
function Profile({ narrator }: { narrator: Narrator }) {
  const initial = narrator.name.slice(0, 1).toUpperCase();
  return (
    <div className="flex items-start gap-3 text-left">
      {narrator.avatar ? (
        <img
          src={narrator.avatar}
          alt=""
          width={34}
          height={34}
          className="mt-0.5 size-[34px] shrink-0 rounded-full border border-white/10 bg-white/5 object-cover"
        />
      ) : (
        <span className="mt-0.5 grid size-[34px] shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 font-mono text-xs text-white/40">
          {initial}
        </span>
      )}
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-mono text-[11px] text-white/60">
          {narrator.url ? (
            <a href={narrator.url} target="_blank" rel="noreferrer" className="hover:text-white/90">
              {narrator.name}
            </a>
          ) : (
            narrator.name
          )}
          {narrator.resolved ? (
            <span
              title={`Resolves to ${narrator.address} on the ETHOnline ENSv2 deployment`}
              className="rounded-full border border-emerald-400/25 px-1.5 text-[9px] uppercase tracking-wider text-emerald-300/80"
            >
              ens
            </span>
          ) : (
            <span className="text-[9px] uppercase tracking-wider text-white/25">unregistered</span>
          )}
        </p>
        {narrator.description && (
          <p className="mt-0.5 text-[11px] leading-snug text-white/30">{narrator.description}</p>
        )}
      </div>
    </div>
  );
}

/** paid -> endpoint -> settled, so each beat carries its own audit trail. */
function PaymentTrail({ payment }: { payment: Payment }) {
  if (!payment.paid) {
    return (
      <p className="font-mono text-[10px] text-white/25" title={payment.reason}>
        unpaid{payment.resource ? ` · ${payment.resource}` : ""}
      </p>
    );
  }
  const Step = ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <span title={title} className="whitespace-nowrap text-white/40">
      {children}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[10px]">
      <Step title={`Paid by ${payment.payer}`}>
        <span className="text-emerald-300/80">paid {payment.amountHbar} ℏ</span>
      </Step>
      <span className="text-white/15">→</span>
      <Step title="The metered resource the agent bought">{payment.resource}</Step>
      <span className="text-white/15">→</span>
      <Step title={`Settled on ${payment.network} by ${payment.facilitator}`}>
        settled
      </Step>
      <a
        href={payment.explorerUrl}
        target="_blank"
        rel="noreferrer"
        title={`Hedera tx ${payment.txId}`}
        className="text-white/40 underline decoration-white/20 underline-offset-2 hover:text-white/80"
      >
        {payment.txId?.split("@")[0]} ↗
      </a>
    </div>
  );
}

export default function NarrationBox({
  narration,
  narrator,
  payment,
  post,
  isLoading,
  isFetching,
}: {
  narration: string;
  narrator: Narrator | null;
  payment: Payment | null;
  post: Post | null;
  isLoading: boolean;
  isFetching: boolean;
}) {
  return (
    <section
      aria-live="polite"
      className="z-10 mb-1 w-[min(56ch,92vw)] rounded-2xl border border-white/[0.09] bg-white/[0.035] px-5 py-4 backdrop-blur-sm"
    >
      {narrator ? (
        <Profile narrator={narrator} />
      ) : (
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/30">Narrator</p>
      )}

      <div className="mt-3 border-t border-white/[0.07] pt-3">
        {isLoading ? (
          <span className="skeleton block h-4 w-3/4 rounded" aria-label="Loading narration" />
        ) : (
          <p
            key={narration}
            className={`narration-line text-[15px] leading-relaxed ${
              narration ? "text-white/80" : "italic text-white/35"
            }`}
          >
            {narration || "Waiting for the next reading…"}
          </p>
        )}
      </div>

      {post && (
        <p
          className="mt-2 truncate font-mono text-[10px] text-white/30"
          title={`Published as an ENS subname, tx ${post.txHash}`}
        >
          <span className="text-white/20">named </span>
          <span className="text-white/50">{post.name}</span>
        </p>
      )}

      {payment && (
        <div className="mt-3 flex items-center gap-2 border-t border-white/[0.07] pt-3">
          <PaymentTrail payment={payment} />
          {isFetching && !isLoading && <span className="live-dot ml-auto" aria-hidden />}
        </div>
      )}
    </section>
  );
}
