import {
  getMatterhornDeskAgentById,
  type MatterhornDeskAgentDeskId,
} from "@matterhorn-work/types/desk-agents";
import {
  getMatterhornCryptoTool,
  MATTERHORN_CRYPTO_ACTION_REGISTRY,
  type MatterhornCryptoToolDefinition,
} from "@matterhorn-work/types/crypto-action-registry";
import { sha256 } from "./guarded-runtime-crypto.js";

const SECRET_KEY = /(?:seed|mnemonic|private.?key|secret|password|passphrase|api.?key|bearer|signature|wallet.?export)/i;

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

/** Cache only explicitly block-bound public evidence. Unbound live reads are never cached here. */
export class MatterhornBlockEvidenceCache<T> {
  private readonly values = new Map<string, CryptoEvidenceCacheEntry<T>>();

  put(input: { venue: string; network: string; block: string; query: unknown; value: T; observedAt?: Date }): CryptoEvidenceCacheEntry<T> {
    if (!input.venue.trim() || !input.network.trim() || !input.block.trim()) {
      throw new Error("block_bound_evidence_cache_key_required");
    }
    const entry: CryptoEvidenceCacheEntry<T> = {
      value: structuredClone(input.value),
      evidenceReference: `sha256:${sha256(input.value)}`,
      venue: input.venue.trim(),
      network: input.network.trim(),
      block: input.block.trim(),
      observedAt: (input.observedAt ?? new Date()).toISOString(),
    };
    this.values.set(this.key(input), entry);
    return structuredClone(entry);
  }

  get(input: { venue: string; network: string; block: string; query: unknown }): CryptoEvidenceCacheEntry<T> | null {
    const entry = this.values.get(this.key(input));
    return entry ? structuredClone(entry) : null;
  }

  private key(input: { venue: string; network: string; block: string; query: unknown }): string {
    return sha256({ venue: input.venue.trim(), network: input.network.trim(), block: input.block.trim(), query: input.query });
  }
}

export function toolDefinitionForName(name: string): MatterhornCryptoToolDefinition | null {
  return getMatterhornCryptoTool(name) ?? null;
}
