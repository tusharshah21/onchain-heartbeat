import {
  createPublicClient, createWalletClient, encodeFunctionData, http, namehash, parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { getNarratorResolver, NARRATOR_ENS_NAME } from "./ens";

/**
 * Gives a narration its own ENS name, e.g.
 *   activity-surges-81.posts.onchain-heartbeat.eth
 *
 * Records go on the narrator's own resolver, keyed by namehash, so no subname
 * registration is involved — writing the records is what makes the name
 * addressable. One transaction per post.
 */

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const KEY = process.env.SEPOLIA_PRIVATE_KEY;

export type Post = { name: string; txHash: string };

const resolverAbi = parseAbi([
  "function setText(bytes32 node, string key, string value)",
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

  const resolver = await getNarratorResolver();
  if (!resolver) {
    console.error("[posts] the narrator's name has no resolver; cannot publish");
    return null;
  }

  const name = `${slugFor(opts.narration, opts.activityLevel)}.posts.${NARRATOR_ENS_NAME}`;
  const node = namehash(name);

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

    const calls = records.map(([key, value]) =>
      encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [node, key, value] }),
    );

    // One transaction for all three records where the resolver supports it,
    // otherwise fall back to writing them one at a time.
    let txHash: string;
    try {
      const { request } = await pub.simulateContract({
        account, address: resolver, abi: resolverAbi,
        functionName: "multicall", args: [calls],
      });
      txHash = await wallet.writeContract(request);
    } catch {
      const { request } = await pub.simulateContract({
        account, address: resolver, abi: resolverAbi, functionName: "setText",
        args: [node, records[0][0], records[0][1]],
      });
      txHash = await wallet.writeContract(request);
      for (const [key, value] of records.slice(1)) {
        await wallet.sendTransaction({
          to: resolver,
          data: encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [node, key, value] }),
        });
      }
    }

    console.log(`[posts] published ${name}  tx ${txHash}`);
    return { name, txHash };
  } catch (err) {
    console.error("[posts] publish failed:", err);
    return null;
  }
}
