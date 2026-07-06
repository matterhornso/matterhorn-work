import { SuiGrpcClient } from "@mysten/sui/grpc";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { createHash } from "node:crypto";

export const SUI_NETWORKS = ["testnet", "mainnet"] as const;
export type SuiNetwork = (typeof SUI_NETWORKS)[number];

export const SUI_GRPC_URLS: Record<SuiNetwork, string> = {
  testnet: "https://fullnode.testnet.sui.io:443",
  mainnet: "https://fullnode.mainnet.sui.io:443",
};

export const SUI_NATIVE_COIN_TYPE =
  "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

type SuiRouteInputErrorCode =
  | "invalid_sui_address"
  | "invalid_sui_network"
  | "invalid_sui_amount"
  | "invalid_sui_preview"
  | "sui_secret_rejected";

export class SuiInputError extends Error {
  readonly code: SuiRouteInputErrorCode;

  constructor(code: SuiRouteInputErrorCode, message: string) {
    super(message);
    this.name = "SuiInputError";
    this.code = code;
  }
}

export interface SuiBalanceResponse {
  balance: {
    coinType: string;
    balance: string;
    coinBalance?: string;
    addressBalance?: string;
  };
}

export interface SuiReadClient {
  getBalance(input: { owner: string; coinType?: string; signal?: AbortSignal }): Promise<SuiBalanceResponse>;
}

export interface SuiSource {
  source: "sui.grpc";
  network: SuiNetwork;
  endpoint: string;
  fetchedAt: string;
}

export interface SuiBalanceSnapshot {
  version: "matterhorn.sui.balance.v1";
  address: string;
  network: SuiNetwork;
  coinType: string;
  balanceMist: string;
  balanceSui: string;
  coinBalanceMist?: string;
  addressBalanceMist?: string;
  custody: false;
  canSubmit: false;
  source: SuiSource;
  warnings: string[];
}

export interface SuiAccountSnapshot {
  version: "matterhorn.sui.account.v1";
  address: string;
  network: SuiNetwork;
  balance: SuiBalanceSnapshot;
  custody: false;
  canSubmit: false;
  signerPolicy: "client_wallet_required";
  safety: {
    publicReadOnly: true;
    signingInMatterhorn: false;
    secretsAccepted: false;
  };
  warnings: string[];
}

export interface SuiTransferPreviewInput {
  network?: string | null;
  kind?: string | null;
  action?: string | null;
  sender?: string | null;
  recipient?: string | null;
  to?: string | null;
  amountMist?: string | number | bigint | null;
  amountSui?: string | number | null;
  memo?: string | null;
}

export interface SuiTransactionPreview {
  version: "matterhorn.sui.transaction-preview.v1";
  id: string;
  family: "sui";
  network: SuiNetwork;
  kind: "transfer_sui";
  sender: string;
  recipient: string;
  amountMist: string;
  amountSui: string;
  memo?: string;
  custody: false;
  canSubmit: false;
  liveSubmissionEnabled: false;
  signerPolicy: "client_wallet_required";
  requiresWalletStandard: true;
  previewSha256: string;
  createdAt: string;
  expiresAt: string;
  handoff: {
    kind: "sui_wallet_standard";
    action: "sign_and_execute_in_wallet";
    network: SuiNetwork;
    chain: `sui:${SuiNetwork}`;
    unsignedIntent: {
      kind: "transfer_sui";
      sender: string;
      recipient: string;
      amountMist: string;
    };
  };
  warnings: string[];
}

export type SuiTransactionPreviewCard = {
  kind: "sui_transaction_preview";
  title: string;
  subtitle: string;
  summary: string;
  tone: "default";
  items: Array<{ label: string; value: string; tone?: "default" | "muted" | "good" | "warning" | "danger" }>;
  warnings: string[];
  data: { preview: SuiTransactionPreview };
};

export type SuiChatCard =
  | {
      kind: "sui_account_snapshot";
      title: string;
      subtitle: string;
      summary: string;
      tone: "default";
      items: Array<{ label: string; value: string; tone?: "default" | "muted" | "good" | "warning" | "danger" }>;
      warnings: string[];
      data: { account: SuiAccountSnapshot };
    }
  | SuiTransactionPreviewCard;

export interface SuiPublicReadProviderOptions {
  clientFactory?: (network: SuiNetwork) => SuiReadClient;
  now?: () => Date;
}

const FORBIDDEN_SUI_SECRET_KEY_PATTERN =
  /(?:private[_\s-]?key|seed[_\s-]?phrase|mnemonic|wallet[_\s-]?export|keystore|raw[_\s-]?signature|signed[_\s-]?payload|secret|password|passphrase)/i;
const FORBIDDEN_SUI_SECRET_VALUE_PATTERN =
  /(?:use\s+this\s+)?(?:private\s+key|seed\s+phrase|mnemonic|wallet\s+export|keystore|raw\s+signature|signed\s+payload|secret|passphrase)\s*(?:to\s+sign|:|=)/i;

function cardItem(
  label: string,
  value: string,
  tone: "default" | "muted" | "good" | "warning" | "danger" = "default",
): SuiChatCard["items"][number] {
  return { label, value, tone };
}

function findForbiddenSuiCredentialInputInner(value: unknown, path: string, depth: number): string | null {
  if (depth > 24) return `${path || "input"}.too-deep`;
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return FORBIDDEN_SUI_SECRET_VALUE_PATTERN.test(value) ? path || "input" : null;
  }
  if (typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findForbiddenSuiCredentialInputInner(value[i], `${path}[${i}]`, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const [key, nextValue] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_SUI_SECRET_KEY_PATTERN.test(key)) return nextPath;
    const found = findForbiddenSuiCredentialInputInner(nextValue, nextPath, depth + 1);
    if (found) return found;
  }
  return null;
}

export function findForbiddenSuiCredentialInput(value: unknown): string | null {
  return findForbiddenSuiCredentialInputInner(value, "", 0);
}

export function normalizeMatterhornSuiNetwork(value?: string | null): SuiNetwork {
  const normalized = (value ?? "testnet").trim().toLowerCase();
  if (!normalized || normalized === "sui-testnet" || normalized === "testnet") return "testnet";
  if (normalized === "sui-mainnet" || normalized === "mainnet") return "mainnet";
  throw new SuiInputError("invalid_sui_network", "network must be testnet or mainnet");
}

export function normalizeMatterhornSuiAddress(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new SuiInputError("invalid_sui_address", "address is required");
  }
  const forbidden = findForbiddenSuiCredentialInput(trimmed);
  if (forbidden) {
    throw new SuiInputError(
      "sui_secret_rejected",
      `Sui reads accept only public addresses. Do not provide seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports (${forbidden}).`,
    );
  }

  let normalized: string;
  try {
    normalized = normalizeSuiAddress(trimmed);
  } catch {
    throw new SuiInputError("invalid_sui_address", "address must be a valid Sui public address");
  }
  if (!isValidSuiAddress(normalized)) {
    throw new SuiInputError("invalid_sui_address", "address must be a valid Sui public address");
  }
  return normalized;
}

export function formatMistToSui(value: string | bigint | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0";
  const mist = BigInt(String(value));
  const divisor = 1_000_000_000n;
  const whole = mist / divisor;
  const fraction = mist % divisor;
  if (fraction === 0n) return whole.toString();
  const fractionText = fraction.toString().padStart(9, "0").replace(/0+$/, "");
  return `${whole}.${fractionText}`;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function parsePositiveMist(value: string | number | bigint | null | undefined): bigint | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "bigint") return value > 0n ? value : null;
  const text = String(value).trim();
  if (!/^[0-9]+$/.test(text)) return null;
  const mist = BigInt(text);
  return mist > 0n ? mist : null;
}

function parseSuiToMist(value: string | number | null | undefined): bigint | null {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (!/^[0-9]+(?:\.[0-9]{1,9})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const mist = (BigInt(whole) * 1_000_000_000n) + BigInt(fraction.padEnd(9, "0"));
  return mist > 0n ? mist : null;
}

export function buildSuiTransferPreview(
  input: SuiTransferPreviewInput,
  options: { now?: () => Date; ttlMs?: number } = {},
): SuiTransactionPreview {
  const forbidden = findForbiddenSuiCredentialInput(input);
  if (forbidden) {
    throw new SuiInputError(
      "sui_secret_rejected",
      `Sui transaction previews accept only public metadata. Do not provide seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports (${forbidden}).`,
    );
  }

  const action = (input.kind ?? input.action ?? "transfer_sui").trim();
  if (action !== "transfer_sui") {
    throw new SuiInputError("invalid_sui_preview", "Sui preview kind must be transfer_sui");
  }

  const network = normalizeMatterhornSuiNetwork(input.network);
  const sender = normalizeMatterhornSuiAddress(input.sender ?? "");
  const recipient = normalizeMatterhornSuiAddress(input.recipient ?? input.to ?? "");
  const amountMist = parsePositiveMist(input.amountMist) ?? parseSuiToMist(input.amountSui);
  if (!amountMist) {
    throw new SuiInputError("invalid_sui_amount", "amountMist or amountSui must be a positive Sui amount");
  }

  const memo = input.memo?.trim();
  if (memo && memo.length > 140) {
    throw new SuiInputError("invalid_sui_preview", "memo must be 140 characters or fewer");
  }

  const now = options.now?.() ?? new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + (options.ttlMs ?? 10 * 60_000)).toISOString();
  const unsignedIntent = {
    kind: "transfer_sui" as const,
    sender,
    recipient,
    amountMist: amountMist.toString(),
  };
  const previewCore = {
    version: "matterhorn.sui.transaction-preview.v1" as const,
    family: "sui" as const,
    network,
    kind: "transfer_sui" as const,
    sender,
    recipient,
    amountMist: amountMist.toString(),
    amountSui: formatMistToSui(amountMist),
    memo: memo || undefined,
    custody: false as const,
    canSubmit: false as const,
    liveSubmissionEnabled: false as const,
    signerPolicy: "client_wallet_required" as const,
    requiresWalletStandard: true as const,
    createdAt,
    expiresAt,
    handoff: {
      kind: "sui_wallet_standard" as const,
      action: "sign_and_execute_in_wallet" as const,
      network,
      chain: `sui:${network}` as const,
      unsignedIntent,
    },
    warnings: [
      "Preview only. Matterhorn does not sign or submit Sui transactions.",
      "Review and sign in your own Sui wallet.",
    ],
  };
  const previewSha256 = sha256(previewCore);
  return {
    ...previewCore,
    id: `sui_preview_${previewSha256.slice(0, 16)}`,
    previewSha256,
  };
}

export class SuiPublicReadProvider {
  private readonly clientFactory: (network: SuiNetwork) => SuiReadClient;
  private readonly now: () => Date;

  constructor(options: SuiPublicReadProviderOptions = {}) {
    this.clientFactory = options.clientFactory ?? ((network) => new SuiGrpcClient({
      network,
      baseUrl: SUI_GRPC_URLS[network],
    }));
    this.now = options.now ?? (() => new Date());
  }

  async getBalance(
    address: string,
    options: { network?: string | null; coinType?: string | null; signal?: AbortSignal } = {},
  ): Promise<SuiBalanceSnapshot> {
    const normalizedAddress = normalizeMatterhornSuiAddress(address);
    const network = normalizeMatterhornSuiNetwork(options.network);
    const coinType = options.coinType?.trim() || SUI_NATIVE_COIN_TYPE;
    const response = await this.clientFactory(network).getBalance({
      owner: normalizedAddress,
      coinType,
      signal: options.signal,
    });
    const balance = response.balance;
    const balanceMist = balance.balance ?? balance.coinBalance ?? balance.addressBalance ?? "0";

    return {
      version: "matterhorn.sui.balance.v1",
      address: normalizedAddress,
      network,
      coinType: balance.coinType || coinType,
      balanceMist,
      balanceSui: formatMistToSui(balanceMist),
      coinBalanceMist: balance.coinBalance,
      addressBalanceMist: balance.addressBalance,
      custody: false,
      canSubmit: false,
      source: {
        source: "sui.grpc",
        network,
        endpoint: SUI_GRPC_URLS[network],
        fetchedAt: this.now().toISOString(),
      },
      warnings: [
        "Read-only Sui account data. Matterhorn does not hold keys, sign, or submit Sui transactions.",
      ],
    };
  }

  async getAccountSnapshot(
    address: string,
    options: { network?: string | null; signal?: AbortSignal } = {},
  ): Promise<SuiAccountSnapshot> {
    const balance = await this.getBalance(address, options);
    return {
      version: "matterhorn.sui.account.v1",
      address: balance.address,
      network: balance.network,
      balance,
      custody: false,
      canSubmit: false,
      signerPolicy: "client_wallet_required",
      safety: {
        publicReadOnly: true,
        signingInMatterhorn: false,
        secretsAccepted: false,
      },
      warnings: balance.warnings,
    };
  }
}

export function buildSuiAccountCard(account: SuiAccountSnapshot): SuiChatCard {
  return {
    kind: "sui_account_snapshot",
    title: "Sui account snapshot",
    subtitle: `${account.network} · ${account.address.slice(0, 10)}...${account.address.slice(-6)}`,
    summary: "Read-only SUI balance from a public Sui address.",
    tone: "default",
    items: [
      cardItem("SUI", account.balance.balanceSui, "good"),
      cardItem("Network", account.network),
      cardItem("Source", account.balance.source.source, "muted"),
      cardItem("Custody", "No custody", "good"),
      cardItem("Submit", "Disabled", "muted"),
    ],
    warnings: account.warnings,
    data: { account },
  };
}

export function buildSuiTransactionPreviewCard(preview: SuiTransactionPreview): SuiTransactionPreviewCard {
  return {
    kind: "sui_transaction_preview",
    title: "Sui transfer preview",
    subtitle: `${preview.network} · ${preview.amountSui} SUI`,
    summary: "Unsigned transfer intent for review in your Sui wallet.",
    tone: "default",
    items: [
      cardItem("Amount", `${preview.amountSui} SUI`, "good"),
      cardItem("Network", preview.network),
      cardItem("Sender", `${preview.sender.slice(0, 10)}...${preview.sender.slice(-6)}`, "muted"),
      cardItem("Recipient", `${preview.recipient.slice(0, 10)}...${preview.recipient.slice(-6)}`, "muted"),
      cardItem("Submit", "Disabled", "muted"),
    ],
    warnings: preview.warnings,
    data: { preview },
  };
}

export const suiProvider = new SuiPublicReadProvider();
