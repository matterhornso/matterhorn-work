import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MatterhornProviderPrivacyPolicy } from "@matterhorn-work/types/backend-models";
import { PrivateModePrivacyNotice } from "../src/react-app/domains/session/surface/private-mode-privacy-notice";
import { MINIMAL_UI } from "../src/app/lib/minimal-ui";
import { readFileSync } from "node:fs";

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

const unverifiedPolicy: MatterhornProviderPrivacyPolicy = {
  ...allowedPolicy,
  allowed: false,
  status: "unverified",
  trainingUse: "unknown",
  retentionDays: null,
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
  test("does not name a processor or promise private processing without a connected model", () => {
    for (const privateModeEnabled of [false, true]) {
      const html = renderNotice({
        modelUnavailable: true,
        providerPrivacyPolicy: allowedPolicy,
        privateModeEnabled,
      });

      expect(html).toContain("No model connected");
      expect(html).not.toContain("processes this chat");
      expect(html).not.toContain("Private is on");
      expect(html).toContain(">Privacy details</button>");
    }
  });

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
    expect(html).toContain(MINIMAL_UI ? ">Privacy details</button>" : "No training");
    expect(html).not.toContain("Set up Private");
  });

  test("states the exact Venice guarantee when Private mode is on", () => {
    const html = renderNotice({
      providerPrivacyPolicy: allowedPolicy,
      privateModeAvailable: true,
      privateModeEnabled: true,
    });

    expect(html).toContain("Private is on");
    if (MINIMAL_UI) {
      expect(html).toContain("No request retention.");
      expect(html).toContain(">Privacy details</button>");
    } else {
      expect(html).toContain("Matterhorn does not train on your chats");
      expect(html).toContain("Venice does not retain this request or response.");
    }
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
      providerPrivacyPolicy: unverifiedPolicy,
      privateModeAvailable: true,
    });

    expect(html).toContain("Sending blocked");
    expect(html).toContain("training and retention terms are not verified");
  });

  test("describes the account gateway's conditional public-research path without claiming this draft passed", () => {
    const html = renderNotice({ providerPrivacyPolicy: unverifiedPolicy, accountMessageGateway: true });
    expect(html).toContain("Provider privacy unverified");
    expect(html).toContain("training and retention terms are not verified");
    expect(html).toContain("Public-only research may proceed after privacy checks");
    expect(html).toContain("private context needs review");
    expect(html).not.toContain("Sending blocked");
    expect(html).not.toContain("No request retention");
    expect(html).toContain(">Privacy details</button>");
  });

  test("selected private context requires review, not a public-research assurance", () => {
    const html = renderNotice({ providerPrivacyPolicy: unverifiedPolicy, accountMessageGateway: true, hasPrivateContext: true });
    expect(html).toContain("Private context needs privacy review before sharing");
    expect(html).toContain("training and retention terms are not verified");
    expect(html).not.toContain("Public-only research may proceed");
    expect(html).not.toContain("Private is on");
  });

  test("the composer includes attachments, saved Memory, agent files and coworkers in private-context notice selection", () => {
    const source = readFileSync(new URL("../src/react-app/domains/session/surface/session-surface.tsx", import.meta.url), "utf8");
    const notice = source.slice(source.indexOf("<PrivateModePrivacyNotice"), source.indexOf('<DevProfiler id="SessionComposer">'));
    expect(notice).toContain("accountMessageGateway={publicBetaWeb}");
    for (const context of ["attachments.length", "memoryContext?.records.length", "agentFileContext?.files.length", "agentFileContext?.coworker.id", "coworkerContext?.id"]) {
      expect(notice).toContain(context);
    }
  });

  test("private mode and unverified Venice keep the real block warning", () => {
    for (const props of [
      { privateModeEnabled: true, providerPrivacyPolicy: unverifiedPolicy },
      { providerPrivacyPolicy: { ...unverifiedPolicy, providerId: "venice", providerName: "Venice Private" } },
      { privateModeEnabled: true, providerPrivacyPolicy: { ...unverifiedPolicy, providerId: " VENICE ", providerName: "Venice Private" } },
    ]) {
      const html = renderNotice({ accountMessageGateway: true, ...props });
      expect(html).toContain("Sending blocked");
      expect(html).not.toContain("Public-only research may proceed");
      expect(html).not.toContain("Private is on");
      expect(html).not.toContain("No request retention");
    }
  });
});
