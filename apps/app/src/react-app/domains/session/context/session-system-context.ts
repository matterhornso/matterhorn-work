export type MatterhornSessionContextBlockId =
  | "execution_mode"
  | "desk_contract"
  | "direct_response"
  | "environment_metadata"
  | "wallet_public_metadata"
  | "crypto_safety"
  | "workspace_orientation"
  | "workflow_run"
  | "response_perspective";

export interface MatterhornSessionContextBlock {
  id: MatterhornSessionContextBlockId;
  content: string | null | undefined;
  enabled?: boolean;
}

const CONTEXT_ORDER: MatterhornSessionContextBlockId[] = [
  "execution_mode",
  "desk_contract",
  "direct_response",
  "environment_metadata",
  "wallet_public_metadata",
  "crypto_safety",
  "workspace_orientation",
  "workflow_run",
  "response_perspective",
];

const DEFAULT_MAX_CONTEXT_CHARS = 64_000;

/**
 * Produces one deterministic, bounded system context. A block id can appear
 * only once, so overlapping hooks cannot silently duplicate policy or wallet
 * metadata.
 */
export function compileMatterhornSessionSystemContext(
  blocks: MatterhornSessionContextBlock[],
  maxChars = DEFAULT_MAX_CONTEXT_CHARS,
): string | undefined {
  const unique = new Map<MatterhornSessionContextBlockId, string>();
  for (const block of blocks) {
    if (block.enabled === false || unique.has(block.id)) continue;
    const content = block.content?.trim();
    if (!content) continue;
    unique.set(block.id, content);
  }

  const ordered = CONTEXT_ORDER
    .map((id) => unique.get(id))
    .filter((content): content is string => Boolean(content));
  if (ordered.length === 0) return undefined;

  const compiled = ordered.join("\n\n");
  if (compiled.length <= maxChars) return compiled;
  if (maxChars <= 0) return "";

  const omission = "[Additional context omitted by Matterhorn.]";
  if (maxChars <= omission.length) return omission.slice(0, maxChars);

  const separator = "\n\n";
  const prefixBudget = Math.max(0, maxChars - omission.length - separator.length);
  const prefix = compiled.slice(0, prefixBudget).trimEnd();
  return `${prefix}${prefix ? separator : ""}${omission}`.slice(0, maxChars);
}

export function buildMatterhornPublicWalletContext(input: {
  address: string | null | undefined;
  chainId: number | null | undefined;
  ethBalance: string | null | undefined;
  usdcBalance: string | null | undefined;
}): string {
  return [
    "## Connected Wallet Public Context",
    `Public address: ${input.address ?? "unknown"}`,
    `Chain ID: ${input.chainId ?? "unknown"}`,
    `ETH balance: ${input.ethBalance ?? "unknown"}`,
    `USDC balance: ${input.usdcBalance ?? "unknown"}`,
    "This is public account metadata only.",
    "Never request signing material. Never sign or submit on the user's behalf.",
    "Any supported action still requires the user's explicit review and wallet approval.",
  ].join("\n");
}
