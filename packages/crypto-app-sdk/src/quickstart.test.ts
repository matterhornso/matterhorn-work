import { describe, expect, test } from "bun:test";

import {
  buildCryptoAppSigningRequest,
} from "./index.js";
import {
  createMatterhornCryptoAppQuickstart,
  MatterhornCryptoAppQuickstartError,
} from "./quickstart.js";

const endpoints = {
  sui: "https://sui-adapter.example/v1",
  hyperliquid: "https://hyperliquid-adapter.example/v1",
  bittensor: "https://bittensor-adapter.example/v1",
} as const;

describe("Matterhorn crypto app quickstart", () => {
  test("builds deterministic, validated, testnet-only starters", () => {
    for (const protocol of ["sui", "hyperliquid", "bittensor"] as const) {
      const options = {
        protocol,
        appId: `acme.${protocol}-testnet`,
        publisherId: "acme",
        endpoint: endpoints[protocol],
      };
      const first = createMatterhornCryptoAppQuickstart(options);
      const second = createMatterhornCryptoAppQuickstart(options);

      expect(first).toEqual(second);
      expect(first.version).toBe("matterhorn.crypto-app-quickstart.v1");
      expect(first.network.endsWith("testnet") || first.network.endsWith("test"))
        .toBe(true);
      expect(first.validation).toEqual({
        passed: true,
        manifest: "passed",
        schemas: "passed",
        fixture: "passed",
        certificationAuthority: "none",
        runtimeProbesRequired: true,
      });
      expect(first.safety).toEqual({
        testnetOnly: true,
        credentialsIncluded: false,
        walletAuthorityIncluded: false,
        signingKeyIncluded: false,
        certificationGranted: false,
      });
      expect(first.manifest.actions).toHaveLength(1);
      expect(first.manifest.actions[0]).toMatchObject({
        access: "read",
        simulationRequired: false,
        walletSubmissionOnly: true,
        agentMaySubmit: false,
      });
      expect(first.artifacts.map((artifact) => artifact.path)).toEqual([
        "manifest.unsigned.json",
        "signing-request.json",
        "fixture-pack.json",
        "adapter.example.ts",
        "validation-report.json",
        "README.md",
      ]);
      const signingArtifact = first.artifacts.find(
        (artifact) => artifact.path === "signing-request.json",
      );
      expect(JSON.parse(signingArtifact?.content ?? "null")).toEqual(
        buildCryptoAppSigningRequest(first.manifest),
      );
    }
  });

  test("contains no credential, private signing material, or live authority", () => {
    const quickstart = createMatterhornCryptoAppQuickstart({
      protocol: "sui",
      appId: "acme.sui-testnet",
      publisherId: "acme",
      endpoint: endpoints.sui,
    });
    const serialized = JSON.stringify(quickstart);
    expect(serialized).not.toContain("BEGIN PRIVATE KEY");
    expect(serialized).not.toContain("MATTERHORN_WORK_HOST_TOKEN");
    expect(serialized).not.toContain("sui:mainnet");
    expect(serialized).not.toContain("ExecuteTransaction");
    expect(serialized).not.toContain("agentMaySubmit\":true");
    expect(quickstart.artifacts.find((artifact) => artifact.path === "signing-request.json")?.content)
      .not.toContain("signature\"");
  });

  test("fails closed for unsupported protocols and invalid manifest fields", () => {
    expect(() => createMatterhornCryptoAppQuickstart({
      protocol: "ethereum" as never,
      appId: "acme.ethereum",
      publisherId: "acme",
      endpoint: "https://adapter.example/v1",
    })).toThrowError(MatterhornCryptoAppQuickstartError);

    for (const options of [
      {
        protocol: "sui" as const,
        appId: "x",
        publisherId: "acme",
        endpoint: endpoints.sui,
      },
      {
        protocol: "sui" as const,
        appId: "acme.sui-testnet",
        publisherId: "acme",
        endpoint: "http://localhost:8787",
      },
      {
        protocol: "sui" as const,
        appId: "acme.sui-testnet",
        publisherId: "acme",
        endpoint: "https://user:password@adapter.example/v1",
      },
    ]) {
      expect(() => createMatterhornCryptoAppQuickstart(options)).toThrowError(
        expect.objectContaining({ code: "quickstart_manifest_invalid" }),
      );
    }
  });

  test("does not serialize unknown secret-shaped caller fields", () => {
    const secret = "sk-must-not-enter-quickstart";
    const quickstart = createMatterhornCryptoAppQuickstart({
      protocol: "bittensor",
      appId: "acme.bittensor-testnet",
      publisherId: "acme",
      endpoint: endpoints.bittensor,
      apiKey: secret,
      privateKey: secret,
    } as never);
    expect(JSON.stringify(quickstart)).not.toContain(secret);
  });
});
