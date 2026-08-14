import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { MatterhornProjectDataLedgerEntry } from "@matterhorn-work/types/project-data-ledger";
import type { MatterhornWorkflowRunListItem } from "@matterhorn-work/types/workflow-runs";

import {
  buildWorkspaceAttentionInbox,
  coerceWorkspaceMissionUpdate,
  deleteWorkspaceMission,
  readWorkspaceMission,
  summarizeMissionRuns,
  writeWorkspaceMission,
  workspaceMissionPath,
} from "./workspace-mission.js";
import type { WorkspaceInfo } from "./types.js";

const roots: string[] = [];

function workspace(): WorkspaceInfo {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-workspace-mission-"));
  roots.push(root);
  return {
    id: "ws_mission",
    name: "Mission workspace",
    path: root,
    preset: "default",
    workspaceType: "local",
  };
}

function run(
  status: MatterhornWorkflowRunListItem["status"],
  updatedAt: number,
): MatterhornWorkflowRunListItem {
  return {
    workflowRunId: `run_${status}`,
    workspaceId: "ws_mission",
    sessionId: `session_${status}`,
    deskId: "bittensor",
    agentId: "matterhorn-bittensor",
    workflowId: "bittensor_research",
    status,
    visibleUserIntent: `Handle ${status} work`,
    outputBasePath: `outputs/bittensor/${status}/`,
    createdAt: updatedAt - 1_000,
    updatedAt,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("workspace mission", () => {
  test("persists a bounded mission without secrets", async () => {
    const target = workspace();
    const mission = await writeWorkspaceMission(target, {
      objective: "Compare Bittensor validators and prepare a reviewed staking decision.",
      successCriteria: ["Validator evidence is current", "Stake terms receive wallet review"],
      deskIds: ["bittensor"],
      networks: ["Bittensor mainnet"],
      status: "active",
    }, "owner");

    expect(mission.workspaceId).toBe(target.id);
    expect(mission.deskIds).toEqual(["bittensor"]);
    expect(mission.updatedBy).toBe("owner");
    expect(workspaceMissionPath(target)).toEndWith("/.matterhorn-work/project/mission.json");
    expect(await readWorkspaceMission(target)).toEqual(mission);
    expect(await deleteWorkspaceMission(target)).toBe(true);
    expect(await readWorkspaceMission(target)).toBeNull();
    expect(await deleteWorkspaceMission(target)).toBe(false);
  });

  test("rejects secret-shaped and unknown mission fields", async () => {
    const target = workspace();
    expect(() => coerceWorkspaceMissionUpdate({ apiKey: "should-not-be-here" })).toThrow("forbidden field");
    expect(() => coerceWorkspaceMissionUpdate({ surprise: true })).toThrow("Unknown mission field");
    await expect(writeWorkspaceMission(target, {
      objective: `Use private key 0x${"a".repeat(64)} to stake`,
    })).rejects.toThrow("secret-shaped");
    expect(await readWorkspaceMission(target)).toBeNull();
  });

  test("derives a prioritized attention inbox and terminal run summary", () => {
    const now = Date.parse("2026-08-13T08:00:00.000Z");
    const evidence: MatterhornProjectDataLedgerEntry[] = [{
      id: "audit:wallet-proposed",
      workspaceId: "ws_mission",
      source: "audit",
      kind: "wallet",
      timestamp: "2026-08-13T07:59:00.000Z",
      title: "Wallet transaction proposed",
      summary: "Review 10 TAO stake terms.",
      href: "/workspace/ws_mission/settings/wallet",
      dataClass: "audit_metadata",
      containsUserContent: true,
      containsSecrets: "redacted",
      retention: "append_only",
      exportable: true,
      deletable: false,
      redactionApplied: false,
      trainingUse: "none",
      eventType: "workspace.wallet.safety_event",
      metadata: { safetyAction: "tx_proposed" },
    }];
    const runs = [
      run("waiting", now - 10_000),
      run("failed", now - 20_000),
      run("running", now - 10 * 60_000),
      run("completed", now - 30_000),
    ];

    const inbox = buildWorkspaceAttentionInbox({ runs, evidence, now });
    expect(inbox.map((item) => item.kind)).toEqual([
      "needs_input",
      "run_failed",
      "approval_ready",
      "run_delayed",
    ]);
    expect(inbox[0]?.href).toContain("session_waiting");

    const summary = summarizeMissionRuns(runs);
    expect(summary.total).toBe(4);
    expect(summary.byStatus.completed).toBe(1);
    expect(summary.byStatus.cancelled).toBe(0);
  });
});
