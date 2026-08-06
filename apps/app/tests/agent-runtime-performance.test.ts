import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  MATTERHORN_DESK_AGENT_MANIFESTS,
  MATTERHORN_EXECUTION_MODE_OPTIONS,
  buildMatterhornExecutionModeSystemPrompt,
} from "../../../packages/types/src/index";

const protocolDeskIds = ["bittensor", "hyperliquid", "polymarket"] as const;

describe("Matterhorn agent runtime budgets", () => {
  test("keeps execution-mode overlays compact and decision-specific", () => {
    for (const option of MATTERHORN_EXECUTION_MODE_OPTIONS) {
      const prompt = buildMatterhornExecutionModeSystemPrompt(option.value);
      expect(prompt.length).toBeLessThan(800);
      expect(prompt).toContain(`Mode: ${option.value}`);
      expect(prompt).toContain("Never expose hidden chain-of-thought");
    }

    expect(buildMatterhornExecutionModeSystemPrompt("discuss")).toContain("read-only context only");
    expect(buildMatterhornExecutionModeSystemPrompt("plan")).toContain("ordered implementation plan");
    expect(buildMatterhornExecutionModeSystemPrompt("work")).toContain("Act before narrating");
  });

  test("bounds specialized instructions and protocol tool loops", () => {
    for (const deskId of protocolDeskIds) {
      const manifest = MATTERHORN_DESK_AGENT_MANIFESTS[deskId];
      expect(manifest.instructions.length).toBeLessThan(4_500);
      expect(manifest.verificationPolicy.maxToolCalls).toBeLessThanOrEqual(2);
      expect(manifest.instructions).toContain("call the final bounded action tool before prose");
      expect(manifest.instructions).toContain("one compact question containing every missing field");
      expect(manifest.instructions).toContain("Never return a generic simulation acknowledgement");
    }
  });

  test("keeps optional context and provider reads behind explicit latency deadlines", () => {
    const route = readFileSync(new URL("../src/react-app/shell/session-route.tsx", import.meta.url), "utf8");
    const bittensor = readFileSync(new URL("../../server/src/tools/bittensor.ts", import.meta.url), "utf8");

    expect(route.match(/resolveOptionalMatterhornContext\(/g)?.length).toBe(2);
    expect(route.match(/\n\s*400,\n\s*\)/g)?.length).toBe(2);
    expect(bittensor).toContain("INTERACTIVE_PREVIEW_PROVIDER_DEADLINE_MS = 750");
  });

  test("records privacy-safe dispatch and first-output timing without prompt content", () => {
    const route = readFileSync(new URL("../src/react-app/shell/session-route.tsx", import.meta.url), "utf8");

    const timingEvent = route.match(/recordInspectorEvent\("session\.prompt\.first_output", \{([\s\S]*?)\n\s*\}\);/);
    expect(timingEvent).not.toBeNull();
    expect(timingEvent?.[1]).toContain("timeToFirstOutputMs");
    expect(timingEvent?.[1]).toContain("executionMode");
    expect(timingEvent?.[1]).toContain("agentId");
    expect(timingEvent?.[1]).not.toContain("text");
    expect(timingEvent?.[1]).not.toContain("parts");
    expect(timingEvent?.[1]).not.toContain("systemContext");
    expect(route).toContain("promptTimingRef.current.delete(selectedSessionId)");
  });
});
