import { describe, expect, test } from "bun:test";

import { getArtifactNoteContext } from "../src/react-app/domains/session/artifacts/artifact-note-context";

describe("artifact note context", () => {
  test("extracts desk and session slug from Matterhorn output paths", () => {
    expect(getArtifactNoteContext("./outputs/longevity/session-alpha/plan.md")).toEqual({
      path: "outputs/longevity/session-alpha/plan.md",
      fileName: "plan.md",
      desk: "longevity",
      sessionSlug: "session-alpha",
    });
  });

  test("keeps non-output paths attachable without desk metadata", () => {
    expect(getArtifactNoteContext("/reports/customer.md")).toEqual({
      path: "reports/customer.md",
      fileName: "customer.md",
      desk: undefined,
      sessionSlug: undefined,
    });
  });
});
