/**
 * Resolves a narration subname through the hackathon Universal Resolver and
 * prints what it holds — the comment, the reading behind it, and the Hedera
 * payment that funded it.
 *
 *   node scripts/resolve-post.mjs <name>
 *   node scripts/resolve-post.mjs            # resolves the narrator's own name
 *
 * Short on purpose: this one gets run on camera.
 */
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";

const UNIVERSAL_RESOLVER =
  process.env.ENS_UNIVERSAL_RESOLVER ?? "0xd26f2040d083af1cd2962ba303f4bea0c4faf142";
const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

const name = process.argv[2] ?? "onchain-heartbeat.eth";
const KEYS = ["description", "activity", "payment", "avatar", "url"];

const ens = createPublicClient({
  chain: {
    ...sepolia,
    contracts: { ...sepolia.contracts, ensUniversalResolver: { address: UNIVERSAL_RESOLVER } },
  },
  transport: http(RPC),
});

console.log(`\n${name}\n`);

const normalized = normalize(name);
const [address, ...texts] = await Promise.all([
  ens.getEnsAddress({ name: normalized }).catch(() => null),
  ...KEYS.map((key) => ens.getEnsText({ name: normalized, key }).catch(() => null)),
]);

if (address) console.log(`  ${"addr".padEnd(12)} ${address}`);
KEYS.forEach((key, i) => {
  const v = texts[i];
  if (v) console.log(`  ${key.padEnd(12)} ${v}`);
});

if (!address && !texts.some(Boolean)) {
  console.log("  (nothing set — is the name registered on this deployment?)");
}

// The control check: mainnet-lineage names must stay null here, which is what
// proves the hackathon deployment is the one answering rather than a fallback.
if (process.argv.includes("--control")) {
  console.log("\n  control — these should all be null on this resolver:");
  for (const other of ["nick.eth", "vitalik.eth"]) {
    const a = await ens.getEnsAddress({ name: other }).catch(() => "error");
    console.log(`  ${other.padEnd(12)} ${a ?? "null"}`);
  }
}

console.log("");
