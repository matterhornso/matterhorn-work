import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  readSessionPanelFromSearch,
  resolveSessionPanelNavigation,
} from "../src/react-app/shell/session-panel-route";
import { buildCoworkerAppConnectionDraft } from "../src/react-app/domains/coworkers/coworker-app-connection";
import { resolveCoworkerNextStep } from "../src/react-app/domains/coworkers/coworkers-panel";
import { suggestCoworkerTemplate } from "../src/react-app/domains/session/chat/workspace-coworker-suggestion";

function appSource(path: string): string {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

describe("chat-operated coworker UI", () => {
  test("makes coworkers a reversible workspace destination", () => {
    expect(readSessionPanelFromSearch("?panel=coworkers")).toBe("coworkers");
    expect(resolveSessionPanelNavigation("", "coworkers")).toEqual({ search: "?panel=coworkers", replace: false });
    expect(resolveSessionPanelNavigation("?panel=coworkers", null)).toEqual({ search: "", replace: true });
  });

  test("lets a first-time user describe one outcome and confirm a suggested coworker from Home", () => {
    const home = appSource("react-app/domains/session/chat/session-page.tsx");
    const start = appSource("react-app/domains/session/chat/workspace-coworker-start.tsx");
    const panel = appSource("react-app/domains/coworkers/coworkers-panel.tsx");
    expect(start).toContain("What should Matterhorn help you do?");
    expect(start).toContain("Describe the outcome in one sentence.");
    expect(start).toContain('role="group" aria-label="Coworker role"');
    expect(start).toContain("aria-pressed={selected}");
    expect(start).toContain("Suggested");
    expect(start).toContain('type="submit"');
    expect(start).toContain("Continue");
    expect(start).toContain("Research markets");
    expect(start).toContain("Watch risk");
    expect(start).toContain("Prepare a wallet review");
    expect(start).toContain("Track balances");
    expect(start).toContain("It cannot see private keys or send funds on its own.");
    expect(home).toContain("setHomeCoworkerStart(request)");
    expect(home).toContain('setCurrentSidePanel("coworkers")');
    expect(panel).toContain("coworker.role === templateId");
    expect(panel).toContain("void createCoworker(templateId)");
    expect(panel).toContain("setPendingOutcome(props.initialOutcome?.trim() ?? \"\")");
    expect(panel).toContain('pendingOutcome || "Ask what outcome I want, then help me take the safest next step."');
    expect(panel).toContain("Your outcome");
  });

  test("suggests a coworker deterministically without sending the outcome anywhere", () => {
    expect(suggestCoworkerTemplate("Compare validators and cite current public evidence")).toBe("market_analyst");
    expect(suggestCoworkerTemplate("Alert me when liquidation risk rises")).toBe("risk_monitor");
    expect(suggestCoworkerTemplate("Prepare a Sui transfer for wallet review")).toBe("transaction_coordinator");
    expect(suggestCoworkerTemplate("Track my balances and holdings")).toBe("treasury_coworker");
  });

  test("explains automatic, approval-required, and impossible actions in plain language", () => {
    const panel = appSource("react-app/domains/coworkers/coworkers-panel.tsx");
    expect(panel).toContain("Can do automatically");
    expect(panel).toContain("Stops for your approval");
    expect(panel).toContain("Can never do");
    expect(panel).toContain("Anything involving funds opens an exact wallet review.");
    expect(panel).toContain("sign for you, or send a transaction on its own");
    expect(panel).not.toContain("capability token");
    expect(panel).not.toContain("policy intersection");
  });

  test("exposes lifecycle, alerts, checks, limits, and wallet reviews without signing controls", () => {
    const panel = appSource("react-app/domains/coworkers/coworkers-panel.tsx");
    expect(panel).toContain("Start chat");
    expect(panel).toContain("Add coworker");
    expect(panel).toContain("Research markets");
    expect(panel).toContain("Monitor risk");
    expect(panel).toContain("Prepare wallet actions");
    expect(panel).toContain("Track treasury");
    expect(panel).toContain("Pause");
    expect(panel).toContain("Resume coworker");
    expect(panel).toContain("Disable permanently");
    expect(panel).toContain("Wallet activity");
    expect(panel).toContain("Wallet reviews per request");
    expect(panel).toContain("Apps this role can use");
    expect(panel).toContain("Only your connected wallet can approve and send.");
    expect(panel).toContain("Transaction details");
    expect(panel).toContain("Safety checks:");
    expect(panel).toContain("Review in wallet");
    expect(panel).toContain("openWalletReview(item)");
    expect(panel).toContain("Cancel review");
    expect(panel).toContain("cancelCoworkerWalletIntent");
    expect(panel).toContain("Checks");
    expect(panel).toContain("Updates");
    expect(panel).toContain("Not available");
    expect(panel).toContain("Not allowed");
    expect(panel).not.toContain("signTransaction");
    expect(panel).not.toContain("submitTransaction");
  });

  test("gives every coworker one clear next step before exposing optional details", () => {
    const panel = appSource("react-app/domains/coworkers/coworkers-panel.tsx");
    expect(resolveCoworkerNextStep({
      coworkerState: "active",
      ready: true,
      loading: false,
      loadFailed: false,
      connectionsAvailable: true,
      connectedAppCount: 1,
    })).toMatchObject({ action: "start", label: "Start chat" });
    expect(resolveCoworkerNextStep({
      coworkerState: "active",
      ready: false,
      loading: true,
      loadFailed: false,
      connectedAppCount: 0,
    })).toMatchObject({ action: "wait", label: "Checking setup…" });
    expect(resolveCoworkerNextStep({
      coworkerState: "active",
      ready: false,
      loading: false,
      loadFailed: true,
      connectionsAvailable: true,
      connectedAppCount: 0,
    })).toMatchObject({ action: "reload", label: "Reload setup" });
    expect(resolveCoworkerNextStep({
      coworkerState: "active",
      ready: false,
      loading: false,
      loadFailed: false,
      connectionsAvailable: true,
      connectedAppCount: 0,
    })).toMatchObject({ action: "connect", label: "Connect an app" });
    expect(resolveCoworkerNextStep({
      coworkerState: "active",
      ready: false,
      loading: false,
      loadFailed: false,
      connectionsAvailable: true,
      connectedAppCount: 1,
    })).toMatchObject({ action: "review", label: "Review access" });
    expect(resolveCoworkerNextStep({
      coworkerState: "paused",
      ready: false,
      loading: false,
      loadFailed: false,
      connectionsAvailable: true,
      connectedAppCount: 1,
    })).toMatchObject({ action: "resume", label: "Resume coworker" });
    expect(resolveCoworkerNextStep({
      coworkerState: "revoked",
      ready: false,
      loading: false,
      loadFailed: false,
      connectionsAvailable: true,
      connectedAppCount: 1,
    })).toMatchObject({ action: "none", label: null });
    expect(panel).toContain("Safety limits");
    expect(panel).toContain("<details className=\"border-b border-dls-border/70 py-4\">");
  });

  test("lets the user approve an exact resource sandbox without privacy bypasses", () => {
    const panel = appSource("react-app/domains/coworkers/coworkers-panel.tsx");
    const client = appSource("app/lib/matterhorn-server.ts");
    expect(panel).toContain("What this coworker can use");
    expect(panel).toContain("Nothing is shared until you choose.");
    expect(panel).toContain("Connect at least one app before starting chat.");
    expect(panel).toContain("ready: canStartCoworker");
    expect(panel).toContain("Suggested items");
    expect(panel).toContain("Nothing changes until you review and save.");
    expect(panel).toContain("Review");
    expect(panel).toContain("Save access");
    expect(panel).toContain("This coworker cannot bypass that rule.");
    expect(panel).toContain("App connections are not enabled in this environment.");
    expect(panel).toContain("Private files are not enabled in this environment.");
    expect(panel).toContain('cause.code === "crypto_app_gateway_disabled"');
    expect(panel).toContain("Connect an app");
    expect(panel).toContain("Nothing is shared until you save access.");
    expect(panel).toContain("createCryptoAppConnection");
    expect(panel).toContain("transitionCryptoAppConnection");
    expect(panel).toContain("Review the selected access, then save it for this coworker.");
    expect(panel).toContain("onClick={props.onBrowseApps}");
    expect(panel).toContain("setCoworkerResources");
    expect(client).toContain("getCoworkerResources:");
    expect(client).toContain("getCoworkerResourceRecommendation:");
    expect(client).toContain("setCoworkerResources:");
    expect(panel).toContain("recommendationHash: resourceRecommendationHash");
    expect(panel).not.toContain("unverifiedProviderConsent: true");
  });

  test("connects only the no-credential actions and networks allowed by the coworker", () => {
    const draft = buildCoworkerAppConnectionDraft({
      allowedAppIds: ["matterhorn.sui-testnet"],
      allowedActionIds: ["sui_account_read", "sui_transfer_preview"],
      allowedNetworks: ["sui:testnet"],
    }, {
      appId: "matterhorn.sui-testnet",
      authentication: { type: "none" },
      actions: [
        {
          id: "sui_transfer_preview",
          access: "prepare",
          requiredScopes: ["wallet:preview", "wallet:preview"],
          walletSubmissionOnly: true,
          agentMaySubmit: false,
        },
        {
          id: "sui_account_read",
          access: "read",
          requiredScopes: ["account:read"],
          walletSubmissionOnly: true,
          agentMaySubmit: false,
        },
        {
          id: "sui_admin",
          access: "read",
          requiredScopes: ["admin"],
          walletSubmissionOnly: true,
          agentMaySubmit: false,
        },
      ],
      networks: [{ chainId: "sui:mainnet" }, { chainId: "sui:testnet" }],
    });

    expect(draft).toEqual({
      appId: "matterhorn.sui-testnet",
      grantedActionIds: ["sui_account_read", "sui_transfer_preview"],
      grantedScopes: ["account:read", "wallet:preview"],
      grantedNetworks: ["sui:testnet"],
    });
  });

  test("refuses inline connections that need credentials or have no permitted authority", () => {
    const coworker = {
      allowedAppIds: ["matterhorn.sui-testnet"],
      allowedActionIds: ["sui_account_read"],
      allowedNetworks: ["sui:testnet"],
    };
    const publicRead = {
      appId: "matterhorn.sui-testnet",
      actions: [{
        id: "sui_account_read",
        access: "read" as const,
        requiredScopes: [],
        walletSubmissionOnly: true as const,
        agentMaySubmit: false as const,
      }],
      networks: [{ chainId: "sui:testnet" }],
    };

    expect(buildCoworkerAppConnectionDraft(coworker, {
      ...publicRead,
      authentication: { type: "wallet_connection" },
    })).toBeNull();
    expect(buildCoworkerAppConnectionDraft(coworker, {
      ...publicRead,
      appId: "unapproved.app",
      authentication: { type: "none" },
    })).toBeNull();
    expect(buildCoworkerAppConnectionDraft(coworker, {
      ...publicRead,
      authentication: { type: "none" },
      networks: [{ chainId: "sui:mainnet" }],
    })).toBeNull();
  });

  test("binds the selected coworker through the authoritative privacy gateway", () => {
    const route = appSource("react-app/shell/session-route.tsx");
    const surface = appSource("react-app/domains/session/surface/session-surface.tsx");
    const context = appSource("react-app/domains/session/surface/coworker-context-store.ts");
    expect(route.match(/coworkerId: draft\.privacy\.coworkerId/g)).toHaveLength(2);
    expect(surface).toContain("...(coworkerId ? { coworkerId } : {})");
    expect(context).not.toContain("mission:");
    expect(context).not.toContain("allowedActionIds");
  });
});
