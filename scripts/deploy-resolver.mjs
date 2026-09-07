/**
 * Finishes ENS resolution for a name already registered on the ETHOnline 2026
 * hackathon deployment.
 *
 * Registration points the name at the shared PublicResolverV2, which will not
 * authorise the owner. ENSv2 wants a per-name Permissioned Resolver proxy, so:
 *
 *   1. deployProxy(PermissionedResolver, salt, initialize([(owner, roles)], []))
 *   2. registry.setResolver(tokenId, thatProxy)
 *   3. proxy.setAddress(dnsEncode(name), 60, ownerBytes)
 *
 * The initializer is initialize((address,uint256)[],bytes[]) / 0x33cc44a0.
 * The hackathon app sends 0x7058b559 - the same arguments with the tuple array
 * flattened - which matches no function and reverts. See
 * docs/ens-app-bug-report.md.
 *
 *   PRIVATE_KEY=0x... node scripts/deploy-resolver.mjs
 *   DRY_RUN=1   simulate what can be simulated, send nothing
 *   LABEL=foo   default onchain-heartbeat
 */
import {
  createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData,
  toHex, formatEther, keccak256, stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { packetToBytes } from "viem/ens";

const FACTORY = "0x894bc9cC8ff1ad96B8a288C86A8C71D662C07780";
const RESOLVER_IMPL = "0xa9d3814AB151BF6E37A427432795371a8361614e";
const REGISTRY = "0x1d78834d97c1d7b1a38c1dedbd1a287cfed3971e";
const UNIVERSAL_RESOLVER = "0xd26f2040d083af1cd2962ba303f4bea0c4faf142";

// Role bitmap copied verbatim from the deployProxy that succeeded on this
// factory (tx 0x0654b313...ddf1b). Not a placeholder - it is the grantee's roles.
const ROLE_BITMAP = 0x1111111111111111111111111111111111111111111111111111111111111111n;
const ETH_COIN_TYPE = 60n;

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const LABEL = process.env.LABEL ?? "onchain-heartbeat";
const NAME = `${LABEL}.eth`;
const DRY_RUN = process.env.DRY_RUN === "1";

const key = process.env.PRIVATE_KEY;
if (!key) {
  console.error("PRIVATE_KEY is not set.  PRIVATE_KEY=0x... node scripts/deploy-resolver.mjs");
  process.exit(1);
}
const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);

const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });

const factoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
]);
const resolverInitAbi = parseAbi([
  "function initialize((address,uint256)[] grants, bytes[] setters)",
]);
const registryAbi = parseAbi([
  "function setResolver(uint256 tokenId, address resolver)",
  "function findTokenId(string) view returns (uint256)",
  "function findOwner(string) view returns (address)",
  "function getResolver(string) view returns (address)",
]);
const permResolverAbi = parseAbi([
  "function setAddress(bytes name, uint256 coinType, bytes value)",
]);

const line = (k, v) => console.log(`${String(k).padEnd(20)} ${v}`);
const step = (n, s) => console.log(`\n=== ${n}. ${s} ===`);

const dnsName = toHex(packetToBytes(NAME));
const ownerBytes = account.address.toLowerCase();
const salt = BigInt(keccak256(stringToHex(`${NAME}-${account.address}-${Date.now()}`)));

line("rpc", RPC);
line("name", NAME);
line("owner", account.address);
line("dns-encoded name", dnsName);
line("salt", "0x" + salt.toString(16).padStart(64, "0"));

const [owner, currentResolver, tokenId, ethBal] = await Promise.all([
  pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "findOwner", args: [LABEL] }),
  pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "getResolver", args: [LABEL] }),
  pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "findTokenId", args: [LABEL] }),
  pub.getBalance({ address: account.address }),
]);
line("registry owner", owner);
line("current resolver", currentResolver);
line("tokenId", tokenId);
line("Sepolia ETH", formatEther(ethBal));

if (owner.toLowerCase() !== account.address.toLowerCase()) {
  console.error(`\n${NAME} is not owned by this wallet. Register it first.`);
  process.exit(1);
}

const send = async (label, request) => {
  const hash = await wallet.writeContract(request);
  console.log(`  sent      ${hash}`);
  console.log(`            https://sepolia.etherscan.io/tx/${hash}`);
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 300_000 });
  console.log(`  ${r.status === "success" ? "mined OK " : "REVERTED "} gas ${r.gasUsed}`);
  if (r.status !== "success") throw new Error(`${label} reverted`);
  return r;
};

// 0 -------------------------------------------------------------------
// eth_simulateV1 runs all three calls against one projected post-state, so
// step 3 can be verified against a proxy that does not exist yet. A plain
// eth_call cannot do that.
step(0, "chained pre-flight: all three steps in one projected block");
{
  const initDataPre = encodeFunctionData({
    abi: resolverInitAbi, functionName: "initialize",
    args: [[[account.address, ROLE_BITMAP]], []],
  });
  const predicted = await pub.simulateContract({
    account, address: FACTORY, abi: factoryAbi, functionName: "deployProxy",
    args: [RESOLVER_IMPL, salt, initDataPre],
  }).then((r) => r.result);

  const calls = [
    ["deployProxy", FACTORY, encodeFunctionData({ abi: factoryAbi, functionName: "deployProxy", args: [RESOLVER_IMPL, salt, initDataPre] })],
    ["setResolver", REGISTRY, encodeFunctionData({ abi: registryAbi, functionName: "setResolver", args: [tokenId, predicted] })],
    ["setAddress", predicted, encodeFunctionData({ abi: permResolverAbi, functionName: "setAddress", args: [dnsName, ETH_COIN_TYPE, ownerBytes] })],
  ];

  const res = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_simulateV1",
      params: [{ blockStateCalls: [{ calls: calls.map(([, to, data]) => ({ from: account.address, to, data })) }], validation: false }, "latest"],
    }),
  });
  const j = await res.json();
  if (j.error) {
    console.log(`  eth_simulateV1 unavailable (${j.error.message}); each step is still`);
    console.log("  simulated individually immediately before it is sent.");
  } else {
    const out = j.result?.[0]?.calls ?? [];
    let allOk = true;
    out.forEach((r, i) => {
      const ok = r.status === "0x1";
      allOk &&= ok;
      console.log(`  ${calls[i][0].padEnd(13)} ${ok ? "OK" : "FAILED"}  gas ${parseInt(r.gasUsed, 16)}`);
      if (!ok) console.log(`     ${r.error?.message ?? ""} ${r.returnData ?? ""}`);
    });
    if (!allOk) {
      console.error("  Pre-flight failed - refusing to send anything.");
      process.exit(1);
    }
    console.log("  all three succeed against the projected state");
  }
}

// 1 -------------------------------------------------------------------
step(1, "deploy the Permissioned Resolver proxy");
const initData = encodeFunctionData({
  abi: resolverInitAbi,
  functionName: "initialize",
  args: [[[account.address, ROLE_BITMAP]], []],
});
console.log(`  init selector  ${initData.slice(0, 10)}  (app sends 0x7058b559, which reverts)`);
console.log(`  init payload   ${initData}`);

let proxy;
{
  const { result, request } = await pub.simulateContract({
    account, address: FACTORY, abi: factoryAbi, functionName: "deployProxy",
    args: [RESOLVER_IMPL, salt, initData],
  });
  proxy = result;
  console.log(`  simulated OK -> proxy would be ${proxy}`);
  if (DRY_RUN) console.log("  DRY_RUN, not sent");
  else {
    await send("deployProxy", request);
    const code = await pub.getBytecode({ address: proxy });
    console.log(`  deployed code  ${code ? (code.length - 2) / 2 + " bytes" : "NONE"}`);
    if (!code) throw new Error("proxy has no code after deployment");
  }
}

// 2 -------------------------------------------------------------------
step(2, "point the registry at the new resolver");
{
  const { request } = await pub.simulateContract({
    account, address: REGISTRY, abi: registryAbi, functionName: "setResolver",
    args: [tokenId, proxy],
  });
  console.log(`  simulated OK -> setResolver(${tokenId}, ${proxy})`);
  if (DRY_RUN) console.log("  DRY_RUN, not sent");
  else await send("setResolver", request);
}

// 3 -------------------------------------------------------------------
step(3, "set the ETH address record");
if (DRY_RUN) {
  console.log("  cannot simulate yet: the proxy does not exist until step 1 is mined.");
  console.log(`  would call setAddress(${dnsName}, 60, ${ownerBytes}) on ${proxy}`);
} else {
  const { request } = await pub.simulateContract({
    account, address: proxy, abi: permResolverAbi, functionName: "setAddress",
    args: [dnsName, ETH_COIN_TYPE, ownerBytes],
  });
  console.log("  simulated OK - sending");
  await send("setAddress", request);
}

// 4 -------------------------------------------------------------------
step(4, "verify through the hackathon Universal Resolver");
if (DRY_RUN) {
  console.log("  DRY_RUN, nothing to verify");
} else {
  const ens = createPublicClient({
    chain: { ...sepolia, contracts: { ...sepolia.contracts, ensUniversalResolver: { address: UNIVERSAL_RESOLVER } } },
    transport: http(RPC),
  });
  const rows = [];
  for (const n of [NAME, "nick.eth", "vitalik.eth"]) {
    const a = await ens.getEnsAddress({ name: n }).catch((e) => `ERR ${(e.shortMessage ?? "").slice(0, 40)}`);
    rows.push([n, a ?? "(null)"]);
  }
  console.log("\n  name                        resolves to");
  console.log("  " + "-".repeat(66));
  for (const [n, a] of rows) console.log(`  ${n.padEnd(27)} ${a}`);

  const ours = rows[0][1];
  const othersNull = rows.slice(1).every(([, a]) => a === "(null)");
  console.log("");
  if (String(ours).toLowerCase() === account.address.toLowerCase() && othersNull) {
    console.log("  onchain-heartbeat.eth resolves to your wallet, and the mainnet-lineage");
    console.log("  names stay null - so it is genuinely the hackathon deployment answering.");
  } else if (String(ours).toLowerCase() === account.address.toLowerCase()) {
    console.log("  Resolves correctly, but the control names did not come back null.");
  } else {
    console.log("  Records are set but resolution is not returning the address yet.");
    console.log("  Re-run verification shortly; some resolvers need a block or two.");
  }
}
