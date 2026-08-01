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
    expect(composer).toContain("sendDisabled?: boolean");
    expect(composer).toContain("props.sendDisabled ?? props.disabled");
  });
});
