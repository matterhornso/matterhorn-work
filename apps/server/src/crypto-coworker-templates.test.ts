import { describe, expect, test } from "bun:test";

import { validateMatterhornCoworkerProfile } from "@matterhorn-work/types/crypto-coworkers";

import {
  getMatterhornCoworkerTemplate,
  listMatterhornCoworkerTemplates,
} from "./crypto-coworker-templates.js";

describe("crypto coworker templates", () => {
  test("ships chat-first analyst and monitor profiles without prepare or submit authority", () => {
    const templates = listMatterhornCoworkerTemplates();
    expect(templates.map((template) => template.id)).toEqual(["market_analyst", "risk_monitor"]);
    for (const template of templates) {
      expect(template.suggestedPrompts.length).toBeGreaterThanOrEqual(3);
      expect(template.profile.automaticAuthorities).not.toContain("prepare");
      expect(JSON.stringify(template)).not.toMatch(/\b(?:sign|submit|relay|broadcast)\b/i);
      expect(validateMatterhornCoworkerProfile({
        version: "matterhorn.coworker-profile.v1",
        id: `cw_${template.id}`,
        workspaceId: "ws_template",
        ownerId: "account_template",
        revision: 1,
        policyVersion: "coworker-policy-1",
        ...template.profile,
        state: "active",
        escalation: {
          privateDataRequiresDisclosure: true,
          transactionRequiresWalletReview: true,
          walletSubmission: "connected_wallet_only",
        },
        createdAt: "2026-09-01T12:00:00.000Z",
        updatedAt: "2026-09-01T12:00:00.000Z",
      })).toEqual([]);
    }
  });

  test("returns defensive copies and no fallback for unknown templates", () => {
    const template = getMatterhornCoworkerTemplate("market_analyst")!;
    template.profile.allowedAppIds.push("malicious.app");
    expect(getMatterhornCoworkerTemplate("market_analyst")?.profile.allowedAppIds)
      .not.toContain("malicious.app");
    expect(getMatterhornCoworkerTemplate("unknown")).toBeNull();
  });
});
