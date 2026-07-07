import { describe, expect, test } from "bun:test";

import {
  normalizeEvidenceEvents,
  type RecentActivityItem,
} from "../src/react-app/domains/recent-activity/recent-activity-types";
import type { MatterhornProjectEvidenceEvent } from "@matterhorn-work/types/project-evidence";

function makeEvent(
  overrides: Partial<MatterhornProjectEvidenceEvent> = {},
): MatterhornProjectEvidenceEvent {
  const now = "2026-07-04T12:00:00.000Z";
  return {
    id: "ev_1",
    workspaceId: "ws_test",
    type: "note.created",
    source: "notes",
    timestamp: now,
    title: "Test event",
    desk: undefined,
    sessionId: undefined,
    sessionSlug: undefined,
    taskId: undefined,
    noteId: undefined,
    outputPath: undefined,
    artifactPaths: undefined,
    memorySuggestionId: undefined,
    memorySuggestionStatus: undefined,
    href: undefined,
    ...overrides,
  };
}

describe("normalizeEvidenceEvents", () => {
  test("maps note.created to note_created", () => {
    const items = normalizeEvidenceEvents([makeEvent({ type: "note.created", title: "My first note" })]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("note_created");
    expect(items[0].title).toBe("My first note");
  });

  test("maps note.memory_suggested to memory_suggested", () => {
    const items = normalizeEvidenceEvents([
      makeEvent({ type: "note.memory_suggested", title: "Memory review suggestion created" }),
    ]);
    expect(items[0].kind).toBe("memory_suggested");
  });

  test("maps task.started to task_started", () => {
    const items = normalizeEvidenceEvents([makeEvent({ type: "task.started", title: "Bittensor research" })]);
    expect(items[0].kind).toBe("task_started");
  });

  test("maps task.stage_started to task_stage_started", () => {
    const items = normalizeEvidenceEvents([makeEvent({ type: "task.stage_started", title: "Fetch subnet weights" })]);
    expect(items[0].kind).toBe("task_stage_started");
  });

  test("maps task.output_saved to task_output_saved", () => {
    const items = normalizeEvidenceEvents([makeEvent({ type: "task.output_saved", title: "Report" })]);
    expect(items[0].kind).toBe("task_output_saved");
  });

  test("maps task.output_deleted to task_output_deleted", () => {
    const items = normalizeEvidenceEvents([makeEvent({ type: "task.output_deleted", title: "Output deleted" })]);
    expect(items[0].kind).toBe("task_output_deleted");
  });

  test("maps task.completed to task_completed", () => {
    const items = normalizeEvidenceEvents([makeEvent({ type: "task.completed", title: "Run complete" })]);
    expect(items[0].kind).toBe("task_completed");
  });

  test("maps task.failed to task_failed", () => {
    const items = normalizeEvidenceEvents([makeEvent({ type: "task.failed", title: "Staking run failed" })]);
    expect(items[0].kind).toBe("task_failed");
  });

  test("maps task.cancelled to task_cancelled", () => {
    const items = normalizeEvidenceEvents([makeEvent({ type: "task.cancelled", title: "Cancelled" })]);
    expect(items[0].kind).toBe("task_cancelled");
  });

  test("returns Untitled when title is missing", () => {
    const items = normalizeEvidenceEvents([makeEvent({ title: "" })]);
    expect(items[0].title).toBe("Untitled");
  });

  test("returns Untitled when title is undefined", () => {
    const items = normalizeEvidenceEvents([makeEvent({ title: undefined as unknown as string })]);
    expect(items[0].title).toBe("Untitled");
  });

  test("builds detail from desk and sessionSlug", () => {
    const items = normalizeEvidenceEvents([
      makeEvent({ desk: "bittensor", sessionSlug: "session-alpha", summary: "Some summary" }),
    ]);
    expect(items[0].detail).toBe("bittensor · session-alpha");
  });

  test("falls back to summary when no desk or sessionSlug", () => {
    const items = normalizeEvidenceEvents([
      makeEvent({ desk: undefined, sessionSlug: undefined, summary: "Validator stats" }),
    ]);
    expect(items[0].detail).toBe("Validator stats");
  });

  test("returns empty detail when no desk, sessionSlug, or summary", () => {
    const items = normalizeEvidenceEvents([makeEvent({ summary: undefined })]);
    expect(items[0].detail).toBe("");
  });

  test("sorts by timestamp descending (newest first)", () => {
    const events = [
      makeEvent({ id: "old", timestamp: "2026-07-01T12:00:00.000Z", title: "Old event" }),
      makeEvent({ id: "new", timestamp: "2026-07-04T12:00:00.000Z", title: "New event" }),
      makeEvent({ id: "mid", timestamp: "2026-07-02T12:00:00.000Z", title: "Mid event" }),
    ];
    const items = normalizeEvidenceEvents(events);
    expect(items[0].id).toBe("new");
    expect(items[1].id).toBe("mid");
    expect(items[2].id).toBe("old");
  });

  test("preserves source, desk, session, task, note, output, and href metadata", () => {
    const items = normalizeEvidenceEvents([
      makeEvent({
        source: "task_events",
        desk: "hyperliquid",
        sessionId: "ses_123",
        sessionSlug: "trade-session",
        taskId: "task_42",
        noteId: "note_abc",
        outputPath: "outputs/hyperliquid/trade-session/brief.md",
        artifactPaths: ["outputs/hyperliquid/trade-session/brief.md"],
        memorySuggestionStatus: "pending",
        href: "/workspace/ws_test/notes",
      }),
    ]);
    expect(items[0].source).toBe("task_events");
    expect(items[0].desk).toBe("hyperliquid");
    expect(items[0].sessionId).toBe("ses_123");
    expect(items[0].sessionSlug).toBe("trade-session");
    expect(items[0].taskId).toBe("task_42");
    expect(items[0].noteId).toBe("note_abc");
    expect(items[0].outputPath).toBe("outputs/hyperliquid/trade-session/brief.md");
    expect(items[0].artifactPaths).toEqual(["outputs/hyperliquid/trade-session/brief.md"]);
    expect(items[0].memorySuggestionStatus).toBe("pending");
    expect(items[0].href).toBe("/workspace/ws_test/notes");
  });

  test("handles empty array", () => {
    const items = normalizeEvidenceEvents([]);
    expect(items).toHaveLength(0);
  });

  test("handles mixed event types", () => {
    const events = [
      makeEvent({ id: "a", type: "note.created", timestamp: "2026-07-03T12:00:00.000Z" }),
      makeEvent({ id: "b", type: "task.output_saved", timestamp: "2026-07-04T12:00:00.000Z" }),
      makeEvent({ id: "c", type: "note.memory_suggested", timestamp: "2026-07-02T12:00:00.000Z" }),
    ];
    const items = normalizeEvidenceEvents(events);
    expect(items).toHaveLength(3);
    expect(items[0].id).toBe("b");
    expect(items[1].id).toBe("a");
    expect(items[2].id).toBe("c");
  });

  test("collapses stage-start noise when the same task has a run-start event", () => {
    const events = [
      makeEvent({
        id: "stage",
        type: "task.stage_started",
        taskId: "task_same",
        desk: "bittensor",
        sessionSlug: "run-one",
        timestamp: "2026-07-04T12:05:00.000Z",
      }),
      makeEvent({
        id: "started",
        type: "task.started",
        taskId: "task_same",
        desk: "bittensor",
        sessionSlug: "run-one",
        timestamp: "2026-07-04T12:00:00.000Z",
      }),
    ];

    const items = normalizeEvidenceEvents(events);
    expect(items.map((item) => item.id)).toEqual(["started"]);
  });

  test("keeps standalone stage-start events when no run-start event exists", () => {
    const items = normalizeEvidenceEvents([
      makeEvent({
        id: "stage-only",
        type: "task.stage_started",
        taskId: "task_stage_only",
        desk: "hyperliquid",
        sessionSlug: "run-two",
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("task_stage_started");
  });

  test("collapses duplicate run-start events for the same task", () => {
    const events = [
      makeEvent({
        id: "newer",
        type: "task.started",
        taskId: "task_duplicate",
        timestamp: "2026-07-04T12:01:00.000Z",
      }),
      makeEvent({
        id: "older",
        type: "task.started",
        taskId: "task_duplicate",
        timestamp: "2026-07-04T12:00:00.000Z",
      }),
      makeEvent({
        id: "other",
        type: "task.started",
        taskId: "task_other",
        timestamp: "2026-07-04T11:59:00.000Z",
      }),
    ];

    const items = normalizeEvidenceEvents(events);
    expect(items.map((item) => item.id)).toEqual(["newer", "other"]);
  });
});
