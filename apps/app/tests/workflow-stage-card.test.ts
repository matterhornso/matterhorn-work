import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("WorkflowStageCard — render contract", () => {
  test("shows title and objective", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain("title:");
    expect(source).toContain("objective?:");
  });

  test("does not expose raw prompt or technical prompt disclosure", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");

    expect(source).not.toContain("rawPrompt?:");
    expect(source).not.toContain("promptExpanded?:");
    expect(source).not.toContain("technical prompt");
    expect(source).not.toContain("ChevronDown");
    expect(source).not.toContain("ChevronRight");
  });

  test("has status badges for all runtime statuses", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain('"idle"');
    expect(source).toContain('"running"');
    expect(source).toContain('"waiting"');
    expect(source).toContain('"completed"');
    expect(source).toContain('"failed"');
    expect(source).toContain('"cancelled"');
  });

  test("shows outputs section when provided", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain("outputs?:");
    expect(source).toContain("FileOutput");
  });

  test("shows evidence hints section when provided", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain("evidenceHints?:");
    expect(source).toContain("Lightbulb");
  });

  test("shows user action hint when provided", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain("userActionHint?:");
    expect(source).toContain("ArrowRight");
  });

  test("shows external signer lock indicator when required", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain("requiresExternalSigner?:");
    expect(source).toContain("Lock");
  });

  test("shows current stage highlight when isCurrent is true", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain("isCurrent?:");
    expect(source).toContain("isCurrent");
  });

  test("does not render numbered stage prefixes", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).not.toContain("stageNumber?:");
    expect(source).not.toContain("padStart");
    expect(source).not.toContain("tabular-nums");
  });

  test("does not show idle Ready copy next to Start task", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain('if (status === "idle") return null;');
  });
});

describe("DeskWorkflowStagePanel — uses WorkflowStageCard", () => {
  test("imports WorkflowStageCard", () => {
    const panelSrc = readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx");
    expect(panelSrc).toContain('import { WorkflowStageCard');
  });

  test("maps manifest steps to WorkflowStageCard instances", () => {
    const panelSrc = readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx");
    expect(panelSrc).toContain("<WorkflowStageCard");
    expect(panelSrc).not.toContain("stageNumber={index + 1}");
    expect(panelSrc).toContain("title={step.name}");
    expect(panelSrc).toContain("objective={step.description}");
  });

  test("derives outputs from step.outputArtifactIds and manifest.generatedArtifacts", () => {
    const panelSrc = readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx");
    expect(panelSrc).toContain("outputArtifactIds");
    expect(panelSrc).toContain("generatedArtifacts");
  });

  test("keeps generated prompts internal to stage actions", () => {
    const panelSrc = readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx");
    expect(panelSrc).toContain("buildStagePrompt");
    expect(panelSrc).toContain("onStartStage(step.id, rawPrompt)");
    expect(panelSrc).not.toContain("rawPrompt={rawPrompt}");
  });

  test("cardStatus maps all runtime statuses correctly", () => {
    const panelSrc = readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx");
    expect(panelSrc).toContain('return "idle"');
    expect(panelSrc).toContain('return "completed"');
    expect(panelSrc).toContain('return "running"');
    expect(panelSrc).toContain('return "failed"');
    expect(panelSrc).toContain('return "cancelled"');
  });
});

describe("ProtocolDeskEmptyState — uses WorkflowStageCard for task buttons", () => {
  test("session-page imports WorkflowStageCard", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");
    expect(src).toContain("WorkflowStageCard");
  });

  test("replaces raw prompt list with WorkflowStageCard instances per task", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");
    // Each prompt item should become a WorkflowStageCard.
    expect(src).toContain("<WorkflowStageCard");
    expect(src).toContain("objective={item.detail}");
    expect(src).not.toContain("rawPrompt={item.prompt}");
    // The old giant raw-prompt text display is gone.
    expect(src).not.toContain("item.prompt}</span>");
    expect(src).not.toContain('className="group grid w-full grid-cols-[minmax(0,1fr)] gap-2 px-4 py-4');
  });

  test("uses user-facing task details instead of prompt-derived objective text", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");
    expect(src).toContain("detail:");
    expect(src).toContain("objective={item.detail}");
    expect(src).not.toContain("objective = item.prompt");
    expect(src).not.toContain("slice(0, 90)");
  });

  test("sets evidence hint per panel type", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");
    expect(src).toContain('panel === "bittensor"');
    expect(src).toContain('panel === "hyperliquid"');
    expect(src).toContain('panel === "polymarket"');
    // The hint is stored in a local `const evidenceHint` variable.
    expect(src).toContain("const evidenceHint =");
    expect(src).toContain("reads:");
  });

  test("keeps desk safety copy behind an info popover", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");

    expect(src).toContain("deskSafetyInfo");
    expect(src).toContain("desk safety info");
    expect(src).toContain("Matterhorn never submits orders inside the app");
    expect(src).toContain("Matterhorn never places bets inside the app");
    expect(src).toContain("<PopoverTrigger");
    expect(src).toContain("<PopoverContent");
    expect(src).not.toContain("Boundary:");
  });

  test("uses positive task copy for preview-only desks", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");

    expect(src).toContain("Summarize spread, depth, and stale-data warnings.");
    expect(src).toContain("Draft an external-client handoff you can review outside Matterhorn.");
    expect(src).toContain("Draft a non-custodial wallet handoff you can review externally.");
  });

  test("focused desk task cards launch the agent instead of hiding a draft", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");

    expect(src).toContain("sendImmediately: true");
    expect(src).toContain("setCurrentSidePanel(null)");
    expect(src).not.toContain("draftedPromptTitle");
    expect(src).not.toContain("Nothing has");
    expect(src).not.toContain("Draft ready");
  });

  test("task launcher route can send the prompt immediately", () => {
    const src = readAppSource("shell/session-route.tsx");

    expect(src).toContain("sendImmediately");
    expect(src).toContain("workspaceClient.session.promptAsync");
    expect(src).toContain("sessionID: session.id");
    expect(src).toContain("agent: agent || undefined");
    expect(src).toContain("buildSessionSystemContext(prompt, session.id)");
  });
});

describe("LongevityWorkflowStagePreview — uses WorkflowStageCard", () => {
  test("session-surface imports WorkflowStageCard", () => {
    const src = readAppSource("domains/session/surface/session-surface.tsx");
    expect(src).toContain("WorkflowStageCard");
  });

  test("LongevityWorkflowStagePreview renders one WorkflowStageCard per stage", () => {
    const src = readAppSource("domains/session/surface/session-surface.tsx");
    expect(src).toContain("<WorkflowStageCard");
    expect(src).not.toContain("stageNumber={index + 1}");
    // The component binds `const manifest = WELLNESS_CREATOR_SERVICES_WORKFLOW` then uses `manifest.steps.map`.
    expect(src).toContain("manifest.steps.map");
  });

  test("derives outputs per stage from outputArtifactIds", () => {
    const src = readAppSource("domains/session/surface/session-surface.tsx");
    expect(src).toContain("outputArtifactIds");
    expect(src).toContain("generatedArtifacts");
  });
});
