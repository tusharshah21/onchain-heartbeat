/**
 * Sends one pre-built transaction with an explicit gas limit.
 *
 * The hackathon ENS app hardcodes gas at 21,000,000, which public RPCs reject
 * as over the block limit. Same calldata, sane ceiling.
 *
 *   PRIVATE_KEY=0x...  node scripts/send-raw-tx.mjs
 *   DRY_RUN=1          simulate and estimate, send nothing
 *   GAS_LIMIT=8000000  override the 5,000,000 default
 *   SEPOLIA_RPC_URL=   override the RPC
 */
import { createPublicClient, createWalletClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const TO = "0x894bc9cC8ff1ad96B8a288C86A8C71D662C07780";
const DATA =
  "0x5d84121a000000000000000000000000a9d3814ab151bf6e37a427432795371a8361614e9ffafaeefd36ff83cce2e982a6fe08ae0c13068aaeae58cd61a5d588e5603147000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000847058b559000000000000000000000000ad1c4453df163396d2b4a2173212fc73c537652d11111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
const VALUE = 0n;

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const GAS_LIMIT = BigInt(process.env.GAS_LIMIT ?? 5_000_000);
const DRY_RUN = process.env.DRY_RUN === "1";

const key = process.env.PRIVATE_KEY;
if (!key) {
  console.error("PRIVATE_KEY is not set. Run with:  PRIVATE_KEY=0x... node scripts/send-raw-tx.mjs");
  process.exit(1);
}
const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);

const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC) });

const log = (k, v) => console.log(`${k.padEnd(16)} ${v}`);

log("rpc", RPC);
log("chain", `${sepolia.name} (${await publicClient.getChainId()})`);
log("from", account.address);
log("to", TO);
log("value", `${VALUE} wei`);
log("calldata", `${(DATA.length - 2) / 2} bytes, selector ${DATA.slice(0, 10)}`);

const [balance, nonce, code] = await Promise.all([
  publicClient.getBalance({ address: account.address }),
  publicClient.getTransactionCount({ address: account.address }),
  publicClient.getBytecode({ address: TO }),
]);
log("balance", `${formatEther(balance)} ETH`);
log("nonce", nonce);
log("target", code ? `contract, ${(code.length - 2) / 2} bytes` : "NO CONTRACT AT THIS ADDRESS");
if (!code) process.exit(1);
if (balance === 0n && !DRY_RUN) {
  console.error("\nWallet has no Sepolia ETH — fund it from a faucet first.");
  process.exit(1);
}

// Simulate before estimating: a revert here means no gas limit will help.
console.log("\n-- eth_call (simulation) --");
try {
  await publicClient.call({ account, to: TO, data: DATA, value: VALUE });
  console.log("would succeed");
} catch (err) {
  console.error("WOULD REVERT:", err.shortMessage ?? err.message);
  console.error("\nThe transaction itself is rejected by the contract, not by the gas limit.");
  console.error("Sending it would burn gas and fail. Set FORCE=1 to send anyway.");
  if (process.env.FORCE !== "1") process.exit(1);
}

console.log("\n-- eth_estimateGas --");
let estimate = null;
try {
  estimate = await publicClient.estimateGas({ account, to: TO, data: DATA, value: VALUE });
  console.log(`estimate:  ${estimate.toLocaleString()} gas`);
  console.log(`we will send with: ${GAS_LIMIT.toLocaleString()} gas`);
  console.log(`app was sending with: 21,000,000 gas  (over the ~36M block limit per tx in practice)`);
  if (estimate > GAS_LIMIT) {
    console.error(`\nEstimate exceeds GAS_LIMIT. Re-run with GAS_LIMIT=${(estimate * 12n) / 10n}`);
    process.exit(1);
  }
} catch (err) {
  console.error("estimate failed:", err.shortMessage ?? err.message);
  console.error(`proceeding with the fixed ${GAS_LIMIT.toLocaleString()} limit`);
}

if (DRY_RUN) {
  console.log("\nDRY_RUN=1 — nothing sent.");
  process.exit(0);
}

console.log("\n-- sending --");
const hash = await walletClient.sendTransaction({
  to: TO,
  data: DATA,
  value: VALUE,
  gas: GAS_LIMIT,
});
console.log(`tx hash:   ${hash}`);
console.log(`etherscan: https://sepolia.etherscan.io/tx/${hash}`);

console.log("\nwaiting for the receipt…");
const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
console.log(`status:    ${receipt.status}`);
console.log(`gas used:  ${receipt.gasUsed.toLocaleString()}${estimate ? ` (estimated ${estimate.toLocaleString()})` : ""}`);
console.log(`block:     ${receipt.blockNumber}`);
if (receipt.status !== "success") {
  console.error("\nMined but reverted — the calldata was rejected by the contract.");
  process.exit(1);
}
