import { sha256 } from "./guarded-runtime-crypto.js";
import type { MatterhornTrustedJurisdiction } from "./trusted-jurisdiction.js";

export const MATTERHORN_POLYMARKET_JURISDICTION_POLICY_VERSION =
  "matterhorn.polymarket-jurisdiction-policy.2026-09-04.v1" as const;
export const MATTERHORN_POLYMARKET_JURISDICTION_POLICY_REVIEW_AFTER =
  "2026-10-04T00:00:00.000Z" as const;
export const MATTERHORN_POLYMARKET_JURISDICTION_DECISION_VERSION =
  "matterhorn.polymarket-jurisdiction-decision.v1" as const;

type RestrictedJurisdictionStatus =
  | "blocked"
  | "close_only"
  | "frontend_restricted"
  | "frontend_sports_only";

// Sourced from Polymarket's official Geographic Restrictions documentation.
// This is deliberately closed and review-dated. Unknown future policy is a
// denial, never an implicit permission.
const RESTRICTED_COUNTRIES: Readonly<Record<string, RestrictedJurisdictionStatus>> = Object.freeze({
  AU: "close_only",
  BE: "close_only",
  BY: "close_only",
  BI: "close_only",
  BR: "close_only",
  CF: "close_only",
  CD: "close_only",
  CU: "blocked",
  DE: "close_only",
  ET: "close_only",
  FR: "close_only",
  GB: "close_only",
  IE: "frontend_restricted",
  IR: "blocked",
  IQ: "close_only",
  IT: "close_only",
  JP: "frontend_restricted",
  KP: "blocked",
  LB: "close_only",
  LY: "close_only",
  MM: "close_only",
  // Malta is frontend-restricted for sports only. Until a certified preview
  // carries a typed market-category attestation, opening is denied rather than
  // guessing that a caller-supplied market is non-sports.
  MT: "frontend_sports_only",
  NI: "close_only",
  NL: "frontend_restricted",
  NZ: "close_only",
  PL: "close_only",
  RU: "close_only",
  SG: "close_only",
  SK: "close_only",
  SO: "close_only",
  SS: "close_only",
  SD: "close_only",
  SY: "blocked",
  TH: "close_only",
  TW: "close_only",
  UM: "close_only",
  US: "close_only",
  VE: "close_only",
  YE: "close_only",
  ZW: "close_only",
});

const RESTRICTED_REGIONS: Readonly<Record<string, Readonly<Record<string, RestrictedJurisdictionStatus>>>> = Object.freeze({
  CA: Object.freeze({ AB: "close_only", BC: "close_only", ON: "close_only", QC: "close_only" }),
  UA: Object.freeze({ "09": "blocked", "14": "blocked", "43": "blocked" }),
});

const POLICY_MATERIAL = Object.freeze({
  version: MATTERHORN_POLYMARKET_JURISDICTION_POLICY_VERSION,
  source: "https://docs.polymarket.com/api-reference/geoblock",
  reviewedAt: "2026-09-04T00:00:00.000Z",
  reviewAfter: MATTERHORN_POLYMARKET_JURISDICTION_POLICY_REVIEW_AFTER,
  openingRule: "deny_blocked_close_only_frontend_restricted_and_unresolved_sports_only",
  restrictedCountries: RESTRICTED_COUNTRIES,
  restrictedRegions: RESTRICTED_REGIONS,
});

export const MATTERHORN_POLYMARKET_JURISDICTION_POLICY_HASH = sha256(POLICY_MATERIAL);

export type MatterhornPolymarketJurisdictionDecision = {
  version: typeof MATTERHORN_POLYMARKET_JURISDICTION_DECISION_VERSION;
  policyVersion: typeof MATTERHORN_POLYMARKET_JURISDICTION_POLICY_VERSION;
  policyHash: string;
  policyReviewAfter: typeof MATTERHORN_POLYMARKET_JURISDICTION_POLICY_REVIEW_AFTER;
  status: "allowed" | "blocked" | "unverified";
  canOpenPosition: boolean;
  reasonCode:
    | "trusted_jurisdiction_missing"
    | "trusted_jurisdiction_invalid_or_expired"
    | "policy_review_required"
    | "country_blocked"
    | "country_close_only"
    | "country_frontend_restricted"
    | "country_frontend_sports_only"
    | "region_required"
    | "region_blocked"
    | "region_close_only"
    | null;
  jurisdictionEvidenceHash: string | null;
  validUntil: string | null;
  decisionHash: string;
};

function decision(input: {
  status: MatterhornPolymarketJurisdictionDecision["status"];
  reasonCode: MatterhornPolymarketJurisdictionDecision["reasonCode"];
  jurisdictionEvidenceHash: string | null;
  validUntil?: string | null;
}): MatterhornPolymarketJurisdictionDecision {
  const material = {
    version: MATTERHORN_POLYMARKET_JURISDICTION_DECISION_VERSION,
    policyVersion: MATTERHORN_POLYMARKET_JURISDICTION_POLICY_VERSION,
    policyHash: MATTERHORN_POLYMARKET_JURISDICTION_POLICY_HASH,
    status: input.status,
    canOpenPosition: input.status === "allowed",
    reasonCode: input.reasonCode,
    jurisdictionEvidenceHash: input.jurisdictionEvidenceHash,
    validUntil: input.validUntil ?? null,
  };
  return {
    ...material,
    policyReviewAfter: MATTERHORN_POLYMARKET_JURISDICTION_POLICY_REVIEW_AFTER,
    decisionHash: sha256(material),
  };
}

/**
 * Evaluate new-position authority from trusted edge evidence and a closed,
 * review-dated server policy. Browser or model fields never enter this
 * decision. The direct venue check remains an additional fail-closed check in
 * the connected-wallet UI and can deny, but cannot turn this denial into an
 * allow.
 */
export function evaluatePolymarketOpenPositionJurisdiction(
  jurisdiction: MatterhornTrustedJurisdiction | null,
  now = new Date(),
): MatterhornPolymarketJurisdictionDecision {
  if (!jurisdiction) {
    return decision({
      status: "unverified",
      reasonCode: "trusted_jurisdiction_missing",
      jurisdictionEvidenceHash: null,
    });
  }
  const nowMs = now.getTime();
  const observedAtMs = Date.parse(jurisdiction.observedAt);
  const expiresAtMs = Date.parse(jurisdiction.expiresAt);
  if (jurisdiction.version !== "matterhorn.edge-jurisdiction.v2"
    || jurisdiction.source !== "vercel_ip_country"
    || !/^[A-Z]{2}$/.test(jurisdiction.country)
    || (jurisdiction.region !== null && !/^[A-Z0-9]{1,3}$/.test(jurisdiction.region))
    || !/^[a-f0-9]{64}$/.test(jurisdiction.evidenceHash)
    || !Number.isFinite(nowMs)
    || !Number.isFinite(observedAtMs)
    || !Number.isFinite(expiresAtMs)
    || observedAtMs > nowMs + 5_000
    || expiresAtMs <= nowMs) {
    return decision({
      status: "unverified",
      reasonCode: "trusted_jurisdiction_invalid_or_expired",
      jurisdictionEvidenceHash: null,
    });
  }
  if (nowMs >= Date.parse(MATTERHORN_POLYMARKET_JURISDICTION_POLICY_REVIEW_AFTER)) {
    return decision({
      status: "unverified",
      reasonCode: "policy_review_required",
      jurisdictionEvidenceHash: jurisdiction.evidenceHash,
    });
  }
  const validUntil = new Date(Math.min(
    expiresAtMs,
    Date.parse(MATTERHORN_POLYMARKET_JURISDICTION_POLICY_REVIEW_AFTER),
  )).toISOString();
  const countryStatus = RESTRICTED_COUNTRIES[jurisdiction.country];
  if (countryStatus) {
    return decision({
      status: "blocked",
      reasonCode: countryStatus === "close_only"
        ? "country_close_only"
        : countryStatus === "frontend_sports_only"
          ? "country_frontend_sports_only"
          : countryStatus === "frontend_restricted"
            ? "country_frontend_restricted"
            : "country_blocked",
      jurisdictionEvidenceHash: jurisdiction.evidenceHash,
      validUntil,
    });
  }
  const restrictedRegions = RESTRICTED_REGIONS[jurisdiction.country];
  if (restrictedRegions && jurisdiction.region === null) {
    return decision({
      status: "unverified",
      reasonCode: "region_required",
      jurisdictionEvidenceHash: jurisdiction.evidenceHash,
      validUntil,
    });
  }
  const regionStatus = jurisdiction.region === null ? undefined : restrictedRegions?.[jurisdiction.region];
  if (regionStatus) {
    return decision({
      status: "blocked",
      reasonCode: regionStatus === "close_only" ? "region_close_only" : "region_blocked",
      jurisdictionEvidenceHash: jurisdiction.evidenceHash,
      validUntil,
    });
  }
  return decision({
    status: "allowed",
    reasonCode: null,
    jurisdictionEvidenceHash: jurisdiction.evidenceHash,
    validUntil,
  });
}
