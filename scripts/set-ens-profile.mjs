/**
 * Writes the narrator's ENS profile records onto its own Permissioned Resolver
 * proxy, so the name carries an identity rather than just an address.
 *
 * Records are keyed by DNS-encoded name: setText(bytes name, string key, string value).
 *
 *   PRIVATE_KEY=0x... node scripts/set-ens-profile.mjs
 *   DRY_RUN=1   simulate everything, send nothing
 */
import {
  createPublicClient, createWalletClient, http, parseAbi,
  encodeFunctionData, toHex, formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { packetToBytes } from "viem/ens";

const REGISTRY = "0x1d78834d97c1d7b1a38c1dedbd1a287cfed3971e";
const UNIVERSAL_RESOLVER = "0xd26f2040d083af1cd2962ba303f4bea0c4faf142";

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const LABEL = process.env.LABEL ?? "onchain-heartbeat";
const NAME = `${LABEL}.eth`;
const DRY_RUN = process.env.DRY_RUN === "1";

const REPO = "https://github.com/tusharshah21/onchain-heartbeat";
const RECORDS = [
  ["description", "A live pulse of Base mainnet activity. I buy each reading over Hedera x402, then call the play-by-play."],
  ["avatar", `${REPO.replace("github.com", "raw.githubusercontent.com")}/main/app/icon.svg`],
  ["url", REPO],
];

const key = process.env.PRIVATE_KEY;
if (!key) {
  console.error("PRIVATE_KEY is not set.  PRIVATE_KEY=0x... node scripts/set-ens-profile.mjs");
  process.exit(1);
}
const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);

const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });

const resolverAbi = parseAbi(["function setText(bytes name, string key, string value)"]);
const registryAbi = parseAbi([
  "function getResolver(string) view returns (address)",
  "function findOwner(string) view returns (address)",
]);

const dnsName = toHex(packetToBytes(NAME));
const line = (k, v) => console.log(`${String(k).padEnd(16)} ${v}`);

const [owner, resolver, bal] = await Promise.all([
  pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "findOwner", args: [LABEL] }),
  pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "getResolver", args: [LABEL] }),
  pub.getBalance({ address: account.address }),
]);

line("name", NAME);
line("owner", owner);
line("resolver", resolver);
line("caller", account.address);
line("Sepolia ETH", formatEther(bal));

if (owner.toLowerCase() !== account.address.toLowerCase()) {
  console.error(`\n${NAME} is not owned by this wallet.`);
  process.exit(1);
}

console.log("\nrecords to write:");
for (const [k, v] of RECORDS) console.log(`  ${k.padEnd(12)} ${v}`);

// ---- chained pre-flight: all three writes against one projected state ----
console.log("\n=== pre-flight (eth_simulateV1) ===");
{
  const calls = RECORDS.map(([k, v]) => ({
    from: account.address,
    to: resolver,
    data: encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [dnsName, k, v] }),
  }));
  const res = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_simulateV1",
      params: [{ blockStateCalls: [{ calls }], validation: false }, "latest"],
    }),
  });
  const j = await res.json();
  if (j.error) {
    console.log(`  eth_simulateV1 unavailable (${j.error.message}); each write is still`);
    console.log("  simulated individually before it is sent.");
  } else {
    const out = j.result?.[0]?.calls ?? [];
    let allOk = true;
    out.forEach((r, i) => {
      const ok = r.status === "0x1";
      allOk &&= ok;
      console.log(`  setText(${RECORDS[i][0].padEnd(12)}) ${ok ? "OK" : "FAILED"}  gas ${parseInt(r.gasUsed, 16)}`);
    });
    if (!allOk) {
      console.error("  Pre-flight failed - sending nothing.");
      process.exit(1);
    }
    console.log("  all writes succeed against the projected state");
  }
}

// ---- send ----
for (const [k, v] of RECORDS) {
  console.log(`\n=== setText("${k}") ===`);
  const { request } = await pub.simulateContract({
    account, address: resolver, abi: resolverAbi, functionName: "setText", args: [dnsName, k, v],
  });
  console.log("  simulated OK");
  if (DRY_RUN) { console.log("  DRY_RUN, not sent"); continue; }
  const hash = await wallet.writeContract(request);
  console.log(`  sent     ${hash}`);
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 300_000 });
  console.log(`  ${r.status === "success" ? "mined OK" : "REVERTED"} gas ${r.gasUsed}`);
  if (r.status !== "success") process.exit(1);
}

// ---- verify ----
console.log("\n=== read back through the hackathon Universal Resolver ===");
const ens = createPublicClient({
  chain: { ...sepolia, contracts: { ...sepolia.contracts, ensUniversalResolver: { address: UNIVERSAL_RESOLVER } } },
  transport: http(RPC),
});
if (DRY_RUN) {
  console.log("  DRY_RUN, nothing written to read");
} else {
  for (const [k] of RECORDS) {
    const v = await ens.getEnsText({ name: NAME, key: k }).catch((e) => `ERR ${e.shortMessage}`);
    console.log(`  ${k.padEnd(12)} ${v ?? "(null)"}`);
  }
  console.log(`  ${"addr".padEnd(12)} ${await ens.getEnsAddress({ name: NAME }).catch(() => "(null)")}`);
}
