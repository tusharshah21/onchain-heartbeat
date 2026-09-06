# Onchain Heartbeat

A live visual pulse of blockchain activity, narrated by an AI commentator that pays for its own data.

A circle beats in the middle of the screen. Its rhythm, amplitude and colour are driven by real gas usage on Base mainnet — calm cyan with a slow swell when the chain is quiet, fast crimson thumping when it is busy. Every 18 seconds an agent buys a metered reading over Hedera x402, then narrates what just happened in one line of play-by-play commentary.

Three things happen at once, and the UI shows all three: the chain's state, an agent paying for data, and that agent's onchain identity.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill in the keys below
npm run dev                    # http://localhost:3000
npm test                       # self-check on the 0-100 activity scale
```

The app runs with **no keys at all**. Without them the narrator stays silent, the metered resource is served free, and the identity renders unregistered — nothing crashes. Each key you add lights up one more layer.

| variable | layer | effect if unset |
|---|---|---|
| `OPENAI_API_KEY` | AI | panel holds its last line; pulse unaffected |
| `HEDERA_ACCOUNT_ID` / `HEDERA_PRIVATE_KEY` / `HEDERA_PAY_TO` | payments | resource served free, `unpaid` chip |
| `NARRATOR_ENS_NAME` | identity | defaults to `onchain-heartbeat.eth` |
| `SEPOLIA_RPC_URL` | identity | viem's public Sepolia RPC |
| `NEXT_PUBLIC_DATA_SOURCE` | data | live Base data; set to `mock` for a random walk |
| `NEXT_PUBLIC_RPC_URL` | data | `https://mainnet.base.org` |
| `X402_FACILITATOR_URL` / `X402_FEE_PAYER` | payments | Blocky402 testnet defaults |

---

## Architecture

Three layers with one seam between each. The rule the codebase enforces is that **the visual never knows where its number came from**.

```
  DATA                     AI                       UI
  ------------------       ------------------       ----------------------
  useChainActivity   -+                        +--  PulseVisual
    Base RPC, 6s      |                        |      activityLevel -> CSS vars
                      +-> { activityLevel,  ---+
  useMockActivity     |      label }           +--  NarrationBox
    random walk, 3s  -+          |                    narration + receipt
                                 v
                           useNarration
                             8-reading buffer, 18s
                                 v
                           POST /api/narrate
                             |-> payForReading()      GET /api/chain-data -> 402 -> settle
                             |-> getNarratorIdentity() Sepolia
                             +-> OpenAI gpt-4o-mini
```

**Data layer.** `hooks/useChainActivity.ts` polls one Base block header every 6s and normalises `gasUsed` onto 0-100. Thresholds in `hooks/activity.ts` came from sampling 50 consecutive blocks — p10 18.9M, p50 26.5M, p90 41.2M gas — so 12M-45M spans quiet to busy. `useMockActivity` returns the identical shape, which is the whole point: either can drive the page and `PulseVisual.tsx` never changes.

**AI layer.** `app/api/narrate/route.ts` takes a reading plus the recent window, computes the delta in points and percent, and asks for one line of commentary. The prompt bans invented specifics (token names, dollar amounts, wallet counts) because none of that is in the payload. A rotating opening directive is appended per call — without it the model converges on a single sentence template within a few narrations.

**UI layer.** `PulseVisual` maps 0-100 onto three CSS custom properties (`--beat`, `--amp`, `--hue`) and lets CSS keyframes do the animating, so the heartbeat runs on the compositor rather than in JS. `@property` registrations let amplitude and hue ease between readings instead of snapping.

---

## Hedera x402 payments

`/api/chain-data` is a real metered resource guarded by `@x402/next`. Before each narration the agent buys it: the GET returns `402` with payment requirements, the agent signs an HBAR transfer, **Blocky402** settles it on Hedera testnet, and the retry returns the data. 0.001 HBAR per narration, charged per call rather than batched — one payment per line is the clearer thing to point at, and 18s leaves ample room for the two round trips.

Settlement goes through Blocky402 (BlockyDevs), as the agentic-payments track requires. It is a different operator from Coinbase's x402.org facilitator — same protocol, different host, and a different fee payer account:

```
https://api.testnet.blocky402.com    hedera:testnet, fee payer 0.0.7162784
https://api.blocky402.com            hedera:mainnet, fee payer 0.0.10571514
```

### Verified settlement

```
tx  0.0.7162784@1788690223.769989855
    https://hashscan.io/testnet/transaction/0.0.7162784%401788690223.769989855
```

Confirmed against the Hedera mirror node — `SUCCESS`, `CRYPTOTRANSFER`:

```
0.0.7055006   -100000 tinybars   the agent
0.0.7117761   +100000 tinybars   the data provider
0.0.7162784   -246808 tinybars   Blocky402 - submitted the tx and paid all gas
0.0.802       +246808 tinybars   network fee
```

The submitting account is Blocky402's, so the settlement path is checkable on-chain rather than taken on trust. The fee-payer model means the agent spends only its 0.001 HBAR; gas is the facilitator's.

The client sets a hard `maxAmountPerPayment` of 0.01 HBAR. An agent paying on a timer should have a ceiling.

---

## ENS identity

The narrator has an onchain name, resolved against the **ETHOnline 2026 ENSv2 deployment** on Sepolia rather than the mainnet-lineage registry.

### Implemented and independently verified

The Universal Resolver address viem ships for Sepolia is overridden with the hackathon `UpgradableUniversalResolverProxy`:

```ts
ensUniversalResolver: { address: "0xd26f2040d083af1cd2962ba303f4bea0c4faf142" }
```

Verified by resolving the same names through both deployments at the same block, which confirms the override reaches a genuinely different namespace rather than silently falling back:

| name | viem default UR | hackathon UR |
|---|---|---|
| `nick.eth` | `0xb8c2C29e...67d5` | `(null)` |
| `vitalik.eth` | `0xd8dA6BF2...6045` | `(null)` |
| `onchain-heartbeat.eth` | `(null)` | `(null)` |

`nick.eth` has a resolver record under the default address and `0x0` under the hackathon one — two separate registries, not two views of one.

That also means an earlier "resolver path proven via nick.eth" check was **invalid** under this deployment and has been retracted. A name must be registered in the hackathon registry to resolve here; registering through app.ens.domains does nothing for it.

Mechanically the override is sound: the proxy holds a real contract, viem's Universal Resolver ABI is compatible with it, and lookups return a clean zero-address "no record" instead of reverting.

### Blocked

`onchain-heartbeat.eth` is **not registered**, so the UI shows `unregistered`. This is not a gap in this codebase — the hackathon's own ENS app cannot complete the registration.

The app builds a `deployProxy` transaction whose inner initialize payload the implementation does not accept. Simulated with `eth_call` from the registrant's own funded wallet, four variants of the same call:

| variant | result |
|---|---|
| original salt + original init payload | **revert** |
| original salt + **empty** init payload | ok, returns proxy `0x39962d7e...1634` |
| new salt + original init payload | **revert** |
| new salt + empty init payload | ok, returns proxy `0x68a9bd8c...ce87` |

The deployment succeeds with either salt and fails only when the init payload is attached, so it is not a CREATE2 collision, not the wallet, and not gas. The payload is `initialize(0xad1c4453...652d, 0x1111...1111, [])`, and the implementation at `0xa9d3814a...614e` exposes no `initialize(address,uint256,bytes[])` — a scan for that selector plus six other common initialize shapes found none of them. Its first argument is an EOA with no bytecode, and `0x1111...1111` reads as an unfilled placeholder.

Separately, the app hardcodes a 21,000,000 gas limit that public RPCs reject. Fixing only that would buy a mined-and-reverted transaction instead of a rejected one.

`scripts/send-raw-tx.mjs` sends a prepared transaction with an explicit gas limit, simulating with `eth_call` first so a contract-level revert is reported rather than paid for. That guard is what caught this.

**Reported at:** not yet filed — see TODO.

---

## Behaviour under failure

Every external dependency degrades instead of breaking. Verified by running the app against dead endpoints:

| broken thing | what happens |
|---|---|
| Base RPC unreachable | pulse holds its last rate, logs `[chain]`, keeps beating |
| Blocky402 unreachable | `payment.paid: false`, narration still delivered |
| Sepolia RPC unreachable | identity renders unregistered, everything else fine |
| OpenAI key invalid | `502`, panel keeps its previous line |
| malformed request body | `400 Bad payload` |
| garbage `X-PAYMENT` header | `402`, not a crash |

Non-numeric entries in `recentValues` are filtered rather than rejected.

---

## Layout

```
app/
  page.tsx                 composition root, picks the data source
  api/narrate/route.ts     validate -> pay -> identity -> narrate
  api/chain-data/route.ts  the x402-metered resource
components/
  PulseVisual.tsx          0-100 -> CSS custom properties
  NarrationBox.tsx         narration, identity, payment receipt
hooks/
  activity.ts              easing, labels, gas normalisation (+ tests)
  useChainActivity.ts      live Base data
  useMockActivity.ts       random walk, same shape
  useNarration.ts          rolling buffer, 18s cadence
lib/
  x402.ts                  the paying client
  ens.ts                   identity resolution
scripts/
  send-raw-tx.mjs          manual tx sender with simulation
```
