import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";

import { SessionTranscript } from "../src/react-app/domains/session/surface/message-list";

describe("crypto shared-card transcript rendering", () => {
  function renderSharedCards(sharedCards: unknown[]) {
    const messages: UIMessage[] = [
      {
        id: "assistant-crypto-shared-card",
        role: "assistant",
        parts: [
          {
            type: "tool-matterhorn_crypto_chat",
            toolCallId: "tool-crypto-chat",
            state: "output-available",
            input: { message: "show crypto context" },
            output: { sharedCards },
            providerMetadata: {
              opencode: {
                partId: "tool-crypto-chat",
              },
            },
          } as never,
        ],
      },
    ];

    return renderToStaticMarkup(
      React.createElement(SessionTranscript, {
        messages,
        isStreaming: false,
        developerMode: false,
      }),
    );
  }

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
            toolCallId: "tool-readiness-chat",
            state: "output-available",
            input: { message: "can Matterhorn submit Hyperliquid and Polymarket orders yet?" },
            output: {
              sharedCards: [
                {
                  version: "matterhorn.crypto.shared-card.v1",
                  kind: "readiness_report",
                  venue: "auto",
                  title: "Market execution readiness",
                  summary: "Cross-venue execution readiness for Hyperliquid and Polymarket. This is a readiness contract, not execution permission.",
                  status: "warning",
                  originalKind: "market_execution_readiness",
                  source: { source: "matterhorn.execution-readiness", freshness: "live" },
                  warnings: ["This is a readiness contract, not execution permission."],
                  data: {
                    kind: "market_execution_readiness",
                    report: {
                      readyForLiveSubmission: false,
                      safety: {
                        canSubmit: false,
                        liveSubmissionEnabled: false,
                        signsOrSubmits: false,
                      },
                    },
                  },
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
                partId: "tool-readiness-chat",
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
          {
            type: "tool-matterhorn_crypto_chat",
            toolCallId: "tool-sdk-validation-chat",
            state: "output-available",
            input: { message: "how do I validate Hyperliquid and Polymarket SDK templates?" },
            output: {
              sharedCards: [
                {
                  version: "matterhorn.crypto.shared-card.v1",
                  kind: "readiness_report",
                  venue: "auto",
                  title: "Official SDK validation",
                  summary: "Public/redacted fixture or operator-owned testnet validation only.",
                  status: "info",
                  originalKind: "market_sdk_validation",
                  source: { source: "matterhorn.sdk-validation", freshness: "live" },
                  warnings: ["Matterhorn does not run private SDK signing, compute final signatures, call exchanges, or submit orders."],
                  data: {
                    kind: "market_sdk_validation",
                    data: {
                      guide: {
                        modes: ["fixture", "operator_owned_fixture", "operator_owned_testnet"],
                        networks: {
                          hyperliquid: ["fixture", "hyperliquid-testnet"],
                          polymarket: ["fixture", "polygon-amoy"],
                        },
                        commands: {
                          doctor: "matterhorn-work crypto sdk-doctor --strict --json",
                          fixtureValidation: "matterhorn-work crypto sdk-validate-public --mode fixture --strict --json",
                        },
                      },
                    },
                  },
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
                partId: "tool-sdk-validation-chat",
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
    expect(html).toContain("Market execution readiness");
    expect(html).toContain("readiness contract, not execution permission");
    expect(html).toContain("matterhorn.execution-readiness");
    expect(html).toContain("Freshness");
    expect(html).toContain("live");
    expect(html).toContain("Compliance blocked");
    expect(html).toContain("User location is not eligible for this action.");
    expect(html).toContain("Official SDK validation");
    expect(html).toContain("Validation modes");
    expect(html).toContain("operator_owned_testnet");
    expect(html).toContain("Testnet networks");
    expect(html).toContain("hyperliquid-testnet");
    expect(html).toContain("polygon-amoy");
    expect(html).toContain("SDK doctor");
    expect(html).toContain("matterhorn-work crypto sdk-doctor");
    expect(html).toContain("Fixture validation");
    expect(html).toContain("matterhorn-work crypto sdk-validate-public");
    expect(html).not.toContain("External signer");
  });

  test("renders shared-card account, preview, market, receipt, and watch fixtures", () => {
    const fixturePack = JSON.parse(readFileSync("qa-fixtures/crypto-shared-cards.v1.json", "utf8")) as {
      cards: Array<Record<string, unknown>>;
    };
    const fixtureCards = fixturePack.cards.filter((card) => {
      if (card.venue === "hyperliquid" && card.kind === "account_snapshot") return true;
      if (card.venue === "hyperliquid" && card.kind === "action_preview") return true;
      if (card.venue === "polymarket" && card.kind === "market_context") return true;
      if (card.venue === "hyperliquid" && card.kind === "receipt_status") return true;
      if (card.venue === "polymarket" && card.kind === "watch_alert") return true;
      return false;
    });

    const html = renderSharedCards(fixtureCards);

    expect(html).toContain("Hyperliquid portfolio snapshot");
    expect(html).toContain("Account value");
    expect(html).toContain("$1,000");
    expect(html).toContain("Withdrawable");
    expect(html).toContain("$500");
    expect(html).toContain("Margin used");
    expect(html).toContain("$100");
    expect(html).toContain("Funding exposure");
    expect(html).toContain("BTC long: 5x leverage");

    expect(html).toContain("Preview Only: BTC order preview");
    expect(html).toContain("External signer");
    expect(html).toContain("Required");
    expect(html).toContain("Preview submit");
    expect(html).toContain("Disabled");
    expect(html).toContain("Can submit");
    expect(html).toContain("No");
    expect(html).toContain("Live submission");
    expect(html).toContain("Off");

    expect(html).toContain("Polymarket market context");
    expect(html).toContain("Preview availability");
    expect(html).toContain("available");
    expect(html).toContain("Compliance");
    expect(html).toContain("allowed");
    expect(html).toContain("Liquidity");
    expect(html).toContain("$42,000");
    expect(html).toContain("Top outcome");
    expect(html).toContain("Yes (0.62)");

    expect(html).toContain("Public receipt");
    expect(html).toContain("Receipt status");
    expect(html).toContain("filled");
    expect(html).toContain("Public order id");
    expect(html).toContain("public-order-1");

    expect(html).toContain("Watch alert");
    expect(html).toContain("Watch id");
    expect(html).toContain("watch-1");
    expect(html).toContain("Watch status");
    expect(html).toContain("triggered");

    expect(html).not.toContain("privateKey");
    expect(html).not.toContain("rawSignature");
    expect(html).not.toContain("signedPayload");
  });
});
