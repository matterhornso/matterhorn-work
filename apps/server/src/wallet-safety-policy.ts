import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  MatterhornWalletSafetyPolicy,
  MatterhornWalletSafetyPolicyResponse,
  MatterhornWalletSafetyPolicyUpdateRequest,
} from "@matterhorn-work/types/wallet-safety-policy";
import { MATTERHORN_WALLET_SAFETY_POLICY_VERSION } from "@matterhorn-work/types/wallet-safety-policy";
import { atomicWriteTextFile } from "./atomic-file.js";
import type { WorkspaceInfo } from "./types.js";

const DEFAULT_MAX_PER_TX_USD = 50;
const DEFAULT_MAX_DAILY_USD = 100;
const DEFAULT_MAX_SLIPPAGE_BPS = 100;
const DEFAULT_PREFERRED_NETWORK = 84532;

const SECRET_KEY_PATTERN = /seed|mnemonic|private[_-]?key|wallet[_\s-]?export|raw[_\s-]?signature|signed[_\s-]?payload|api[_\s-]?secret|bearer/i;
const SECRET_VALUE_PATTERN = /\b(seed phrase|mnemonic|private key|wallet export|raw signature|signed payload|api secret)\b|Bearer\s+[A-Za-z0-9._-]{8,}|0x[A-Fa-f0-9]{64}\b/i;

export function walletSafetyPolicyPath(workspace: WorkspaceInfo): string {
  return join(workspace.path, ".matterhorn-work", "wallet", "safety-policy.json");
}

function positiveNumber(value: unknown, fallback: number, options: { max?: number } = {}): number {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return fallback;
  return Math.min(next, options.max ?? Number.MAX_SAFE_INTEGER);
}

function preferredNetwork(value: unknown): number | null {
  if (value === null) return null;
  const next = Number(value);
  if (next === 8453 || next === 84532) return next;
  return DEFAULT_PREFERRED_NETWORK;
}

function defaultPolicy(): MatterhornWalletSafetyPolicy {
  return {
    version: MATTERHORN_WALLET_SAFETY_POLICY_VERSION,
    maxPerTransactionUSD: DEFAULT_MAX_PER_TX_USD,
    maxDailySpendUSD: DEFAULT_MAX_DAILY_USD,
    mainnetEnabled: false,
    maxSlippageBps: DEFAULT_MAX_SLIPPAGE_BPS,
    preferredNetwork: DEFAULT_PREFERRED_NETWORK,
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizePolicy(value: unknown): MatterhornWalletSafetyPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultPolicy();
  const record = value as Record<string, unknown>;
  const updatedAt = typeof record.updatedAt === "string" && record.updatedAt.trim()
    ? record.updatedAt.trim()
    : new Date(0).toISOString();
  const updatedBy = typeof record.updatedBy === "string" && record.updatedBy.trim()
    ? record.updatedBy.trim().slice(0, 80)
    : undefined;

  return {
    version: MATTERHORN_WALLET_SAFETY_POLICY_VERSION,
    maxPerTransactionUSD: positiveNumber(record.maxPerTransactionUSD, DEFAULT_MAX_PER_TX_USD, { max: 1_000_000 }),
    maxDailySpendUSD: positiveNumber(record.maxDailySpendUSD, DEFAULT_MAX_DAILY_USD, { max: 10_000_000 }),
    mainnetEnabled: record.mainnetEnabled === true,
    maxSlippageBps: positiveNumber(record.maxSlippageBps, DEFAULT_MAX_SLIPPAGE_BPS, { max: 10_000 }),
    preferredNetwork: preferredNetwork(record.preferredNetwork),
    updatedAt,
    ...(updatedBy ? { updatedBy } : {}),
  };
}

export function readWorkspaceWalletSafetyPolicySync(workspace: WorkspaceInfo): MatterhornWalletSafetyPolicy {
  const path = walletSafetyPolicyPath(workspace);
  if (!existsSync(path)) return defaultPolicy();
  try {
    return normalizePolicy(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return defaultPolicy();
  }
}

export async function readWorkspaceWalletSafetyPolicy(workspace: WorkspaceInfo): Promise<MatterhornWalletSafetyPolicy> {
  const path = walletSafetyPolicyPath(workspace);
  if (!existsSync(path)) return defaultPolicy();
  try {
    return normalizePolicy(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return defaultPolicy();
  }
}

export function assertWalletSafetyPolicyUpdateSafe(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`Wallet safety policy update contains forbidden field: ${key}`);
    }
    if (typeof raw === "string" && SECRET_VALUE_PATTERN.test(raw)) {
      throw new Error(`Wallet safety policy update contains forbidden value for ${key}`);
    }
  }
}

export function coerceWalletSafetyPolicyUpdate(value: unknown): MatterhornWalletSafetyPolicyUpdateRequest {
  assertWalletSafetyPolicyUpdateSafe(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const update: MatterhornWalletSafetyPolicyUpdateRequest = {};

  if ("maxPerTransactionUSD" in record) {
    update.maxPerTransactionUSD = positiveNumber(record.maxPerTransactionUSD, DEFAULT_MAX_PER_TX_USD, { max: 1_000_000 });
  }
  if ("maxDailySpendUSD" in record) {
    update.maxDailySpendUSD = positiveNumber(record.maxDailySpendUSD, DEFAULT_MAX_DAILY_USD, { max: 10_000_000 });
  }
  if ("mainnetEnabled" in record) {
    update.mainnetEnabled = record.mainnetEnabled === true;
  }
  if ("maxSlippageBps" in record) {
    update.maxSlippageBps = positiveNumber(record.maxSlippageBps, DEFAULT_MAX_SLIPPAGE_BPS, { max: 10_000 });
  }
  if ("preferredNetwork" in record) {
    update.preferredNetwork = preferredNetwork(record.preferredNetwork);
  }

  return update;
}

export function buildWalletSafetyPolicyResponse(
  workspace: WorkspaceInfo,
  options: { writable: boolean },
): MatterhornWalletSafetyPolicyResponse {
  const path = walletSafetyPolicyPath(workspace);
  return {
    success: true,
    version: MATTERHORN_WALLET_SAFETY_POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      type: workspace.workspaceType,
      preset: workspace.preset,
    },
    storage: {
      path,
      exists: existsSync(path),
    },
    policy: readWorkspaceWalletSafetyPolicySync(workspace),
    controls: {
      writable: options.writable,
      ledgerRoute: `/workspace/${encodeURIComponent(workspace.id)}/data-ledger?kind=wallet`,
      settingsRoute: `/workspace/${encodeURIComponent(workspace.id)}/settings/wallet`,
    },
  };
}

export async function writeWorkspaceWalletSafetyPolicy(
  workspace: WorkspaceInfo,
  request: MatterhornWalletSafetyPolicyUpdateRequest,
  updatedBy?: string,
): Promise<MatterhornWalletSafetyPolicyResponse> {
  const current = await readWorkspaceWalletSafetyPolicy(workspace);
  const next: MatterhornWalletSafetyPolicy = {
    ...current,
    ...request,
    version: MATTERHORN_WALLET_SAFETY_POLICY_VERSION,
    updatedAt: new Date().toISOString(),
    ...(updatedBy ? { updatedBy: updatedBy.slice(0, 80) } : {}),
  };
  const path = walletSafetyPolicyPath(workspace);
  await atomicWriteTextFile(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return buildWalletSafetyPolicyResponse(workspace, { writable: true });
}
