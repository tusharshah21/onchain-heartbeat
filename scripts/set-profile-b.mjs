/**
 * Writes the narrator's identity records on the ETHOnline deployment whose
 * portal provisions a resolver at registration time.
 *
 * That resolver uses the classic namehash interface -
 *   setAddr(bytes32 node, address)
 *   setText(bytes32 node, string key, string value)
 * - unlike the earlier deployment's DNS-encoded-name setters.
 *
 *   PRIVATE_KEY=0x... node scripts/set-profile-b.mjs
 *   DRY_RUN=1   simulate everything, send nothing
 */
import {
  createPublicClient, createWalletClient, http, parseAbi,
  encodeFunctionData, namehash, formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const REGISTRY = "0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2";
const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const LABEL = process.env.LABEL ?? "onchain-heartbeat";
const NAME = `${LABEL}.eth`;
const DRY_RUN = process.env.DRY_RUN === "1";

const REPO = "https://github.com/tusharshah21/onchain-heartbeat";
const TEXTS = [
  ["description", "A live pulse of Base mainnet activity. I buy each reading over Hedera x402, then call the play-by-play."],
  ["avatar", `${REPO.replace("github.com", "raw.githubusercontent.com")}/main/app/icon.svg`],
  ["url", REPO],
];

const key = process.env.PRIVATE_KEY;
if (!key) {
  console.error("PRIVATE_KEY is not set.");
  process.exit(1);
}
const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });

const registryAbi = parseAbi([
  "function findOwner(string) view returns (address)",
  "function getResolver(string) view returns (address)",
]);
const resolverAbi = parseAbi([
  "function setAddr(bytes32 node, address a)",
  "function setText(bytes32 node, string key, string value)",
  "function addr(bytes32 node) view returns (address)",
  "function text(bytes32 node, string key) view returns (string)",
]);

const node = namehash(NAME);
const [owner, resolver, bal] = await Promise.all([
  pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "findOwner", args: [LABEL] }),
  pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "getResolver", args: [LABEL] }),
  pub.getBalance({ address: account.address }),
]);

const line = (k, v) => console.log(`${String(k).padEnd(14)} ${v}`);
line("name", NAME);
line("node", node);
line("owner", owner);
line("resolver", resolver);
line("caller", account.address);
line("Sepolia ETH", formatEther(bal));

if (owner.toLowerCase() !== account.address.toLowerCase()) {
  console.error(`\n${NAME} is not owned by this wallet on this deployment.`);
  process.exit(1);
}

const writes = [
  ["setAddr", encodeFunctionData({ abi: resolverAbi, functionName: "setAddr", args: [node, account.address] }), "addr"],
  ...TEXTS.map(([k, v]) => [
    `setText(${k})`,
    encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [node, k, v] }),
    k,
  ]),
];

console.log("\n=== pre-flight: all writes against one projected block ===");
{
  const res = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_simulateV1",
      params: [{
        blockStateCalls: [{
          calls: writes.map(([, data]) => ({ from: account.address, to: resolver, data })),
        }],
        validation: false,
      }, "latest"],
    }),
  });
  const j = await res.json();
  if (j.error) {
    console.log(`  eth_simulateV1 unavailable (${j.error.message}); each write still`);
    console.log("  simulates individually before it is sent.");
  } else {
    const out = j.result?.[0]?.calls ?? [];
    let ok = true;
    out.forEach((r, i) => {
      const good = r.status === "0x1";
      ok &&= good;
      console.log(`  ${writes[i][0].padEnd(22)} ${good ? "OK" : "FAILED"}  gas ${parseInt(r.gasUsed, 16)}`);
    });
    if (!ok) { console.error("  Pre-flight failed - sending nothing."); process.exit(1); }
    console.log("  all writes succeed");
  }
}

for (const [label, data] of writes) {
  console.log(`\n=== ${label} ===`);
  if (DRY_RUN) { console.log("  DRY_RUN, not sent"); continue; }
  const hash = await wallet.sendTransaction({ to: resolver, data });
  console.log(`  sent     ${hash}`);
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 300_000 });
  console.log(`  ${r.status === "success" ? "mined OK" : "REVERTED"} gas ${r.gasUsed}`);
  if (r.status !== "success") process.exit(1);
}

console.log("\n=== read back directly from the resolver ===");
if (DRY_RUN) {
  console.log("  DRY_RUN, nothing written");
} else {
  const a = await pub.readContract({ address: resolver, abi: resolverAbi, functionName: "addr", args: [node] });
  console.log(`  addr         ${a}`);
  for (const [k] of TEXTS) {
    const v = await pub.readContract({ address: resolver, abi: resolverAbi, functionName: "text", args: [node, k] });
    console.log(`  ${k.padEnd(12)} ${String(v).slice(0, 70)}`);
  }
}
