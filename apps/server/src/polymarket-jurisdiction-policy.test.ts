import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_POLYMARKET_JURISDICTION_POLICY_HASH,
  evaluatePolymarketOpenPositionJurisdiction,
} from "./polymarket-jurisdiction-policy.js";
import type { MatterhornTrustedJurisdiction } from "./trusted-jurisdiction.js";

const NOW = new Date("2026-09-04T12:00:00.000Z");

function jurisdiction(country: string, region: string | null = null): MatterhornTrustedJurisdiction {
  return {
    version: "matterhorn.edge-jurisdiction.v2",
    source: "vercel_ip_country",
    country,
    region,
    observedAt: "2026-09-04T11:59:59.000Z",
    expiresAt: "2026-09-04T12:00:59.000Z",
    evidenceHash: "a".repeat(64),
  };
}

describe("Polymarket server-owned jurisdiction policy", () => {
  test("allows an unambiguously open country without retaining location in the decision", () => {
    const result = evaluatePolymarketOpenPositionJurisdiction(jurisdiction("CH", "ZH"), NOW);
    expect(result).toMatchObject({
      status: "allowed",
      canOpenPosition: true,
      reasonCode: null,
      policyHash: MATTERHORN_POLYMARKET_JURISDICTION_POLICY_HASH,
      validUntil: "2026-09-04T12:00:59.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("CH");
    expect(JSON.stringify(result)).not.toContain("ZH");
  });

  test("blocks every official country status from opening a position", () => {
    const blocked = [
      "CU", "IR", "KP", "SY",
    ];
    for (const country of blocked) {
      expect(evaluatePolymarketOpenPositionJurisdiction(jurisdiction(country), NOW))
        .toMatchObject({ status: "blocked", canOpenPosition: false, reasonCode: "country_blocked" });
    }
    for (const country of [
      "AU", "BE", "BY", "BI", "BR", "CF", "CD", "DE", "ET", "FR", "GB", "IQ", "IT", "LB",
      "LY", "MM", "NI", "NZ", "PL", "RU", "SG", "SK", "SO", "SS", "SD", "TH", "TW", "UM", "US",
      "VE", "YE", "ZW",
    ]) {
      expect(evaluatePolymarketOpenPositionJurisdiction(jurisdiction(country), NOW))
        .toMatchObject({ status: "blocked", canOpenPosition: false, reasonCode: "country_close_only" });
    }
    for (const country of ["IE", "JP", "NL"]) {
      expect(evaluatePolymarketOpenPositionJurisdiction(jurisdiction(country), NOW))
        .toMatchObject({ status: "blocked", canOpenPosition: false, reasonCode: "country_frontend_restricted" });
    }
    expect(evaluatePolymarketOpenPositionJurisdiction(jurisdiction("MT"), NOW))
      .toMatchObject({ status: "blocked", canOpenPosition: false, reasonCode: "country_frontend_sports_only" });
  });

  test("blocks restricted subregions and fails closed when a required region is missing", () => {
    for (const region of ["AB", "BC", "ON", "QC"]) {
      expect(evaluatePolymarketOpenPositionJurisdiction(jurisdiction("CA", region), NOW))
        .toMatchObject({ status: "blocked", reasonCode: "region_close_only" });
    }
    expect(evaluatePolymarketOpenPositionJurisdiction(jurisdiction("CA", "NS"), NOW))
      .toMatchObject({ status: "allowed", reasonCode: null });
    expect(evaluatePolymarketOpenPositionJurisdiction(jurisdiction("CA"), NOW))
      .toMatchObject({ status: "unverified", reasonCode: "region_required" });
    for (const region of ["09", "14", "43"]) {
      expect(evaluatePolymarketOpenPositionJurisdiction(jurisdiction("UA", region), NOW))
        .toMatchObject({ status: "blocked", reasonCode: "region_blocked" });
    }
    expect(evaluatePolymarketOpenPositionJurisdiction(jurisdiction("UA", "30"), NOW))
      .toMatchObject({ status: "allowed", reasonCode: null });
  });

  test("fails closed without trusted evidence and after the policy review deadline", () => {
    expect(evaluatePolymarketOpenPositionJurisdiction(null, NOW))
      .toMatchObject({ status: "unverified", canOpenPosition: false, reasonCode: "trusted_jurisdiction_missing" });
    expect(evaluatePolymarketOpenPositionJurisdiction(
      {
        ...jurisdiction("CH", "ZH"),
        observedAt: "2026-10-03T23:59:59.000Z",
        expiresAt: "2026-10-04T00:00:59.000Z",
      },
      new Date("2026-10-04T00:00:00.000Z"),
    )).toMatchObject({ status: "unverified", canOpenPosition: false, reasonCode: "policy_review_required" });
    expect(evaluatePolymarketOpenPositionJurisdiction({
      ...jurisdiction("CH", "ZH"),
      expiresAt: "2026-09-04T12:00:00.000Z",
    }, NOW)).toMatchObject({
      status: "unverified",
      canOpenPosition: false,
      reasonCode: "trusted_jurisdiction_invalid_or_expired",
    });
  });

  test("binds decisions to both the policy and the exact edge evidence", () => {
    const first = evaluatePolymarketOpenPositionJurisdiction(jurisdiction("CH", "ZH"), NOW);
    const second = evaluatePolymarketOpenPositionJurisdiction({
      ...jurisdiction("CH", "ZH"),
      evidenceHash: "f".repeat(64),
    }, NOW);
    expect(first.policyHash).toBe(second.policyHash);
    expect(first.decisionHash).not.toBe(second.decisionHash);
  });
});
