import { describe, expect, test } from "bun:test";

import {
  createMatterhornCryptoIntegrationSetup,
  MatterhornCryptoIntegrationSetupError,
} from "./integration-setup.js";

const repositoryPath = "/Users/example/Matterhorn Work";

describe("Matterhorn crypto integration setup", () => {
  test("builds truthful client-only setup for every supported target", () => {
    const targets = [
      "matterhorn_skill",
      "codex",
      "claude_code",
      "generic_mcp",
      "cli",
      "http_api",
    ] as const;

    for (const target of targets) {
      const setup = createMatterhornCryptoIntegrationSetup({
        target,
        ...(target === "cli" || target === "http_api"
          ? {}
          : { repositoryPath }),
      });
      expect(setup.version).toBe("matterhorn.crypto-app-integration-setup.v1");
      expect(setup.authority.requiredEnvironment).toEqual([
        "MATTERHORN_WORK_TOKEN",
      ]);
      expect(setup.authority.hostApprovalAuthorityIncluded).toBe(false);
      expect(setup.authority.walletSubmissionAuthorityIncluded).toBe(false);
      expect(setup.authority.privateKeyAccepted).toBe(false);
      expect(setup.artifacts.length).toBeGreaterThan(0);
      expect(setup.steps.length).toBeGreaterThan(0);
      expect(setup.verification.checks.map((check) => check.id)).toEqual([
        "connection",
        "workspace_scope",
        "tool_scope",
        "wallet_boundary",
      ]);
      expect(setup.verification.checks[0]?.expected).toContain(
        setup.verification.firstAction,
      );

      const serialized = JSON.stringify(setup);
      if (target !== "cli" && target !== "http_api") {
        expect(serialized).toContain("MATTERHORN_WORK_MCP_PROFILE");
        expect(serialized).toContain("guarded_client");
      }
      expect(serialized).not.toContain("MATTERHORN_WORK_HOST_TOKEN");
      expect(serialized).not.toContain("OPENWORK_HOST_TOKEN");
      expect(serialized).not.toContain("npx");
      expect(serialized).not.toContain("submit capability");
    }
  });

  test("describes a deterministic verification boundary for each client", () => {
    const codex = createMatterhornCryptoIntegrationSetup({
      target: "codex",
      repositoryPath,
    });
    const cli = createMatterhornCryptoIntegrationSetup({ target: "cli" });
    const http = createMatterhornCryptoIntegrationSetup({ target: "http_api" });

    expect(codex.verification.firstAction).toBe("matterhorn_status");
    expect(cli.verification.firstAction).toBe("matterhorn-work doctor");
    expect(http.verification.firstAction).toBe("GET /status");
    for (const setup of [codex, cli, http]) {
      expect(setup.verification.expectedBoundary).toBe(
        "Client-scoped workspace access only; wallet approval remains separate.",
      );
      expect(setup.verification.checks[3]).toEqual({
        id: "wallet_boundary",
        title: "Wallet control stays separate",
        expected:
          "No signing, submission, relay, or broadcast authority should be available.",
      });
    }
  });

  test("uses a trusted checkout entrypoint and escapes target-specific config", () => {
    const codex = createMatterhornCryptoIntegrationSetup({
      target: "codex",
      repositoryPath,
    });
    expect(codex.distribution).toEqual({
      mode: "local_checkout",
      npmPublished: false,
      entrypoint: `${repositoryPath}/packages/matterhorn-work-mcp/index.mjs`,
    });
    expect(codex.artifacts[0]?.content).toContain(
      "[mcp_servers.matterhorn-work]",
    );
    expect(codex.artifacts[0]?.content).toContain("MATTERHORN_WORK_TOKEN");
    expect(codex.artifacts[0]?.content).toContain(
      'MATTERHORN_WORK_MCP_PROFILE = "guarded_client"',
    );

    const claude = createMatterhornCryptoIntegrationSetup({
      target: "claude_code",
      repositoryPath: "/Users/o'hara/Matterhorn Work",
      serverOrigin: "https://control.example",
    });
    expect(claude.artifacts[0]?.content).toContain(
      "claude mcp add --transport stdio",
    );
    expect(claude.artifacts[0]?.content).toContain(
      "'/Users/o'\"'\"'hara/Matterhorn Work/packages/matterhorn-work-mcp/index.mjs'",
    );
    expect(claude.artifacts[0]?.content).toContain(
      "MATTERHORN_WORK_MCP_PROFILE='guarded_client'",
    );
    expect(claude.serverOrigin).toBe("https://control.example");

    const generic = createMatterhornCryptoIntegrationSetup({
      target: "generic_mcp",
      repositoryPath,
    });
    expect(generic.artifacts[0]?.content).toContain(
      '"MATTERHORN_WORK_MCP_PROFILE": "guarded_client"',
    );
  });

  test("does not serialize unknown credential values supplied by JavaScript callers", () => {
    const secret = "sk-do-not-serialize-this-value";
    const setup = createMatterhornCryptoIntegrationSetup({
      target: "generic_mcp",
      repositoryPath,
      token: secret,
      hostToken: secret,
      privateKey: secret,
    } as never);
    expect(JSON.stringify(setup)).not.toContain(secret);
  });

  test("rejects unsafe origins and repository paths", () => {
    for (const serverOrigin of [
      "http://control.example",
      "https://user:password@control.example",
      "https://control.example/path",
      "https://control.example?token=secret",
      "javascript:alert(1)",
      "https://control.example\nmalicious",
    ]) {
      expect(() =>
        createMatterhornCryptoIntegrationSetup({
          target: "http_api",
          serverOrigin,
        }),
      ).toThrowError(
        expect.objectContaining({ code: "integration_server_origin_invalid" }),
      );
    }

    for (const invalidPath of [
      "relative/path",
      "/trusted/../other",
      "/trusted\nother",
      "C:relative",
    ]) {
      expect(() =>
        createMatterhornCryptoIntegrationSetup({
          target: "codex",
          repositoryPath: invalidPath,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: "integration_repository_path_invalid",
        }),
      );
    }
    expect(() =>
      createMatterhornCryptoIntegrationSetup({ target: "codex" }),
    ).toThrowError(
      expect.objectContaining({ code: "integration_repository_path_required" }),
    );
  });

  test("rejects unknown runtime targets", () => {
    expect(() =>
      createMatterhornCryptoIntegrationSetup({
        target: "autonomous_wallet",
        repositoryPath,
      } as never),
    ).toThrowError(MatterhornCryptoIntegrationSetupError);
  });
});
