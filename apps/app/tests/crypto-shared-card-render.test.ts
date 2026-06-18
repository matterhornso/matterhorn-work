import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";

import { SessionTranscript } from "../src/react-app/domains/session/surface/message-list";

describe("crypto shared-card transcript rendering", () => {
  test("renders versioned shared crypto cards with customer safety context", () => {
    const messages: UIMessage[] = [
      {
        id: "assistant-crypto-shared-card",
        role: "assistant",
        parts: [
          {
            type: "tool-matterhorn_crypto_chat",
            toolCallId: "tool-crypto-chat",
            state: "output-available",
            input: { message: "show BTC orderbook on Hyperliquid" },
            output: {
              sharedCards: [
                {
                  version: "matterhorn.crypto.shared-card.v1",
                  kind: "orderbook_context",
                  venue: "hyperliquid",
                  title: "BTC orderbook",
                  summary: "Read-only orderbook/depth context from hyperliquid.",
                  status: "success",
                  originalKind: "hyperliquid_orderbook",
                  source: { source: "mock.hyperliquid" },
                  warnings: [],
                  data: { rows: [] },
                  safety: {
                    nonCustodial: true,
                    liveSubmissionEnabled: false,
                    canSubmit: false,
                  },
                },
              ],
            },
            providerMetadata: {
              opencode: {
                partId: "tool-crypto-chat",
              },
            },
          } as never,
          {
            type: "tool-matterhorn_crypto_chat",
            toolCallId: "tool-polymarket-chat",
            state: "output-available",
            input: { message: "preview Polymarket order" },
            output: {
              sharedCards: [
                {
                  version: "matterhorn.crypto.shared-card.v1",
                  kind: "compliance_block",
                  venue: "polymarket",
                  title: "Compliance blocked",
                  summary: "Compliance status from polymarket; blocked previews must not contain executable order terms.",
                  status: "danger",
                  originalKind: "polymarket_compliance",
                  source: null,
                  warnings: ["User location is not eligible for this action."],
                  data: {},
                  safety: {
                    nonCustodial: true,
                    liveSubmissionEnabled: false,
                    canSubmit: false,
                  },
                },
              ],
            },
            providerMetadata: {
              opencode: {
                partId: "tool-polymarket-chat",
              },
            },
          } as never,
        ],
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(SessionTranscript, {
        messages,
        isStreaming: false,
        developerMode: false,
      }),
    );

    expect(html).toContain("BTC orderbook");
    expect(html).toContain("Read-only orderbook/depth context from hyperliquid.");
    expect(html).toContain("Hyperliquid");
    expect(html).toContain("Can submit");
    expect(html).toContain("No");
    expect(html).toContain("Live submission");
    expect(html).toContain("Off");
    expect(html).toContain("mock.hyperliquid");
    expect(html).toContain("Compliance blocked");
    expect(html).toContain("User location is not eligible for this action.");
  });
});
