import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

const composerSource = readFileSync(
  new URL(
    "../src/react-app/domains/session/surface/composer/composer.tsx",
    import.meta.url,
  ),
  "utf8",
);
const sessionSurfaceSource = readFileSync(
  new URL(
    "../src/react-app/domains/session/surface/session-surface.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("composer stop control", () => {
  test("keeps cancellation visible throughout an active run", () => {
    const actionControls = composerSource.slice(
      composerSource.indexOf("Keep cancellation available"),
      composerSource.indexOf("Below-panel control strip"),
    );

    expect(actionControls).toContain("{props.busy ? (");
    expect(actionControls).toContain("onClick={props.onStop}");
    expect(actionControls).toContain('<span>{t("composer.stop")}</span>');
    expect(actionControls).not.toContain("props.busy && !canSend");
  });

  test("keeps a drafted follow-up separate from cancellation", () => {
    const actionControls = composerSource.slice(
      composerSource.indexOf("Keep cancellation available"),
      composerSource.indexOf("Below-panel control strip"),
    );

    expect(actionControls).toContain("{canSend ? (");
    expect(actionControls).toContain("onClick={props.onSend}");
    expect(actionControls).toContain('<span>{t("composer.run_task")}</span>');
  });

  test("keeps accepted prompts cancellable while the first snapshot is pending", () => {
    expect(sessionSurfaceSource).toContain(
      "const sessionRunActive = chatStreaming || showAssistantWaitState;",
    );
    expect(sessionSurfaceSource).toContain("if (!sessionRunActive) return;");
    expect(sessionSurfaceSource).toContain("busy={sessionRunActive}");
    expect(sessionSurfaceSource).toContain(
      "statusLabel={statusLabel(snapshot ?? undefined, sessionRunActive)}",
    );
  });
});
