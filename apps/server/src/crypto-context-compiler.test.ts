import { describe, expect, test } from "bun:test";
import { MATTERHORN_CRYPTO_ACTION_REGISTRY } from "@matterhorn-work/types/crypto-action-registry";
import {
  activeDeskToolDefinitions,
  compileMatterhornCryptoState,
  MatterhornBlockEvidenceCache,
} from "./crypto-context-compiler.js";

describe("crypto context compiler", () => {
  test("makes only the active desk schema available and saves at least 40% repeated schema input", () => {
    const full = JSON.stringify(MATTERHORN_CRYPTO_ACTION_REGISTRY).length;
    for (const deskId of ["bittensor", "hyperliquid", "polymarket", "sui"] as const) {
      const active = JSON.stringify(activeDeskToolDefinitions(deskId)).length;
      expect(active, `${deskId} must retain at least one tool`).toBeGreaterThan(0);
      expect(active / full, `${deskId} active schemas must reduce repeated input by at least 40%`).toBeLessThanOrEqual(0.6);
    }
  });

  test("projects decisions and evidence references without replaying secrets", () => {
    const compiled = compileMatterhornCryptoState({
      decisions: ["Use Sui testnet"],
      unresolvedRisks: ["Recipient has not been independently verified"],
      pendingActionIds: ["intent_123"],
      evidenceReferences: ["sha256:abc"],
    });
    expect(compiled).toContain("Use Sui testnet");
    expect(compiled).toContain("sha256:abc");
    expect(() => compileMatterhornCryptoState({ decisions: ["private key must never be present"] })).toThrow("forbidden_secret_key");
  });

  test("caches only immutable block-bound public evidence", () => {
    const cache = new MatterhornBlockEvidenceCache<{ balance: string }>();
    expect(() => cache.put({ venue: "sui", network: "testnet", block: "", query: {}, value: { balance: "1" } }))
      .toThrow("block_bound_evidence_cache_key_required");
    const entry = cache.put({
      venue: "sui",
      network: "testnet",
      block: "checkpoint:100",
      query: { address: "0x1" },
      value: { balance: "1" },
    });
    expect(cache.get({ venue: "sui", network: "testnet", block: "checkpoint:100", query: { address: "0x1" } }))
      .toEqual(entry);
  });
});
