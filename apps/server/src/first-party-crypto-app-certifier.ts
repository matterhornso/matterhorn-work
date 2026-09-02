import type { MatterhornCryptoAppManifest } from "@matterhorn-work/types/crypto-coworkers";

import {
  runCryptoAppManifestConformance,
  verifyCryptoAppConformanceReport,
  type MatterhornCryptoAppConformanceReport,
} from "./crypto-app-conformance.js";
import {
  createFirstPartyCryptoAppCertificationDriver,
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
  "matterhorn.first-party-crypto-app-certification-bundle.v1";

export type MatterhornFirstPartyCertificationPromotion = {
  state: "certified_testnet";
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
    || !options.policyVersion.trim()
    || options.policyVersion.length > 160) {
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
