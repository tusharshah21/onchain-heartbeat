import {
  createPublicClient, createWalletClient, encodeFunctionData, http, parseAbi, toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { packetToBytes } from "viem/ens";

import { NARRATOR_ENS_NAME } from "./ens";

/**
 * Gives a narration its own ENS name, e.g.
 *   activity-surges-81.posts.onchain-heartbeat.eth
 *
 * No subname registration is involved. Our Permissioned Resolver keys records
 * by DNS-encoded name rather than by node, and the Universal Resolver reaches
 * it by ENSIP-10 wildcard — so writing records for a subname is enough to make
 * it resolve. One transaction per post, no CCIP-Read gateway.
 */

const RESOLVER = (process.env.NARRATOR_RESOLVER ??
  "0xB7BBb344Ce3E3E5Eae7fb604cE7F96B03DBA5BC2") as `0x${string}`;
const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const KEY = process.env.SEPOLIA_PRIVATE_KEY;

export type Post = { name: string; txHash: string };

const resolverAbi = parseAbi([
  "function setText(bytes name, string key, string value)",
  "function multicall(bytes[] data) returns (bytes[])",
]);

export function postsEnabled() {
  return Boolean(KEY);
}

/** "Activity surges 113%, traders piling in" + 81 -> "activity-surges-81" */
function slugFor(narration: string, activityLevel: number) {
  const words = narration
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join("-")
    .slice(0, 28);
  return `${words || "beat"}-${activityLevel}`;
}

/**
 * Publishes one narration as a subname. Never throws — a failed publish just
 * means no name for this beat.
 */
export async function publishNarration(opts: {
  narration: string;
  activityLevel: number;
  paymentTxId?: string;
}): Promise<Post | null> {
  if (!KEY) return null;

  const name = `${slugFor(opts.narration, opts.activityLevel)}.posts.${NARRATOR_ENS_NAME}`;
  const dnsName = toHex(packetToBytes(name));

  // Everything a reader needs to check the claim: what was said, what was seen,
  // and which payment funded it.
  const records: [string, string][] = [
    ["description", opts.narration],
    ["activity", String(opts.activityLevel)],
    ["payment", opts.paymentTxId ?? "unpaid"],
  ];

  try {
    const account = privateKeyToAccount(
      (KEY.startsWith("0x") ? KEY : `0x${KEY}`) as `0x${string}`,
    );
    const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
    const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });

    // One transaction for all three records.
    const calls = records.map(([key, value]) =>
      encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [dnsName, key, value] }),
    );
    const { request } = await pub.simulateContract({
      account, address: RESOLVER, abi: resolverAbi,
      functionName: "multicall", args: [calls],
    });

    // Sent, not awaited to completion: the name is known up front, and the
    // narration should not wait on a Sepolia block.
    const txHash = await wallet.writeContract(request);
    console.log(`[posts] published ${name}  tx ${txHash}`);
    return { name, txHash };
  } catch (err) {
    console.error("[posts] publish failed:", err);
    return null;
  }
}
