/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SessionErrorCard, parseSessionError } from "../src/react-app/domains/session/surface/session-surface";

describe("privacy consent card rendered behavior", () => {
  test("offers one explicit share-and-send action without internal labels", () => {
    const preflight = {
      version: "matterhorn.agent-privacy-preflight.v1",
      requestHash: "request_hash",
      workspaceId: "ws_1",
      sessionId: "ses_1",
      requestedMode: "public_research",
      effectiveMode: "private_workspace",
      decision: "consent_required",
      provider: {
        id: "cudos",
        name: "ASI:Cloud",
        modelId: "asi1-mini",
        privacyStatus: "unverified",
        trainingUse: "unknown",
        retentionDays: null,
        policyUrl: null,
        dataLeavesMatterhorn: true,
      },
      detectedData: {
        labels: ["workspace_private"],
        categories: ["selected_memory", "workspace_attachment"],
        redactionCount: 0,
      },
      challenge: {
        id: "challenge_1",
        expiresAt: "2026-09-05T05:00:00.000Z",
        singleUse: true,
      },
      reason: "Private context requires one-request consent.",
    };
    const error = parseSessionError(new Error(JSON.stringify({ details: preflight })));
    const html = renderToStaticMarkup(
      <SessionErrorCard
        error={error}
        onDismiss={() => {}}
        onConfirmPrivacy={() => {}}
        onOpenPrivacyDetails={() => {}}
      />,
    );

    expect(html).toContain("Share private context with ASI:Cloud once?");
    expect(html).toContain("saved memory and an attached file");
    expect(html).toContain(">Share once and send</button>");
    expect(html).toContain(">Privacy details</button>");
    expect(html).toContain("size-10");
    expect(html).toContain('aria-label="Dismiss error"');
    expect(html).not.toContain("selected_memory");
    expect(html).not.toContain("workspace_attachment");
    expect(html.match(/>Share once and send<\/button>/g)).toHaveLength(1);
  });

  test("shows an in-progress label and prevents duplicate confirmation", () => {
    const html = renderToStaticMarkup(
      <SessionErrorCard
        error={{
          message: "Share private context with ASI:Cloud once?",
          detail: "Approval applies only to this exact request.",
          kind: "privacy-consent",
        }}
        onDismiss={() => {}}
        onConfirmPrivacy={() => {}}
        confirmingPrivacy
      />,
    );

    expect(html).toContain(">Sending…</button>");
    expect(html).toContain("disabled");
  });
});
