import { describe, expect, test } from "bun:test";

import { buildMatterhornMemorySuggestions } from "../src/react-app/domains/memory/memory-suggestion-producers";

function bodyOf(suggestion: ReturnType<typeof buildMatterhornMemorySuggestions>[number]) {
  return suggestion.proposedRecord.body as Record<string, unknown>;
}

describe("Matterhorn memory suggestion producers", () => {
  test("writes compact Bittensor why-suggested copy without exposing full SS58", () => {
    const ss58Address = "5GrwvaEF5zXb26Fz9rcQpDWS7KSJYEcC5F11jTXURrWbkE3";
    const suggestions = buildMatterhornMemorySuggestions({
      desk: "bittensor",
      prompt: `Show my TAO for ${ss58Address}`,
      source: "chat_capture",
      sourceId: "producer-bittensor-test",
      workspaceId: "workspace-test",
      sessionId: "session-test",
    });

    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0]!;
    expect(suggestion.desk).toBe("bittensor");
    expect(suggestion.reason.length).toBeLessThanOrEqual(200);
    expect(suggestion.reason).toContain("visible chat");
    expect(suggestion.reason).toContain("5Grwva...bkE3");
    expect(suggestion.reason).not.toContain(ss58Address);
    expect(suggestion.proposedRecord.body).toEqual({ ss58Address });
  });

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
    expect(suggestion.reason.length).toBeLessThanOrEqual(200);
    expect(suggestion.reason).toContain("Hyperliquid preview");
    expect(suggestion.reason).toContain("read-only orderbook");
    expect(suggestion.reason).not.toMatch(/\bsubmit|submitted|execute|executed|signing\b/i);
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
    expect(suggestion.reason.length).toBeLessThanOrEqual(200);
    expect(suggestion.reason).toContain("read-only research prompt");
    expect(suggestion.reason).toContain("outcome");
    expect(suggestion.reason).not.toMatch(/\bbet|placed|submit|submitted|execute|executed|signing\b/i);
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

  test("suggests public Sui wallet context without treating public addresses as secrets", () => {
    const suiAddress = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const suggestions = buildMatterhornMemorySuggestions({
      desk: "sui",
      prompt: `Show my Sui wallet ${suiAddress} on testnet.`,
      source: "chat_capture",
      sourceId: "producer-sui-test",
      workspaceId: "workspace-test",
      sessionId: "session-test",
    });

    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0]!;
    const body = bodyOf(suggestion);
    expect(suggestion.desk).toBe("sui");
    expect(suggestion.useCase).toBe("sui_wallet_label");
    expect(suggestion.captureMode).toBe("user_confirmed_only");
    expect(suggestion.canAutoCapture).toBe(false);
    expect(suggestion.requiresExplicitConsent).toBe(true);
    expect(suggestion.reason).toContain("visible chat");
    expect(suggestion.reason).toContain("0x1234...cdef");
    expect(suggestion.proposedRecord.kind).toBe("protocol_address");
    expect(suggestion.proposedRecord.canExport).toBe(true);
    expect(body.suiAddress).toBe(suiAddress);
    expect(body).not.toHaveProperty("privateKey");
    expect(body).not.toHaveProperty("signedPayload");
  });

  test("suggests Sui receipt context without executable signing data", () => {
    const suggestions = buildMatterhornMemorySuggestions({
      desk: "sui",
      prompt: "Import this Sui transaction digest receipt for project evidence review.",
      source: "chat_capture",
      sourceId: "producer-sui-receipt-test",
      workspaceId: "workspace-test",
      sessionId: "session-test",
    });

    expect(suggestions).toHaveLength(1);
    const suggestion = suggestions[0]!;
    const body = bodyOf(suggestion);
    expect(suggestion.desk).toBe("sui");
    expect(suggestion.useCase).toBe("sui_receipt_context");
    expect(suggestion.proposedRecord.kind).toBe("receipt");
    expect(body.venue).toBe("sui");
    expect(body.publicReceiptOnly).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/\b(privateKey|seedPhrase|signedPayload|rawSignature|walletExport)\b/);
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
