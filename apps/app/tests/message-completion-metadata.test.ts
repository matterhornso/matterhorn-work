import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import {
  buildOpenCodeMessageMetadata,
  responseCompletionSummary,
} from "../src/react-app/domains/session/message-completion-metadata";

function assistantMessage(parts: UIMessage["parts"], metadata?: UIMessage["metadata"]): UIMessage {
  return {
    id: "assistant-response",
    role: "assistant",
    parts,
    ...(metadata ? { metadata } : {}),
  };
}

describe("completed response metadata", () => {
  test("stopping a streamed answer leaves token usage unavailable, not zero", () => {
    const metadata = buildOpenCodeMessageMetadata({
      error: { name: "MessageAbortedError", data: { message: "Aborted" } },
      time: { created: 1_000, completed: 22_000 },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    const summary = responseCompletionSummary(assistantMessage([
      { type: "text", text: "A partial streamed answer. ".repeat(500) },
    ], metadata));
    expect(summary).toMatchObject({
      state: "stopped", label: "Stopped", durationLabel: "21 s",
      tokenLabel: "Tokens unavailable", tokenDetail: "Token usage is unavailable for this response.",
    });
    expect(summary.tokenDetail).not.toContain("Provider-reported");
  });

  for (const tokens of [undefined, {}, { input: 120 }, { output: 36 },
    { input: 120, output: Number.NaN }, { input: -1, output: 36 },
    { input: 120, output: 36, reasoning: Number.NaN }]) {
    test(`does not present incomplete counters as total usage: ${JSON.stringify(tokens)}`, () => {
      const metadata = buildOpenCodeMessageMetadata({ finish: "stop", tokens });
      expect(responseCompletionSummary(assistantMessage([], metadata))).toMatchObject({
        tokenLabel: "Tokens unavailable", tokenDetail: "Token usage is unavailable for this response.",
      });
    });
  }

  test.each(["stop", "tool-calls", "length", "content-filter"])("preserves known usage and explicit zero for %s", (finish) => {
    for (const tokens of [{ total: 473 }, { input: 350, output: 123 }]) {
      const metadata = buildOpenCodeMessageMetadata({ finish, tokens });
      expect(responseCompletionSummary(assistantMessage([], metadata)).tokenLabel).toBe("473 tokens");
    }
    const zero = buildOpenCodeMessageMetadata({ finish, tokens: { total: 0 } });
    expect(responseCompletionSummary(assistantMessage([], zero))).toMatchObject({
      tokenLabel: "0 tokens", tokenDetail: "Provider-reported usage: 0 total tokens.",
    });
    const placeholder = buildOpenCodeMessageMetadata({ finish, tokens: { input: 0, output: 0, reasoning: 0 } });
    expect(responseCompletionSummary(assistantMessage([], placeholder)).tokenLabel).toBe("Tokens unavailable");
  });

  test.each(["MessageAbortedError", "APIError"])("does not trust zero or a stale finish after %s", (name) => {
    for (const finish of [undefined, "unknown", "stop", "tool-calls"]) {
      const metadata = buildOpenCodeMessageMetadata({ finish, error: { name }, tokens: { total: 0 } });
      expect(responseCompletionSummary(assistantMessage([], metadata)).tokenLabel).toBe("Tokens unavailable");
      const known = buildOpenCodeMessageMetadata({ finish, error: { name }, tokens: { input: 350, output: 123 } });
      expect(responseCompletionSummary(assistantMessage([], known)).tokenLabel).toBe("473 tokens");
    }
  });

  test("does not infer reported zero from an unverified completion timestamp", () => {
    const metadata = buildOpenCodeMessageMetadata({ time: { created: 1000, completed: 2000 }, tokens: { total: 0 } });
    expect(responseCompletionSummary(assistantMessage([], metadata))).toMatchObject({
      state: "unknown", tokenLabel: "Tokens unavailable",
    });
  });

  test.each([
    ["stop", "completed", "Completed"],
    ["length", "incomplete", "Incomplete"],
    ["tool-calls", "step", "Tool step"],
    ["content-filter", "incomplete", "Incomplete"],
    ["unknown", "unknown", "Completion unverified"],
    [undefined, "unknown", "Completion unverified"],
  ])("reports finish %s without inferring success from a timestamp", (finish, state, label) => {
    const metadata = buildOpenCodeMessageMetadata({ finish, time: { created: 1000, completed: 2000 }, tokens: { total: 473 } });
    expect(responseCompletionSummary(assistantMessage([{ type: "text", text: "Partial" }], metadata)))
      .toMatchObject({ state, label, tokenLabel: "473 tokens" });
  });

  test.each([["MessageAbortedError", "stopped"], ["APIError", "failed"]])("error %s overrides stop", (name, state) => {
    const metadata = buildOpenCodeMessageMetadata({ finish: "stop", error: { name, data: { message: "private provider detail" } } });
    expect(responseCompletionSummary(assistantMessage([], metadata)).state).toBe(state);
    expect(JSON.stringify(metadata)).not.toContain("private provider detail");
  });

  test("preserves provider usage and timing from the OpenCode message", () => {
    const metadata = buildOpenCodeMessageMetadata({
      role: "assistant",
      time: { created: 1_000, completed: 9_450 },
      tokens: {
        total: 1_650,
        input: 1_200,
        output: 400,
        reasoning: 50,
        cache: { read: 600, write: 0 },
      },
    });
    const summary = responseCompletionSummary(assistantMessage([
      { type: "text", text: "Finished." },
    ], metadata));

    expect(summary.tokenLabel).toBe("1,650 tokens");
    expect(summary.tokenDetail).toContain("1,200 input");
    expect(summary.tokenDetail).toContain("400 output");
    expect(summary.durationLabel).toBe("8.4 s");
  });

  test("fails honestly when an older provider message has no usage metadata", () => {
    const summary = responseCompletionSummary(assistantMessage([
      { type: "text", text: "Finished." },
    ]));

    expect(summary.tokenLabel).toBe("Tokens unavailable");
    expect(summary.durationLabel).toBe("Time unavailable");
    expect(summary.transaction.state).toBe("none");
  });

  test("distinguishes a review preview from a submitted transaction", () => {
    const summary = responseCompletionSummary(assistantMessage([{
      type: "dynamic-tool",
      toolName: "matterhorn_crypto_chat",
      toolCallId: "preview",
      state: "output-available",
      input: {},
      output: { cards: [{ kind: "action_preview", title: "Review order" }] },
    }]));

    expect(summary.transaction).toMatchObject({
      state: "preview",
      label: "Preview only · no transaction",
    });
  });

  test("reports persisted transaction receipts only when an output path exists", () => {
    const summary = responseCompletionSummary(assistantMessage([{
      type: "dynamic-tool",
      toolName: "matterhorn_sui_chat",
      toolCallId: "receipt",
      state: "output-available",
      input: {},
      output: {
        cards: [{ kind: "sui_transaction_receipt", data: { receipt: { transactionDigest: "0xabc" } } }],
        evidence: { outputPath: "outputs/sui/session/transaction-receipt-0xabc.json" },
      },
    }]));

    expect(summary.transaction).toMatchObject({
      state: "persisted",
      label: "Tx receipt · Outputs + Activity",
    });
    expect(summary.transaction.detail).toContain("does not store private keys or seed phrases");
  });

  test("does not mistake an ordinary saved research output for transaction history", () => {
    const summary = responseCompletionSummary(assistantMessage([{
      type: "dynamic-tool",
      toolName: "matterhorn_crypto_chat",
      toolCallId: "research",
      state: "output-available",
      input: {},
      output: {
        cards: [{ kind: "market_context", title: "Market research" }],
        evidence: { outputPath: "outputs/polymarket/session/research.json" },
      },
    }]));

    expect(summary.transaction.state).toBe("none");
  });
});
