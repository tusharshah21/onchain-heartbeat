/**
 * Registers a name directly against the ETHOnline 2026 ENSv2 hackathon
 * contracts, bypassing the hackathon app (which builds a broken deployProxy
 * call - see docs/ens-app-bug-report.md).
 *
 * Flow, mirroring a registration that already succeeded on this registrar:
 *   1. USDC.approve(registrar, price)
 *   2. makeCommitment(...) -> commit(...)
 *   3. wait MIN_COMMITMENT_AGE
 *   4. register(...)          <- simulated immediately before sending
 *   5. resolver.setAddr(node, owner)
 *
 *   PRIVATE_KEY=0x... node scripts/register-ens.mjs
 *   DRY_RUN=1     simulate every step, send nothing
 *   LABEL=foo     register a different label (default onchain-heartbeat)
 *   YEARS=2       registration length (default 1)
 */
import {
  createPublicClient, createWalletClient, http, parseAbi,
  formatUnits, formatEther, namehash, keccak256, toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// ---- ETHOnline 2026 hackathon deployment (Sepolia) ----
const REGISTRAR = "0x7d1b7f586a62ac3f54b9a396849757814283270b";
const REGISTRY = "0x1d78834d97c1d7b1a38c1dedbd1a287cfed3971e";
const RESOLVER = "0xf9de4979ddb290baf5b760d0e788125017bc33f6";
const UNIVERSAL_RESOLVER = "0xd26f2040d083af1cd2962ba303f4bea0c4faf142";
const USDC = "0xcBFD80F74375c54E545AF34788Ff465F96F66F05"; // the deployment's payment token

const ZERO = "0x0000000000000000000000000000000000000000";
const ZERO32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const LABEL = process.env.LABEL ?? "onchain-heartbeat";
const YEARS = BigInt(process.env.YEARS ?? 1);
const DURATION = 31536000n * YEARS;
const DRY_RUN = process.env.DRY_RUN === "1";
const NAME = `${LABEL}.eth`;

const key = process.env.PRIVATE_KEY;
if (!key) {
  console.error("PRIVATE_KEY is not set.  PRIVATE_KEY=0x... node scripts/register-ens.mjs");
  process.exit(1);
}
const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);

const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });

const registrarAbi = parseAbi([
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) view returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
  "function isAvailable(string) view returns (bool)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
]);
const erc20Abi = parseAbi([
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);
const resolverAbi = parseAbi(["function setAddr(bytes32 node, address a)"]);
const registryAbi = parseAbi([
  "function findOwner(string) view returns (address)",
  "function getResolver(string) view returns (address)",
]);

const line = (k, v) => console.log(`${String(k).padEnd(18)} ${v}`);
const step = (n, s) => console.log(`\n=== ${n}. ${s} ===`);

// A fresh secret per run, so a half-finished attempt can never collide.
const SECRET = keccak256(toHex(`${LABEL}-${account.address}-${Date.now()}`));

line("rpc", RPC);
line("name", NAME);
line("owner", account.address);
line("duration", `${DURATION}s (${YEARS} year(s))`);
line("node", namehash(NAME));

const [ethBal, available, price, minAge] = await Promise.all([
  pub.getBalance({ address: account.address }),
  pub.readContract({ address: REGISTRAR, abi: registrarAbi, functionName: "isAvailable", args: [LABEL] }),
  pub.readContract({ address: REGISTRAR, abi: registrarAbi, functionName: "getRegisterPrice", args: [LABEL, DURATION, USDC] }),
  pub.readContract({ address: REGISTRAR, abi: registrarAbi, functionName: "MIN_COMMITMENT_AGE" }),
]);
const [usdcBal, allowance] = await Promise.all([
  pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
  pub.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [account.address, REGISTRAR] }),
]);

line("available", available);
line("price", `${formatUnits(price, 6)} USDC`);
line("USDC balance", formatUnits(usdcBal, 6));
line("allowance", formatUnits(allowance, 6));
line("Sepolia ETH", formatEther(ethBal));

if (!available) {
  console.error(`\n${NAME} is not available.`);
  process.exit(1);
}
if (usdcBal < price) {
  console.error(`\nNot enough USDC: need ${formatUnits(price, 6)}, have ${formatUnits(usdcBal, 6)}.`);
  console.error(`Payment token is ${USDC} (the deployment's test USDC), not real USDC.`);
  process.exit(1);
}
if (ethBal === 0n) {
  console.error("\nNo Sepolia ETH for gas.");
  process.exit(1);
}

const send = async (label, request) => {
  const hash = await wallet.writeContract(request);
  console.log(`  sent     ${hash}`);
  console.log(`           https://sepolia.etherscan.io/tx/${hash}`);
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 300_000 });
  console.log(`  ${r.status === "success" ? "mined OK" : "REVERTED"}  gas ${r.gasUsed}`);
  if (r.status !== "success") throw new Error(`${label} reverted`);
  return r;
};

// 1 ------------------------------------------------------------------
step(1, "approve USDC");
if (allowance >= price) {
  console.log("  allowance already sufficient, skipping");
} else {
  const { request } = await pub.simulateContract({
    account, address: USDC, abi: erc20Abi, functionName: "approve", args: [REGISTRAR, price],
  });
  console.log("  simulated OK");
  if (DRY_RUN) console.log("  DRY_RUN, not sent");
  else await send("approve", request);
}

// 2 ------------------------------------------------------------------
step(2, "commit");
const commitment = await pub.readContract({
  address: REGISTRAR, abi: registrarAbi, functionName: "makeCommitment",
  args: [LABEL, account.address, SECRET, ZERO, RESOLVER, DURATION, ZERO32],
});
console.log(`  secret     ${SECRET}`);
console.log(`  commitment ${commitment}`);
{
  const { request } = await pub.simulateContract({
    account, address: REGISTRAR, abi: registrarAbi, functionName: "commit", args: [commitment],
  });
  console.log("  simulated OK");
  if (DRY_RUN) console.log("  DRY_RUN, not sent");
  else await send("commit", request);
}

// 3 ------------------------------------------------------------------
step(3, `wait MIN_COMMITMENT_AGE (${minAge}s)`);
if (DRY_RUN) {
  console.log("  DRY_RUN, not waiting");
} else {
  const waitMs = (Number(minAge) + 15) * 1000;
  console.log(`  sleeping ${waitMs / 1000}s...`);
  await new Promise((r) => setTimeout(r, waitMs));
}

// 4 ------------------------------------------------------------------
step(4, "register");
if (DRY_RUN) {
  console.log("  skipped: register cannot simulate before a real commit exists.");
  console.log("  Without one it reverts CommitmentTooOld, which is expected.");
} else {
  const { request } = await pub.simulateContract({
    account, address: REGISTRAR, abi: registrarAbi, functionName: "register",
    args: [LABEL, account.address, SECRET, ZERO, RESOLVER, DURATION, USDC, ZERO32],
  });
  console.log("  simulated OK - sending");
  await send("register", request);
}

// 5 ------------------------------------------------------------------
step(5, "set the ETH address record");
{
  const node = namehash(NAME);
  try {
    const { request } = await pub.simulateContract({
      account, address: RESOLVER, abi: resolverAbi, functionName: "setAddr",
      args: [node, account.address],
    });
    console.log("  simulated OK");
    if (DRY_RUN) console.log("  DRY_RUN, not sent");
    else await send("setAddr", request);
  } catch (e) {
    console.error(`  setAddr simulation failed: ${(e.shortMessage ?? e.message).split("\n")[0]}`);
    console.error("  (expected in DRY_RUN - the name is not owned yet)");
  }
}

// 6 ------------------------------------------------------------------
step(6, "verify");
if (DRY_RUN) {
  console.log("  DRY_RUN, nothing to verify");
} else {
  const owner = await pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "findOwner", args: [LABEL] });
  const res = await pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "getResolver", args: [LABEL] });
  line("registry owner", owner);
  line("registry resolver", res);

  const ens = createPublicClient({
    chain: { ...sepolia, contracts: { ...sepolia.contracts, ensUniversalResolver: { address: UNIVERSAL_RESOLVER } } },
    transport: http(RPC),
  });
  const resolved = await ens.getEnsAddress({ name: NAME }).catch(() => null);
  line("resolves to", resolved ?? "(null)");
  console.log(
    resolved?.toLowerCase() === account.address.toLowerCase()
      ? "\nDone - the app will now show the name as verified."
      : "\nRegistered, but resolution is not returning the address yet. Re-run verification in a minute.",
  );
}
