import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  readSessionPanelFromSearch,
  resolveSessionPanelNavigation,
} from "../src/react-app/shell/session-panel-route";
import { buildCoworkerAppConnectionDraft } from "../src/react-app/domains/coworkers/coworker-app-connection";
import {
  coworkerActivitySummary,
  resolveCoworkerNextStep,
} from "../src/react-app/domains/coworkers/coworkers-panel";
import {
  parseCoworkerWatchParameters,
  resolveCoworkerWatchFields,
  resolveCoworkerWatchSources,
} from "../src/react-app/domains/coworkers/coworker-watch-form";
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

  test("accepts invite access without persisting the one-time code in browser storage", () => {
    const route = appSource("react-app/domains/coworkers/coworker-access-route.tsx");
    const fragment = appSource("react-app/domains/coworkers/coworker-invite-fragment.ts");
    const shell = appSource("react-app/shell/app-root.tsx");
    expect(route).toContain("Coworker access");
    expect(route).toContain("Your connected wallet always signs and sends.");
    expect(route).toContain("The one-time code was removed from the address bar");
    expect(fragment).toContain("window.history.replaceState");
    expect(fragment).not.toMatch(/localStorage|sessionStorage/);
    expect(route).not.toMatch(/localStorage|sessionStorage/);
    expect(shell).toContain('path="/coworker-access"');
    expect(shell).toContain("hasPendingCoworkerInvite");
  });

  test("lets a first-time user describe one outcome and confirm a suggested coworker from Home", () => {
    const home = appSource("react-app/domains/session/chat/session-page.tsx");
    const start = appSource("react-app/domains/session/chat/workspace-coworker-start.tsx");
    const panel = appSource("react-app/domains/coworkers/coworkers-panel.tsx");
    expect(start).toContain("What should Matterhorn help you do?");
    expect(start).toContain("Describe your goal in one sentence.");
    expect(start).toContain('role="group" aria-label="Coworker role"');
    expect(start).toContain("aria-pressed={selected}");
    expect(start).toContain("Suggested");
    expect(start).toContain('type="submit"');
    expect(start).toContain("Choose access");
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
    expect(panel).toContain("Your goal");
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
    expect(panel).toContain("Apps allowed");
    expect(panel).toContain("Only your connected wallet can approve and send.");
    expect(panel).toContain("Wallet review details");
    expect(panel).toContain("Safety checks:");
    expect(panel).toContain("Technical proof");
    expect(panel).toContain("Network check ID:");
    expect(panel).not.toContain("Preview reference:");
    expect(panel).toContain("Review in wallet");
    expect(panel).toContain("openWalletReview(item)");
    expect(panel).toContain("Cancel review");
    expect(panel).toContain("cancelCoworkerWalletIntent");
    expect(panel).toContain("Checks");
    expect(panel).toContain("Add check");
    expect(panel).toContain("Notify me when the result changes.");
    expect(panel).toContain("It cannot move funds.");
    expect(panel).toContain("Remove check");
    expect(panel).toContain("Updates");
    expect(panel).toContain("Not available");
    expect(panel).toContain("Not allowed");
    expect(panel).not.toContain("signTransaction");
    expect(panel).not.toContain("submitTransaction");
  });

  test("offers only read/watch actions from the exact approved live connection", () => {
    const sources = resolveCoworkerWatchSources({
      coworker: {
        allowedAppIds: ["matterhorn.sui-testnet"],
        allowedActionIds: ["sui_account_read", "sui_transfer_preview"],
        allowedNetworks: ["sui:testnet"],
      },
      scope: {
        connections: [{
          id: "connection_1",
          appId: "matterhorn.sui-testnet",
          manifestRevision: "1.0.0",
          actionIds: ["sui_account_read", "sui_transfer_preview"],
          networks: ["sui:testnet"],
        }],
      },
      connections: [{
        version: "matterhorn.crypto-app-connection.v1",
        id: "connection_1",
        workspaceId: "workspace_1",
        appId: "matterhorn.sui-testnet",
        manifestRevision: "1.0.0",
        state: "active",
        grantedActionIds: ["sui_account_read", "sui_transfer_preview"],
        grantedScopes: [],
        grantedNetworks: ["sui:testnet"],
        credential: { type: "none", connected: true },
        availability: "available",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      }],
      apps: [{
        version: "matterhorn.crypto-app-catalog.v1",
        appId: "matterhorn.sui-testnet",
        displayName: "Sui Testnet",
        description: "Safe Sui reads",
        manifestRevision: "1.0.0",
        manifestHash: "a".repeat(64),
        certification: {
          state: "certified_testnet",
          reportHash: "b".repeat(64),
          runtimeReportHash: "c".repeat(64),
          policyVersion: "policy-1",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        authentication: { type: "none", scopes: [], connectionRequired: false },
        networks: [{ protocol: "sui", chainId: "sui:testnet", environment: "testnet" }],
        actions: [
          {
            id: "sui_account_read",
            title: "Read Sui balance",
            description: "Read one balance",
            access: "read",
            risk: "private_data",
            requiredScopes: [],
            requiresFreshness: true,
            freshnessMaxAgeMs: 30_000,
            timeoutMs: 10_000,
            simulationRequired: false,
            walletSubmissionOnly: true,
            agentMaySubmit: false,
          },
          {
            id: "sui_transfer_preview",
            title: "Prepare transfer",
            description: "Prepare one transfer",
            access: "prepare",
            risk: "financial_high",
            requiredScopes: [],
            requiresFreshness: true,
            freshnessMaxAgeMs: 15_000,
            timeoutMs: 15_000,
            simulationRequired: true,
            walletSubmissionOnly: true,
            agentMaySubmit: false,
          },
        ],
        support: { privacyPolicyUrl: "https://matterhorn.so/privacy", statusUrl: null },
      }],
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      connectionId: "connection_1",
      manifestRevision: "1.0.0",
      actionId: "sui_account_read",
      network: "sui:testnet",
    });
  });

  test("turns certified scalar schemas into guided, validated check fields", () => {
    const fields = resolveCoworkerWatchFields({
      actionSchemas: [{
        actionId: "balance_read",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            address: { type: "string", minLength: 3, maxLength: 128 },
            limit: { type: "integer", minimum: 1, maximum: 50 },
            testnet: { type: "boolean" },
          },
          required: ["address"],
        },
        outputProjectionSchema: {},
      }],
    } as Parameters<typeof resolveCoworkerWatchFields>[0], "balance_read");

    expect(fields.supported).toBe(true);
    if (!fields.supported) throw new Error("expected supported fields");
    expect(fields.fields.map((field) => field.label)).toEqual(["Address", "Limit", "Testnet"]);
    expect(parseCoworkerWatchParameters(fields.fields, {
      address: "0x1234",
      limit: "10",
      testnet: true,
    })).toEqual({ ok: true, parameters: { address: "0x1234", limit: 10, testnet: true } });
    expect(parseCoworkerWatchParameters(fields.fields, { address: "0x1234", limit: "51" }))
      .toEqual({ ok: false, error: "Check limit." });
  });

  test("gives every coworker one clear next step before exposing optional details", () => {
    const panel = appSource("react-app/domains/coworkers/coworkers-panel.tsx");
    const sessionPage = appSource("react-app/domains/session/chat/session-page.tsx");
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
    })).toMatchObject({ action: "wait", label: "Checking…" });
    expect(resolveCoworkerNextStep({
      coworkerState: "active",
      ready: false,
      loading: false,
      loadFailed: true,
      connectedAppCount: 0,
    })).toMatchObject({ action: "reload", label: "Try again" });
    expect(resolveCoworkerNextStep({
      coworkerState: "active",
      ready: false,
      loading: false,
      loadFailed: false,
      connectionsAvailable: false,
      connectedAppCount: 0,
    })).toMatchObject({ action: "none", label: null, message: "Apps are unavailable right now. Try again later." });
    expect(resolveCoworkerNextStep({
      coworkerState: "active",
      ready: false,
      loading: false,
      loadFailed: false,
      connectionsAvailable: true,
      connectedAppCount: 0,
    })).toMatchObject({ action: "connect", label: "Choose an app" });
    expect(resolveCoworkerNextStep({
      coworkerState: "active",
      ready: false,
      loading: false,
      loadFailed: false,
      connectionsAvailable: true,
      connectedAppCount: 1,
    })).toMatchObject({ action: "review", label: "Choose access" });
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
    expect(panel).toContain('aria-label="Next step"');
    expect(panel).toContain("Next, choose what it can use.");
    expect(panel).toContain("setResourcesOpen(true)");
    expect(panel).not.toContain("is ready`, description: \"Start a chat whenever you have an outcome in mind.");
    expect(panel).toContain("Safety and wallet control");
    expect(panel).toContain("What it does");
    expect(panel).toContain('onClick={props.onBrowseFiles}>Add file</Button>');
    expect(panel).toContain('onClick={props.onBrowseMemory}>Add memory</Button>');
    expect(panel).toContain('onClick={props.onBrowseApps}>Browse apps</Button>');
    expect(panel.match(/onClick=\{props\.onBrowseApps\}>Browse apps<\/Button>/g)?.length).toBe(2);
    expect(sessionPage).toContain('onBrowseFiles={() => setCurrentSidePanel("files")}');
    expect(sessionPage).toContain('onBrowseMemory={() => setCurrentSidePanel("memory")}');
    expect(panel).not.toContain("This invalidates the current intent.");
    expect(panel).toContain("Your wallet will no longer be able to approve or send this review.");
    expect(panel).toContain("Limits");
    expect(panel).toContain("<details className=\"border-b border-dls-border/70 py-4\">");
  });

  test("explains every first coworker choice without steering users to an arbitrary default", () => {
    const panel = appSource("react-app/domains/coworkers/coworkers-panel.tsx");
    const emptyState = panel.slice(
      panel.indexOf("coworkers.length === 0"),
      panel.indexOf(") : selectedCoworker ?"),
    );
    expect(emptyState).toContain("What do you want help with?");
    expect(emptyState).toContain("Choose one to continue. You will review its access before it starts.");
    expect(emptyState).toContain("{choice.summary}");
    expect(emptyState).toContain('className="h-auto min-h-14 justify-start whitespace-normal px-3 py-2 text-left"');
    expect(emptyState).not.toContain('variant={index === 0 ? "default" : "outline"}');
  });

  test("collapses empty activity and destructive controls behind plain-language summaries", () => {
    const panel = appSource("react-app/domains/coworkers/coworkers-panel.tsx");
    expect(coworkerActivitySummary({ walletReviewCount: 0, checkCount: 0, updateCount: 0 })).toBe("No activity yet");
    expect(coworkerActivitySummary({ walletReviewCount: 1, checkCount: 2, updateCount: 3 }))
      .toBe("1 wallet review · 2 recurring checks · 3 updates");
    expect(panel).toContain("open={activityOpen}");
    expect(panel).toContain("setActivityOpen(event.currentTarget.open)");
    expect(panel).toContain(">Activity</span>");
    expect(panel).toContain("Pause or disable");
    expect(panel).not.toContain("Stop this coworker");
    expect(panel).toContain("App reads per request");
    expect(panel).not.toContain("App lookups per request");
  });

  test("lets the user approve an exact resource sandbox without privacy bypasses", () => {
    const panel = appSource("react-app/domains/coworkers/coworkers-panel.tsx");
    const client = appSource("app/lib/matterhorn-server.ts");
    expect(panel).toContain("Apps and information");
    expect(panel).toContain("Nothing is shared until you choose.");
    expect(panel).toContain("Connect at least one app before starting chat.");
    expect(panel).toContain("ready: canStartCoworker");
    expect(panel).toContain("Suggested access");
    expect(panel).toContain("Nothing changes until you review and save.");
    expect(panel).toContain("Review");
    expect(panel).toContain("Save access");
    expect(panel).toContain("This coworker cannot change that.");
    expect(panel).toContain("App connections are not enabled in this environment.");
    expect(panel).toContain("Private files are not enabled in this environment.");
    expect(panel).toContain('cause.code === "crypto_app_gateway_disabled"');
    expect(panel).toContain("Choose an app");
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
