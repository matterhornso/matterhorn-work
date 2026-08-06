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
const DEFAULT_CONTEXT_VALUE_MAX_CHARS = 256;

export function sanitizeMatterhornSystemContextValue(
  value: unknown,
  options: { maxChars?: number; fallback?: string } = {},
): string {
  const maxChars = Math.max(1, options.maxChars ?? DEFAULT_CONTEXT_VALUE_MAX_CHARS);
  const fallback = options.fallback ?? "unknown";
  if (value == null) return fallback;

  const normalized = String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return fallback;
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

export async function resolveOptionalMatterhornContext<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | undefined> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch(() => undefined),
      new Promise<undefined>((resolve) => {
        timeout = setTimeout(() => resolve(undefined), Math.max(0, timeoutMs));
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

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
  const address = sanitizeMatterhornSystemContextValue(input.address, { maxChars: 128 });
  const chainId = sanitizeMatterhornSystemContextValue(input.chainId, { maxChars: 32 });
  const ethBalance = sanitizeMatterhornSystemContextValue(input.ethBalance, { maxChars: 64 });
  const usdcBalance = sanitizeMatterhornSystemContextValue(input.usdcBalance, { maxChars: 64 });
  return [
    "## Connected Wallet Public Context",
    `Public address: ${address}`,
    `Chain ID: ${chainId}`,
    `ETH balance: ${ethBalance}`,
    `USDC balance: ${usdcBalance}`,
    "This is public account metadata only.",
    "Never request signing material. Never sign or submit on the user's behalf.",
    "Any supported action still requires the user's explicit review and wallet approval.",
  ].join("\n");
}
