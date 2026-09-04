import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  MATTERHORN_EXECUTION_MODE_OPTIONS,
  buildMatterhornExecutionModeSystemPrompt,
  buildMatterhornExecutionModeTools,
  normalizeMatterhornReasoningEffort,
} from "@matterhorn-work/types/execution-mode";
import {
  readMatterhornExecutionMode,
  writeMatterhornExecutionMode,
} from "../src/react-app/domains/session/modes/execution-mode";
import {
  buildMatterhornPromptTools,
  promptNeedsMatterhornTools,
} from "../src/react-app/domains/session/modes/prompt-tool-policy";

function readReactSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    globalThis.window = originalWindow;
  }
});

describe("Matterhorn execution modes", () => {
  test("defines Discuss, Plan, and Work as capability modes rather than response tone", () => {
    expect(MATTERHORN_EXECUTION_MODE_OPTIONS.map((option) => option.value)).toEqual([
      "discuss",
      "plan",
      "work",
    ]);
    expect(buildMatterhornExecutionModeSystemPrompt("discuss")).toContain("Do not edit files");
    expect(buildMatterhornExecutionModeSystemPrompt("plan")).toContain("produce a concrete, ordered implementation plan");
    expect(buildMatterhornExecutionModeSystemPrompt("work")).toContain("tools and approvals available to this agent");
    expect(buildMatterhornExecutionModeSystemPrompt("discuss")).toContain("Lead with the answer");
    expect(buildMatterhornExecutionModeSystemPrompt("plan")).toContain("decision-ready");
    expect(buildMatterhornExecutionModeSystemPrompt("work")).toContain("Act before narrating");
    for (const option of MATTERHORN_EXECUTION_MODE_OPTIONS) {
      expect(buildMatterhornExecutionModeSystemPrompt(option.value)).toContain("never weakens desk allowlists");
      expect(buildMatterhornExecutionModeSystemPrompt(option.value)).toContain("connected-wallet boundaries");
      expect(buildMatterhornExecutionModeSystemPrompt(option.value)).toContain("transaction safety");
    }
  });

  test("normalizes supported reasoning hints without inventing provider capabilities", () => {
    expect(normalizeMatterhornReasoningEffort(" HIGH ")).toBe("high");
    expect(normalizeMatterhornReasoningEffort("minimal")).toBe("minimal");
    expect(normalizeMatterhornReasoningEffort("turbo")).toBeUndefined();
    expect(normalizeMatterhornReasoningEffort(null)).toBeUndefined();
  });

  test("uses deny-by-default tools and never broadens desk or custom agents", () => {
    expect(buildMatterhornExecutionModeTools("discuss", null)).toEqual({
      "*": false,
      read: true,
      glob: true,
      grep: true,
      webfetch: true,
      websearch: true,
    });
    expect(buildMatterhornExecutionModeTools("plan", "matterhorn-sui")).toEqual({
      "*": false,
      "matterhorn-work_matterhorn_sui_get_balance": true,
    });
    expect(buildMatterhornExecutionModeTools("plan", "matterhorn-bittensor")).toEqual({
      "*": false,
      "matterhorn-work_matterhorn_bittensor_chat": true,
    });
    expect(buildMatterhornExecutionModeTools("discuss", "custom-agent")).toEqual({ "*": false });
    expect(buildMatterhornExecutionModeTools("work", "matterhorn-sui")).toBeUndefined();
  });

  test("omits the tool catalog for answer-only Work turns", () => {
    expect(promptNeedsMatterhornTools("Reply with exactly: CUDOS_READY")).toBe(false);
    expect(promptNeedsMatterhornTools("Explain proof of stake in plain English.")).toBe(false);
    expect(promptNeedsMatterhornTools("Do it")).toBe(true);
    expect(promptNeedsMatterhornTools("Continue")).toBe(true);
    expect(buildMatterhornPromptTools({
      mode: "work",
      agentId: null,
      text: "Reply with exactly: CUDOS_READY",
    })).toEqual({ "*": false });
  });

  test("preserves tools for data access, mutations, attachments, and managed desks", () => {
    for (const text of [
      "Read the current workspace files and write a report.",
      "Show my live Sui wallet balance.",
      "Research the latest Bittensor validator data.",
      "Save this response to an output.",
    ]) {
      expect(promptNeedsMatterhornTools(text)).toBe(true);
      expect(buildMatterhornPromptTools({ mode: "work", agentId: null, text })).toBeUndefined();
    }
    expect(buildMatterhornPromptTools({
      mode: "work",
      agentId: null,
      text: "Summarize this",
      hasAttachments: true,
    })).toBeUndefined();
    expect(buildMatterhornPromptTools({
      mode: "work",
      agentId: "matterhorn-sui",
      text: "Explain this transaction",
    })).toBeUndefined();
  });

  test("persists mode per workspace session and defaults safely to Work", () => {
    const values = new Map<string, string>();
    (globalThis as { window: unknown }).window = {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    };

    expect(readMatterhornExecutionMode("ws_1", "ses_1")).toBe("work");
    writeMatterhornExecutionMode("ws_1", "ses_1", "plan");
    expect(readMatterhornExecutionMode("ws_1", "ses_1")).toBe("plan");
    expect(readMatterhornExecutionMode("ws_1", "ses_2")).toBe("work");
  });

  test("wires enforcement, busy-state locking, and Plan-to-Work handoff through the composer", () => {
    const route = readReactSource("shell/session-route.tsx");
    const surface = readReactSource("domains/session/surface/session-surface.tsx");
    const composer = readReactSource("domains/session/surface/composer/composer.tsx");

    expect(route).toContain("buildMatterhornPromptTools({");
    expect(route).toContain("writeMatterhornExecutionMode(selectedWorkspaceId, selectedSessionId, mode)");
    expect(route).toContain("recordSessionExecutionMode(selectedWorkspaceId, selectedSessionId, mode, previousMode)");
    expect(route).toContain("executionMode !== \"work\"");
    expect(surface).toContain("executionMode: props.executionMode");
    expect(composer).toContain('aria-label="Execution mode"');
    expect(composer).toContain("disabled={props.busy}");
    expect(composer).toContain("Start work");
    expect(composer).toContain('props.onExecutionModeChange("work")');
  });
});
