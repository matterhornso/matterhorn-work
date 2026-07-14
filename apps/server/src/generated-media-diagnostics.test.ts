import { describe, expect, test } from "bun:test";
import {
  buildGeneratedMediaDiagnostics,
  type SuiPackageVerifier,
} from "./generated-media-diagnostics.js";

const productionSuiIds = {
  nft: `0x${"0123456789abcdef".repeat(4)}`,
  kiosk: `0x${"abcdef0123456789".repeat(4)}`,
  transferPolicy: `0x${"fedcba9876543210".repeat(4)}`,
};

function generatedMediaEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    MATTERHORN_IMAGE_PROVIDER: "openai",
    OPENAI_API_KEY: "sk-test-generated-media-readiness",
    MATTERHORN_WALRUS_PUBLISHER_URL: "https://publisher.walrus.example.com",
    MATTERHORN_WALRUS_RELAY_URL: "https://relay.walrus.example.com",
    MATTERHORN_WALRUS_STORAGE_EPOCHS: "3",
    MATTERHORN_SUI_NETWORK: "sui-testnet",
    MATTERHORN_SUI_NFT_PACKAGE_ID: productionSuiIds.nft,
    MATTERHORN_SUI_NFT_MODULE_NAME: "matterhorn_nft",
    MATTERHORN_SUI_KIOSK_PACKAGE_ID: productionSuiIds.kiosk,
    MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID: productionSuiIds.transferPolicy,
    ...overrides,
  };
}

const successfulProbeFetch = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;

function packageVerifier(
  status: "deployed" | "not_found" | "not_package",
  calls: string[] = [],
): SuiPackageVerifier {
  return {
    async verifyPackage(input) {
      calls.push(input.packageId);
      return { status };
    },
  };
}

describe("generated media production readiness", () => {
  test("accepts public HTTPS endpoints and Sui packages verified on the selected network", async () => {
    const packageChecks: string[] = [];
    const diagnostics = await buildGeneratedMediaDiagnostics({
      workspaceId: "ws_production_candidate",
      env: generatedMediaEnv(),
      fetchImpl: successfulProbeFetch,
      suiPackageVerifier: packageVerifier("deployed", packageChecks),
      now: () => new Date("2026-07-13T00:00:00.000Z"),
    });

    expect(diagnostics.status).toBe("pass");
    expect(diagnostics.productionSmokePlan).toMatchObject({
      mode: "production_candidate",
      canRunEndToEnd: true,
      blockers: [],
    });
    expect(diagnostics.productionSmokePlan.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "walrus_public_upload", status: "manual" }),
      expect.objectContaining({ id: "sui_wallet_mint", status: "manual" }),
      expect.objectContaining({ id: "sui_kiosk_listing", status: "manual" }),
    ]));
    expect(JSON.stringify(diagnostics)).not.toContain("publisher.walrus.example.com");
    expect(JSON.stringify(diagnostics)).not.toContain(productionSuiIds.nft);
    expect(packageChecks.sort()).toEqual(Object.values(productionSuiIds).sort());
  });

  test("keeps local probes usable while blocking loopback endpoints and smoke package ids from production", async () => {
    const packageChecks: string[] = [];
    const diagnostics = await buildGeneratedMediaDiagnostics({
      workspaceId: "ws_local_smoke",
      env: generatedMediaEnv({
        MATTERHORN_WALRUS_PUBLISHER_URL: "http://127.0.0.1:62991",
        MATTERHORN_WALRUS_RELAY_URL: "http://localhost:62991",
        MATTERHORN_SUI_NFT_PACKAGE_ID: `0x${"1".repeat(64)}`,
        MATTERHORN_SUI_KIOSK_PACKAGE_ID: `0x${"2".repeat(64)}`,
        MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID: `0x${"3".repeat(64)}`,
      }),
      fetchImpl: successfulProbeFetch,
      suiPackageVerifier: packageVerifier("deployed", packageChecks),
    });

    expect(diagnostics.status).toBe("pass");
    expect(diagnostics.checks.every((check) => check.status === "pass")).toBe(true);
    expect(diagnostics.productionSmokePlan).toMatchObject({
      mode: "needs_setup",
      canRunEndToEnd: false,
    });
    expect(diagnostics.productionSmokePlan.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ envVar: "MATTERHORN_WALRUS_PUBLISHER_URL", status: "invalid" }),
      expect.objectContaining({ envVar: "MATTERHORN_WALRUS_RELAY_URL", status: "invalid" }),
      expect.objectContaining({ envVar: "MATTERHORN_SUI_NFT_PACKAGE_ID", status: "invalid" }),
      expect.objectContaining({ envVar: "MATTERHORN_SUI_KIOSK_PACKAGE_ID", status: "invalid" }),
      expect.objectContaining({ envVar: "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID", status: "invalid" }),
    ]));
    expect(packageChecks).toEqual([]);
  });

  test("blocks configured ids that resolve to ordinary Sui objects", async () => {
    const diagnostics = await buildGeneratedMediaDiagnostics({
      workspaceId: "ws_not_packages",
      env: generatedMediaEnv(),
      fetchImpl: successfulProbeFetch,
      suiPackageVerifier: packageVerifier("not_package"),
    });

    expect(diagnostics.status).toBe("fail");
    expect(diagnostics.productionSmokePlan).toMatchObject({
      mode: "needs_setup",
      canRunEndToEnd: false,
    });
    expect(diagnostics.productionSmokePlan.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        envVar: "MATTERHORN_SUI_NFT_PACKAGE_ID",
        description: expect.stringContaining("not a Move package"),
      }),
      expect.objectContaining({ envVar: "MATTERHORN_SUI_KIOSK_PACKAGE_ID" }),
      expect.objectContaining({ envVar: "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID" }),
    ]));
  });

  test("reports unavailable chain verification without leaking ids or verifier errors", async () => {
    const diagnostics = await buildGeneratedMediaDiagnostics({
      workspaceId: "ws_chain_unavailable",
      env: generatedMediaEnv(),
      fetchImpl: successfulProbeFetch,
      suiPackageVerifier: {
        async verifyPackage(input) {
          throw new Error(`secret upstream failure for ${input.packageId}`);
        },
      },
    });

    expect(diagnostics.status).toBe("warning");
    expect(diagnostics.productionSmokePlan).toMatchObject({
      mode: "needs_setup",
      canRunEndToEnd: false,
    });
    expect(diagnostics.checks.find((check) => check.id === "sui_nft_minting")).toMatchObject({
      status: "warning",
      details: {
        packageDeploymentStatus: "unavailable",
        packageDeploymentVerified: false,
      },
    });
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain("secret upstream failure");
    expect(serialized).not.toContain(productionSuiIds.nft);
  });

  test("bounds package verification even when an injected reader ignores abort signals", async () => {
    const startedAt = Date.now();
    const diagnostics = await buildGeneratedMediaDiagnostics({
      workspaceId: "ws_chain_timeout",
      env: generatedMediaEnv(),
      fetchImpl: successfulProbeFetch,
      timeoutMs: 20,
      suiPackageVerifier: {
        verifyPackage: async () => new Promise(() => {}),
      },
    });

    expect(Date.now() - startedAt).toBeLessThan(250);
    expect(diagnostics.status).toBe("warning");
    expect(diagnostics.productionSmokePlan.canRunEndToEnd).toBe(false);
    expect(diagnostics.productionSmokePlan.blockers).toHaveLength(3);
  });
});
