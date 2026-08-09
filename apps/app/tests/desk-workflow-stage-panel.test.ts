import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  getCustomerProtocolDeskVisual,
  getDeskWorkflowManifest,
  CUSTOMER_LAUNCHER_DESK_IDS,
} from "../src/react-app/domains/session/workflows/protocol-desk-ui";
import {
  getMatterhornDeskAgent,
} from "@matterhorn-work/types/desk-agents";

describe("desk workflow stage panel metadata", () => {
  test.each(CUSTOMER_LAUNCHER_DESK_IDS)("%s has a workflow manifest and desk visual", (deskId) => {
    const visual = getCustomerProtocolDeskVisual(deskId);
    const manifest = getDeskWorkflowManifest(deskId);
    expect(visual).not.toBeNull();
    expect(manifest).not.toBeNull();
    expect(visual?.agentName).toBeTruthy();
    expect(visual?.sessionBoundary).toBeTruthy();
    expect(manifest?.steps.length).toBeGreaterThan(0);
    expect(manifest?.inputPrompts.length).toBeGreaterThan(0);
    expect(manifest?.generatedArtifacts.length).toBeGreaterThan(0);
  });

  test("Longevity exposes the full 7-stage workflow", () => {
    const manifest = getDeskWorkflowManifest("wellness");
    expect(manifest?.steps.length).toBe(7);
    const titles = manifest?.steps.map((step) => step.name) ?? [];
    expect(titles).toContain("Client / audience intake");
    expect(titles).toContain("Goals and constraints");
    expect(titles).toContain("Training, mobility, and yoga plan");
    expect(titles).toContain("Nutrition education plan");
    expect(titles).toContain("Weekly schedule and check-ins");
    expect(titles).toContain("Client artifacts and handouts");
    expect(titles).toContain("Service package / creator business handoff");
  });

  test("Bittensor exposes Bittensor-native stages", () => {
    const manifest = getDeskWorkflowManifest("bittensor");
    expect(manifest?.steps.length).toBe(7);
    const titles = manifest?.steps.map((step) => step.name) ?? [];
    expect(titles).toContain("Public SS58 context");
    expect(titles).toContain("Balance and readiness");
    expect(titles).toContain("Subnet discovery");
    expect(titles).toContain("Validator comparison");
    expect(titles).toContain("Review stake");
    expect(titles).toContain("External-signer handoff");
    expect(titles).toContain("Receipt and evidence");
  });

  test("Hyperliquid and Polymarket show read/research/handoff stages", () => {
    for (const deskId of ["hyperliquid", "polymarket"] as const) {
      const manifest = getDeskWorkflowManifest(deskId);
      expect(manifest?.steps.length).toBeGreaterThanOrEqual(4);
      const titles = manifest?.steps.map((step) => step.name.toLowerCase()) ?? [];
      expect(titles.some((t) => t.includes("read") || t.includes("summary"))).toBe(true);
      expect(titles.some((t) => t.includes("research") || t.includes("check"))).toBe(true);
      expect(titles.some((t) => t.includes("handoff"))).toBe(true);
      expect(manifest?.safetyPolicy.canSubmit).toBe(false);
      expect(manifest?.safetyPolicy.liveExecutionEnabled).toBe(false);
    }
  });

  test("user-facing manifest fields do not expose agent system prompts", () => {
    const hiddenPhrases = [
      "You are a",
      "you are a",
      "Act as",
      "act as",
      "system prompt",
      "SYSTEM PROMPT",
      "hidden instruction",
      "never reveal",
      "internal use only",
      "Can submit: No",
      "Live submission: Off",
    ];

    for (const deskId of CUSTOMER_LAUNCHER_DESK_IDS) {
      const manifest = getDeskWorkflowManifest(deskId);
      const visual = getCustomerProtocolDeskVisual(deskId);
      const userFacingText = [
        manifest?.name,
        manifest?.description,
        ...(manifest?.steps.map((s) => `${s.name} ${s.description}`) ?? []),
        ...(manifest?.inputPrompts.map((p) => `${p.label} ${p.helpText ?? ""}`) ?? []),
        ...(manifest?.generatedArtifacts.map((a) => `${a.name} ${a.description ?? ""}`) ?? []),
        visual?.agentName,
        visual?.agentDescription,
        visual?.sessionBoundary,
        visual?.safetySummary,
      ].join(" ");

      for (const phrase of hiddenPhrases) {
        expect(userFacingText).not.toContain(phrase);
      }
    }
  });

  test("agent system prompts are not included in workflow manifest strings", () => {
    for (const deskId of CUSTOMER_LAUNCHER_DESK_IDS) {
      const agent = getMatterhornDeskAgent(deskId);
      const manifest = getDeskWorkflowManifest(deskId);
      if (!agent?.systemPrompt || !manifest) continue;

      const manifestText = [
        manifest.name,
        manifest.description,
        ...manifest.steps.map((s) => s.description),
        ...manifest.inputPrompts.map((p) => p.label),
      ].join(" ");

      // The exact system prompt must not appear in user-facing manifest text.
      expect(manifestText).not.toContain(agent.systemPrompt.slice(0, 120));
    }
  });

  test("stage panel accepts workspace readiness blockers for task actions", async () => {
    const source = await Bun.file("apps/app/src/react-app/domains/session/workflows/desk-workflow-stage-panel.tsx").text();

    expect(source).toContain("stageActionDisabled?: boolean");
    expect(source).toContain("stageActionLabel?: string");
    expect(source).toContain("stageActionTitle?: string");
    expect(source).toContain("actionDisabled={stageActionDisabled}");
    expect(source).toContain("actionTitle={stageActionTitle}");
    expect(source).toContain('stageActionDisabled ? stageActionLabel');
    expect(source).toContain('stageActionLabel = "Task unavailable"');
  });

  test("Longevity desk marks match the Dumbbell icon used in the app rail", () => {
    const markSource = readFileSync(
      "apps/app/src/react-app/domains/session/workflows/protocol-brand-logo.tsx",
      "utf8",
    );
    const deskSources = [
      "apps/app/src/react-app/domains/session/chat/session-page.tsx",
      "apps/app/src/react-app/domains/session/surface/session-surface.tsx",
      "apps/app/src/react-app/domains/session/workflows/desk-workflow-stage-panel.tsx",
    ].map((path) => readFileSync(path, "utf8"));

    expect(markSource).toContain('deskId === "wellness"');
    expect(markSource).toContain("<Dumbbell");
    expect(markSource).toContain("export function ProtocolDeskMark");
    for (const source of deskSources) {
      expect(source).toContain("ProtocolDeskMark");
    }
  });

  test("Longevity describes a guided workflow without implying offline runtime", () => {
    const agentSource = readFileSync("packages/types/src/desk-agents.ts", "utf8");

    expect(agentSource).toContain(
      'description: "Guided longevity program workflow for creators, coaches, client packets, and service packaging."',
    );
    expect(agentSource).not.toContain("Offline longevity optimization workflow agent");
  });
});
