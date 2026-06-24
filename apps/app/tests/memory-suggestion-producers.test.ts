import { describe, expect, test } from "bun:test";

import { buildMatterhornMemorySuggestions } from "../src/react-app/domains/memory/memory-suggestion-producers";

function bodyOf(suggestion: ReturnType<typeof buildMatterhornMemorySuggestions>[number]) {
  return suggestion.proposedRecord.body as Record<string, unknown>;
}

describe("Matterhorn memory suggestion producers", () => {
  test("suggests public Hyperliquid watch context without execution fields", () => {
    const suggestions = buildMatterhornMemorySuggestions({
      desk: "hyperliquid",
      prompt: "Use Hyperliquid chat to watch BTC funding and orderbook context.",
      source: "chat_capture",
      sourceId: "producer-test",
      workspaceId: "workspace-test",
      sessionId: "session-test",
    });

    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0]!;
    const body = bodyOf(suggestion);
    expect(suggestion.desk).toBe("hyperliquid");
    expect(suggestion.useCase).toBe("hyperliquid_watched_market");
    expect(suggestion.captureMode).toBe("user_confirmed_only");
    expect(suggestion.canAutoCapture).toBe(false);
    expect(suggestion.requiresExplicitConsent).toBe(true);
    expect(suggestion.proposedRecord.kind).toBe("watchlist");
    expect(suggestion.proposedRecord.canExport).toBe(false);
    expect(body.venue).toBe("hyperliquid");
    expect(body.asset).toBe("BTC");
    expect(body.readOnly).toBe(true);
    expect(body.previewOnly).toBe(true);
    expect(body.externalSignerRequired).toBe(true);
    expect(body).not.toHaveProperty("canSubmit");
    expect(body).not.toHaveProperty("liveSubmissionEnabled");
  });

  test("suggests public Polymarket watch context without execution fields", () => {
    const suggestions = buildMatterhornMemorySuggestions({
      desk: "polymarket",
      prompt: "Summarize this Polymarket election market odds and liquidity.",
      source: "chat_capture",
      sourceId: "producer-test",
      workspaceId: "workspace-test",
      sessionId: "session-test",
    });

    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0]!;
    const body = bodyOf(suggestion);
    expect(suggestion.desk).toBe("polymarket");
    expect(suggestion.useCase).toBe("polymarket_watched_market");
    expect(suggestion.captureMode).toBe("user_confirmed_only");
    expect(suggestion.canAutoCapture).toBe(false);
    expect(suggestion.requiresExplicitConsent).toBe(true);
    expect(suggestion.proposedRecord.kind).toBe("watchlist");
    expect(suggestion.proposedRecord.canExport).toBe(false);
    expect(body.venue).toBe("polymarket");
    expect(body.topic).toBe("Summarize this election market odds and liquidity.");
    expect(body.readOnly).toBe(true);
    expect(body.previewOnly).toBe(true);
    expect(body.externalSignerRequired).toBe(true);
    expect(body).not.toHaveProperty("canSubmit");
    expect(body).not.toHaveProperty("liveSubmissionEnabled");
  });

  test("refuses secret-shaped market prompt input", () => {
    const suggestions = buildMatterhornMemorySuggestions({
      desk: "hyperliquid",
      prompt: "Remember my API secret HYPERLIQUID_SECRET=super-secret-value for BTC.",
      source: "chat_capture",
      sourceId: "producer-secret-test",
    });

    expect(suggestions).toEqual([]);
  });
});
