import { describe, expect, test } from "bun:test";

import { outputDescriptorFromNoteAttachment, outputDescriptorFromOpenTarget } from "../src/react-app/domains/session/artifacts/output-descriptor";
import type { OpenTarget } from "../src/react-app/domains/session/artifacts/open-target";
import type { WorkflowOutputReceipt } from "../src/react-app/domains/session/artifacts/output-receipts";
import type { NoteOutputAttachment } from "../src/react-app/domains/notes/notes-types";

describe("output descriptor", () => {
  test("builds a descriptor from an OpenTarget with outputs/ metadata", () => {
    const target: OpenTarget = {
      id: "file:outputs/longevity/session-alpha/plan.md",
      kind: "file",
      value: "outputs/longevity/session-alpha/plan.md",
      name: "plan.md",
      preview: "markdown",
      confidence: 95,
      reason: "write tool metadata",
      exists: true,
      size: 1234,
      updatedAt: 1_700_000_000_000,
    };

    const descriptor = outputDescriptorFromOpenTarget(target);

    expect(descriptor).toMatchObject({
      id: target.id,
      kind: "file",
      title: "plan.md",
      path: "outputs/longevity/session-alpha/plan.md",
      desk: "longevity",
      sessionSlug: "session-alpha",
      size: 1234,
      exists: true,
      preview: "markdown",
      isLegacy: false,
      originLabel: "Longevity",
    });
    expect(descriptor.updatedAt).toBe(1_700_000_000_000);
  });

  test("flags legacy OpenTarget descriptors", () => {
    const target: OpenTarget = {
      id: "file:.opencode/openwork/outbox/artifact.md",
      kind: "file",
      value: ".opencode/openwork/outbox/artifact.md",
      name: "artifact.md",
      preview: "text",
      confidence: 90,
      reason: "tool output",
      exists: true,
    };

    const descriptor = outputDescriptorFromOpenTarget(target);

    expect(descriptor.isLegacy).toBe(true);
    expect(descriptor.originLabel).toBe("OpenCode import");
  });

  test("builds a descriptor from a note output attachment", () => {
    const attachment: NoteOutputAttachment = {
      type: "output",
      id: "outputs/bittensor/session-beta/report.md",
      label: "Session report",
    };

    const descriptor = outputDescriptorFromNoteAttachment(attachment);

    expect(descriptor).toMatchObject({
      kind: "note-attachment",
      title: "Session report",
      path: "outputs/bittensor/session-beta/report.md",
      desk: "bittensor",
      sessionSlug: "session-beta",
      originLabel: "Project note",
    });
  });

  test("adds workflow receipt metadata to OpenTarget descriptors", () => {
    const target: OpenTarget = {
      id: "file:outputs/longevity/session-alpha/plan.md",
      kind: "file",
      value: "outputs/longevity/session-alpha/plan.md",
      name: "plan.md",
      preview: "markdown",
      confidence: 95,
      reason: "workflow output receipt",
      exists: true,
      updatedAt: 1_600_000_000_000,
    };
    const receipt: WorkflowOutputReceipt = {
      id: "workflow-output:evt_1:outputs/longevity/session-alpha/plan.md",
      outputPath: "outputs/longevity/session-alpha/plan.md",
      title: "Saved plan",
      summary: "longevity;session-alpha",
      desk: "longevity",
      sessionSlug: "session-alpha",
      taskId: "task_1",
      timestamp: "2026-07-05T10:00:00.000Z",
      updatedAt: 1_700_000_000_000,
      status: "saved",
      source: "task_events",
      artifactCount: 2,
    };

    const descriptor = outputDescriptorFromOpenTarget(target, receipt);

    expect(descriptor).toMatchObject({
      receiptStatus: "saved",
      receiptTitle: "Saved plan",
      receiptSummary: "longevity;session-alpha",
      desk: "longevity",
      sessionSlug: "session-alpha",
      sourceId: "task_1",
      taskId: "task_1",
      updatedAt: 1_700_000_000_000,
      receiptArtifactCount: 2,
      originLabel: "Longevity",
    });
    expect(descriptor.updatedAt).toBe(1_700_000_000_000);
  });

  test("uses readable titles for Sui preview and receipt output filenames", () => {
    const previewTarget: OpenTarget = {
      id: "file:outputs/sui/sess_sui/transfer-preview-abc123def456.json",
      kind: "file",
      value: "outputs/sui/sess_sui/transfer-preview-abc123def456.json",
      name: "transfer-preview-abc123def456.json",
      preview: "json",
      confidence: 95,
      reason: "Sui preview evidence",
      exists: true,
    };
    const receiptAttachment: NoteOutputAttachment = {
      type: "output",
      id: "outputs/sui/sess_sui/transaction-receipt-5xY8P6TQ4qGsGLk1qUZ9vCkD8uWnz1wQp2mgSm7Jyzky.json",
      label: "",
    };

    expect(outputDescriptorFromOpenTarget(previewTarget)).toMatchObject({
      title: "Sui transfer preview",
      desk: "sui",
      sessionSlug: "sess_sui",
      originLabel: "Sui",
    });
    expect(outputDescriptorFromNoteAttachment(receiptAttachment)).toMatchObject({
      title: "Sui transaction receipt",
      desk: "sui",
      sessionSlug: "sess_sui",
      originLabel: "Project note",
    });
  });
});
