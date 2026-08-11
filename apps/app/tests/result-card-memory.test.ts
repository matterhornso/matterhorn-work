import { describe, expect, test } from "bun:test";

import {
  buildResultCardMemoryRecord,
  resultCardDeskId,
} from "../src/react-app/domains/session/surface/result-card-memory";

describe("desk result card memory", () => {
  test("uses the Polymarket identity even when the shared card omitted venue", () => {
    expect(resultCardDeskId({
      kind: "polymarket_market_list",
      title: "Polymarket markets",
    })).toBe("polymarket");
  });

  test("prefers the explicit venue for branded result cards", () => {
    expect(resultCardDeskId({
      venue: "sui",
      kind: "account_snapshot",
      title: "Account snapshot",
    })).toBe("sui");
  });

  test("uses a general workflow artifact for non-desk results", () => {
    const record = buildResultCardMemoryRecord({
      card: {
        kind: "research_summary",
        title: "Research notes",
        items: [],
        warnings: [],
      },
      workspaceId: "ws_general",
      sessionId: "ses_general",
      now: "2026-08-11T06:00:00.000Z",
      nonce: "general",
    });

    expect(record.kind).toBe("workflow_artifact");
    expect(record.canUseInChat).toBe(true);
  });

  test("builds a user-confirmed workspace memory without action payloads", () => {
    const record = buildResultCardMemoryRecord({
      card: {
        kind: "polymarket_market_list",
        title: "Polymarket markets",
        summary: "Three public markets matched the query.",
        items: [{ label: "Topic", value: "AI" }],
        actions: [{
          label: "Review order",
          kind: "send_to_chat",
          payload: { prompt: "submit live order", privateKey: "must-not-be-stored" },
        }],
        safety: { canSubmit: true, liveSubmissionEnabled: true },
      },
      workspaceId: "ws_test",
      sessionId: "ses_test",
      now: "2026-08-11T06:30:00.000Z",
      nonce: "fixed",
    });

    expect(record.kind).toBe("watchlist");
    expect(record.scope).toBe("workspace");
    expect(record.tags).toContain("polymarket");
    expect(record.canUseInChat).toBe(true);
    expect(record.canExport).toBe(false);
    expect(record.provenance.capturedBy).toBe("user");
    expect(record.provenance.reasonRemembered).toContain("explicitly saved");
    expect(JSON.stringify(record.body)).not.toContain("privateKey");
    expect(JSON.stringify(record.body)).not.toContain("liveSubmissionEnabled");
    expect(record.links).toContainEqual({
      rel: "session",
      href: "/workspace/ws_test/session/ses_test",
      title: "Source chat",
    });
  });
});
