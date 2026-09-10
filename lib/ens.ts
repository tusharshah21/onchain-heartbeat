import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";

// The narrator's onchain identity. Register this name on Sepolia and the UI
// picks it up; until then it renders unresolved.
export const NARRATOR_ENS_NAME =
  process.env.NARRATOR_ENS_NAME ?? "onchain-heartbeat.eth";

const OK_TTL_MS = 10 * 60 * 1000; // a registration does not change often
const FAIL_TTL_MS = 60 * 1000; // but retry a failure sooner

export type NarratorIdentity = {
  name: string;
  address: string | null;
  resolved: boolean;
  /** ENS text records, so the name is a profile rather than a label. */
  description: string | null;
  avatar: string | null;
  url: string | null;
};

const TEXT_KEYS = ["description", "avatar", "url"] as const;

// ETHOnline 2026 ENSv2 deployment. viem ships mainnet-lineage Universal
// Resolver addresses for Sepolia, which point at a different deployment, so the
// address is overridden rather than inherited.
export const HACKATHON_UNIVERSAL_RESOLVER =
  "0xd26f2040d083af1cd2962ba303f4bea0c4faf142" as const;

export const hackathonSepolia = {
  ...sepolia,
  contracts: {
    ...sepolia.contracts,
    ensUniversalResolver: { address: HACKATHON_UNIVERSAL_RESOLVER },
  },
} as const;

export const ensClient = createPublicClient({
  chain: hackathonSepolia,
  transport: http(process.env.SEPOLIA_RPC_URL),
});

let cache: { until: number; value: NarratorIdentity } | null = null;

/** Resolves the narrator's ENS name via the ETHOnline deployment. Never throws. */
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
    const name = normalize(NARRATOR_ENS_NAME);
    // One round of lookups: the address plus the profile records.
    const [address, ...texts] = await Promise.all([
      ensClient.getEnsAddress({ name }),
      ...TEXT_KEYS.map((key) =>
        ensClient.getEnsText({ name, key }).catch(() => null),
      ),
    ]);
    const [description, avatar, url] = texts;
    value = {
      name: NARRATOR_ENS_NAME,
      address,
      resolved: address !== null,
      description,
      avatar,
      url,
    };
    if (address) {
      ttl = OK_TTL_MS;
      console.log(
        `[ens] ${NARRATOR_ENS_NAME} -> ${address} via the ETHOnline resolver` +
          ` (records: ${TEXT_KEYS.filter((_, i) => texts[i]).join(", ") || "none"})`,
      );
    } else {
      console.log(
        `[ens] ${NARRATOR_ENS_NAME} has no record in the ETHOnline ENSv2 deployment yet`,
      );
    }
  } catch (err) {
    console.error("[ens] lookup failed, showing the name unresolved:", err);
  }

  cache = { until: Date.now() + ttl, value };
  return value;
}
