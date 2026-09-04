import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  RESPONSE_PERSPECTIVE_OPTIONS,
  buildResponsePerspectiveSystemPrompt,
} from "../src/react-app/domains/session/perspectives/response-perspective";
import { getMatterhornDeskAgentById } from "@matterhorn-work/types/desk-agents";

function readReactSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Matterhorn response perspectives", () => {
  test("offers cautious, balanced, and optimistic framing without weakening safety", () => {
    expect(RESPONSE_PERSPECTIVE_OPTIONS.map((option) => option.value)).toEqual([
      "cautious",
      "balanced",
      "optimistic",
    ]);

    expect(buildResponsePerspectiveSystemPrompt("balanced")).toBe("");
    for (const perspective of ["cautious", "optimistic"] as const) {
      const prompt = buildResponsePerspectiveSystemPrompt(perspective);
      expect(prompt).toContain("This changes framing only.");
      expect(prompt).toContain("Never remove, weaken, delay, or hide safety constraints");
      expect(prompt).toContain("connected-wallet requirements");
      expect(prompt).toContain("wellness disclaimers");
    }
  });

  test("exposes the perspective selector at the composer and sends it through system context", () => {
    const composer = readReactSource("domains/session/surface/composer/composer.tsx");
    const route = readReactSource("shell/session-route.tsx");

    expect(composer).toContain('aria-label="Response perspective"');
    expect(composer).toContain("RESPONSE_PERSPECTIVE_OPTIONS.map");
    expect(composer).toContain("<SlidersHorizontal");
    expect(composer).toContain('aria-hidden="true"');
    expect(composer).toContain("text-[10px] font-normal text-dls-secondary");
    expect(route).toContain("buildResponsePerspectiveSystemPrompt(responsePerspective)");
    expect(route).toContain("writeResponsePerspective(selectedWorkspaceId, selectedSessionId, perspective)");
  });

  test("injects a compact selected-desk overlay while the runtime owns the full contract", () => {
    const route = readReactSource("shell/session-route.tsx");
    const compiler = readReactSource("domains/session/context/session-system-context.ts");
    const longevity = getMatterhornDeskAgentById("matterhorn-longevity");

    expect(route).toContain("const deskAgent = getMatterhornDeskAgentById(agentId);");
    expect(route).toContain("buildMatterhornDeskRequestOverlay(deskAgent)");
    expect(route).toContain('{ id: "desk_contract", content: deskAgentInstructions }');
    expect(route).toContain("compileMatterhornSessionSystemContext([");
    expect(compiler).toContain('"desk_contract",');
    expect(compiler).toContain("unique.has(block.id)");
    expect(route).toContain("buildSessionSystemContext(text, selectedSessionId, selectedAgent, executionMode)");
    expect(route).toContain('buildSessionSystemContext(prompt, session.id, agent, "work")');
    expect(route).toContain("Canonical output directory:");
    expect(route).toContain("Do not create a parallel descriptive or custom session folder.");
    expect(longevity?.instructions).toContain("Never ask for injuries, pain, health status");
    expect(longevity?.instructions).toContain("medical history, diagnoses, prescriptions");
    expect(longevity?.instructions).toContain("protected health information");
  });

  test("recovers stale session URLs to project Home instead of rendering a dead end", () => {
    const route = readReactSource("shell/session-route.tsx");
    const surface = readReactSource("domains/session/surface/session-surface.tsx");

    expect(route).toContain('title: "Chat no longer available"');
    expect(route).toContain("navigateToWorkspaceSession(selectedWorkspaceId, null, { replace: true })");
    expect(route).toContain("uiState.setSidePanelState(selectedSessionId, null)");
    expect(route).toContain("uiState.setSidePanelState(GLOBAL_HOME_SIDE_PANEL_KEY, null)");
    expect(route).not.toContain('return "Session was not found. Select a new session from the sidebar."');
    expect(surface).toContain("error instanceof MatterhornServerError && error.status === 404");
    expect(surface).toContain("props.onSessionMissing?.()");
    expect(surface).toContain("Returning to project Home");
  });

  test("trusts workspace-scoped session results across canonical path aliases", () => {
    const sessionRoute = readReactSource("shell/session-route.tsx");
    const settingsRoute = readReactSource("shell/settings-route.tsx");

    expect(sessionRoute).toContain("const items = response.items ?? [];");
    expect(settingsRoute).toContain("const items = response.items ?? [];");
    expect(sessionRoute).not.toContain("normalizeDirectoryPath(session?.directory ?? \"\") === workspaceRoot");
    expect(settingsRoute).not.toContain("normalizeDirectoryPath(session?.directory ?? \"\") === workspaceRoot");
  });
});
