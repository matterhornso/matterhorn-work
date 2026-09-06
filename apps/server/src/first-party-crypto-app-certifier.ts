import type { MatterhornCryptoAppManifest } from "@matterhorn-work/types/crypto-coworkers";

import {
  runCryptoAppManifestConformance,
  verifyCryptoAppConformanceReport,
  type MatterhornCryptoAppConformanceReport,
} from "./crypto-app-conformance.js";
import {
  createFirstPartyCryptoAppCertificationDriver,
  createFirstPartyPolymarketWalletPreviewCertificationDriver,
  createFirstPartyPublicReadCryptoAppCertificationDriver,
  firstPartyPolymarketWalletPreviewCertificationScopeValid,
  firstPartyPublicReadCertificationScopeValid,
  type MatterhornFirstPartyCertificationInputs,
} from "./first-party-crypto-app-certification-driver.js";
import {
  runCryptoAppRuntimeCertificationHarness,
  type MatterhornCryptoAppRuntimeProbeDriver,
} from "./crypto-app-runtime-certification-harness.js";
import {
  verifyCryptoAppRuntimeCertificationReport,
  type MatterhornCryptoAppRuntimeCertificationReport,
} from "./crypto-app-runtime-certification.js";
import type { MatterhornTrustedPublisherKey } from "./crypto-app-signature.js";

export const MATTERHORN_FIRST_PARTY_CERTIFICATION_BUNDLE_VERSION =
  "matterhorn.first-party-crypto-app-certification-bundle.v2";

export type MatterhornFirstPartyCertificationPromotion = {
  state: "certified_testnet";
  report: MatterhornCryptoAppConformanceReport;
  runtimeReport: MatterhornCryptoAppRuntimeCertificationReport;
};

export type MatterhornFirstPartyPublicReadCertificationPromotion = {
  state: "certified_mainnet";
  report: MatterhornCryptoAppConformanceReport;
  runtimeReport: MatterhornCryptoAppRuntimeCertificationReport;
};

export type MatterhornFirstPartyPolymarketWalletPreviewCertificationPromotion = {
  state: "certified_mainnet";
  report: MatterhornCryptoAppConformanceReport;
  runtimeReport: MatterhornCryptoAppRuntimeCertificationReport;
};

type CertificationOptions = {
  manifest: MatterhornCryptoAppManifest;
  publisherPublicKey: MatterhornTrustedPublisherKey["publicKey"];
  policyVersion: string;
  actionInputs: MatterhornFirstPartyCertificationInputs;
  probeTimeoutMs?: number;
  now?: () => Date;
  driver?: MatterhornCryptoAppRuntimeProbeDriver;
};

const SUPPORTED_APP_IDS = new Set([
  "matterhorn.sui-testnet",
  "matterhorn.hyperliquid-testnet",
  "matterhorn.bittensor-testnet",
]);

function policyVersionValid(value: string): boolean {
  return Boolean(value.trim()) && value.length <= 160;
}

/**
 * Produces the exact body accepted by the trusted operator certification route.
 * It never returns action inputs, live observations, wallet identities, or keys.
 */
export async function certifyMatterhornFirstPartyCryptoApp(
  options: CertificationOptions,
): Promise<MatterhornFirstPartyCertificationPromotion> {
  if (!SUPPORTED_APP_IDS.has(options.manifest.appId)
    || options.manifest.authentication.type !== "none"
    || options.manifest.networks.some((network) => network.environment !== "testnet")
    || !policyVersionValid(options.policyVersion)) {
    throw new Error("first_party_certification_scope_invalid");
  }

  const report = runCryptoAppManifestConformance(options.manifest, {
    publisherKey: options.publisherPublicKey,
    policyVersion: options.policyVersion.trim(),
    targetEnvironment: "testnet",
    now: options.now,
  });
  if (!verifyCryptoAppConformanceReport(report) || !report.passed) {
    throw new Error("first_party_certification_static_failed");
  }

  const runtimeReport = await runCryptoAppRuntimeCertificationHarness({
    manifest: options.manifest,
    staticReport: report,
    driver: options.driver ?? createFirstPartyCryptoAppCertificationDriver({
      actionInputs: options.actionInputs,
      now: options.now,
    }),
    probeTimeoutMs: options.probeTimeoutMs,
    now: options.now,
  });
  if (!verifyCryptoAppRuntimeCertificationReport(runtimeReport, options.manifest, report)) {
    throw new Error("first_party_certification_runtime_failed");
  }

  return {
    state: "certified_testnet",
    report,
    runtimeReport,
  };
}

/**
 * Produces an operator promotion body only for Matterhorn's two fixed,
 * unauthenticated Polymarket public-read contracts. This path cannot certify
 * account data, transaction preparation, simulation, signing, or submission.
 */
export async function certifyMatterhornFirstPartyPublicReadCryptoApp(
  options: CertificationOptions,
): Promise<MatterhornFirstPartyPublicReadCertificationPromotion> {
  if (!firstPartyPublicReadCertificationScopeValid(options.manifest)
    || !policyVersionValid(options.policyVersion)) {
    throw new Error("first_party_public_read_certification_scope_invalid");
  }

  const report = runCryptoAppManifestConformance(options.manifest, {
    publisherKey: options.publisherPublicKey,
    policyVersion: options.policyVersion.trim(),
    targetEnvironment: "mainnet",
    now: options.now,
  });
  if (!verifyCryptoAppConformanceReport(report) || !report.passed) {
    throw new Error("first_party_public_read_certification_static_failed");
  }

  const runtimeReport = await runCryptoAppRuntimeCertificationHarness({
    manifest: options.manifest,
    staticReport: report,
    driver: options.driver ?? createFirstPartyPublicReadCryptoAppCertificationDriver({
      actionInputs: options.actionInputs,
      now: options.now,
    }),
    probeTimeoutMs: options.probeTimeoutMs,
    now: options.now,
  });
  if (!verifyCryptoAppRuntimeCertificationReport(runtimeReport, options.manifest, report)
    || !runtimeReport.passed) {
    throw new Error("first_party_public_read_certification_runtime_failed");
  }

  return {
    state: "certified_mainnet",
    report,
    runtimeReport,
  };
}

/**
 * Certifies only the fixed, unauthenticated, simulation-only Polymarket wallet
 * preview. It cannot promote account, signing, cancellation, relay, or submit
 * authority.
 */
export async function certifyMatterhornFirstPartyPolymarketWalletPreview(
  options: CertificationOptions,
): Promise<MatterhornFirstPartyPolymarketWalletPreviewCertificationPromotion> {
  if (!firstPartyPolymarketWalletPreviewCertificationScopeValid(options.manifest)
    || !policyVersionValid(options.policyVersion)) {
    throw new Error("first_party_polymarket_preview_certification_scope_invalid");
  }
  const report = runCryptoAppManifestConformance(options.manifest, {
    publisherKey: options.publisherPublicKey,
    policyVersion: options.policyVersion.trim(),
    targetEnvironment: "mainnet",
    now: options.now,
  });
  if (!verifyCryptoAppConformanceReport(report) || !report.passed) {
    throw new Error("first_party_polymarket_preview_certification_static_failed");
  }
  const runtimeReport = await runCryptoAppRuntimeCertificationHarness({
    manifest: options.manifest,
    staticReport: report,
    driver: options.driver ?? createFirstPartyPolymarketWalletPreviewCertificationDriver({
      actionInputs: options.actionInputs,
      now: options.now,
    }),
    probeTimeoutMs: options.probeTimeoutMs,
    now: options.now,
  });
  if (!verifyCryptoAppRuntimeCertificationReport(runtimeReport, options.manifest, report)
    || !runtimeReport.passed) {
    throw new Error("first_party_polymarket_preview_certification_runtime_failed");
  }
  return { state: "certified_mainnet", report, runtimeReport };
}
