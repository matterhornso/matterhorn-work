import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

import {
  AgentRunReceiptDisclosure,
  privacyCategoryLabel,
  privacyModeLabel,
  receiptStatusLabel,
} from "../src/react-app/domains/session/surface/agent-run-receipt-disclosure";

const source = readFileSync(
  new URL("../src/react-app/domains/session/surface/agent-run-receipt-disclosure.tsx", import.meta.url),
  "utf8",
);

const completedReceipt: MatterhornAgentRunReceipt = {
  version: "matterhorn.agent-run-receipt.v1",
  id: "receipt_public_research",
  runId: "run_public_research",
  workspaceId: "workspace_test",
  sessionId: "session_test",
  status: "success",
  startedAt: "2026-09-04T12:00:00.000Z",
  completedAt: "2026-09-04T12:00:01.250Z",
  responseDurationMs: 1_250,
  provider: {
    id: "venice",
    name: "Venice Private",
    modelId: "private-tools",
    privacyStatus: "verified_no_training",
    trainingUse: "none",
    retentionDays: 0,
    policyUrl: "https://docs.venice.ai/overview/privacy",
  },
  privacy: {
    requestHash: "request-proof",
    mode: "private_workspace",
    dataCategories: ["workspace_private", "untrusted_external"],
    redactionCount: 1,
    consent: "single_request",
    dataLeavesMatterhorn: true,
  },
  context: {
    chatFiles: 1,
    coworkerFiles: 2,
    savedMemories: 1,
  },
  usage: {
    inputTokens: 120,
    outputTokens: 30,
    reasoningTokens: 10,
    cacheReadTokens: 40,
    cacheWriteTokens: 5,
    estimatedCostUsd: 0.0025,
    toolCallBudget: { reads: 12, preparesPerFamily: 1, submits: 0 },
  },
  tools: [{
    name: "matterhorn_work_hyperliquid_markets",
    access: "read",
    outcome: "success",
    latencyMs: 80,
    source: "Hyperliquid",
    freshness: "observed 10 seconds ago",
    trust: "untrusted_external",
  }],
  memory: {
    readIds: ["memory_used"],
    writtenIds: ["memory_saved"],
  },
  capabilities: [{
    toolName: "matterhorn_work_hyperliquid_markets",
    access: "read",
    decision: "allowed",
    reason: "policy intersection allowed the exact read",
    callId: "call_read",
    decidedAt: "2026-09-04T12:00:00.100Z",
    latencyMs: 2,
  }],
  reviewedActions: [{
    intentHash: "intent-proof",
    policyHash: "policy-proof",
    simulationReference: "simulation-proof",
    publicReceipt: null,
  }],
  integrity: {
    previousHash: null,
    recordHash: "receipt-proof",
  },
};

function renderReceipt(receipt: MatterhornAgentRunReceipt): string {
  return renderToStaticMarkup(React.createElement(AgentRunReceiptDisclosure, { receipt }));
}

describe("plain-language response details", () => {
  test("translates stored privacy values into language users can understand", () => {
    expect(privacyModeLabel("public_research")).toBe("Public research");
    expect(privacyModeLabel("private_workspace")).toBe("Private workspace");
    expect(privacyModeLabel("transaction")).toBe("Wallet request");

    expect(privacyCategoryLabel("public")).toBe("public information");
    expect(privacyCategoryLabel("workspace_private")).toBe("workspace information");
    expect(privacyCategoryLabel("wallet_private")).toBe("wallet-related information");
    expect(privacyCategoryLabel("untrusted_external")).toBe("app and market data");
    expect(privacyCategoryLabel("secret")).toBe("secret");
  });

  test("gives every run state a direct status label", () => {
    expect(receiptStatusLabel("pending")).toBe("In progress");
    expect(receiptStatusLabel("success")).toBe("Completed");
    expect(receiptStatusLabel("partial")).toBe("Partially completed");
    expect(receiptStatusLabel("cancelled")).toBe("Cancelled");
    expect(receiptStatusLabel("error")).toBe("Failed");
  });

  test("leads with privacy, time, app, and wallet explanations", () => {
    expect(source).toContain("Response details");
    expect(source).toContain("Time and usage");
    expect(source).toContain("Apps and data");
    expect(source).toContain("No wallet action was prepared.");
    expect(source).toContain("Your connected wallet is the only place that can approve and send a transaction.");
    expect(source).toContain("That approval cannot be reused.");
    expect(source).toContain("Matterhorn blocked a secret before sharing this request.");
    expect(source).toContain('.filter((category) => category !== "secret")');
    expect(source).not.toContain("Data left Matterhorn");
    expect(source).not.toContain("capability decision");
    expect(source).not.toContain("Run receipt");
  });

  test("keeps security proofs available only after an explicit technical disclosure", () => {
    const technicalDetails = source.indexOf("Technical details");
    expect(technicalDetails).toBeGreaterThan(0);
    expect(source.indexOf("Request proof:")).toBeGreaterThan(technicalDetails);
    expect(source.indexOf("Receipt proof:")).toBeGreaterThan(technicalDetails);
    expect(source.indexOf("Exact app calls")).toBeGreaterThan(technicalDetails);
    expect(source.indexOf("Wallet-action proofs")).toBeGreaterThan(technicalDetails);
  });

  test("renders the customer summary and complete wallet boundary from receipt data", () => {
    const html = renderReceipt(completedReceipt);

    expect(html).toContain("Response details");
    expect(html).toContain("Completed");
    expect(html).toContain("1.3s");
    expect(html).toContain("160 tokens");
    expect(html).toContain("Private workspace");
    expect(html).toContain("The provider does not use this request for training.");
    expect(html).toContain("The provider does not keep this request after processing.");
    expect(html).not.toContain("up to 0 days");
    expect(html).toContain("Shared: workspace information, app and market data.");
    expect(html).toContain("You approved sharing this exact request once. That approval cannot be reused.");
    expect(html).toContain("Hyperliquid: Completed · Data observed 10 seconds ago");
    expect(html).toContain("1 wallet action prepared for review. None was sent.");
    expect(html).toContain("Your connected wallet is the only place that can approve and send a transaction.");
    expect(html).toContain("matterhorn_work_hyperliquid_markets · read · untrusted_external · success · 80ms");
    expect(html).toContain("Intent intent-proof · policy policy-proof · simulation simulation-proof · not sent");
    expect(html).not.toContain("workspace_private");
  });

  test("never describes a detected secret as shared", () => {
    const html = renderReceipt({
      ...completedReceipt,
      privacy: {
        ...completedReceipt.privacy,
        dataCategories: ["public", "secret"],
      },
    });

    expect(html).toContain("Shared: public information.");
    expect(html).toContain("Matterhorn blocked a secret before sharing this request.");
    expect(html).not.toContain("Shared: public information, secret");
    expect(html).not.toContain("Shared: secret");
  });

  test("does not report a false completion time while a receipt is pending", () => {
    const html = renderReceipt({
      ...completedReceipt,
      status: "pending",
      completedAt: null,
      responseDurationMs: null,
    });

    expect(html).toContain("In progress");
    expect(html).toContain("Still running");
    expect(html).not.toContain("Response time: 0ms");
  });
});
