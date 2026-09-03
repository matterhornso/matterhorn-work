import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  type MatterhornCryptoAppAction,
  type MatterhornCryptoAppManifest,
  validateMatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import {
  validateCryptoAppSchemaDefinition,
} from "./json-schema.js";

export {
  projectCryptoAppOutput,
  validateCryptoAppInput,
  validateCryptoAppSchemaDefinition,
  type CryptoAppSchemaResult,
} from "./json-schema.js";

export {
  validateCryptoAppFixture,
  type MatterhornCryptoAppFixture,
  type MatterhornCryptoAppFixtureReport,
} from "./fixture.js";

export {
  createMatterhornCryptoDeveloperClient,
  MatterhornCryptoDeveloperClientError,
  type MatterhornCryptoAppConformanceFindingView,
  type MatterhornCryptoAppConformanceReportView,
  type MatterhornCryptoDeveloperClientOptions,
  type MatterhornCryptoDeveloperKeyView,
  type MatterhornCryptoDeveloperProfileView,
  type MatterhornCryptoDeveloperStatus,
  type MatterhornCryptoDeveloperSubmissionView,
  type MatterhornCryptoGatewayMode,
} from "./developer-client.js";

export {
  createMatterhornBittensorTestnetFixturePack,
  createMatterhornHyperliquidTestnetFixturePack,
  createMatterhornSuiTestnetFixturePack,
  validateMatterhornCryptoProtocolFixturePack,
  type MatterhornCryptoProtocolFixturePack,
  type MatterhornCryptoProtocolFixturePackReport,
} from "./protocol-fixtures.js";

export {
  runMatterhornCryptoAppLocalAdapter,
  MatterhornCryptoAppLocalRunnerError,
  type MatterhornCryptoAppLocalCall,
  type MatterhornCryptoAppLocalEnvelope,
  type MatterhornCryptoAppLocalRunnerOptions,
  type MatterhornCryptoAppLocalRunReport,
} from "./local-runner.js";

export {
  createMatterhornCryptoIntegrationSetup,
  MATTERHORN_CRYPTO_APP_INTEGRATION_SETUP_VERSION,
  MatterhornCryptoIntegrationSetupError,
  type MatterhornCryptoIntegrationSetup,
  type MatterhornCryptoIntegrationSetupArtifact,
  type MatterhornCryptoIntegrationSetupOptions,
  type MatterhornCryptoIntegrationSetupStep,
  type MatterhornCryptoIntegrationTarget,
  type MatterhornCryptoIntegrationVerificationCheck,
} from "./integration-setup.js";

export {
  createMatterhornCryptoAppQuickstart,
  createMatterhornCryptoAppQuickstartCommand,
  MATTERHORN_CRYPTO_APP_QUICKSTART_VERSION,
  MatterhornCryptoAppQuickstartError,
  type MatterhornCryptoAppQuickstart,
  type MatterhornCryptoAppQuickstartArtifact,
  type MatterhornCryptoAppQuickstartCommandOptions,
  type MatterhornCryptoAppQuickstartOptions,
  type MatterhornCryptoAppQuickstartProtocol,
} from "./quickstart.js";

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | { [key: string]: CanonicalValue };

export type MatterhornUnsignedCryptoAppManifest = Omit<MatterhornCryptoAppManifest, "version" | "publisher"> & {
  publisher: {
    id: string;
    keyId: string;
    algorithm: "ed25519";
  };
};

export type MatterhornCryptoAppSigningRequest = {
  version: "matterhorn.crypto-app-signing-request.v1";
  appId: string;
  manifestRevision: string;
  publisherId: string;
  publisherKeyId: string;
  algorithm: "ed25519";
  canonicalPayload: string;
  payloadEncoding: "utf8";
  signatureEncoding: "base64url";
};

export type MatterhornCryptoAppLocalFinding = {
  severity: "error" | "warning";
  category: "manifest" | "authority" | "authentication" | "network" | "schema" | "reliability";
  code: string;
  actionId: string | null;
};

export type MatterhornCryptoAppLocalPolicyReport = {
  version: "matterhorn.crypto-app-local-policy.v1";
  targetEnvironment: "testnet" | "mainnet";
  passed: boolean;
  findings: MatterhornCryptoAppLocalFinding[];
  /** Local emulation is advisory. Only Matterhorn's server can certify an adapter. */
  certificationAuthority: "none";
  runtimeProbesRequired: true;
};

export class MatterhornCryptoAppSdkError extends Error {
  constructor(
    public readonly code:
      | "manifest_invalid"
      | "manifest_signature_invalid"
      | "manifest_private_key_forbidden",
    public readonly issues: string[] = [],
  ) {
    super(code);
    this.name = "MatterhornCryptoAppSdkError";
  }
}

function canonicalValue(value: unknown): CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return String(value);
}

export function canonicalCryptoAppJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

/** The detached signature is excluded; publisher identity and key id remain bound. */
export function canonicalCryptoAppManifestPayload(
  manifest: MatterhornCryptoAppManifest | MatterhornUnsignedCryptoAppManifest,
): string {
  return canonicalCryptoAppJson({
    ...manifest,
    version: MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
    publisher: {
      id: manifest.publisher.id,
      keyId: manifest.publisher.keyId,
      algorithm: manifest.publisher.algorithm,
    },
  });
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function materializedManifest(
  draft: MatterhornUnsignedCryptoAppManifest,
  signature: string,
): MatterhornCryptoAppManifest {
  return {
    version: MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
    ...deepClone(draft),
    publisher: {
      id: draft.publisher.id,
      keyId: draft.publisher.keyId,
      algorithm: "ed25519",
      signature,
    },
  };
}

function validateManifestActionSchemas(manifest: MatterhornCryptoAppManifest): string[] {
  const issues: string[] = [];
  for (const action of manifest.actions) {
    for (const issue of validateCryptoAppSchemaDefinition(action.inputSchema)) {
      issues.push(`action:${action.id}:input:${issue}`);
    }
    for (const issue of validateCryptoAppSchemaDefinition(action.outputProjectionSchema)) {
      issues.push(`action:${action.id}:output:${issue}`);
    }
  }
  return [...new Set(issues)];
}

/**
 * Builds and validates an unsigned manifest. No key material crosses this API;
 * the caller signs the returned canonical payload in its own key boundary.
 */
export function defineCryptoAppManifest(
  draft: MatterhornUnsignedCryptoAppManifest,
): MatterhornUnsignedCryptoAppManifest {
  const candidate = materializedManifest(draft, "pending-detached-signature");
  const issues = validateMatterhornCryptoAppManifest(candidate);
  if (issues.length > 0) throw new MatterhornCryptoAppSdkError("manifest_invalid", issues);
  const schemaIssues = validateManifestActionSchemas(candidate);
  if (schemaIssues.length > 0) throw new MatterhornCryptoAppSdkError("manifest_invalid", schemaIssues);
  return deepClone(draft);
}

export function buildCryptoAppSigningRequest(
  draft: MatterhornUnsignedCryptoAppManifest,
): MatterhornCryptoAppSigningRequest {
  const validated = defineCryptoAppManifest(draft);
  return {
    version: "matterhorn.crypto-app-signing-request.v1",
    appId: validated.appId,
    manifestRevision: validated.manifestRevision,
    publisherId: validated.publisher.id,
    publisherKeyId: validated.publisher.keyId,
    algorithm: "ed25519",
    canonicalPayload: canonicalCryptoAppManifestPayload(validated),
    payloadEncoding: "utf8",
    signatureEncoding: "base64url",
  };
}

function validDetachedEd25519Signature(value: string): boolean {
  if (!/^[A-Za-z0-9_-]{86}$/.test(value)) return false;
  try {
    const bytes = Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=="), (char) => char.charCodeAt(0));
    return bytes.length === 64;
  } catch {
    return false;
  }
}

/** Attaches a detached signature produced outside the SDK's process boundary. */
export function attachCryptoAppManifestSignature(
  draft: MatterhornUnsignedCryptoAppManifest,
  signature: string,
): MatterhornCryptoAppManifest {
  if (/PRIVATE KEY|BEGIN [A-Z ]*PRIVATE/i.test(signature)) {
    throw new MatterhornCryptoAppSdkError("manifest_private_key_forbidden");
  }
  if (!validDetachedEd25519Signature(signature)) {
    throw new MatterhornCryptoAppSdkError("manifest_signature_invalid");
  }
  const manifest = materializedManifest(defineCryptoAppManifest(draft), signature);
  const issues = validateMatterhornCryptoAppManifest(manifest);
  if (issues.length > 0) throw new MatterhornCryptoAppSdkError("manifest_invalid", issues);
  return manifest;
}

function addFinding(
  findings: MatterhornCryptoAppLocalFinding[],
  severity: MatterhornCryptoAppLocalFinding["severity"],
  category: MatterhornCryptoAppLocalFinding["category"],
  code: string,
  actionId: string | null = null,
): void {
  const key = `${severity}\u0000${category}\u0000${code}\u0000${actionId ?? ""}`;
  if (!findings.some((item) => `${item.severity}\u0000${item.category}\u0000${item.code}\u0000${item.actionId ?? ""}` === key)) {
    findings.push({ severity, category, code, actionId });
  }
}

function closedObjectSchema(value: Record<string, unknown>): boolean {
  return value.type === "object" && value.additionalProperties === false;
}

function privateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return true;
  const [a, b] = octets as [number, number, number, number];
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function publicHttpsShape(value: string): boolean {
  try {
    const endpoint = new URL(value);
    const hostname = endpoint.hostname.toLowerCase();
    return endpoint.protocol === "https:"
      && !endpoint.username
      && !endpoint.password
      && (!endpoint.port || endpoint.port === "443")
      && hostname !== "localhost"
      && !hostname.endsWith(".localhost")
      && !hostname.endsWith(".local")
      && !hostname.endsWith(".internal")
      && !privateIpv4(hostname)
      && !hostname.includes(":");
  } catch {
    return false;
  }
}

function inspectAction(
  action: MatterhornCryptoAppAction,
  scopes: Set<string>,
  findings: MatterhornCryptoAppLocalFinding[],
): void {
  for (const issue of validateCryptoAppSchemaDefinition(action.inputSchema)) {
    addFinding(findings, "error", "schema", `action_input_${issue}`, action.id);
  }
  for (const issue of validateCryptoAppSchemaDefinition(action.outputProjectionSchema)) {
    addFinding(findings, "error", "schema", `action_output_${issue}`, action.id);
  }
  if (!closedObjectSchema(action.inputSchema)) {
    addFinding(findings, "error", "schema", "action_input_schema_must_be_closed_object", action.id);
  }
  if (!closedObjectSchema(action.outputProjectionSchema)) {
    addFinding(findings, "error", "schema", "action_output_schema_must_be_closed_object", action.id);
  }
  if (action.requiredScopes.some((scope) => !scopes.has(scope))) {
    addFinding(findings, "error", "authentication", "action_scope_not_declared", action.id);
  }
  if (action.requiresFreshness && action.freshnessMaxAgeMs === null) {
    addFinding(findings, "error", "reliability", "freshness_max_age_required", action.id);
  }
  const financial = action.access === "prepare" || action.access === "simulate";
  if (financial && action.risk !== "financial_low" && action.risk !== "financial_high") {
    addFinding(findings, "error", "authority", "financial_action_risk_required", action.id);
  }
  if (!financial && (action.risk === "financial_low" || action.risk === "financial_high")) {
    addFinding(findings, "error", "authority", "financial_risk_requires_prepare_or_simulate", action.id);
  }
  if (action.walletSubmissionOnly !== true || action.agentMaySubmit !== false) {
    addFinding(findings, "error", "authority", "wallet_submission_boundary_required", action.id);
  }
}

/** Advisory local emulator; it never certifies or contacts Matterhorn. */
export function emulateCryptoAppPolicy(
  manifest: MatterhornCryptoAppManifest,
  targetEnvironment: "testnet" | "mainnet",
): MatterhornCryptoAppLocalPolicyReport {
  const findings: MatterhornCryptoAppLocalFinding[] = [];
  for (const code of validateMatterhornCryptoAppManifest(manifest)) {
    addFinding(findings, "error", "manifest", code);
  }
  if (!publicHttpsShape(manifest.transport.endpoint)) {
    addFinding(findings, "error", "network", "transport_public_https_required");
  } else {
    addFinding(findings, "warning", "network", "server_dns_revalidation_required");
  }
  if (manifest.authentication.type === "oauth2"
    && !publicHttpsShape(manifest.authentication.authorizationServer)) {
    addFinding(findings, "error", "authentication", "oauth_public_https_required");
  }
  if (!manifest.networks.some((network) => network.environment === targetEnvironment)) {
    addFinding(findings, "error", "network", "target_environment_not_declared");
  }
  const scopes = new Set(manifest.authentication.scopes);
  for (const action of manifest.actions) inspectAction(action, scopes, findings);
  return {
    version: "matterhorn.crypto-app-local-policy.v1",
    targetEnvironment,
    passed: !findings.some((item) => item.severity === "error"),
    findings,
    certificationAuthority: "none",
    runtimeProbesRequired: true,
  };
}

export type {
  MatterhornCryptoAppAction,
  MatterhornCryptoAppManifest,
};
