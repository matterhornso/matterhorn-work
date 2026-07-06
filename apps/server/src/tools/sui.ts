import { SuiGrpcClient } from "@mysten/sui/grpc";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";

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
    };

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

export const suiProvider = new SuiPublicReadProvider();
