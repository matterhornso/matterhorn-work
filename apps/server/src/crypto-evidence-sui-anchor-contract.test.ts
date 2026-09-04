import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dir, "../../../packages/matterhorn-evidence-anchor");

describe("Sui evidence anchor source boundary", () => {
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
