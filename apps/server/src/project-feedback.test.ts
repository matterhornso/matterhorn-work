import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MatterhornProjectFeedbackEntry } from "@matterhorn-work/types/project-data-ledger";
import {
  deleteProjectFeedbackEntry,
  readProjectFeedbackEntries,
  recordProjectFeedback,
} from "./project-feedback.js";

const roots: string[] = [];
const priorDataDir = process.env.OPENWORK_DATA_DIR;

function feedback(id: string): MatterhornProjectFeedbackEntry {
  return {
    id,
    workspaceId: "ws_feedback_concurrency",
    kind: "thumbs_up",
    comment: `Feedback ${id}`,
    createdAt: new Date().toISOString(),
    trainingUse: "eval_routing_product_quality_only",
    redactionApplied: true,
  };
}

afterEach(async () => {
  if (priorDataDir === undefined) delete process.env.OPENWORK_DATA_DIR;
  else process.env.OPENWORK_DATA_DIR = priorDataDir;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project feedback persistence", () => {
  test("preserves concurrent submissions and submissions racing with deletion", async () => {
    const root = await mkdtemp(join(tmpdir(), "matterhorn-feedback-"));
    roots.push(root);
    process.env.OPENWORK_DATA_DIR = root;

    await Promise.all(
      Array.from({ length: 30 }, (_, index) => recordProjectFeedback(feedback(`fb_${index}`))),
    );
    expect(await readProjectFeedbackEntries("ws_feedback_concurrency", 50)).toHaveLength(30);

    await Promise.all([
      deleteProjectFeedbackEntry("ws_feedback_concurrency", "fb_0"),
      recordProjectFeedback(feedback("fb_new")),
    ]);

    const saved = await readProjectFeedbackEntries("ws_feedback_concurrency", 50);
    expect(saved).toHaveLength(30);
    expect(saved.some((entry) => entry.id === "fb_0")).toBe(false);
    expect(saved.some((entry) => entry.id === "fb_new")).toBe(true);
  });
});
