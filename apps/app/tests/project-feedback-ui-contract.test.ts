import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readReactSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("project feedback UI contract", () => {
  test("uses a local structured feedback dialog backed by the project ledger", () => {
    const source = readReactSource("domains/feedback/project-feedback-dialog.tsx");

    expect(source).toContain("ProjectFeedbackDialog");
    expect(source).toContain("submitProjectFeedback");
    expect(source).toContain("Feedback is stored locally for product quality and routing");
    expect(source).toContain("not used for training by default");
    expect(source).toContain('"thumbs_up"');
    expect(source).toContain('"thumbs_down"');
    expect(source).toContain('"feature_request"');
    expect(source).toContain('"rating"');
  });

  test("session feedback opens the local dialog instead of an external URL", () => {
    const source = readReactSource("shell/session-route.tsx");

    expect(source).toContain("ProjectFeedbackDialog");
    expect(source).toContain("setFeedbackDialogOpen(true)");
    expect(source).toContain('entrypoint="status-bar"');
    expect(source).toContain('sourceType: selectedSessionId ? "chat" : "other"');
    expect(source).not.toContain("buildFeedbackUrl");
  });

  test("settings feedback opens the local dialog with settings context", () => {
    const source = readReactSource("shell/settings-route.tsx");

    expect(source).toContain("ProjectFeedbackDialog");
    expect(source).toContain("setFeedbackDialogOpen(true)");
    expect(source).toContain('entrypoint="settings"');
    expect(source).toContain('sourceType: "settings"');
    expect(source).not.toContain("buildFeedbackUrl");
  });

  test("settings overview exposes redacted project ledger export", () => {
    const source = readReactSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("exportProjectLedger");
    expect(source).toContain("client.listProjectDataLedger(workspaceId, { limit: 300 })");
    expect(source).toContain("Export ledger JSON");
    expect(source).toContain("Download a redacted workspace ledger snapshot");
  });

  test("settings overview exposes a local feedback review surface", () => {
    const source = readReactSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("FeedbackReviewSection");
    expect(source).toContain('source: "feedback"');
    expect(source).toContain("MATTERHORN_PROJECT_FEEDBACK_KINDS.map");
    expect(source).toContain("feedbackKindFromEntry");
    expect(source).toContain("Local feedback stored for product quality and routing. No training by default.");
  });
});
