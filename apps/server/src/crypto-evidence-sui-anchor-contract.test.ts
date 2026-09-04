import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { MATTERHORN_EVIDENCE_ANCHOR_MODULE_SHA256 } from "./crypto-evidence-sui-anchor-package.js";

const packageRoot = resolve(import.meta.dir, "../../../packages/matterhorn-evidence-anchor");

describe("Sui evidence anchor source boundary", () => {
  test("pins the audited source, dependencies, and production module digest", async () => {
    const manifest = JSON.parse(await readFile(resolve(packageRoot, "release-manifest.json"), "utf8")) as {
      version: string;
      network: string;
      frameworkRevision: string;
      modules: Record<string, string>;
      files: Record<string, string>;
    };
    expect(manifest.version).toBe("matterhorn.sui-evidence-anchor-release.v1");
    expect(manifest.network).toBe("testnet");
    expect(manifest.frameworkRevision).toBe("718ae563a42fb4ba0d055588f81c704dcef58c25");
    expect(manifest.modules).toEqual({
      evidence_anchor: MATTERHORN_EVIDENCE_ANCHOR_MODULE_SHA256,
    });
    expect(Object.keys(manifest.files).sort()).toEqual([
      "Move.lock",
      "Move.toml",
      "sources/evidence_anchor.move",
      "tests/evidence_anchor_tests.move",
    ]);
    for (const [relativePath, expectedHash] of Object.entries(manifest.files)) {
      const contents = await readFile(resolve(packageRoot, relativePath));
      expect(createHash("sha256").update(contents).digest("hex")).toBe(expectedHash);
    }
    const lock = await readFile(resolve(packageRoot, "Move.lock"), "utf8");
    expect(lock.match(/rev = "([a-f0-9]{40})"/g)).toEqual([
      `rev = "${manifest.frameworkRevision}"`,
      `rev = "${manifest.frameworkRevision}"`,
    ]);
  });

  test("stores only the allowlisted non-content fields and freezes the object", async () => {
    const source = await readFile(resolve(packageRoot, "sources/evidence_anchor.move"), "utf8");
    expect(source).toContain("public struct EvidenceAnchor has key, store");
    expect(source).toContain("sui::transfer::freeze_object(anchor);");
    const fields = source.match(/public struct EvidenceAnchor has key, store \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(fields.match(/^\s*[a-z_]+:\s*[^,]+,/gm)?.map((line) => line.trim())).toEqual([
      "id: UID,",
      "schema_version: u16,",
      "batch_id: vector<u8>,",
      "merkle_root: vector<u8>,",
      "walrus_object_id: address,",
      "certified_epoch: u64,",
      "valid_until_epoch: u64,",
    ]);
    expect(fields).not.toMatch(/workspace|account|coworker|wallet|prompt|plaintext|ciphertext|private_key|signature/i);
  });

  test("contains no signing, relay, submission, transfer, or mainnet surface", async () => {
    const source = await readFile(resolve(packageRoot, "sources/evidence_anchor.move"), "utf8");
    expect(source).not.toMatch(/\b(sign|submit|relay|broadcast|mainnet)\b/i);
    expect(source).not.toContain("transfer::public_transfer");
    expect(source.match(/public fun anchor\(/g)).toHaveLength(1);
  });
});
