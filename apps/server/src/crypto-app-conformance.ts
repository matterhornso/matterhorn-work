import type { MatterhornCryptoAppManifest } from "@matterhorn-work/types/crypto-coworkers";
import { validateMatterhornCryptoAppManifest } from "@matterhorn-work/types/crypto-coworkers";

import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";
import { isPublicHttpsCryptoAdapterEndpoint } from "./crypto-app-egress.js";
import { validateCryptoAppSchemaDefinition } from "./crypto-app-json-schema.js";
import {
  cryptoAppManifestHash,
  verifyCryptoAppManifestSignature,
  type MatterhornTrustedPublisherKey,
} from "./crypto-app-signature.js";

export const MATTERHORN_CRYPTO_APP_CONFORMANCE_VERSION = "matterhorn.crypto-app-conformance.v1";

export type MatterhornCryptoAppConformanceFinding = {
  severity: "error" | "warning";
  category: "authority" | "authentication" | "network" | "schema" | "reliability" | "privacy";
  code: string;
  actionId: string | null;
};

export type MatterhornCryptoAppConformanceReport = {
  version: typeof MATTERHORN_CRYPTO_APP_CONFORMANCE_VERSION;
  appId: string;
  manifestRevision: string;
  manifestHash: string;
  publisherId: string;
  publisherKeyId: string;
  policyVersion: string;
  targetEnvironment: "testnet" | "mainnet";
  generatedAt: string;
  passed: boolean;
  findings: MatterhornCryptoAppConformanceFinding[];
  reportHash: string;
};

type ConformanceOptions = {
  publisherKey: MatterhornTrustedPublisherKey["publicKey"];
  policyVersion: string;
  targetEnvironment: "testnet" | "mainnet";
  now?: () => Date;
};

const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_SCHEMA_BYTES = 32 * 1024;

function finding(
  findings: MatterhornCryptoAppConformanceFinding[],
  severity: MatterhornCryptoAppConformanceFinding["severity"],
  category: MatterhornCryptoAppConformanceFinding["category"],
  code: string,
  actionId: string | null = null,
): void {
  findings.push({ severity, category, code, actionId });
}

function strictObjectSchema(value: Record<string, unknown>): boolean {
  return value.type === "object" && value.additionalProperties === false;
}

function schemaSize(value: Record<string, unknown>): number {
  return Buffer.byteLength(canonicalJson(value), "utf8");
}

function uniqueFindings(findings: MatterhornCryptoAppConformanceFinding[]): MatterhornCryptoAppConformanceFinding[] {
  const seen = new Set<string>();
  return findings.filter((item) => {
    const key = `${item.severity}\u0000${item.category}\u0000${item.code}\u0000${item.actionId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Static Phase 1 conformance. Runtime certification adds live auth, egress,
 * timeout, schema-drift and adversarial-output probes before an adapter can be
 * promoted from pending.
 */
export function runCryptoAppManifestConformance(
  manifest: MatterhornCryptoAppManifest,
  options: ConformanceOptions,
): MatterhornCryptoAppConformanceReport {
  const findings: MatterhornCryptoAppConformanceFinding[] = [];
  for (const code of validateMatterhornCryptoAppManifest(manifest)) {
    finding(
      findings,
      "error",
      code.includes("oauth") || code.includes("authentication") ? "authentication" : "schema",
      code,
    );
  }

  if (!verifyCryptoAppManifestSignature(manifest, options.publisherKey)) {
    finding(findings, "error", "authentication", "manifest_signature_invalid");
  }
  if (!isPublicHttpsCryptoAdapterEndpoint(manifest.transport.endpoint)) {
    finding(findings, "error", "network", "transport_public_https_required");
  } else {
    finding(findings, "warning", "network", "runtime_dns_revalidation_required");
  }
  if (Buffer.byteLength(canonicalJson(manifest), "utf8") > MAX_MANIFEST_BYTES) {
    finding(findings, "error", "schema", "manifest_size_exceeded");
  }

  const grantedScopes = new Set(manifest.authentication.scopes);
  if (manifest.authentication.type === "oauth2" && !isPublicHttpsCryptoAdapterEndpoint(manifest.authentication.authorizationServer)) {
    finding(findings, "error", "authentication", "oauth_public_https_required");
  }
  if (manifest.authentication.type === "none" && manifest.authentication.scopes.length > 0) {
    finding(findings, "error", "authentication", "unauthenticated_scopes_forbidden");
  }

  const networkIds = new Set<string>();
  let targetEnvironmentDeclared = false;
  for (const network of manifest.networks) {
    const id = `${network.protocol}\u0000${network.chainId}\u0000${network.environment}`;
    if (networkIds.has(id)) finding(findings, "error", "network", "network_duplicate");
    networkIds.add(id);
    if (network.environment === options.targetEnvironment) targetEnvironmentDeclared = true;
  }
  if (!targetEnvironmentDeclared) finding(findings, "error", "network", "target_environment_not_declared");

  for (const action of manifest.actions) {
    if (action.requiredScopes.some((scope) => !grantedScopes.has(scope))) {
      finding(findings, "error", "authentication", "action_scope_not_declared", action.id);
    }
    if (!strictObjectSchema(action.inputSchema)) {
      finding(findings, "error", "schema", "action_input_schema_must_be_closed_object", action.id);
    }
    if (!strictObjectSchema(action.outputProjectionSchema)) {
      finding(findings, "error", "schema", "action_output_schema_must_be_closed_object", action.id);
    }
    if (schemaSize(action.inputSchema) > MAX_SCHEMA_BYTES) {
      finding(findings, "error", "schema", "action_input_schema_size_exceeded", action.id);
    }
    if (schemaSize(action.outputProjectionSchema) > MAX_SCHEMA_BYTES) {
      finding(findings, "error", "schema", "action_output_schema_size_exceeded", action.id);
    }
    for (const issue of validateCryptoAppSchemaDefinition(action.inputSchema)) {
      finding(findings, "error", "schema", `action_input_${issue}`, action.id);
    }
    for (const issue of validateCryptoAppSchemaDefinition(action.outputProjectionSchema)) {
      finding(findings, "error", "schema", `action_output_${issue}`, action.id);
    }
    if (action.requiresFreshness && action.freshnessMaxAgeMs === null) {
      finding(findings, "error", "reliability", "freshness_max_age_required", action.id);
    }
    if ((action.access === "prepare" || action.access === "simulate")
      && action.risk !== "financial_low"
      && action.risk !== "financial_high") {
      finding(findings, "error", "authority", "financial_action_risk_required", action.id);
    }
    if ((action.risk === "financial_low" || action.risk === "financial_high")
      && action.access !== "prepare"
      && action.access !== "simulate") {
      finding(findings, "error", "authority", "financial_risk_requires_prepare_or_simulate", action.id);
    }
  }

  const normalizedFindings = uniqueFindings(findings);
  const reportWithoutHash = {
    version: MATTERHORN_CRYPTO_APP_CONFORMANCE_VERSION,
    appId: manifest.appId,
    manifestRevision: manifest.manifestRevision,
    manifestHash: cryptoAppManifestHash(manifest),
    publisherId: manifest.publisher.id,
    publisherKeyId: manifest.publisher.keyId,
    policyVersion: options.policyVersion,
    targetEnvironment: options.targetEnvironment,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    passed: !normalizedFindings.some((item) => item.severity === "error"),
    findings: normalizedFindings,
  } as const;
  return {
    ...reportWithoutHash,
    reportHash: sha256(reportWithoutHash),
  };
}

export function verifyCryptoAppConformanceReport(report: MatterhornCryptoAppConformanceReport): boolean {
  const { reportHash, ...payload } = report;
  return report.version === MATTERHORN_CRYPTO_APP_CONFORMANCE_VERSION
    && report.passed === !report.findings.some((item) => item.severity === "error")
    && sha256(payload) === reportHash;
}
