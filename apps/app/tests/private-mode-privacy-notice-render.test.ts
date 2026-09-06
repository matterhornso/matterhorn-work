import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MatterhornProviderPrivacyPolicy } from "@matterhorn-work/types/backend-models";
import { PrivateModePrivacyNotice } from "../src/react-app/domains/session/surface/private-mode-privacy-notice";

const allowedPolicy: MatterhornProviderPrivacyPolicy = {
  providerId: "cudos",
  providerName: "ASI:Cloud",
  status: "verified_no_training",
  trainingUse: "none",
  retentionDays: 0,
  policyUrl: "https://example.test/privacy",
  verifiedAt: "2026-09-01T00:00:00.000Z",
  verificationExpiresAt: null,
  verifiedModelIds: [],
  allowed: true,
  label: "No training",
  description: "Prompts are not used for training.",
};

function renderNotice(
  props: Partial<React.ComponentProps<typeof PrivateModePrivacyNotice>> = {},
) {
  return renderToStaticMarkup(
    React.createElement(PrivateModePrivacyNotice, {
      providerPrivacyPolicy: null,
      privateModeAvailable: false,
      privateModeEnabled: false,
      privateModeUnavailableReason: null,
      onPrivateModeChange: () => undefined,
      onOpenPrivacyDetails: () => undefined,
      ...props,
    }),
  );
}

describe("Private mode privacy notice rendered behavior", () => {
  test("gives an unconfigured user a plain-language setup path", () => {
    const html = renderNotice();

    expect(html).toContain("Private is off");
    expect(html).toContain("Matterhorn does not train on your chats.");
    expect(html).toContain(
      "Set up Venice for no prompt or response retention.",
    );
    expect(html).not.toContain(">Set up Private</button>");
    expect(html).toContain(">Privacy details</button>");
  });

  test("names the current processor while Private mode is off", () => {
    const html = renderNotice({
      providerPrivacyPolicy: allowedPolicy,
      privateModeAvailable: true,
    });

    expect(html).toContain("Private is off");
    expect(html).toContain("ASI:Cloud processes this chat");
    expect(html).toContain("No training");
    expect(html).not.toContain("Set up Private");
  });

  test("states the exact Venice guarantee when Private mode is on", () => {
    const html = renderNotice({
      providerPrivacyPolicy: allowedPolicy,
      privateModeAvailable: true,
      privateModeEnabled: true,
    });

    expect(html).toContain("Private is on");
    expect(html).toContain("Matterhorn does not train on your chats");
    expect(html).toContain("Venice does not retain this request or response.");
    expect(html).not.toContain("Set up Private");
  });

  test("shows a verification failure and one recovery action", () => {
    const reason =
      "Matterhorn could not verify Venice's current private-model list.";
    const html = renderNotice({ privateModeUnavailableReason: reason });

    expect(html).toContain("Private is unavailable");
    expect(html).toContain(reason.replaceAll("'", "&#x27;"));
    expect(html).not.toContain(">Review Private</button>");
    expect(html).toContain(">Privacy details</button>");
  });

  test("keeps an unverified provider fail-closed", () => {
    const html = renderNotice({
      providerPrivacyPolicy: {
        ...allowedPolicy,
        allowed: false,
        status: "unverified",
        trainingUse: "unknown",
        retentionDays: null,
      },
      privateModeAvailable: true,
    });

    expect(html).toContain("Sending blocked");
    expect(html).toContain("training and retention terms are not verified");
  });
});
