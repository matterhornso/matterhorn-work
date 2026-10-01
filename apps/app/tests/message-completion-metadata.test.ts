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
