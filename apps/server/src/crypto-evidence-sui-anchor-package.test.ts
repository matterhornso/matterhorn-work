import { describe, expect, test } from "bun:test";
import { normalizeSuiObjectId } from "@mysten/sui/utils";

import {
  createPinnedSuiEvidenceAnchorPackageVerifier,
  MATTERHORN_EVIDENCE_ANCHOR_MODULE_SHA256,
  type MatterhornSuiEvidenceAnchorPackageProjection,
} from "./crypto-evidence-sui-anchor-package.js";

const ENDPOINT = new URL("https://fullnode.testnet.sui.io:443");
const PEER = "8.8.8.8";
const PACKAGE = normalizeSuiObjectId("0x8");
const MODULE_BASE64 = "oRzrCwcAAAULAQAIAggMAxQzBEcCBUkpB3LGAQi4AkAG+AK0AQqsBBQMwATdAQ2dBgwABgEMAQ4BDwAADAABAgQAAwECAAADAAEAAAsAAgAADQMEAAAEAwUAAAkDBQAAEQMGAAAFAwcAABADBwABCgoLAAIHCAEBCAkCBgoCCgIFAwMHCAIAAQgAAQYIAAENAQYKAgEFAQMBCQABAgEHCAIBCAEORXZpZGVuY2VBbmNob3IJVHhDb250ZXh0A1VJRAZhbmNob3IIYmF0Y2hfaWQPY2VydGlmaWVkX2Vwb2NoD2V2aWRlbmNlX2FuY2hvcg1mcmVlemVfb2JqZWN0AmlkC21lcmtsZV9yb290A25ldwpuZXdfYW5jaG9yBm9iamVjdA5zY2hlbWFfdmVyc2lvbgh0cmFuc2Zlcgp0eF9jb250ZXh0EXZhbGlkX3VudGlsX2Vwb2NoEHdhbHJ1c19vYmplY3RfaWQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACDQIBAAMIIAAAAAAAAAADCDUAAAAAAAAACgIQD0VJbnZhbGlkQmF0Y2hJZAoCGhliYXRjaCBpZCBtdXN0IGJlIDMyIGJ5dGVzCgITEkVJbnZhbGlkTWVya2xlUm9vdAoCHRxtZXJrbGUgcm9vdCBtdXN0IGJlIDMyIGJ5dGVzCgIUE0VJbnZhbGlkRXBvY2hXaW5kb3cKAhwbaW52YWxpZCBXYWxydXMgZXBvY2ggd2luZG93AAIHCAgBDQ0ECgIJCgIRBQUDEAMAAQAAAQkLAAsBCwILAwsECwURATgAAgABAAAAATIOAEEJBwEhBAYFCgsFAQYEAAMAQQAAwCcOAUEJBwEhBBAFFAsFAQYGAAUAQgABwCcKBAoDJAQZBR0LBQEGCAAHAEMAAsAnCgQKAxcHAiUEJAUoCwUBBggABwBEAALAJwsFEQgHAAsACwELAgsDCwQSAAIAAgEAAAEECwAQABQCAAMBAAABAwsAEAECAAQBAAABAwsAEAICAAUBAAABBAsAEAMUAgAGAQAAAQQLABAEFAIABwEAAAEECwAQBRQCAAABAAIAAwAEAAUABgA=";

function projection(overrides: Partial<MatterhornSuiEvidenceAnchorPackageProjection> = {}) {
  return {
    storageId: PACKAGE,
    originalId: PACKAGE,
    version: 1n,
    modules: [{ name: "evidence_anchor", contents: Buffer.from(MODULE_BASE64, "base64") }],
    ...overrides,
  } satisfies MatterhornSuiEvidenceAnchorPackageProjection;
}

function fixture(value = projection()) {
  const calls: unknown[] = [];
  const verify = createPinnedSuiEvidenceAnchorPackageVerifier({
    endpoint: ENDPOINT,
    resolver: async () => [{ address: PEER, family: 4 }],
    now: () => new Date("2026-09-04T00:00:00.000Z"),
    createClient: (input) => ({
      async getPackage(request) {
        calls.push({ input, request });
        return structuredClone(value);
      },
    }),
  });
  return { calls, verify };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    network: "sui:testnet" as const,
    packageId: PACKAGE,
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("pinned Sui evidence-anchor package verifier", () => {
  test("accepts only the exact first-version audited module", async () => {
    const subject = fixture();
    await expect(subject.verify(request())).resolves.toEqual({
      network: "testnet",
      moduleName: "evidence_anchor",
      moduleSha256: MATTERHORN_EVIDENCE_ANCHOR_MODULE_SHA256,
      verifiedAt: "2026-09-04T00:00:00.000Z",
    });
    expect(subject.calls).toHaveLength(1);
    expect(subject.calls[0]).toMatchObject({
      input: { endpoint: ENDPOINT, approvedAddresses: [PEER] },
      request: { packageId: PACKAGE },
    });
  });

  test("rejects package identity, upgrade, module-set, and bytecode substitution", async () => {
    const other = normalizeSuiObjectId("0x9");
    const cases: Array<[MatterhornSuiEvidenceAnchorPackageProjection, string]> = [
      [projection({ storageId: other }), "crypto_evidence_sui_anchor_package_identity_mismatch"],
      [projection({ originalId: other }), "crypto_evidence_sui_anchor_package_identity_mismatch"],
      [projection({ version: 2n }), "crypto_evidence_sui_anchor_package_identity_mismatch"],
      [projection({ modules: [] }), "crypto_evidence_sui_anchor_package_modules_mismatch"],
      [projection({ modules: [projection().modules[0]!, { name: "extra", contents: new Uint8Array([1]) }] }), "crypto_evidence_sui_anchor_package_modules_mismatch"],
      [projection({ modules: [{ name: "other", contents: projection().modules[0]!.contents }] }), "crypto_evidence_sui_anchor_package_modules_mismatch"],
      [projection({ modules: [{ name: "evidence_anchor", contents: null }] }), "crypto_evidence_sui_anchor_package_modules_mismatch"],
      [projection({ modules: [{ name: "evidence_anchor", contents: new Uint8Array([1, 2, 3]) }] }), "crypto_evidence_sui_anchor_package_bytecode_mismatch"],
    ];
    for (const [candidate, code] of cases) {
      await expect(fixture(candidate).verify(request())).rejects.toThrow(code);
    }
  });

  test("fails before package lookup for malformed input, mainnet, and abort", async () => {
    const subject = fixture();
    await expect(subject.verify(request({ packageId: "not-an-object-id" })))
      .rejects.toThrow("crypto_evidence_sui_anchor_package_invalid");
    await expect(subject.verify(request({ network: "sui:mainnet" })))
      .rejects.toThrow("crypto_evidence_sui_anchor_package_mainnet_disabled");
    const controller = new AbortController();
    controller.abort();
    await expect(subject.verify(request({ signal: controller.signal })))
      .rejects.toThrow("crypto_evidence_sui_anchor_package_aborted");
    expect(subject.calls).toHaveLength(0);
  });

  test("rejects unsafe endpoints and sanitizes transport failures", async () => {
    expect(() => createPinnedSuiEvidenceAnchorPackageVerifier({
      endpoint: new URL("https://user:pass@example.com"),
    })).toThrow("crypto_evidence_sui_anchor_package_endpoint_invalid");
    const verify = createPinnedSuiEvidenceAnchorPackageVerifier({
      endpoint: ENDPOINT,
      resolver: async () => [{ address: PEER, family: 4 }],
      createClient: () => ({
        async getPackage() {
          throw new Error("upstream internals and credentials");
        },
      }),
    });
    await expect(verify(request())).rejects.toThrow("crypto_evidence_sui_anchor_package_lookup_failed");
  });
});
