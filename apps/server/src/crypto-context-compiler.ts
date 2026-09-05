import {
  getMatterhornDeskAgentById,
  type MatterhornDeskAgentDeskId,
} from "@matterhorn-work/types/desk-agents";
import {
  getMatterhornCryptoTool,
  MATTERHORN_CRYPTO_ACTION_REGISTRY,
  type MatterhornCryptoToolDefinition,
} from "@matterhorn-work/types/crypto-action-registry";
import type { MatterhornAgentToolReceipt } from "@matterhorn-work/types/guarded-agent-runtime";
import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";

const SECRET_KEY = /(?:seed|mnemonic|private.?key|secret|password|passphrase|api.?key|bearer|signature|wallet.?export)/i;
const EXACT_EVIDENCE_HASH = /^[a-f0-9]{64}$/;

export type MatterhornCryptoStructuredState = {
  decisions?: string[];
  unresolvedRisks?: string[];
  activePositions?: Array<{ venue: string; asset: string; side: string; size: string }>;
  pendingActionIds?: string[];
  evidenceReferences?: string[];
};

function boundedPublicStrings(values: string[] | undefined, limit: number, maxChars: number): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
    .slice(0, limit)
    .map((value) => value.slice(0, maxChars));
}

/** Deterministic, secret-free state projection used instead of replaying transcripts. */
export function compileMatterhornCryptoState(state: MatterhornCryptoStructuredState): string {
  const safe = {
    decisions: boundedPublicStrings(state.decisions, 12, 500),
    unresolvedRisks: boundedPublicStrings(state.unresolvedRisks, 12, 500),
    activePositions: (state.activePositions ?? []).slice(0, 20).map((position) => ({
      venue: position.venue.slice(0, 64),
      asset: position.asset.slice(0, 128),
      side: position.side.slice(0, 32),
      size: position.size.slice(0, 64),
    })),
    pendingActionIds: boundedPublicStrings(state.pendingActionIds, 20, 128),
    evidenceReferences: boundedPublicStrings(state.evidenceReferences, 40, 256),
  };
  const json = JSON.stringify(safe);
  if (SECRET_KEY.test(json)) {
    throw new Error("crypto_context_state_contains_forbidden_secret_key");
  }
  return json;
}

/**
 * Convert receipt evidence into content-free references for later runs.
 * Current receipts retain the exact projection and observation identities.
 * Legacy receipts get one domain-separated digest instead of replaying their
 * externally sourced provenance strings into model context.
 */
export function receiptEvidenceReferences(
  tools: readonly MatterhornAgentToolReceipt[],
): string[] {
  return tools.flatMap((tool) => {
    const projectionHash = tool.evidence?.projectionHash;
    const observationHash = tool.evidence?.observationHash;
    if (projectionHash !== undefined || observationHash !== undefined) {
      if (projectionHash && observationHash
        && EXACT_EVIDENCE_HASH.test(projectionHash)
        && EXACT_EVIDENCE_HASH.test(observationHash)) {
        return [
          `projection:${projectionHash}`,
          `observation:${observationHash}`,
        ];
      }
      return [];
    }
    if (!tool.source && !tool.freshness) return [];
    return [`legacy:${sha256({
      domain: "matterhorn:legacy-tool-evidence-reference:v1",
      toolName: tool.name,
      source: tool.source,
      freshness: tool.freshness,
    })}`];
  });
}

export function activeDeskToolDefinitions(deskId: MatterhornDeskAgentDeskId): MatterhornCryptoToolDefinition[] {
  const agent = getMatterhornDeskAgentById(`matterhorn-${deskId}`);
  const allowed = new Set((agent?.toolPolicy.work ?? []).map((name) => name.replace(/^matterhorn-work_/, "")));
  return MATTERHORN_CRYPTO_ACTION_REGISTRY.filter((tool) => allowed.has(tool.name));
}

export type CryptoEvidenceCacheEntry<T> = {
  value: T;
  evidenceReference: string;
  venue: string;
  network: string;
  block: string;
  observedAt: string;
};

type StoredCryptoEvidenceCacheEntry<T> = CryptoEvidenceCacheEntry<T> & {
  queryHash: string;
};

const DEFAULT_BLOCK_EVIDENCE_CACHE_ENTRIES = 256;
const DEFAULT_BLOCK_EVIDENCE_CACHE_ENTRY_BYTES = 256 * 1024;

function boundedCacheLabel(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error("block_bound_evidence_cache_key_invalid");
  }
  return normalized;
}

/**
 * In-memory cache for explicitly block-bound public evidence. It retains only
 * a hash of the canonical query, bounds both item count and value size, and
 * returns defensive copies. Unbound, private, wallet-linked, and transaction
 * results must never be placed here.
 */
export class MatterhornBlockEvidenceCache<T> {
  private readonly values = new Map<string, StoredCryptoEvidenceCacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly maxEntryBytes: number;

  constructor(options: { maxEntries?: number; maxEntryBytes?: number } = {}) {
    const maxEntries = options.maxEntries ?? DEFAULT_BLOCK_EVIDENCE_CACHE_ENTRIES;
    const maxEntryBytes = options.maxEntryBytes ?? DEFAULT_BLOCK_EVIDENCE_CACHE_ENTRY_BYTES;
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 10_000
      || !Number.isSafeInteger(maxEntryBytes) || maxEntryBytes < 1 || maxEntryBytes > 1024 * 1024) {
      throw new Error("block_bound_evidence_cache_options_invalid");
    }
    this.maxEntries = maxEntries;
    this.maxEntryBytes = maxEntryBytes;
  }

  put(input: { venue: string; network: string; block: string; query: unknown; value: T; observedAt?: Date }): CryptoEvidenceCacheEntry<T> {
    const venue = boundedCacheLabel(input.venue);
    const network = boundedCacheLabel(input.network);
    const block = boundedCacheLabel(input.block);
    const observedAt = input.observedAt ?? new Date();
    if (!Number.isFinite(observedAt.getTime())) {
      throw new Error("block_bound_evidence_cache_observation_invalid");
    }
    const canonicalValue = canonicalJson(input.value);
    if (Buffer.byteLength(canonicalValue, "utf8") > this.maxEntryBytes) {
      throw new Error("block_bound_evidence_cache_value_too_large");
    }
    const queryHash = sha256(input.query);
    const entry: StoredCryptoEvidenceCacheEntry<T> = {
      value: structuredClone(input.value),
      evidenceReference: `sha256:${sha256(input.value)}`,
      venue,
      network,
      block,
      observedAt: observedAt.toISOString(),
      queryHash,
    };
    const key = this.key({ venue, network, block, queryHash });
    this.values.delete(key);
    while (this.values.size >= this.maxEntries) {
      const oldest = this.values.keys().next().value;
      if (typeof oldest !== "string") break;
      this.values.delete(oldest);
    }
    this.values.set(key, entry);
    return this.publicEntry(entry);
  }

  get(input: { venue: string; network: string; block: string; query: unknown }): CryptoEvidenceCacheEntry<T> | null {
    const entry = this.values.get(this.key({
      venue: boundedCacheLabel(input.venue),
      network: boundedCacheLabel(input.network),
      block: boundedCacheLabel(input.block),
      queryHash: sha256(input.query),
    }));
    return entry ? this.publicEntry(entry) : null;
  }

  getLatest(input: {
    venue: string;
    network: string;
    query: unknown;
    now?: Date;
    maxAgeMs: number;
  }): CryptoEvidenceCacheEntry<T> | null {
    const venue = boundedCacheLabel(input.venue);
    const network = boundedCacheLabel(input.network);
    const queryHash = sha256(input.query);
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())
      || !Number.isSafeInteger(input.maxAgeMs)
      || input.maxAgeMs < 0
      || input.maxAgeMs > 60 * 60 * 1000) {
      throw new Error("block_bound_evidence_cache_lookup_invalid");
    }
    let latest: StoredCryptoEvidenceCacheEntry<T> | null = null;
    for (const entry of this.values.values()) {
      if (entry.venue !== venue || entry.network !== network || entry.queryHash !== queryHash) continue;
      const observedAtMs = Date.parse(entry.observedAt);
      const ageMs = now.getTime() - observedAtMs;
      if (!Number.isFinite(observedAtMs) || ageMs < -60_000 || ageMs > input.maxAgeMs) continue;
      if (!latest || entry.observedAt > latest.observedAt) latest = entry;
    }
    return latest ? this.publicEntry(latest) : null;
  }

  private key(input: { venue: string; network: string; block: string; queryHash: string }): string {
    return sha256(input);
  }

  private publicEntry(entry: StoredCryptoEvidenceCacheEntry<T>): CryptoEvidenceCacheEntry<T> {
    const { queryHash: _queryHash, ...visible } = entry;
    return structuredClone(visible);
  }
}

export function toolDefinitionForName(name: string): MatterhornCryptoToolDefinition | null {
  return getMatterhornCryptoTool(name) ?? null;
}
