import { describe, expect, test } from "bun:test";

import { validateMatterhornCoworkerProfile } from "@matterhorn-work/types/crypto-coworkers";

import {
  getMatterhornCoworkerTemplate,
  listMatterhornCoworkerTemplates,
} from "./crypto-coworker-templates.js";

describe("crypto coworker templates", () => {
  test("ships all four chat-first roles with bounded authority", () => {
    const templates = listMatterhornCoworkerTemplates();
    expect(templates.map((template) => template.id)).toEqual([
      "market_analyst",
      "risk_monitor",
      "transaction_coordinator",
      "treasury_coworker",
    ]);
    for (const template of templates) {
      expect(template.suggestedPrompts.length).toBeGreaterThanOrEqual(3);
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

    for (const id of ["market_analyst", "risk_monitor"] as const) {
      const template = getMatterhornCoworkerTemplate(id)!;
      expect(template.profile.automaticAuthorities).not.toContain("prepare");
      expect(template.profile.limits.maxPrepareCallsPerFamily).toBe(0);
      expect(template.profile.allowedAppIds).toContain("matterhorn.bittensor-testnet");
      expect(template.profile.allowedActionIds).toEqual(expect.arrayContaining([
        "bittensor_subnet_list",
        "bittensor_subnet_read",
      ]));
      expect(template.profile.allowedNetworks).toContain("bittensor:test");
      expect(template.profile.allowedAppIds).toEqual(expect.arrayContaining([
        "matterhorn.polymarket-research",
        "matterhorn.polymarket-clob-research",
      ]));
      expect(template.profile.allowedActionIds).toEqual(expect.arrayContaining([
        "polymarket_market_search",
        "polymarket_orderbook_read",
      ]));
      expect(template.profile.allowedNetworks).toContain("polymarket:public");
    }

    for (const id of ["transaction_coordinator", "treasury_coworker"] as const) {
      const template = getMatterhornCoworkerTemplate(id)!;
      expect(template.profile.automaticAuthorities).toContain("prepare");
      expect(template.profile.limits.maxPrepareCallsPerFamily).toBe(1);
      expect(template.profile.allowedNetworks.every((network) => (
        network.endsWith(":testnet") || network === "bittensor:test"
      ))).toBe(true);
      expect(template.profile.allowedActionIds.some((action) => action.endsWith("_preview"))).toBe(true);
      expect(template.profile.allowedAppIds).toContain("matterhorn.bittensor-testnet");
      expect(template.profile.allowedActionIds).toContain("bittensor_prepare_transfer");
      expect(template.profile.allowedAppIds).not.toContain("matterhorn.polymarket-clob-research");
      expect(template.profile.allowedNetworks).not.toContain("polymarket:public");
      expect(template.profile.privacy.allowUnverifiedProviderConsent).toBe(false);
    }
    expect(getMatterhornCoworkerTemplate("transaction_coordinator")?.profile.allowedActionIds).toEqual(
      expect.arrayContaining(["bittensor_prepare_stake", "bittensor_prepare_unstake"]),
    );
    expect(getMatterhornCoworkerTemplate("treasury_coworker")?.profile.allowedActionIds)
      .not.toContain("bittensor_prepare_stake");
  });

  test("returns defensive copies and no fallback for unknown templates", () => {
    const template = getMatterhornCoworkerTemplate("market_analyst")!;
    template.profile.allowedAppIds.push("malicious.app");
    expect(getMatterhornCoworkerTemplate("market_analyst")?.profile.allowedAppIds)
      .not.toContain("malicious.app");
    expect(getMatterhornCoworkerTemplate("unknown")).toBeNull();
  });
});
