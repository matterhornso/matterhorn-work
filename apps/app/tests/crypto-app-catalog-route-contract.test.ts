import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string): string {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

describe("invite-only crypto app catalog route", () => {
  test("is lazy, account-gated and workspace scoped", () => {
    const appRoot = readAppSource("react-app/shell/app-root.tsx");

    expect(appRoot).toContain('path="/workspace/:workspaceId/crypto-apps"');
    expect(appRoot).toContain('path="/workspace/:workspaceId/evidence-proofs"');
    expect(appRoot).toContain('import("../domains/crypto-apps/crypto-app-catalog-route")');
    expect(appRoot).toContain('import("../domains/crypto-apps/crypto-evidence-route")');
    expect(appRoot.indexOf("<DenSigninGate>")).toBeLessThan(appRoot.indexOf('path="/workspace/:workspaceId/crypto-apps"'));
    expect(appRoot.indexOf("<DenSigninGate>")).toBeLessThan(appRoot.indexOf('path="/workspace/:workspaceId/evidence-proofs"'));
    expect(appRoot).not.toContain('pathname === "/workspace/:workspaceId/crypto-apps"');
    expect(appRoot).not.toContain('pathname === "/workspace/:workspaceId/evidence-proofs"');
  });

  test("keeps encrypted evidence publication explicit, testnet-only and redacted", () => {
    const catalog = readAppSource("react-app/domains/crypto-apps/crypto-app-catalog-route.tsx");
    const route = readAppSource("react-app/domains/crypto-apps/crypto-evidence-route.tsx");
    const client = readAppSource("app/lib/matterhorn-server.ts");

    expect(catalog).toContain("Evidence proofs");
    expect(route).toContain("Ciphertext only");
    expect(route).toContain("Owner-scoped access");
    expect(route).toContain("Nothing stored automatically");
    expect(route).toContain("No wallet signature");
    expect(route).toContain("client.listCryptoEvidence(workspaceId)");
    expect(route).toContain("client.publishCryptoEvidence(workspaceId, item.evidenceId, item.revision)");
    expect(route).toContain("client.verifyCryptoEvidence(workspaceId, item.evidenceId)");
    expect(route).toContain("Only encrypted bytes go to the public Walrus test network");
    expect(route).toContain("I understand that the encrypted public bytes may remain.");
    expect(client).toContain("/crypto-evidence?limit=");
    expect(client).toContain("/crypto-evidence/${encodeURIComponent(evidenceId)}/publish");
    expect(client).toContain("/crypto-evidence/${encodeURIComponent(evidenceId)}/verify");
    expect(client).toContain('network: "testnet"');
    expect(client).toContain("acknowledgePublicCiphertext: true");
    expect(route).not.toContain("privateKey");
    expect(route).not.toContain("seedPhrase");
    expect(route).not.toContain("signTransaction");
    expect(route).not.toContain("executeTransaction");
  });

  test("keeps the catalog testnet-only with explicit wallet and credential boundaries", () => {
    const route = readAppSource("react-app/domains/crypto-apps/crypto-app-catalog-route.tsx");

    expect(route).toContain('client.listCryptoApps({ environment: "testnet" })');
    expect(route).toContain("Testing networks only");
    expect(route).toContain("Never paste keys in chat");
    expect(route).toContain("Your wallet approves every transaction");
    expect(route).toContain("Research only");
    expect(route).toContain("Research + wallet previews");
    expect(route).toContain("Your connected wallet still signs and submits");
    expect(route).toContain("Matterhorn will never ask you to paste it into chat");
    expect(route).toContain("Revocation is permanent");
    expect(route).toContain('role="alert"');
    expect(route).toContain('role="status"');
    expect(route).toContain("motion-reduce:animate-none");
    expect(route).not.toContain('type="password"');
    expect(route).not.toContain("privateKey");
    expect(route).not.toContain("seedPhrase");
    expect(route).not.toContain("signTransaction");
    expect(route).not.toContain("executeTransaction");
  });

  test("keeps catalog decisions understandable while exposing complete safe details", () => {
    const route = readAppSource("react-app/domains/crypto-apps/crypto-app-catalog-route.tsx");

    expect(route).toContain("Apps for your coworkers");
    expect(route).toContain("Search apps or tasks");
    expect(route).toContain("Any protocol");
    expect(route).toContain("Any network");
    expect(route).toContain('item.chainId === network');
    expect(route).toContain("What this app can do");
    expect(route).toContain("Uses approved private data");
    expect(route).toContain("Your wallet submits");
    expect(route).toContain("Measured per run and shown in its receipt");
    expect(route).toContain("Connection history");
    expect(route).toContain("How this provider handles data");
    expect(route).toContain("Check service status");
    expect(route).not.toContain("manifestHash}");
    expect(route).not.toContain("reportHash}");
    expect(route).not.toContain("runtimeReportHash}");
  });

  test("uses account-token catalog methods without operator authority", () => {
    const client = readAppSource("app/lib/matterhorn-server.ts");
    const catalogMethods = client.slice(
      client.indexOf("listCryptoApps:"),
      client.indexOf("backendModels:"),
    );

    expect(catalogMethods).toContain('`/crypto-apps${suffix}`');
    expect(catalogMethods).toContain("/crypto-app-connections");
    expect(catalogMethods).toContain("method: \"POST\"");
    expect(catalogMethods).toContain("method: \"PATCH\"");
    expect(catalogMethods).toContain("method: \"DELETE\"");
    expect(catalogMethods).not.toContain("hostToken");
    expect(catalogMethods).not.toContain("/operator/");
    expect(catalogMethods).not.toContain("credential:");
  });

  test("is discoverable from managed tools without exposing operator controls", () => {
    const settingsRoute = readAppSource("react-app/shell/settings-route.tsx");
    const mcpView = readAppSource("react-app/domains/settings/pages/mcp-view.tsx");
    const managedTools = readAppSource("react-app/domains/settings/pages/hosted-mcp-summary.tsx");

    expect(settingsRoute).toContain("onBrowseCryptoApps={selectedWorkspaceId");
    expect(settingsRoute).toContain("/crypto-apps`");
    expect(mcpView).toContain("onBrowseCryptoApps={props.onBrowseCryptoApps}");
    expect(managedTools).toContain("Browse certified crypto apps");
    expect(managedTools).toContain("Credentials never belong in chat");
    expect(managedTools).toContain("connected wallet remains the only signer");
    expect(managedTools).not.toContain("Promote certification");
    expect(managedTools).not.toContain("host token");
  });

  test("grants only the user-selected certified actions and testnet networks", () => {
    const route = readAppSource("react-app/domains/crypto-apps/crypto-app-catalog-route.tsx");

    expect(route).toContain('action.access === "read" || action.access === "watch" || scope === "wallet_previews"');
    expect(route).toContain('network.environment === "testnet"');
    expect(route).toContain("grantedActionIds");
    expect(route).toContain("grantedScopes");
    expect(route).toContain("grantedNetworks");
    expect(route).toContain('app.authentication.type === "none"');
  });
});
