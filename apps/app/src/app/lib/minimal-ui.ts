import { resolveRetroUi } from "./retro-ui";

/** Retro uses the same desk-first layout and persisted data, not a second shell. */
export function resolveMinimalUi(
  env: Record<string, unknown> | undefined,
): boolean {
  return (
    resolveRetroUi(env) ||
    env?.VITE_MATTERHORN_MINIMAL_UI === "1" ||
    env?.VITE_MATTERHORN_MINIMAL_UI === "true"
  );
}

export const MINIMAL_UI = resolveMinimalUi(import.meta.env);

export type PrimaryDeskId =
  | "private_ai"
  | "bittensor"
  | "hyperliquid"
  | "polymarket"
  | "sui";

export const PRIMARY_DESKS = [
  {
    id: "private_ai",
    name: "Private AI",
    purpose: "Chat, write, and explore ideas.",
  },
  {
    id: "bittensor",
    name: "Bittensor",
    purpose: "Research subnets and validators.",
  },
  {
    id: "hyperliquid",
    name: "Hyperliquid",
    purpose: "Explore markets and funding.",
  },
  {
    id: "polymarket",
    name: "Polymarket",
    purpose: "Research prediction markets.",
  },
  { id: "sui", name: "Sui", purpose: "Explore accounts and objects." },
] satisfies { id: PrimaryDeskId; name: string; purpose: string }[];

/** Exclude recognisably non-chat entries when older catalogues omit modality metadata. */
export function isChatModelId(id: string): boolean {
  return !/(?:embed|rerank|(?:^|[\/_-])bge(?:[\/_-]|$)|(?:^|[\/_-])uae(?:[\/_-]|$))/i.test(
    id,
  );
}
