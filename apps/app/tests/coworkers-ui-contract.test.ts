import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  readSessionPanelFromSearch,
  resolveSessionPanelNavigation,
} from "../src/react-app/shell/session-panel-route";
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
    expect(panel).toContain("Resume");
    expect(panel).toContain("Revoke");
    expect(panel).toContain("Wallet activity");
    expect(panel).toContain("Wallet reviews per request");
    expect(panel).toContain("Apps this role can use");
    expect(panel).toContain("Only your connected wallet can approve and send.");
    expect(panel).toContain("Exact review details");
    expect(panel).toContain("Policy checks:");
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

  test("lets the user approve an exact resource sandbox without privacy bypasses", () => {
    const panel = appSource("react-app/domains/coworkers/coworkers-panel.tsx");
    const client = appSource("app/lib/matterhorn-server.ts");
    expect(panel).toContain("Files, Memory, and apps");
    expect(panel).toContain("Nothing is shared until you choose.");
    expect(panel).toContain("Choose at least one connected app before starting chat.");
    expect(panel).toContain("disabled={!canStartCoworker}");
    expect(panel).toContain("Choose access");
    expect(panel).toContain("Suggested access");
    expect(panel).toContain("Nothing changes until you review and save.");
    expect(panel).toContain("Review suggestion");
    expect(panel).toContain("Save access");
    expect(panel).toContain("This coworker cannot bypass that rule.");
    expect(panel).toContain("App connections are not enabled in this environment.");
    expect(panel).toContain("Private files are not enabled in this environment.");
    expect(panel).toContain('cause.code === "crypto_app_gateway_disabled"');
    expect(panel).toContain("setCoworkerResources");
    expect(client).toContain("getCoworkerResources:");
    expect(client).toContain("getCoworkerResourceRecommendation:");
    expect(client).toContain("setCoworkerResources:");
    expect(panel).toContain("recommendationHash: resourceRecommendationHash");
    expect(panel).not.toContain("unverifiedProviderConsent: true");
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
