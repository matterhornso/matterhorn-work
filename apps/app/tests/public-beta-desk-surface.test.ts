import { describe, expect, test } from "bun:test";

import { filterDeskWorkflowStepsForLaunch } from "../src/react-app/domains/session/workflows/desk-workflow-stage-panel";
import {
  getCustomerProtocolDeskVisualForLaunch,
  getDeskWorkflowManifest,
  type CustomerProtocolDeskId,
} from "../src/react-app/domains/session/workflows/protocol-desk-ui";

const PUBLIC_BETA_PROTOCOL_DESKS: CustomerProtocolDeskId[] = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "sui",
];

describe("public Beta desk surfaces", () => {
  test("uses read-only copy across Home, rails, sessions, and capability detail", () => {
    for (const deskId of PUBLIC_BETA_PROTOCOL_DESKS) {
      const visual = getCustomerProtocolDeskVisualForLaunch(deskId, false);
      expect(visual).not.toBeNull();
      const copy = [
        visual?.shortDescription,
        visual?.railTitle,
        visual?.safetySummary,
        visual?.sessionBoundary,
        visual?.agentDescription,
        ...(visual?.capabilityBullets ?? []),
        ...(visual?.primaryActions.flatMap((action) => [action.label, action.intent]) ?? []),
        ...(visual?.secondaryActions.flatMap((action) => [action.label, action.intent]) ?? []),
      ].join(" ");
      expect(visual?.statusLabel).toBe("Read-only Beta");
      expect(copy).not.toMatch(
        /wallet-reviewed|wallet-approved|prepare (?:an? )?(?:order|trade|transfer)|buy, sell|stake and unstake|sign and submit/i,
      );
    }
  });

  test("removes reviewed-action workflow stages, inputs, and outputs", () => {
    for (const deskId of PUBLIC_BETA_PROTOCOL_DESKS) {
      const manifest = getDeskWorkflowManifest(deskId);
      expect(manifest).not.toBeNull();
      if (!manifest) throw new Error(`Missing ${deskId} workflow manifest`);
      const visibleSteps = filterDeskWorkflowStepsForLaunch(
        deskId,
        manifest.steps,
        false,
      );
      const visibleStepIds = new Set(visibleSteps.map((step) => step.id));
      expect(visibleStepIds.has("stage_5_stake_preview")).toBe(false);
      expect(visibleStepIds.has("stage_4_unsigned_preview")).toBe(false);
      expect([...visibleStepIds].some((id) => id.includes("handoff"))).toBe(false);
      expect(visibleSteps.length).toBeGreaterThan(0);
    }
  });
});
