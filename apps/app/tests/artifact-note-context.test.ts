import { describe, expect, test } from "bun:test";

import { getArtifactNoteContext } from "../src/react-app/domains/session/artifacts/artifact-note-context";

describe("artifact note context", () => {
  test("extracts desk and session slug from Matterhorn output paths", () => {
    expect(getArtifactNoteContext("./outputs/longevity/session-alpha/plan.md")).toEqual({
      path: "outputs/longevity/session-alpha/plan.md",
      fileName: "plan.md",
      desk: "longevity",
      sessionSlug: "session-alpha",
      isLegacy: false,
      legacyKind: null,
    });
  });

  test("extracts desk and session slug without leading ./", () => {
    expect(getArtifactNoteContext("outputs/bittensor/session-beta/report.md")).toEqual({
      path: "outputs/bittensor/session-beta/report.md",
      fileName: "report.md",
      desk: "bittensor",
      sessionSlug: "session-beta",
      isLegacy: false,
      legacyKind: null,
    });
  });

  test("flags legacy .opencode/openwork/outbox/ paths as developer-readable", () => {
    expect(getArtifactNoteContext(".opencode/openwork/outbox/plan.md")).toEqual({
      path: ".opencode/openwork/outbox/plan.md",
      fileName: "plan.md",
      desk: undefined,
      sessionSlug: undefined,
      isLegacy: true,
      legacyKind: "opencode",
    });
    expect(getArtifactNoteContext("openwork/outbox/report.md")).toEqual({
      path: "openwork/outbox/report.md",
      fileName: "report.md",
      desk: undefined,
      sessionSlug: undefined,
      isLegacy: true,
      legacyKind: "openwork",
    });
    expect(getArtifactNoteContext("outbox/artifact.md")).toEqual({
      path: "outbox/artifact.md",
      fileName: "artifact.md",
      desk: undefined,
      sessionSlug: undefined,
      isLegacy: true,
      legacyKind: "outbox",
    });
  });

  test("keeps non-output paths attachable without desk metadata", () => {
    expect(getArtifactNoteContext("/reports/customer.md")).toEqual({
      path: "reports/customer.md",
      fileName: "customer.md",
      desk: undefined,
      sessionSlug: undefined,
      isLegacy: false,
      legacyKind: null,
    });
  });
});
