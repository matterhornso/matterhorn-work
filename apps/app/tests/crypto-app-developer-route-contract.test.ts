import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createMatterhornCryptoDeveloperClient } from "@matterhorn-work/crypto-app-sdk";
import { DeveloperQuickstartSetup } from "../src/react-app/domains/developer/developer-quickstart-setup";

function readAppSource(path: string): string {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

function readRepoSource(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

describe("invite-only crypto app developer route", () => {
  test("is lazy, account-gated, and absent from public trust paths", () => {
    const appRoot = readAppSource("shell/app-root.tsx");
    const viteConfig = readRepoSource("apps/app/vite.config.ts");
    const vercel = JSON.parse(readRepoSource("vercel.json")) as {
      rewrites: Array<{ source: string; destination: string; missing?: Array<{ key: string; value: string }> }>;
    };

    expect(appRoot).toContain('path="/developer/crypto-apps"');
    expect(appRoot).toContain('import("../domains/developer/crypto-app-developer-route")');
    expect(appRoot).toContain("capturePendingDeveloperInviteFromBrowser");
    expect(appRoot).toContain("hasPendingDeveloperInvite");
    expect(appRoot).toContain('? "/developer/crypto-apps"');
    expect(appRoot.indexOf("<DenSigninGate>")).toBeLessThan(appRoot.indexOf('path="/developer/crypto-apps"'));
    expect(appRoot).not.toContain('pathname === "/developer/crypto-apps"');
    expect(viteConfig).toContain('"/developer": sameOriginWorkspaceProxy');
    expect(vercel.rewrites).toContainEqual({
      source: "/developer/:path*",
      missing: [{ type: "header", key: "accept", value: ".*text/html.*" }],
      destination: "/api/matterhorn-proxy?__matterhorn_path=/developer/:path*",
    });
  });

  test("exposes one guided testnet certification step without custody controls", () => {
    const route = readAppSource("domains/developer/crypto-app-developer-route.tsx");

    expect(route).toContain("Testnet only");
    expect(route).toContain("Public keys only");
    expect(route).toContain("Connected wallet signs");
    expect(route).toContain("Independent runtime probes");
    expect(route).toContain("Mainnet</dt><dd");
    expect(route).toContain("Unavailable</dd>");
    expect(route).toContain("Do not paste a private key");
    expect(route).toContain("Private keys and recovery phrases are never accepted");
    expect(route).toContain("Latest revision findings");
    expect(route).toContain("Submit a new immutable revision");
    expect(route).toContain("Runtime review needs a new revision");
    expect(route).toContain("Testnet review passed");
    expect(route).toContain("This does not list or promote the app");
    expect(route).toContain("No mainnet or wallet authority has been granted");
    expect(route).toContain('role="alert"');
    expect(route).toContain('role="status"');
    expect(route).toContain("motion-reduce:animate-none");
    expect(route).not.toContain('type="password"');
    expect(route).not.toContain("signTransaction");
    expect(route).not.toContain("executeTransaction");
  });

  test("uses only the bounded account-session developer client", () => {
    const clientSource = readRepoSource("packages/crypto-app-sdk/src/developer-client.ts");
    const client = createMatterhornCryptoDeveloperClient({
      fetch: async () => new Response(JSON.stringify({}), { status: 500 }),
    });

    expect(clientSource).toContain('credentials: "include"');
    expect(clientSource).toContain('redirect: "error"');
    expect(clientSource).not.toContain('headers.set("Authorization"');
    expect(clientSource).not.toContain("MATTERHORN_WORK_HOST_TOKEN");
    expect(clientSource).not.toContain("MATTERHORN_CAPABILITY_SIGNING_SECRET");
    expect(Object.keys(client).sort()).toEqual([
      "enroll",
      "getProfile",
      "getStatus",
      "listSubmissions",
      "registerPublisherKey",
      "requestTestnetCertification",
      "submitTestnetManifest",
    ]);
  });

  test("generates client-only setup for enrolled developers without sending local paths", () => {
    const route = readAppSource("domains/developer/crypto-app-developer-route.tsx");
    const setup = readAppSource("domains/developer/developer-integration-setup.tsx");
    const quickstart = readAppSource("domains/developer/developer-quickstart-setup.tsx");

    expect(route).toContain("snapshot.status.enrolled");
    expect(route).toContain("capturePendingDeveloperInviteFromBrowser");
    expect(route).toContain("takePendingDeveloperInvite");
    expect(route).toContain("Developer invite ready");
    expect(route).toContain("The one-time token was removed from the address bar");
    expect(route).toContain("Use a different invite");
    expect(route).not.toContain("localStorage");
    expect(route).not.toContain("sessionStorage");
    expect(route).toContain("<DeveloperQuickstartSetup");
    expect(route).toContain("<DeveloperIntegrationSetup");
    expect(route).toContain("Sui, Hyperliquid, or Bittensor testnet");
    expect(quickstart).toContain("createMatterhornCryptoAppQuickstartCommand");
    expect(quickstart).toContain("Create a testnet starter");
    expect(quickstart).toContain("Copy command");
    expect(quickstart).toContain("The command refuses to overwrite an existing folder");
    expect(quickstart).toContain("No credentials or keys");
    expect(quickstart).toContain("No wallet access");
    expect(quickstart).toContain("No certification granted");
    expect(quickstart).toContain('aria-live="polite"');
    expect(quickstart).toContain('role="alert"');
    expect(quickstart).not.toContain("MATTERHORN_WORK_HOST_TOKEN");
    expect(quickstart).not.toContain("privateKey");
    expect(quickstart).not.toContain("signTransaction");
    expect(quickstart).not.toContain("executeTransaction");
    expect(quickstart).not.toContain("fetch(");
    expect(setup).toContain("createMatterhornCryptoIntegrationSetup");
    expect(setup).toContain("Connect your development tool");
    expect(setup).toContain("Check the connection");
    expect(setup).toContain("verification.checks.map");
    expect(setup).toContain("Testnet certification is a separate review");
    expect(setup).toContain('className="min-h-11"');
    expect(setup).toContain("Codex");
    expect(setup).toContain("Claude Code");
    expect(setup).toContain("Agent skill");
    expect(setup).toContain("Other MCP client");
    expect(setup).toContain("Command line");
    expect(setup).toContain("HTTP API");
    expect(setup).toContain("Nothing is sent to Matterhorn.");
    expect(setup).toContain("No wallet submission");
    expect(setup).not.toContain("MATTERHORN_WORK_HOST_TOKEN");
    expect(setup).not.toContain("signTransaction");
    expect(setup).not.toContain("executeTransaction");
    expect(setup).not.toContain("fetch(");
    expect(route.match(/<h1/g)).toHaveLength(1);
    expect(route).toContain('className="-ml-2 mb-6 min-h-11"');
    expect(route).toContain('className="min-h-11" disabled={busy}');
  });

  test("renders one calm local-start path before any network or wallet authority", () => {
    const html = renderToStaticMarkup(React.createElement(DeveloperQuickstartSetup));

    expect(html).toContain("Create a testnet starter");
    expect(html).toContain("Sui testnet");
    expect(html).toContain("your-company.sui-testnet");
    expect(html).toContain("Add your public test adapter URL to generate the command");
    expect(html).toContain("Copy command");
    expect(html).toContain("disabled");
    expect(html).toContain("No credentials or keys");
    expect(html).toContain("No wallet access");
    expect(html).toContain('aria-label="Test network"');
    expect(html).toContain('aria-label="Quickstart safety"');
    expect(html).not.toContain("Private key");
    expect(html).not.toContain("Mainnet");
  });
});
