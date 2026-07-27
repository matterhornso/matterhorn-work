import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  MATTERHORN_DESK_AGENT_MANIFESTS,
  buildMatterhornDeskAgentSystemPrompt,
  buildMatterhornDeskReadOnlyTools,
  buildMatterhornDeskRuntimeTools,
  evaluateMatterhornDeskResponseEvidence,
} from "@matterhorn-work/types/desk-agents";
import {
  buildMatterhornPublicWalletContext,
  compileMatterhornSessionSystemContext,
} from "../src/react-app/domains/session/context/session-system-context";

const managedAgents = Object.values(MATTERHORN_DESK_AGENT_MANIFESTS)
  .filter((agent) => agent.toolPolicy.runtimeKind === "managed_desk");

describe("Matterhorn desk agent architecture", () => {
  test("keeps every specialized desk on an exact deny-by-default tool contract", () => {
    expect(managedAgents).toHaveLength(7);

    for (const agent of managedAgents) {
      expect(agent.version).toBe("matterhorn.desk.agent.v2");
      expect(agent.toolPolicy.denyByDefault).toBe(true);
      expect(agent.toolPolicy.work.length).toBeGreaterThan(0);
      expect(new Set(agent.toolPolicy.work).size).toBe(agent.toolPolicy.work.length);
      expect(agent.toolPolicy.readOnly.every((tool) => agent.toolPolicy.work.includes(tool))).toBe(true);
      expect(buildMatterhornDeskRuntimeTools(agent)).toEqual({
        "*": false,
        ...Object.fromEntries(agent.toolPolicy.work.map((tool) => [tool, true])),
      });
      expect(buildMatterhornDeskReadOnlyTools(agent)).toEqual({
        "*": false,
        ...Object.fromEntries(agent.toolPolicy.readOnly.map((tool) => [tool, true])),
      });
      expect(agent.capabilityPolicy.agentMaySign).toBe(false);
      expect(agent.capabilityPolicy.agentMaySubmit).toBe(false);
      expect(agent.capabilityPolicy.automationsMaySubmit).toBe(false);
    }
  });

  test("keeps signing and submission outside all agent tool allowlists", () => {
    const prohibitedToolName = /(?:^|_)(?:sign|submit|broadcast|execute)(?:_|$)/i;

    for (const agent of managedAgents) {
      expect(agent.toolPolicy.work.filter((tool) => prohibitedToolName.test(tool))).toEqual([]);
      expect(agent.toolPolicy.readOnly.filter((tool) => prohibitedToolName.test(tool))).toEqual([]);
      expect(buildMatterhornDeskAgentSystemPrompt(agent)).toContain(
        "The agent may never sign, submit, broadcast, or auto-execute",
      );
    }
  });

  test("models each protocol completion surface truthfully", () => {
    expect(MATTERHORN_DESK_AGENT_MANIFESTS.bittensor.capabilityPolicy.userCompletion.surface)
      .toBe("connected_wallet");
    expect(MATTERHORN_DESK_AGENT_MANIFESTS.hyperliquid.capabilityPolicy.userCompletion)
      .toEqual({
        surface: "manual_trade_ticket",
        availableAfterReview: true,
        featureGate: "hyperliquid_execution",
      });
    expect(MATTERHORN_DESK_AGENT_MANIFESTS.polymarket.capabilityPolicy.userCompletion)
      .toEqual({
        surface: "connected_wallet",
        availableAfterReview: true,
        featureGate: "polymarket_compliance",
      });
    expect(MATTERHORN_DESK_AGENT_MANIFESTS.sui.capabilityPolicy.userCompletion.surface)
      .toBe("connected_wallet");
  });

  test("shares public wallet context only with desks that need it", () => {
    for (const deskId of ["bittensor", "hyperliquid", "polymarket"] as const) {
      expect(MATTERHORN_DESK_AGENT_MANIFESTS[deskId].contextPolicy.includeWalletPublicContext)
        .toBe(true);
    }
    for (const deskId of ["sui", "wellness", "memory", "mcps"] as const) {
      expect(MATTERHORN_DESK_AGENT_MANIFESTS[deskId].contextPolicy.includeWalletPublicContext)
        .toBe(false);
    }
  });

  test("requires typed wallet-review cards for complete protocol action requests", () => {
    for (const deskId of ["bittensor", "hyperliquid", "polymarket"] as const) {
      const agent = MATTERHORN_DESK_AGENT_MANIFESTS[deskId];
      expect(agent.toolPolicy.work).toContain("matterhorn-work_matterhorn_crypto_chat");
      expect(agent.instructions).toContain("you MUST call matterhorn-work_matterhorn_crypto_chat exactly once");
      expect(agent.instructions).toContain("Review in wallet");
      expect(agent.instructions).toContain("do not replace it with a prose-only");
    }
  });

  test("keeps checked-in execution desk manifests synchronized with the source policy", async () => {
    const repositoryRoot = join(import.meta.dir, "../../..");

    for (const deskId of ["bittensor", "hyperliquid", "polymarket"] as const) {
      const agent = MATTERHORN_DESK_AGENT_MANIFESTS[deskId];
      const checkedIn = await readFile(
        join(repositoryRoot, ".opencode", "agents", `${agent.agentId}.md`),
        "utf8",
      );

      expect(checkedIn).toContain('"matterhorn-work_matterhorn_crypto_chat": true');
      expect(checkedIn).toContain("you MUST call matterhorn-work_matterhorn_crypto_chat exactly once");
      expect(checkedIn).toContain("typed Review in wallet card");
    }
  });

  test("rejects unsupported facts, completion claims, and execution claims deterministically", () => {
    const agent = MATTERHORN_DESK_AGENT_MANIFESTS.hyperliquid;
    expect(evaluateMatterhornDeskResponseEvidence(agent, {
      liveFactsUsed: true,
      completionClaimed: true,
      agentSigningClaimed: true,
      agentSubmissionClaimed: true,
      automationSubmissionClaimed: true,
      toolCalls: agent.verificationPolicy.maxToolCalls + 1,
    })).toEqual([
      "agent_signing_claim",
      "agent_submission_claim",
      "automation_submission_claim",
      "completion_without_receipt",
      "live_fact_without_tool_evidence",
      "live_fact_without_source",
      "live_fact_without_freshness",
      "tool_call_budget_exceeded",
    ]);

    expect(evaluateMatterhornDeskResponseEvidence(agent, {
      liveFactsUsed: true,
      toolEvidencePresent: true,
      sourceNamed: true,
      freshnessNamed: true,
      completionClaimed: true,
      receiptEvidencePresent: true,
      toolCalls: 1,
    })).toEqual([]);
  });

  test("assembles context in a stable, unique, bounded order", () => {
    const compiled = compileMatterhornSessionSystemContext([
      { id: "response_perspective", content: "Perspective" },
      { id: "desk_contract", content: "Desk" },
      { id: "execution_mode", content: "Mode" },
      { id: "desk_contract", content: "Duplicate desk" },
    ]);
    expect(compiled).toBe("Mode\n\nDesk\n\nPerspective");

    const bounded = compileMatterhornSessionSystemContext([
      { id: "execution_mode", content: "12345" },
      { id: "desk_contract", content: "x".repeat(100) },
    ], 60);
    expect(bounded).toContain("Additional context omitted");
    expect(bounded?.length).toBeLessThanOrEqual(60);
  });

  test("keeps wallet context public and user-approved", () => {
    const context = buildMatterhornPublicWalletContext({
      address: "0x1234",
      chainId: 8453,
      ethBalance: "1.2",
      usdcBalance: "30",
    });
    expect(context).toContain("Public address: 0x1234");
    expect(context).toContain("user's explicit review and wallet approval");
    expect(context).not.toContain("sign on behalf");
    expect(context.toLowerCase()).not.toContain("private key");
  });
});
