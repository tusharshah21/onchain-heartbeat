import { createPublicClient, http, decodeFunctionData, parseAbi } from "viem";
import { sepolia } from "viem/chains";

const c = createPublicClient({ chain: sepolia, transport: http("https://ethereum-sepolia-rpc.publicnode.com") });
const FACTORY = "0x894bc9cC8ff1ad96B8a288C86A8C71D662C07780";
const THEIR_PROXY = "0xfD8847ba5d2fFE2d4AEe83df8052287c99f2E046";

console.log("their resolver proxy:", THEIR_PROXY);
const code = await c.getBytecode({ address: THEIR_PROXY });
console.log("  bytecode:", code ? (code.length - 2) / 2 + " bytes" : "NONE");
console.log("  raw:", code);

console.log("\n== hunting the deployProxy tx that created it ==");
const abi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
]);

let found = false;
for (let end = 11648400n; end > 11646000n && !found; end -= 100n) {
  const from = end - 99n;
  let block;
  try {
    block = await c.getBlock({ blockNumber: end, includeTransactions: false });
  } catch { continue; }
  // cheap filter: look at logs emitted by the factory
  const logs = await c.getLogs({ address: FACTORY, fromBlock: from, toBlock: end }).catch(() => []);
  for (const l of logs) {
    const tx = await c.getTransaction({ hash: l.transactionHash });
    const rcpt = await c.getTransactionReceipt({ hash: l.transactionHash });
    if (rcpt.status !== "success") continue;
    if (!tx.input.startsWith("0x5d84121a")) continue;
    console.log(`\nSUCCESSFUL deployProxy: ${l.transactionHash}`);
    console.log(`  block ${tx.blockNumber}  from ${tx.from}`);
    const d = decodeFunctionData({ abi, data: tx.input });
    console.log(`  implementation ${d.args[0]}`);
    console.log(`  salt           0x${d.args[1].toString(16).padStart(64, "0")}`);
    console.log(`  data           ${d.args[2]}`);
    console.log(`  data selector  ${d.args[2].slice(0, 10)}`);
    console.log(`  FULL CALLDATA  ${tx.input}`);
    found = true;
    break;
  }
}
if (!found) console.log("  none found in the scanned range");

console.log("\n== what initializer does the implementation actually expose? ==");
const IMPL = "0xa9d3814ab151bf6e37a427432795371a8361614e";
const ic = await c.getBytecode({ address: IMPL });
const b = Buffer.from(ic.slice(2), "hex");
const sels = new Set();
for (let i = 0; i < b.length - 4; i++) if (b[i] === 0x63) sels.add(b.subarray(i + 1, i + 5).toString("hex"));
const all = [...sels];
const named = {};
for (let i = 0; i < all.length; i += 40) {
  const url = "https://api.openchain.xyz/signature-database/v1/lookup?filter=true&function=" +
    all.slice(i, i + 40).map((s) => "0x" + s).join(",");
  const j = await (await fetch(url)).json();
  for (const [k, v] of Object.entries(j.result?.function ?? {})) if (v?.length) named[k.slice(2)] = v.map((x) => x.name);
}
const inits = Object.entries(named).filter(([, n]) => n.some((x) => /init|Init/.test(x)));
console.log("  initializers found:", inits.length ? "" : "none");
for (const [s, n] of inits) console.log(`    0x${s}  ${n.join(" | ")}`);
console.log("  (full list)");
for (const [s, n] of Object.entries(named).sort((a, b) => a[1][0].localeCompare(b[1][0])).slice(0, 30)) {
  console.log(`    0x${s}  ${n.join(" | ")}`);
}
