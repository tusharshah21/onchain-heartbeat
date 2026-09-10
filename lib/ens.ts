import { createPublicClient, http, namehash, parseAbi } from "viem";
import { sepolia } from "viem/chains";

/**
 * The narrator's onchain identity, read from the ETHOnline 2026 ENSv2
 * deployment on Sepolia.
 *
 * Records are read straight from the registry and the name's resolver rather
 * than through a Universal Resolver. Two reasons: the deployment provisions a
 * resolver per name at registration, so the registry already points at the
 * right contract; and it keeps this working across deployments, where the
 * Universal Resolver address changes but `getResolver` does not.
 */

export const NARRATOR_ENS_NAME =
  process.env.NARRATOR_ENS_NAME ?? "onchain-heartbeat.eth";

const REGISTRY = (process.env.ENS_REGISTRY ??
  "0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2") as `0x${string}`;

const OK_TTL_MS = 10 * 60 * 1000; // a registration does not change often
const FAIL_TTL_MS = 60 * 1000; // but retry a failure sooner
const TEXT_KEYS = ["description", "avatar", "url"] as const;

export type NarratorIdentity = {
  name: string;
  address: string | null;
  resolved: boolean;
  /** ENS text records, so the name is a profile rather than a label. */
  description: string | null;
  avatar: string | null;
  url: string | null;
};

export const ensClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL),
});

const registryAbi = parseAbi([
  "function getResolver(string label) view returns (address)",
]);
const resolverAbi = parseAbi([
  "function addr(bytes32 node) view returns (address)",
  "function text(bytes32 node, string key) view returns (string)",
]);

const ZERO = "0x0000000000000000000000000000000000000000";
const label = NARRATOR_ENS_NAME.replace(/\.eth$/, "");

let cache: { until: number; value: NarratorIdentity } | null = null;

/** Resolves the narrator's name and profile. Never throws. */
export async function getNarratorIdentity(): Promise<NarratorIdentity> {
  if (cache && Date.now() < cache.until) return cache.value;

  let value: NarratorIdentity = {
    name: NARRATOR_ENS_NAME,
    address: null,
    resolved: false,
    description: null,
    avatar: null,
    url: null,
  };
  let ttl = FAIL_TTL_MS;

  try {
    const resolver = await ensClient.readContract({
      address: REGISTRY,
      abi: registryAbi,
      functionName: "getResolver",
      args: [label],
    });

    if (resolver === ZERO) {
      console.log(`[ens] ${NARRATOR_ENS_NAME} has no resolver set yet`);
    } else {
      const node = namehash(NARRATOR_ENS_NAME);
      const [address, ...texts] = await Promise.all([
        ensClient
          .readContract({ address: resolver, abi: resolverAbi, functionName: "addr", args: [node] })
          .catch(() => null),
        ...TEXT_KEYS.map((key) =>
          ensClient
            .readContract({ address: resolver, abi: resolverAbi, functionName: "text", args: [node, key] })
            .then((v) => (v === "" ? null : v))
            .catch(() => null),
        ),
      ]);
      const [description, avatar, url] = texts as (string | null)[];
      const addr = address === ZERO ? null : (address as string | null);

      value = {
        name: NARRATOR_ENS_NAME,
        address: addr,
        resolved: addr !== null,
        description,
        avatar,
        url,
      };

      if (addr) {
        ttl = OK_TTL_MS;
        console.log(
          `[ens] ${NARRATOR_ENS_NAME} -> ${addr} via resolver ${resolver}` +
            ` (records: ${TEXT_KEYS.filter((_, i) => texts[i]).join(", ") || "none"})`,
        );
      } else {
        console.log(`[ens] ${NARRATOR_ENS_NAME} has a resolver but no address record`);
      }
    }
  } catch (err) {
    console.error("[ens] lookup failed, showing the name unresolved:", err);
  }

  cache = { until: Date.now() + ttl, value };
  return value;
}

/** The resolver currently set for the narrator's name, or null. */
export async function getNarratorResolver(): Promise<`0x${string}` | null> {
  try {
    const r = await ensClient.readContract({
      address: REGISTRY,
      abi: registryAbi,
      functionName: "getResolver",
      args: [label],
    });
    return r === ZERO ? null : r;
  } catch {
    return null;
  }
}
