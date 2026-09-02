import type { MatterhornCryptoAppManifest } from "@matterhorn-work/types/crypto-coworkers";

import type { MatterhornCryptoAppConformanceReport } from "./crypto-app-conformance.js";
import { verifyCryptoAppConformanceReport } from "./crypto-app-conformance.js";
import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";
import { cryptoAppManifestHash } from "./crypto-app-signature.js";

export const MATTERHORN_CRYPTO_APP_RUNTIME_CERTIFICATION_VERSION =
  "matterhorn.crypto-app-runtime-certification.v1";

export const MATTERHORN_CRYPTO_APP_RUNTIME_PROBE_IDS = [
  "authority_boundary",
  "egress_boundary",
  "tenant_isolation",
  "schema_drift",
  "untrusted_output",
  "timeout_abort",
  "capability_replay",
  "quota_circuit_restart",
  "wallet_only_simulation",
  "auth_confusion",
] as const;

export type MatterhornCryptoAppRuntimeProbeId =
  (typeof MATTERHORN_CRYPTO_APP_RUNTIME_PROBE_IDS)[number];

export type MatterhornCryptoAppRuntimeProbe = {
  id: MatterhornCryptoAppRuntimeProbeId;
  passed: boolean;
  /** Hash of redacted certification evidence. Raw evidence is never persisted here. */
  evidenceHash: string;
  actionIds: string[];
};

export type MatterhornCryptoAppRuntimeCertificationReport = {
  version: typeof MATTERHORN_CRYPTO_APP_RUNTIME_CERTIFICATION_VERSION;
  appId: string;
  manifestRevision: string;
  manifestHash: string;
  staticReportHash: string;
  policyVersion: string;
  targetEnvironment: "testnet" | "mainnet";
  generatedAt: string;
  requiredProbeIds: MatterhornCryptoAppRuntimeProbeId[];
  probes: MatterhornCryptoAppRuntimeProbe[];
  passed: boolean;
  reportHash: string;
};

type RuntimeCertificationOptions = {
  probes: MatterhornCryptoAppRuntimeProbe[];
  now?: () => Date;
};

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const REPORT_KEYS = new Set([
  "version",
  "appId",
  "manifestRevision",
  "manifestHash",
  "staticReportHash",
  "policyVersion",
  "targetEnvironment",
  "generatedAt",
  "requiredProbeIds",
  "probes",
  "passed",
  "reportHash",
]);
const PROBE_KEYS = new Set(["id", "passed", "evidenceHash", "actionIds"]);

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function financialActionIds(manifest: MatterhornCryptoAppManifest): string[] {
  return manifest.actions
    .filter((action) => action.access === "prepare" || action.access === "simulate")
    .map((action) => action.id)
    .sort((left, right) => left.localeCompare(right));
}

export function requiredCryptoAppRuntimeCertificationProbes(
  manifest: MatterhornCryptoAppManifest,
): MatterhornCryptoAppRuntimeProbeId[] {
  const required: MatterhornCryptoAppRuntimeProbeId[] = [
    "authority_boundary",
    "egress_boundary",
    "tenant_isolation",
    "schema_drift",
    "untrusted_output",
    "timeout_abort",
    "capability_replay",
    "quota_circuit_restart",
  ];
  if (financialActionIds(manifest).length > 0) required.push("wallet_only_simulation");
  if (manifest.authentication.type !== "none") required.push("auth_confusion");
  return required;
}

export function expectedCryptoAppRuntimeProbeActionIds(
  manifest: MatterhornCryptoAppManifest,
  probeId: MatterhornCryptoAppRuntimeProbeId,
): string[] {
  if (probeId === "wallet_only_simulation") return financialActionIds(manifest);
  return manifest.actions.map((action) => action.id).sort((left, right) => left.localeCompare(right));
}

function normalizeProbes(
  manifest: MatterhornCryptoAppManifest,
  probes: MatterhornCryptoAppRuntimeProbe[],
): MatterhornCryptoAppRuntimeProbe[] {
  const seen = new Set<MatterhornCryptoAppRuntimeProbeId>();
  const normalized: MatterhornCryptoAppRuntimeProbe[] = [];
  for (const probe of probes) {
    if (seen.has(probe.id)) throw new Error(`crypto_app_runtime_probe_duplicate:${probe.id}`);
    seen.add(probe.id);
    normalized.push({
      id: probe.id,
      passed: probe.passed,
      evidenceHash: probe.evidenceHash,
      actionIds: sortedUnique(probe.actionIds),
    });
  }
  return normalized.sort((left, right) => left.id.localeCompare(right.id));
}

export function buildCryptoAppRuntimeCertificationReport(
  manifest: MatterhornCryptoAppManifest,
  staticReport: MatterhornCryptoAppConformanceReport,
  options: RuntimeCertificationOptions,
): MatterhornCryptoAppRuntimeCertificationReport {
  const requiredProbeIds = requiredCryptoAppRuntimeCertificationProbes(manifest);
  const probes = normalizeProbes(manifest, options.probes);
  const probeById = new Map(probes.map((probe) => [probe.id, probe]));
  const passed = verifyCryptoAppConformanceReport(staticReport)
    && staticReport.passed
    && staticReport.manifestHash === cryptoAppManifestHash(manifest)
    && requiredProbeIds.every((id) => {
      const probe = probeById.get(id);
      return Boolean(probe
        && probe.passed
        && HASH_PATTERN.test(probe.evidenceHash)
        && canonicalJson(probe.actionIds) === canonicalJson(expectedCryptoAppRuntimeProbeActionIds(manifest, id)));
    })
    && probes.length === requiredProbeIds.length;
  const reportWithoutHash = {
    version: MATTERHORN_CRYPTO_APP_RUNTIME_CERTIFICATION_VERSION,
    appId: manifest.appId,
    manifestRevision: manifest.manifestRevision,
    manifestHash: cryptoAppManifestHash(manifest),
    staticReportHash: staticReport.reportHash,
    policyVersion: staticReport.policyVersion,
    targetEnvironment: staticReport.targetEnvironment,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    requiredProbeIds,
    probes,
    passed,
  } as const;
  return {
    ...reportWithoutHash,
    reportHash: sha256(reportWithoutHash),
  };
}

export function verifyCryptoAppRuntimeCertificationReport(
  report: MatterhornCryptoAppRuntimeCertificationReport,
  manifest: MatterhornCryptoAppManifest,
  staticReport: MatterhornCryptoAppConformanceReport,
): boolean {
  return verifyCryptoAppRuntimeCertificationOutcome(report, manifest, staticReport) && report.passed;
}

/** Verify a complete testnet outcome, including a fail-closed report. */
export function verifyCryptoAppRuntimeCertificationOutcome(
  report: MatterhornCryptoAppRuntimeCertificationReport,
  manifest: MatterhornCryptoAppManifest,
  staticReport: MatterhornCryptoAppConformanceReport,
): boolean {
  if (!report
    || typeof report !== "object"
    || Array.isArray(report)
    || Object.keys(report).some((key) => !REPORT_KEYS.has(key))
    || !Array.isArray(report.requiredProbeIds)
    || !Array.isArray(report.probes)
    || typeof report.passed !== "boolean") return false;
  const { reportHash, ...payload } = report;
  if (report.version !== MATTERHORN_CRYPTO_APP_RUNTIME_CERTIFICATION_VERSION
    || !HASH_PATTERN.test(reportHash)
    || !Number.isFinite(Date.parse(report.generatedAt))
    || sha256(payload) !== reportHash
    || !verifyCryptoAppConformanceReport(staticReport)
    || !staticReport.passed
    || report.staticReportHash !== staticReport.reportHash
    || report.appId !== manifest.appId
    || report.manifestRevision !== manifest.manifestRevision
    || report.manifestHash !== cryptoAppManifestHash(manifest)
    || report.manifestHash !== staticReport.manifestHash
    || report.policyVersion !== staticReport.policyVersion
    || report.targetEnvironment !== staticReport.targetEnvironment) return false;

  const requiredProbeIds = requiredCryptoAppRuntimeCertificationProbes(manifest);
  if (canonicalJson(report.requiredProbeIds) !== canonicalJson(requiredProbeIds)
    || report.probes.length !== requiredProbeIds.length) return false;
  const seen = new Set<MatterhornCryptoAppRuntimeProbeId>();
  let allPassed = true;
  for (const probe of report.probes) {
    if (!probe
      || typeof probe !== "object"
      || Array.isArray(probe)
      || Object.keys(probe).some((key) => !PROBE_KEYS.has(key))
      || !Array.isArray(probe.actionIds)
      || !requiredProbeIds.includes(probe.id)
      || seen.has(probe.id)
      || typeof probe.passed !== "boolean"
      || !HASH_PATTERN.test(probe.evidenceHash)
      || canonicalJson(probe.actionIds) !== canonicalJson(expectedCryptoAppRuntimeProbeActionIds(manifest, probe.id))) {
      return false;
    }
    allPassed = allPassed && probe.passed;
    seen.add(probe.id);
  }
  return requiredProbeIds.every((id) => seen.has(id)) && report.passed === allPassed;
}
