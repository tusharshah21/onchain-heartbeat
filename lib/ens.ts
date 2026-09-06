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
};

const client = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL),
});

let cache: { until: number; value: NarratorIdentity } | null = null;

/** Resolves the narrator's ENS name on Sepolia. Never throws. */
export async function getNarratorIdentity(): Promise<NarratorIdentity> {
  if (cache && Date.now() < cache.until) return cache.value;

  let value: NarratorIdentity = {
    name: NARRATOR_ENS_NAME,
    address: null,
    resolved: false,
  };
  let ttl = FAIL_TTL_MS;

  try {
    const address = await client.getEnsAddress({
      name: normalize(NARRATOR_ENS_NAME),
    });
    value = { name: NARRATOR_ENS_NAME, address, resolved: address !== null };
    if (address) {
      ttl = OK_TTL_MS;
      console.log(`[ens] ${NARRATOR_ENS_NAME} resolves to ${address} on Sepolia`);
    } else {
      console.log(`[ens] ${NARRATOR_ENS_NAME} is not registered on Sepolia yet`);
    }
  } catch (err) {
    console.error("[ens] lookup failed, showing the name unresolved:", err);
  }

  cache = { until: Date.now() + ttl, value };
  return value;
}
