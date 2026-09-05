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
      .toThrow("block_bound_evidence_cache_key_invalid");
    const entry = cache.put({
      venue: "sui",
      network: "testnet",
      block: "checkpoint:100",
      query: { address: "0x1" },
      value: { balance: "1" },
      observedAt: new Date("2026-09-01T12:00:00.000Z"),
    });
    expect(cache.get({ venue: "sui", network: "testnet", block: "checkpoint:100", query: { address: "0x1" } }))
      .toEqual(entry);
    expect(cache.getLatest({
      venue: "sui",
      network: "testnet",
      query: { address: "0x1" },
      now: new Date("2026-09-01T12:00:10.000Z"),
      maxAgeMs: 30_000,
    })).toEqual(entry);
    expect(cache.getLatest({
      venue: "sui",
      network: "testnet",
      query: { address: "0x1" },
      now: new Date("2026-09-01T12:00:30.001Z"),
      maxAgeMs: 30_000,
    })).toBeNull();
  });

  test("bounds cache memory, evicts oldest evidence and returns defensive copies", () => {
    const cache = new MatterhornBlockEvidenceCache<{ values: string[] }>({
      maxEntries: 2,
      maxEntryBytes: 128,
    });
    cache.put({ venue: "sui", network: "testnet", block: "1", query: { id: 1 }, value: { values: ["one"] } });
    const second = cache.put({ venue: "sui", network: "testnet", block: "2", query: { id: 2 }, value: { values: ["two"] } });
    const returned = cache.get({ venue: "sui", network: "testnet", block: "2", query: { id: 2 } });
    returned?.value.values.push("poison");
    expect(cache.get({ venue: "sui", network: "testnet", block: "2", query: { id: 2 } })).toEqual(second);

    cache.put({ venue: "sui", network: "testnet", block: "3", query: { id: 3 }, value: { values: ["three"] } });
    expect(cache.get({ venue: "sui", network: "testnet", block: "1", query: { id: 1 } })).toBeNull();
    expect(cache.get({ venue: "sui", network: "testnet", block: "2", query: { id: 2 } })).toEqual(second);
    expect(() => cache.put({
      venue: "sui",
      network: "testnet",
      block: "4",
      query: { id: 4 },
      value: { values: ["x".repeat(256)] },
    })).toThrow("block_bound_evidence_cache_value_too_large");
  });
});
