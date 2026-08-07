import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AgentActivityOrb,
  orbStateForAgentActivity,
  type AgentActivityKind,
} from "../src/react-app/design-system/agent-activity-orb";

describe("agent activity orb", () => {
  test("maps authoritative Matterhorn activity to deterministic motion", () => {
    const expected: Record<AgentActivityKind, string> = {
      planning: "solving",
      reading: "searching",
      searching: "searching",
      connecting: "connecting",
      working: "working",
      synthesizing: "weaving",
      composing: "composing",
      listening: "listening",
      shaping: "shaping",
      idle: "breathing",
    };

    for (const [activity, state] of Object.entries(expected)) {
      expect(orbStateForAgentActivity(activity as AgentActivityKind)).toBe(state);
    }
  });

  test("lets the surrounding live region own announcements by default", () => {
    const html = renderToStaticMarkup(
      <AgentActivityOrb activity="planning" size={20} />,
    );

    expect(html).toContain('role="presentation"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('width:20px');
  });

  test("requires a specific label when used as standalone status content", () => {
    const html = renderToStaticMarkup(
      <AgentActivityOrb
        activity="searching"
        size={64}
        decorative={false}
        label="Searching project evidence"
      />,
    );

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Searching project evidence"');
    expect(html).toContain('width:64px');
  });

  test("animates only active work, not approval, error, or terminal states", () => {
    const source = readFileSync(
      new URL("../src/react-app/domains/session/surface/session-surface.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('effectiveActivityStatus === "thinking"');
    expect(source).toContain('effectiveActivityStatus === "responding"');
    expect(source).toContain('effectiveActivityStatus === "compacting"');
    expect(source).toContain("const assistantStatusFooter = assistantOrbActivity ?");
    expect(source).toContain("renderedMessages.length === 0 && assistantOrbActivity");
    expect(source).not.toContain('effectiveActivityStatus !== "idle" && effectiveActivityStatus !== "error"');
  });
});
