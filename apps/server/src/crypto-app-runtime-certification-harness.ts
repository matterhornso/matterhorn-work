import type { MatterhornCryptoAppManifest } from "@matterhorn-work/types/crypto-coworkers";

import type { MatterhornCryptoAppConformanceReport } from "./crypto-app-conformance.js";
import { verifyCryptoAppConformanceReport } from "./crypto-app-conformance.js";
import {
  buildCryptoAppRuntimeCertificationReport,
  expectedCryptoAppRuntimeProbeActionIds,
  requiredCryptoAppRuntimeCertificationProbes,
  type MatterhornCryptoAppRuntimeCertificationReport,
  type MatterhornCryptoAppRuntimeProbeId,
} from "./crypto-app-runtime-certification.js";
import { sha256 } from "./guarded-runtime-crypto.js";
import { cryptoAppManifestHash } from "./crypto-app-signature.js";

export const MATTERHORN_CRYPTO_APP_RUNTIME_HARNESS_VERSION =
  "matterhorn.crypto-app-runtime-harness.v1";
export const MATTERHORN_CRYPTO_APP_RUNTIME_EVIDENCE_VERSION =
  "matterhorn.crypto-app-runtime-evidence.v1";

export type MatterhornCryptoAppRuntimeProbeAssertion = {
  id: string;
  passed: boolean;
  /** Hash of a redacted observation. Raw observations must remain outside the report boundary. */
  observationHash: string;
};

export type MatterhornCryptoAppRuntimeProbeDriver = {
  runProbe(input: {
    probeId: MatterhornCryptoAppRuntimeProbeId;
    manifest: MatterhornCryptoAppManifest;
    expectedActionIds: string[];
    signal: AbortSignal;
  }): Promise<{ assertions: MatterhornCryptoAppRuntimeProbeAssertion[] }>;
};

type RuntimeHarnessOptions = {
  manifest: MatterhornCryptoAppManifest;
  staticReport: MatterhornCryptoAppConformanceReport;
  driver: MatterhornCryptoAppRuntimeProbeDriver;
  probeTimeoutMs?: number;
  now?: () => Date;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
};

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ASSERTION_ID_PATTERN = /^[a-z][a-z0-9_]{2,79}$/;
const MAX_ASSERTIONS_PER_PROBE = 64;

export class MatterhornCryptoAppRuntimeHarnessError extends Error {
  constructor(public readonly code: "static_report_invalid" | "harness_configuration_invalid") {
    super(code);
    this.name = "MatterhornCryptoAppRuntimeHarnessError";
  }
}

function normalizedAssertions(value: unknown): MatterhornCryptoAppRuntimeProbeAssertion[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { assertions?: unknown }).assertions)) {
    return null;
  }
  const assertions = (value as { assertions: unknown[] }).assertions;
  if (assertions.length === 0 || assertions.length > MAX_ASSERTIONS_PER_PROBE) return null;
  const seen = new Set<string>();
  const normalized: MatterhornCryptoAppRuntimeProbeAssertion[] = [];
  for (const item of assertions) {
    if (!item || typeof item !== "object") return null;
    const assertion = item as Partial<MatterhornCryptoAppRuntimeProbeAssertion>;
    if (typeof assertion.id !== "string"
      || !ASSERTION_ID_PATTERN.test(assertion.id)
      || seen.has(assertion.id)
      || typeof assertion.passed !== "boolean"
      || typeof assertion.observationHash !== "string"
      || !HASH_PATTERN.test(assertion.observationHash)) return null;
    seen.add(assertion.id);
    normalized.push({
      id: assertion.id,
      passed: assertion.passed,
      observationHash: assertion.observationHash,
    });
  }
  return normalized.sort((left, right) => left.id.localeCompare(right.id));
}

function failedEvidenceHash(input: {
  manifestHash: string;
  staticReportHash: string;
  probeId: MatterhornCryptoAppRuntimeProbeId;
  code: "probe_timeout" | "probe_failed" | "probe_result_invalid";
}): string {
  return sha256({
    version: MATTERHORN_CRYPTO_APP_RUNTIME_EVIDENCE_VERSION,
    harnessVersion: MATTERHORN_CRYPTO_APP_RUNTIME_HARNESS_VERSION,
    ...input,
  });
}

/**
 * Trusted certification orchestrator. It receives assertion and observation
 * hashes only, applies one bounded timeout per required probe, and returns no
 * raw runtime observation, error message, credential, argument or output.
 */
export async function runCryptoAppRuntimeCertificationHarness(
  options: RuntimeHarnessOptions,
): Promise<MatterhornCryptoAppRuntimeCertificationReport> {
  const probeTimeoutMs = options.probeTimeoutMs ?? 15_000;
  if (!Number.isSafeInteger(probeTimeoutMs) || probeTimeoutMs < 1 || probeTimeoutMs > 30_000) {
    throw new MatterhornCryptoAppRuntimeHarnessError("harness_configuration_invalid");
  }
  const manifestHash = cryptoAppManifestHash(options.manifest);
  if (!verifyCryptoAppConformanceReport(options.staticReport)
    || !options.staticReport.passed
    || options.staticReport.appId !== options.manifest.appId
    || options.staticReport.manifestRevision !== options.manifest.manifestRevision
    || options.staticReport.manifestHash !== manifestHash) {
    throw new MatterhornCryptoAppRuntimeHarnessError("static_report_invalid");
  }

  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const probes = [];
  for (const probeId of requiredCryptoAppRuntimeCertificationProbes(options.manifest)) {
    const actionIds = expectedCryptoAppRuntimeProbeActionIds(options.manifest, probeId);
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    try {
      const result = await Promise.race([
        options.driver.runProbe({
          probeId,
          manifest: structuredClone(options.manifest),
          expectedActionIds: [...actionIds],
          signal: controller.signal,
        }),
        new Promise<never>((_resolve, reject) => {
          timeoutHandle = setTimer(() => {
            timedOut = true;
            reject(new Error("certification_probe_timeout"));
            controller.abort("certification_probe_timeout");
          }, probeTimeoutMs);
        }),
      ]);
      const assertions = normalizedAssertions(result);
      if (!assertions) {
        probes.push({
          id: probeId,
          passed: false,
          evidenceHash: failedEvidenceHash({
            manifestHash,
            staticReportHash: options.staticReport.reportHash,
            probeId,
            code: "probe_result_invalid",
          }),
          actionIds,
        });
        continue;
      }
      probes.push({
        id: probeId,
        passed: assertions.every((assertion) => assertion.passed),
        evidenceHash: sha256({
          version: MATTERHORN_CRYPTO_APP_RUNTIME_EVIDENCE_VERSION,
          harnessVersion: MATTERHORN_CRYPTO_APP_RUNTIME_HARNESS_VERSION,
          manifestHash,
          staticReportHash: options.staticReport.reportHash,
          probeId,
          assertions,
        }),
        actionIds,
      });
    } catch {
      probes.push({
        id: probeId,
        passed: false,
        evidenceHash: failedEvidenceHash({
          manifestHash,
          staticReportHash: options.staticReport.reportHash,
          probeId,
          code: timedOut ? "probe_timeout" : "probe_failed",
        }),
        actionIds,
      });
    } finally {
      if (timeoutHandle) clearTimer(timeoutHandle);
      controller.abort("certification_probe_complete");
    }
  }

  return buildCryptoAppRuntimeCertificationReport(options.manifest, options.staticReport, {
    probes,
    now: options.now,
  });
}
