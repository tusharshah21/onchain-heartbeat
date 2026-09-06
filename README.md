This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Narrator

`/api/narrate` calls OpenAI to commentate on the current reading. It needs a
key in `.env.local` (gitignored):

```
OPENAI_API_KEY=sk-...
```

Without it the route returns 502 and the panel keeps whatever it last said.
Model and prompt are at the top of `app/api/narrate/route.ts`; cadence and
buffer size at the top of `hooks/useNarration.ts`.

## Onchain identity and payments (phase 4)

Both are additive. With nothing configured the app still runs: the resource is
free, the payment step logs a skip, and the narrator name renders unresolved.

### Hedera x402 micropayment

Before each narration the server buys `/api/chain-data`, which is metered with
`@x402/next`. The GET comes back `402`, the payer signs an HBAR transfer, the
public facilitator settles it on Hedera testnet, and the retry returns the
data. Price is 0.001 HBAR (`PRICE_TINYBARS` in `lib/x402.ts`).

```
HEDERA_ACCOUNT_ID=0.0.xxxxxxx     # payer (the agent)
HEDERA_PRIVATE_KEY=302e0201...    # payer's DER private key
HEDERA_PAY_TO=0.0.yyyyyyy         # recipient (the data provider)
```

The facilitator pays gas, so the payer only needs HBAR for the payments
themselves. Confirm the fee payer account still matches with:

```
curl -s https://x402.org/facilitator/supported
```

Override with `X402_FEE_PAYER` / `X402_FACILITATOR_URL` if it has changed.

### ENS identity

```
NARRATOR_ENS_NAME=onchain-heartbeat.eth   # default
SEPOLIA_RPC_URL=https://...               # optional, viem's public RPC otherwise
```

Resolved on Sepolia against the **ETHOnline 2026 ENSv2 deployment**
(`UpgradableUniversalResolverProxy` at `0xd26f2040d083af1cd2962ba303f4bea0c4faf142`),
overriding the address viem ships for Sepolia. Cached 10 minutes on success,
1 minute on failure.

That deployment is a separate namespace: names in the mainnet-lineage Sepolia
registry do not resolve through it, and vice versa. `nick.eth` returns a
resolver under viem's default address and `0x0` under this one. So
`onchain-heartbeat.eth` has to be registered **in the hackathon deployment** —
registering it through the ordinary Sepolia flow will not make it resolve here.

## Data source

The pulse is driven by live Base mainnet gas usage, polled from the public RPC
every 6s (no API key). To fall back to the mock random walk — e.g. if the RPC
is flaky during a demo — create `.env.local`:

```
NEXT_PUBLIC_DATA_SOURCE=mock
```

and restart. Override the endpoint with `NEXT_PUBLIC_RPC_URL`. The current
source is shown in the small debug line under the pulse.

Tuning knobs for how hard the pulse beats: `QUIET_GAS` / `BUSY_GAS` in
`hooks/activity.ts`.

Run the scale's self-check with `npm test`.
