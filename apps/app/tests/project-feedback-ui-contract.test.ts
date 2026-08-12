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
    const paletteSource = readReactSource("shell/command-palette.tsx");

    expect(source).toContain("ProjectFeedbackDialog");
    expect(source).toContain("setFeedbackDialogOpen(true)");
    expect(source).toContain('entrypoint="status-bar"');
    expect(source).toContain('sourceType: selectedSessionId ? "chat" : "other"');
    expect(source).toContain("onSendFeedback={() => setFeedbackDialogOpen(true)}");
    expect(paletteSource).toContain("onSendFeedback?: () => void");
    expect(paletteSource).toContain("props.onSendFeedback()");
    expect(source).not.toContain("buildFeedbackUrl");
  });

  test("settings feedback opens the local dialog with settings context", () => {
    const source = readReactSource("shell/settings-route.tsx");
    const profileSource = readReactSource("domains/settings/pages/cloud-account-view.tsx");

    expect(source).toContain("ProjectFeedbackDialog");
    expect(source).toContain("setFeedbackDialogOpen(true)");
    expect(source).toContain('entrypoint="settings"');
    expect(source).toContain('sourceType: "settings"');
    expect(source).toContain("onSendFeedback={() => setFeedbackDialogOpen(true)}");
    expect(profileSource).toContain("onSendFeedback?: () => void");
    expect(profileSource).toContain("onClick={onSendFeedback}");
    expect(source).not.toContain("buildFeedbackUrl");
  });

  test("settings overview exposes redacted project ledger export", () => {
    const source = readReactSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("exportProjectLedger");
    expect(source).toContain("client.exportProjectDataLedger(workspaceId, {");
    expect(source).toContain("limit: 300");
    expect(source).toContain("exportPayload.manifest.itemCount");
    expect(source).toContain("exportSupportReport");
    expect(source).toContain("client.workspaceBackendSupportReport(workspaceId)");
    expect(source).toContain("Ledger JSON");
    expect(source).toContain("Support report");
    expect(source).toContain("Download the workspace archive, redacted project");
    expect(source).toContain("ProjectLedgerControlSummary");
    expect(source).toContain("client.listProjectDataLedger(workspaceId, { limit: 50 })");
    expect(source).toContain("exportable");
    expect(source).toContain("deletable");
    expect(source).toContain("append-only");
    expect(source).toContain(
      "Local feedback stored for product quality and routing. No training by default.",
    );
    expect(source).toContain(
      "Explicit feedback only. Product quality and routing, not training.",
    );
  });

  test("settings overview exposes a local feedback review surface", () => {
    const source = readReactSource("domains/settings/pages/overview-view.tsx");
    const helperSource = readReactSource("domains/settings/backend-capabilities/backend-capability-helpers.ts");

    expect(source).toContain("FeedbackReviewSection");
    expect(source).toContain('source: "feedback"');
    expect(source).toContain("MATTERHORN_PROJECT_FEEDBACK_KINDS.map");
    expect(source).toContain("feedbackKindFromEntry");
    expect(source).toContain("feedbackIdFromEntry");
    expect(source).toContain("deleteProjectFeedback");
    expect(source).toContain("deleteAllProjectFeedback");
    expect(source).toContain("Feedback deleted.");
    expect(source).toContain("Delete all local feedback for this workspace?");
    expect(source).toContain("Local feedback stored for product quality and routing. No training by default.");
    expect(helperSource).toContain("Structured feedback is stored locally for product quality and routing. No training by default.");
    expect(helperSource).not.toContain("Today feedback is still a link");
  });
});
