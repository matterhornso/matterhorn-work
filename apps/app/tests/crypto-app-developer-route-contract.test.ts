import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { createMatterhornCryptoDeveloperClient } from "@matterhorn-work/crypto-app-sdk";

function readAppSource(path: string): string {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

function readRepoSource(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

describe("invite-only crypto app developer route", () => {
  test("is lazy, account-gated, and absent from public trust paths", () => {
    const appRoot = readAppSource("shell/app-root.tsx");

    expect(appRoot).toContain('path="/developer/crypto-apps"');
    expect(appRoot).toContain('import("../domains/developer/crypto-app-developer-route")');
    expect(appRoot.indexOf("<DenSigninGate>")).toBeLessThan(appRoot.indexOf('path="/developer/crypto-apps"'));
    expect(appRoot).not.toContain('pathname === "/developer/crypto-apps"');
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
});
