import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, test } from "bun:test";

import {
  createMatterhornHyperliquidTestnetFixturePack,
  createMatterhornSuiTestnetFixturePack,
  validateMatterhornCryptoProtocolFixturePack,
} from "./protocol-fixtures.js";
import {
  attachCryptoAppManifestSignature,
  buildCryptoAppSigningRequest,
  type MatterhornUnsignedCryptoAppManifest,
} from "./index.js";

function closed(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", additionalProperties: false, properties, required };
}

function schemaFor(value: unknown): Record<string, unknown> {
  if (value === null) return { type: "null" };
  if (typeof value === "string") return { type: "string" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  if (Array.isArray(value)) return { type: "array", items: schemaFor(value[0]) };
  const entries = Object.entries(value as Record<string, unknown>);
  return closed(Object.fromEntries(entries.map(([key, item]) => [key, schemaFor(item)])), entries.map(([key]) => key));
}

function manifestFor(pack: ReturnType<typeof createMatterhornSuiTestnetFixturePack>): MatterhornUnsignedCryptoAppManifest {
  const actions = pack.fixtures.map((fixture) => ({
    id: fixture.actionId,
    title: fixture.actionId,
    description: "Inert fixture schema",
    access: fixture.actionId.includes("preview") ? "prepare" as const : "read" as const,
    risk: fixture.actionId.includes("preview") ? "financial_high" as const : "informational" as const,
    inputSchema: schemaFor(fixture.input),
    outputProjectionSchema: schemaFor(fixture.output),
    requiredScopes: [],
    requiresFreshness: true,
    freshnessMaxAgeMs: 10_000,
    timeoutMs: 10_000,
    simulationRequired: fixture.actionId.includes("preview"),
    walletSubmissionOnly: true as const,
    agentMaySubmit: false as const,
  }));
  return {
    appId: "fixture.app",
    displayName: "Fixture App",
    description: "Fixture-only testnet app",
    manifestRevision: "revision-1",
    publisher: { id: "fixture.publisher", keyId: "key-1", algorithm: "ed25519" },
    transport: { kind: "matterhorn_sdk", endpoint: "https://fixture.example/v1" },
    authentication: { type: "none", scopes: [] },
    networks: [{ protocol: pack.protocol, chainId: pack.network, environment: "testnet" }],
    actions,
    support: {
      privacyPolicyUrl: "https://fixture.example/privacy",
      statusUrl: null,
      securityContact: "security@fixture.example",
    },
  };
}

function signManifest(draft: MatterhornUnsignedCryptoAppManifest) {
  const keys = generateKeyPairSync("ed25519");
  const signing = buildCryptoAppSigningRequest(draft);
  return attachCryptoAppManifestSignature(
    draft,
    sign(null, Buffer.from(signing.canonicalPayload), keys.privateKey).toString("base64url"),
  );
}

describe("Matterhorn protocol fixture packs", () => {
  test("are deterministic, testnet-only, and never contain signing material", () => {
    const packs = [createMatterhornSuiTestnetFixturePack(), createMatterhornHyperliquidTestnetFixturePack()];
    expect(packs.map((pack) => pack.network)).toEqual(["sui:testnet", "hyperliquid:testnet"]);
    expect(createMatterhornSuiTestnetFixturePack()).toEqual(createMatterhornSuiTestnetFixturePack());
    expect(JSON.stringify(packs)).not.toMatch(/private.?key|seed.?phrase|signature/i);
  });

  test("fails a wrong network and reports schema mismatches without runtime execution", () => {
    const pack = createMatterhornSuiTestnetFixturePack();
    const manifest = signManifest(manifestFor(pack));
    const result = validateMatterhornCryptoProtocolFixturePack(manifest, pack);
    expect(result.passed).toBe(true);
    expect(result.fixtures.every((fixture) => fixture.output.value !== null)).toBe(true);

    const wrongNetwork = structuredClone(manifest);
    wrongNetwork.networks[0]!.chainId = "sui:mainnet";
    expect(validateMatterhornCryptoProtocolFixturePack(wrongNetwork, pack)).toMatchObject({
      passed: false,
      networkDeclared: false,
    });

    const injected = createMatterhornSuiTestnetFixturePack();
    (injected.fixtures[0]!.input as Record<string, unknown>).submit = true;
    const rejected = validateMatterhornCryptoProtocolFixturePack(manifest, injected);
    expect(rejected.passed).toBe(false);
    expect(rejected.fixtures[0]?.input.issues).toContain("$.submit:value_unknown_property");
  });
});
