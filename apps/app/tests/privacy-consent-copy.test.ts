import { describe, expect, test } from "bun:test";

import type { MatterhornAgentPrivacyPreflightResponse } from "@matterhorn-work/types/guarded-agent-runtime";

import {
  privacyConsentCategorySummary,
  privacyConsentDetail,
} from "../src/react-app/domains/session/surface/privacy-consent-copy";

function preflight(
  provider: Partial<MatterhornAgentPrivacyPreflightResponse["provider"]> = {},
  categories = ["selected_memory"],
): MatterhornAgentPrivacyPreflightResponse {
  return {
    version: "matterhorn.agent-privacy-preflight.v1",
    requestHash: "request_hash",
    workspaceId: "ws_1",
    sessionId: "ses_1",
    requestedMode: "public_research",
    effectiveMode: "private_workspace",
    decision: "consent_required",
    provider: {
      id: "provider",
      name: "Example AI",
      modelId: "model",
      privacyStatus: "unverified",
      trainingUse: "unknown",
      retentionDays: null,
      policyUrl: null,
      dataLeavesMatterhorn: true,
      ...provider,
    },
    detectedData: {
      labels: ["workspace_private"],
      categories,
      redactionCount: 0,
    },
    challenge: {
      id: "challenge_1",
      expiresAt: "2026-09-05T05:00:00.000Z",
      singleUse: true,
    },
    reason: "Private context requires one-request consent.",
  };
}

describe("privacy consent copy", () => {
  test("turns internal categories into a short natural-language list", () => {
    expect(privacyConsentCategorySummary([
      "workspace_attachment",
      "selected_memory",
      "linked_wallet_context",
      "selected_memory",
    ])).toBe("an attached file, saved memory, and linked wallet details");
  });

  test("does not expose unknown or secret-shaped internal category names", () => {
    expect(privacyConsentCategorySummary(["future_internal_category", "private_key"]))
      .toBe("private workspace data");
  });

  test("states unknown training and retention terms without implying protection", () => {
    const detail = privacyConsentDetail(preflight());

    expect(detail).toContain("Matterhorn will send it to Example AI.");
    expect(detail).toContain("has not verified whether the provider uses requests for training");
    expect(detail).toContain("has not verified how long the provider keeps request data");
    expect(detail).toContain("only to this exact request");
  });

  test("states reported no-training and zero-retention terms precisely", () => {
    const detail = privacyConsentDetail(preflight({
      privacyStatus: "verified_no_training",
      trainingUse: "none",
      retentionDays: 0,
    }));

    expect(detail).toContain("does not use this request for training");
    expect(detail).toContain("does not retain the request or response");
  });

  test("states opt-in training and bounded retention without hiding either", () => {
    const detail = privacyConsentDetail(preflight({
      privacyStatus: "opt_in_training",
      trainingUse: "opt_in_only",
      retentionDays: 30,
    }, ["transaction_intent"]));

    expect(detail).toContain("a proposed wallet action");
    expect(detail).toContain("may use requests for training only when its Matterhorn account has opted in");
    expect(detail).toContain("may retain request data for up to 30 days");
  });
});
