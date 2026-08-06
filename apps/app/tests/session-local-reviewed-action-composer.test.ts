import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");

describe("local reviewed-action composer contract", () => {
  test("keeps the editor available without a model and gates only the send action", () => {
    const surface = fs.readFileSync(
      path.join(root, "src/react-app/domains/session/surface/session-surface.tsx"),
      "utf8",
    );
    const composer = fs.readFileSync(
      path.join(root, "src/react-app/domains/session/surface/composer/composer.tsx"),
      "utf8",
    );

    expect(surface).toContain('disabled={model.transitionState !== "idle"}');
    expect(surface).toContain("Boolean(props.modelUnavailable) && !localReviewedActionReady");
    expect(surface).toContain("reviewedActionHandoffFromComposer(draft.trim()");
    expect(surface).toContain("reviewedActionPreparedChatText(reviewedActionHandoff)");
    expect(surface).toContain("setLocalReviewedActionMessages((current) => [");
    expect(composer).toContain("sendDisabled?: boolean");
    expect(composer).toContain("props.sendDisabled ?? props.disabled");
  });

  test("routes transaction starter cards through editable chat before wallet review", () => {
    const page = fs.readFileSync(
      path.join(root, "src/react-app/domains/session/chat/session-page.tsx"),
      "utf8",
    );

    expect(page).toContain("reviewedActionChatDraft(item)");
    expect(page).toContain("startTask(draft, item.title, { sendImmediately: false })");
    expect(page).toContain('? "Prepare in chat"');
    expect(page).toContain("sendImmediately: options?.sendImmediately ?? true");
    expect(page).not.toContain("onOpenReviewedAction(item.reviewedAction");
  });
});
