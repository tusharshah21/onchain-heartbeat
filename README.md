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

`/api/narrate` calls Claude to commentate on the current reading. It needs a
key in `.env.local` (gitignored):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Without it the route returns 502 and the panel keeps whatever it last said.
Model and prompt are at the top of `app/api/narrate/route.ts`; cadence and
buffer size at the top of `hooks/useNarration.ts`.

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
