import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const sessionPage = readFileSync(
  new URL("../src/react-app/domains/session/chat/session-page.tsx", import.meta.url),
  "utf8",
);

describe("workflow desk open contract", () => {
  test("opens a workflow desk without creating a persisted run", () => {
    const readOnlyOpen = sessionPage.indexOf('if (!options?.launchAgent) {');
    const sessionCreated = sessionPage.indexOf("onSessionCreated: async (sessionId) => {");
    const stageRun = sessionPage.indexOf("const stagedRun = await stageWorkflowRun(props.matterhornServerClient!");

    expect(readOnlyOpen).toBeGreaterThan(-1);
    expect(sessionCreated).toBeGreaterThan(readOnlyOpen);
    expect(stageRun).toBeGreaterThan(sessionCreated);
    expect(sessionPage).toContain("Choose a stage to begin. Outputs will save under outputs/");
    expect(sessionPage.match(/dispatchMatterhornMemorySuggestions\(\{/g)).toHaveLength(1);
    expect(sessionPage).not.toContain('launchState?.status === "staging" || launchState?.status === "ready"');
    expect(sessionPage).not.toContain("const sessionId = `workflow_${deskId}_");
  });

  test("creates the run only for an explicit stage launch", () => {
    expect(sessionPage).toContain("launchAgent: true");
    expect(sessionPage).toContain("const run = await startWorkflowRun");
    expect(sessionPage).toContain("onSessionCreated: async (sessionId) => {");
    expect(sessionPage).not.toContain('if (!options?.launchAgent) {\n        setWorkflowLaunchState({\n          deskId,\n          status: "ready",\n          run: stagedRun');
  });
});
