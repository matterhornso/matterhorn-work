import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readReactSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("session provider recovery", () => {
  test("keeps blank-chat creation available while safely gating sends", () => {
    const route = readReactSource("shell/session-route.tsx");
    const canCreateTask = route.match(/const canCreateTask = Boolean\(\s*([\s\S]*?)\);/);

    expect(canCreateTask?.[1]).toContain("selectedWorkspaceId");
    expect(canCreateTask?.[1]).not.toContain("selectedModelUnavailable");
    expect(route).toContain('onOpenAiProviders: () => {\n        handleOpenSettings("/settings/ai");');
  });

  test("turns an unavailable model into direct provider and model recovery actions", () => {
    const surface = readReactSource("domains/session/surface/session-surface.tsx");
    const composer = readReactSource("domains/session/surface/composer/composer.tsx");

    expect(surface).toContain("onOpenAiProviders={props.onOpenAiProviders}");
    expect(surface).toContain("showModelPicker={shellConfig.modelPicker && !props.modelUnavailable}");
    expect(composer).toContain("onOpenAiProviders?: () => void;");
    expect(composer).toContain("Connect a model");
    expect(composer).toContain("props.onOpenAiProviders");
    expect(surface).toContain("Set up provider");
    expect(surface).toContain("Choose another model");
    expect(composer).not.toContain("Model no longer available");
  });

  test("keeps a rejected prompt in the composer so recovery never loses work", () => {
    const surface = readReactSource("domains/session/surface/session-surface.tsx");

    expect(surface).toContain("Your message is still in the composer.");
    expect(surface).toContain("setComposerDraft(props.sessionId, text);");
    expect(surface).toContain("props.onDraftChange(buildDraft(text, attachments));");
    expect(surface).not.toContain("setComposerDraft(props.sessionId, \"\");");
  });

  test("holds a blocked desk task at setup without silently creating or sending a chat", () => {
    const route = readReactSource("shell/session-route.tsx");
    const settings = readReactSource("shell/settings-route.tsx");
    const page = readReactSource("domains/session/chat/session-page.tsx");
    const ai = readReactSource("domains/settings/pages/ai-view.tsx");

    expect(route).toContain("pendingDeskTask");
    expect(route).toContain('reason: "model_unavailable"');
    expect(route).toContain("writePendingDeskTask(workspaceId, pendingDeskTask)");
    expect(route).toContain("clearPendingDeskTask(workspaceId);");
    expect(route).toContain("navigateToWorkspaceSession(workspaceId, selectedSessionId, { replace: true });");
    expect(route).toContain("readPendingDeskTaskReturn(location.search)");
    expect(route).not.toContain("readStoredPendingDeskTask(routeWorkspaceId)");
    expect(route).toContain('handleOpenSettings("/settings/ai", workspaceId, { pendingDeskTask })');
    expect(settings).toContain("readPendingDeskTaskNavigation");
    expect(settings).toContain("readStoredPendingDeskTask(selectedWorkspaceId)");
    expect(settings).toContain("PENDING_DESK_TASK_RETURN_PARAM");
    expect(settings).toContain("onResumePendingDeskTask");
    expect(settings).toContain("${PENDING_DESK_TASK_RETURN_PARAM}=${encodeURIComponent(pendingDeskTask.deskId)}");
    expect(page).toContain("recovery: true");
    expect(page).toContain("restoredPendingDeskWorkspaceRef.current = props.selectedWorkspaceId;");
    expect(page).toContain("restoredPendingDeskWorkspaceRef.current === props.selectedWorkspaceId");
    expect(page).toContain("if (!props.matterhornServerClient) return;");
    expect(page).toContain("`${visual.displayName} desk`");
    expect(page).toContain("Nothing has been sent yet.");
    expect(ai).toContain('data-testid="pending-desk-task-handoff"');
    expect(ai).toContain("Finish setting up");
    expect(ai).toContain("Return to desk");
    expect(ai).toContain("Nothing has been sent.");
  });

  test("never exposes engineering-only workspace skills in the customer composer", () => {
    const surface = readReactSource("domains/session/surface/session-surface.tsx");

    expect(surface).toContain("function isCustomerFacingWorkspaceSkill");
    expect(surface).toContain("skill.userInvocable !== false");
    expect(surface).toContain('"browser-automation"');
    expect(surface).toContain('"daytona-dev"');
    expect(surface).toContain('"run-evals"');
    expect(surface).toContain(".filter(isCustomerFacingWorkspaceSkill)");
  });
});
