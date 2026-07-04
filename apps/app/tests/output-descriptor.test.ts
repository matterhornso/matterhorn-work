import { describe, expect, test } from "bun:test";

import { outputDescriptorFromNoteAttachment, outputDescriptorFromOpenTarget } from "../src/react-app/domains/session/artifacts/output-descriptor";
import type { OpenTarget } from "../src/react-app/domains/session/artifacts/open-target";
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
});
