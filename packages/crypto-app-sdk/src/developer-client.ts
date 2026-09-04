import type { MatterhornCryptoAppManifest } from "./manifest-contract.js";

const MAX_RESPONSE_BYTES = 512 * 1_024;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type MatterhornCryptoGatewayMode = "shadow" | "enforce";

export type MatterhornCryptoDeveloperKeyView = {
  publisherId: string;
  keyId: string;
  algorithm: "ed25519";
  fingerprint: string;
  createdAt: string;
};

export type MatterhornCryptoDeveloperProfileView = {
  id: string;
  publisherId: string;
  displayName: string;
  createdAt: string;
  keys: MatterhornCryptoDeveloperKeyView[];
};

export type MatterhornCryptoAppConformanceFindingView = {
  severity: "error" | "warning";
  category: "authority" | "authentication" | "network" | "schema" | "reliability" | "privacy";
  code: string;
  actionId: string | null;
};

export type MatterhornCryptoAppConformanceReportView = {
  version: "matterhorn.crypto-app-conformance.v1";
  appId: string;
  manifestRevision: string;
  manifestHash: string;
  publisherId: string;
  publisherKeyId: string;
  policyVersion: string;
  targetEnvironment: "testnet";
  generatedAt: string;
  passed: boolean;
  findings: MatterhornCryptoAppConformanceFindingView[];
  reportHash: string;
};

export type MatterhornCryptoDeveloperSubmissionView = {
  appId: string;
  manifestRevision: string;
  manifestHash: string;
  manifest: Pick<MatterhornCryptoAppManifest, "appId" | "displayName" | "description" | "manifestRevision">;
  publisherKeyFingerprint: string;
  targetEnvironment: "testnet";
  staticReport: MatterhornCryptoAppConformanceReportView;
  state: "static_failed" | "static_passed" | "certification_requested" | "certification_passed" | "certification_failed";
  createdAt: string;
  updatedAt: string;
  certificationRequestedAt: string | null;
  certificationDecidedAt: string | null;
  runtimeReview: null | {
    version: "matterhorn.crypto-developer-runtime-review.v1";
    passed: boolean;
    generatedAt: string;
    reportHash: string;
    probes: Array<{ id: string; passed: boolean; actionIds: string[] }>;
  };
};

export type MatterhornCryptoDeveloperStatus = {
  version: "matterhorn.crypto-developer-status.v1";
  policyVersion: string;
  enrolled: boolean;
  publisherKeyReady: boolean;
  supportedEnvironments: ["testnet"];
  mainnetAvailable: false;
  runtimeCertificationRequired: true;
  submissionCounts: {
    staticFailed: number;
    staticPassed: number;
    certificationRequested: number;
    certificationPassed: number;
    certificationFailed: number;
  };
  nextStep:
    | "enroll"
    | "register_public_key"
    | "submit_testnet_manifest"
    | "fix_static_conformance"
    | "request_testnet_certification"
    | "await_certification_review"
    | "fix_runtime_certification"
    | "certification_complete";
};

export type MatterhornCryptoDeveloperUsageStats = {
  calls: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  pending: number;
  abandoned: number;
  actualCostMicros: number;
  pendingReservedCostMicros: number;
  averageLatencyMs: number | null;
  maximumLatencyMs: number | null;
};

export type MatterhornCryptoDeveloperUsageReport = {
  version: "matterhorn.crypto-app-developer-usage.v1";
  appId: string;
  manifestRevision: string;
  costUnit: "micro_usd";
  windowDays: number;
  fromDay: string;
  throughDay: string;
  generatedAt: string;
  budgetPolicy: {
    scope: "per_workspace";
    dailyToolCostLimitMicros: number;
    perCallToolCostLimitMicros: number;
    walletTransactionLimitsIncluded: false;
  };
  totals: MatterhornCryptoDeveloperUsageStats;
  byDay: Array<MatterhornCryptoDeveloperUsageStats & { day: string }>;
  byAction: Array<MatterhornCryptoDeveloperUsageStats & { actionId: string }>;
  privacy: {
    aggregateOnly: true;
    tenantIdentifiersIncluded: false;
    requestContentIncluded: false;
    walletDataIncluded: false;
  };
};

export type MatterhornCryptoDeveloperClientOptions = {
  /** Omit for same-origin browser use. Remote origins must use HTTPS. */
  baseUrl?: string;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

export class MatterhornCryptoDeveloperClientError extends Error {
  constructor(
    public readonly code:
      | "developer_client_configuration_invalid"
      | "developer_client_response_invalid"
      | "developer_client_response_too_large"
      | "developer_client_request_failed",
    public readonly status: number | null,
    public readonly serverCode: string | null = null,
    public readonly issues: string[] = [],
  ) {
    super(serverCode ?? code);
    this.name = "MatterhornCryptoDeveloperClientError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(value: string | undefined): string {
  if (!value?.trim()) return "";
  try {
    const url = new URL(value);
    const localHttp = url.protocol === "http:"
      && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]");
    if ((url.protocol !== "https:" && !localHttp)
      || url.username
      || url.password
      || url.search
      || url.hash
      || (url.pathname !== "/" && url.pathname !== "")) {
      throw new Error("unsafe developer API origin");
    }
    return url.origin;
  } catch {
    throw new MatterhornCryptoDeveloperClientError("developer_client_configuration_invalid", null);
  }
}

function boundedIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .slice(0, 50)
    .map((item) => item.slice(0, 256));
}

function identifier(value: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new MatterhornCryptoDeveloperClientError("developer_client_configuration_invalid", null);
  }
  return encodeURIComponent(value);
}

async function parseBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_too_large", response.status);
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_too_large", response.status);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", response.status);
  }
}

function profileFrom(value: unknown): MatterhornCryptoDeveloperProfileView {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.publisherId !== "string"
    || typeof value.displayName !== "string"
    || typeof value.createdAt !== "string"
    || !Array.isArray(value.keys)) {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
  }
  const keys = value.keys.map((item): MatterhornCryptoDeveloperKeyView => {
    if (!isRecord(item)
      || typeof item.publisherId !== "string"
      || typeof item.keyId !== "string"
      || item.algorithm !== "ed25519"
      || typeof item.fingerprint !== "string"
      || typeof item.createdAt !== "string") {
      throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
    }
    return {
      publisherId: item.publisherId,
      keyId: item.keyId,
      algorithm: "ed25519",
      fingerprint: item.fingerprint,
      createdAt: item.createdAt,
    };
  });
  return {
    id: value.id,
    publisherId: value.publisherId,
    displayName: value.displayName,
    createdAt: value.createdAt,
    keys,
  };
}

function submissionFrom(value: unknown): MatterhornCryptoDeveloperSubmissionView {
  if (!isRecord(value)
    || typeof value.appId !== "string"
    || typeof value.manifestRevision !== "string"
    || typeof value.manifestHash !== "string"
    || value.targetEnvironment !== "testnet"
    || typeof value.publisherKeyFingerprint !== "string"
    || !isRecord(value.staticReport)
    || !isRecord(value.manifest)
    || typeof value.manifest.appId !== "string"
    || typeof value.manifest.displayName !== "string"
    || typeof value.manifest.description !== "string"
    || typeof value.manifest.manifestRevision !== "string"
    || !["static_failed", "static_passed", "certification_requested", "certification_passed", "certification_failed"].includes(String(value.state))
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
    || (value.certificationRequestedAt !== null && typeof value.certificationRequestedAt !== "string")
    || (value.certificationDecidedAt !== null && typeof value.certificationDecidedAt !== "string")) {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
  }
  const report = conformanceReportFrom(value.staticReport);
  const runtimeReview = runtimeReviewFrom(value.runtimeReview);
  const terminal = value.state === "certification_passed" || value.state === "certification_failed";
  const submissionStateConsistent = terminal
    ? runtimeReview !== null
      && runtimeReview.passed === (value.state === "certification_passed")
      && typeof value.certificationRequestedAt === "string"
      && typeof value.certificationDecidedAt === "string"
    : runtimeReview === null
      && value.certificationDecidedAt === null
      && (value.state === "certification_requested"
        ? typeof value.certificationRequestedAt === "string"
        : value.certificationRequestedAt === null);
  if (!submissionStateConsistent) {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
  }
  return {
    appId: value.appId,
    manifestRevision: value.manifestRevision,
    manifestHash: value.manifestHash,
    manifest: {
      appId: value.manifest.appId,
      displayName: value.manifest.displayName,
      description: value.manifest.description,
      manifestRevision: value.manifest.manifestRevision,
    },
    publisherKeyFingerprint: value.publisherKeyFingerprint,
    targetEnvironment: "testnet",
    staticReport: report,
    state: value.state as MatterhornCryptoDeveloperSubmissionView["state"],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    certificationRequestedAt: value.certificationRequestedAt,
    certificationDecidedAt: value.certificationDecidedAt,
    runtimeReview,
  };
}

function runtimeReviewFrom(value: unknown): MatterhornCryptoDeveloperSubmissionView["runtimeReview"] {
  if (value === null) return null;
  if (!isRecord(value)
    || value.version !== "matterhorn.crypto-developer-runtime-review.v1"
    || typeof value.passed !== "boolean"
    || typeof value.generatedAt !== "string"
    || typeof value.reportHash !== "string"
    || !/^[a-f0-9]{64}$/.test(value.reportHash)
    || !Number.isFinite(Date.parse(value.generatedAt))
    || !Array.isArray(value.probes)
    || value.probes.length < 1
    || value.probes.length > 10) {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
  }
  const probes = value.probes.map((probe) => {
    if (!isRecord(probe)
      || typeof probe.id !== "string"
      || probe.id.length > 80
      || typeof probe.passed !== "boolean"
      || !Array.isArray(probe.actionIds)
      || probe.actionIds.length > 64
      || probe.actionIds.some((actionId) => typeof actionId !== "string" || actionId.length > 160)) {
      throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
    }
    return { id: probe.id, passed: probe.passed, actionIds: [...probe.actionIds] as string[] };
  });
  return {
    version: "matterhorn.crypto-developer-runtime-review.v1",
    passed: value.passed,
    generatedAt: value.generatedAt,
    reportHash: value.reportHash,
    probes,
  };
}

function conformanceReportFrom(value: Record<string, unknown>): MatterhornCryptoAppConformanceReportView {
  if (value.version !== "matterhorn.crypto-app-conformance.v1"
    || typeof value.appId !== "string"
    || typeof value.manifestRevision !== "string"
    || typeof value.manifestHash !== "string"
    || typeof value.publisherId !== "string"
    || typeof value.publisherKeyId !== "string"
    || typeof value.policyVersion !== "string"
    || value.targetEnvironment !== "testnet"
    || typeof value.generatedAt !== "string"
    || typeof value.passed !== "boolean"
    || !Array.isArray(value.findings)
    || typeof value.reportHash !== "string") {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
  }
  const findings = value.findings.map((item): MatterhornCryptoAppConformanceFindingView => {
    if (!isRecord(item)
      || (item.severity !== "error" && item.severity !== "warning")
      || !["authority", "authentication", "network", "schema", "reliability", "privacy"].includes(String(item.category))
      || typeof item.code !== "string"
      || (item.actionId !== null && typeof item.actionId !== "string")) {
      throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
    }
    return {
      severity: item.severity,
      category: item.category as MatterhornCryptoAppConformanceFindingView["category"],
      code: item.code,
      actionId: item.actionId,
    };
  });
  return {
    version: "matterhorn.crypto-app-conformance.v1",
    appId: value.appId,
    manifestRevision: value.manifestRevision,
    manifestHash: value.manifestHash,
    publisherId: value.publisherId,
    publisherKeyId: value.publisherKeyId,
    policyVersion: value.policyVersion,
    targetEnvironment: "testnet",
    generatedAt: value.generatedAt,
    passed: value.passed,
    findings,
    reportHash: value.reportHash,
  };
}

function gatewayMode(value: unknown): MatterhornCryptoGatewayMode {
  if (value !== "shadow" && value !== "enforce") {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
  }
  return value;
}

function usageStatsFrom(value: unknown): MatterhornCryptoDeveloperUsageStats {
  if (!isRecord(value)) {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
  }
  const numericKeys = [
    "calls",
    "succeeded",
    "failed",
    "timedOut",
    "pending",
    "abandoned",
    "actualCostMicros",
    "pendingReservedCostMicros",
  ] as const;
  if (numericKeys.some((key) => !Number.isSafeInteger(value[key]) || Number(value[key]) < 0)
    || (value.averageLatencyMs !== null
      && (!Number.isSafeInteger(value.averageLatencyMs) || Number(value.averageLatencyMs) < 0))
    || (value.maximumLatencyMs !== null
      && (!Number.isSafeInteger(value.maximumLatencyMs) || Number(value.maximumLatencyMs) < 0))) {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
  }
  const stats = Object.fromEntries(numericKeys.map((key) => [key, Number(value[key])])) as unknown as Omit<
    MatterhornCryptoDeveloperUsageStats,
    "averageLatencyMs" | "maximumLatencyMs"
  >;
  if (stats.calls !== stats.succeeded + stats.failed + stats.timedOut + stats.pending + stats.abandoned) {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
  }
  return {
    ...stats,
    averageLatencyMs: value.averageLatencyMs === null ? null : Number(value.averageLatencyMs),
    maximumLatencyMs: value.maximumLatencyMs === null ? null : Number(value.maximumLatencyMs),
  };
}

function usageProjectionMatchesTotals(
  rows: MatterhornCryptoDeveloperUsageStats[],
  totals: MatterhornCryptoDeveloperUsageStats,
): boolean {
  const additiveKeys = [
    "calls",
    "succeeded",
    "failed",
    "timedOut",
    "pending",
    "abandoned",
    "actualCostMicros",
    "pendingReservedCostMicros",
  ] as const;
  return additiveKeys.every((key) => {
    const sum = rows.reduce((total, row) => total + row[key], 0);
    return Number.isSafeInteger(sum) && sum === totals[key];
  });
}

function developerUsageFrom(value: unknown): MatterhornCryptoDeveloperUsageReport {
  if (!isRecord(value)
    || value.version !== "matterhorn.crypto-app-developer-usage.v1"
    || typeof value.appId !== "string"
    || !SAFE_IDENTIFIER.test(value.appId)
    || typeof value.manifestRevision !== "string"
    || !SAFE_IDENTIFIER.test(value.manifestRevision)
    || value.costUnit !== "micro_usd"
    || !Number.isSafeInteger(value.windowDays)
    || Number(value.windowDays) < 1
    || Number(value.windowDays) > 30
    || typeof value.fromDay !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.fromDay)
    || typeof value.throughDay !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.throughDay)
    || value.fromDay > value.throughDay
    || typeof value.generatedAt !== "string"
    || !Number.isFinite(Date.parse(value.generatedAt))
    || !isRecord(value.budgetPolicy)
    || value.budgetPolicy.scope !== "per_workspace"
    || !Number.isSafeInteger(value.budgetPolicy.dailyToolCostLimitMicros)
    || Number(value.budgetPolicy.dailyToolCostLimitMicros) < 1
    || !Number.isSafeInteger(value.budgetPolicy.perCallToolCostLimitMicros)
    || Number(value.budgetPolicy.perCallToolCostLimitMicros) < 1
    || Number(value.budgetPolicy.perCallToolCostLimitMicros) > Number(value.budgetPolicy.dailyToolCostLimitMicros)
    || value.budgetPolicy.walletTransactionLimitsIncluded !== false
    || !Array.isArray(value.byDay)
    || value.byDay.length > 30
    || !Array.isArray(value.byAction)
    || value.byAction.length > 256
    || !isRecord(value.privacy)
    || value.privacy.aggregateOnly !== true
    || value.privacy.tenantIdentifiersIncluded !== false
    || value.privacy.requestContentIncluded !== false
    || value.privacy.walletDataIncluded !== false) {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
  }
  const fromDay = value.fromDay;
  const throughDay = value.throughDay;
  const byDay = value.byDay.map((item) => {
    if (!isRecord(item)
      || typeof item.day !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/.test(item.day)
      || item.day < fromDay
      || item.day > throughDay) {
      throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
    }
    return { day: item.day, ...usageStatsFrom(item) };
  });
  const byAction = value.byAction.map((item) => {
    if (!isRecord(item)
      || typeof item.actionId !== "string"
      || !SAFE_IDENTIFIER.test(item.actionId)) {
      throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
    }
    return { actionId: item.actionId, ...usageStatsFrom(item) };
  });
  const totals = usageStatsFrom(value.totals);
  if (new Set(byDay.map((item) => item.day)).size !== byDay.length
    || new Set(byAction.map((item) => item.actionId)).size !== byAction.length
    || !usageProjectionMatchesTotals(byDay, totals)
    || !usageProjectionMatchesTotals(byAction, totals)) {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
  }
  return {
    version: "matterhorn.crypto-app-developer-usage.v1",
    appId: value.appId,
    manifestRevision: value.manifestRevision,
    costUnit: "micro_usd",
    windowDays: Number(value.windowDays),
    fromDay,
    throughDay,
    generatedAt: value.generatedAt,
    budgetPolicy: {
      scope: "per_workspace",
      dailyToolCostLimitMicros: Number(value.budgetPolicy.dailyToolCostLimitMicros),
      perCallToolCostLimitMicros: Number(value.budgetPolicy.perCallToolCostLimitMicros),
      walletTransactionLimitsIncluded: false,
    },
    totals,
    byDay,
    byAction,
    privacy: {
      aggregateOnly: true,
      tenantIdentifiersIncluded: false,
      requestContentIncluded: false,
      walletDataIncluded: false,
    },
  };
}

function developerStatusFrom(value: unknown): MatterhornCryptoDeveloperStatus {
  const steps = [
    "enroll",
    "register_public_key",
    "submit_testnet_manifest",
    "fix_static_conformance",
    "request_testnet_certification",
    "await_certification_review",
    "fix_runtime_certification",
    "certification_complete",
  ];
  if (!isRecord(value)
    || value.version !== "matterhorn.crypto-developer-status.v1"
    || typeof value.policyVersion !== "string"
    || typeof value.enrolled !== "boolean"
    || typeof value.publisherKeyReady !== "boolean"
    || !Array.isArray(value.supportedEnvironments)
    || value.supportedEnvironments.length !== 1
    || value.supportedEnvironments[0] !== "testnet"
    || value.mainnetAvailable !== false
    || value.runtimeCertificationRequired !== true
    || !isRecord(value.submissionCounts)
    || !steps.includes(String(value.nextStep))) {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
  }
  const submissionCounts = value.submissionCounts;
  if (!["staticFailed", "staticPassed", "certificationRequested", "certificationPassed", "certificationFailed"].every((key) => (
    Number.isSafeInteger(submissionCounts[key]) && Number(submissionCounts[key]) >= 0
  ))) {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
  }
  return {
    version: "matterhorn.crypto-developer-status.v1",
    policyVersion: value.policyVersion,
    enrolled: value.enrolled,
    publisherKeyReady: value.publisherKeyReady,
    supportedEnvironments: ["testnet"],
    mainnetAvailable: false,
    runtimeCertificationRequired: true,
    submissionCounts: {
      staticFailed: Number(submissionCounts.staticFailed),
      staticPassed: Number(submissionCounts.staticPassed),
      certificationRequested: Number(submissionCounts.certificationRequested),
      certificationPassed: Number(submissionCounts.certificationPassed),
      certificationFailed: Number(submissionCounts.certificationFailed),
    },
    nextStep: value.nextStep as MatterhornCryptoDeveloperStatus["nextStep"],
  };
}

/**
 * Account-scoped invite-only developer API. Authentication is the user's
 * existing HttpOnly Matterhorn session cookie; this client never accepts a
 * bearer token, host token, private key, wallet credential, or submit action.
 */
export function createMatterhornCryptoDeveloperClient(options: MatterhornCryptoDeveloperClientOptions = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new MatterhornCryptoDeveloperClientError("developer_client_configuration_invalid", null);
  }

  async function request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    // Credentials cannot be overridden: only the signed-in account session is valid.
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers,
      credentials: "include",
      redirect: "error",
    });
    const payload = await parseBoundedJson(response);
    if (!isRecord(payload)) {
      throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", response.status);
    }
    if (!response.ok) {
      const serverCode = typeof payload.code === "string" ? payload.code.slice(0, 128) : null;
      throw new MatterhornCryptoDeveloperClientError(
        "developer_client_request_failed",
        response.status,
        serverCode,
        boundedIssues(payload.issues),
      );
    }
    return payload;
  }

  return Object.freeze({
    async getStatus(): Promise<{
      mode: MatterhornCryptoGatewayMode;
      status: MatterhornCryptoDeveloperStatus;
    }> {
      const payload = await request("/developer/crypto-apps/status");
      return { mode: gatewayMode(payload.mode), status: developerStatusFrom(payload.status) };
    },

    async getProfile(): Promise<{
      mode: MatterhornCryptoGatewayMode;
      enrolled: boolean;
      profile: MatterhornCryptoDeveloperProfileView | null;
    }> {
      const payload = await request("/developer/crypto-apps/profile");
      const enrolled = payload.enrolled === true;
      const profile = payload.profile === null ? null : profileFrom(payload.profile);
      if (enrolled !== Boolean(profile)) {
        throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
      }
      return {
        mode: gatewayMode(payload.mode),
        enrolled,
        profile,
      };
    },

    async enroll(input: {
      inviteToken: string;
      publisherId: string;
      displayName: string;
    }): Promise<MatterhornCryptoDeveloperProfileView> {
      const payload = await request("/developer/crypto-apps/enroll", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return profileFrom(payload.profile);
    },

    async registerPublisherKey(input: {
      keyId: string;
      algorithm: "ed25519";
      publicKeyPem: string;
    }): Promise<MatterhornCryptoDeveloperProfileView> {
      const payload = await request("/developer/crypto-apps/publisher-keys", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return profileFrom(payload.profile);
    },

    async listSubmissions(): Promise<MatterhornCryptoDeveloperSubmissionView[]> {
      const payload = await request("/developer/crypto-apps/submissions");
      if (!Array.isArray(payload.submissions)) {
        throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
      }
      return payload.submissions.map(submissionFrom);
    },

    async getUsage(
      appId: string,
      manifestRevision: string,
      windowDays = 7,
    ): Promise<MatterhornCryptoDeveloperUsageReport> {
      if (!Number.isSafeInteger(windowDays) || windowDays < 1 || windowDays > 30) {
        throw new MatterhornCryptoDeveloperClientError("developer_client_configuration_invalid", null);
      }
      const payload = await request(
        `/developer/crypto-apps/submissions/${identifier(appId)}/${identifier(manifestRevision)}/usage?days=${windowDays}`,
      );
      const usage = developerUsageFrom(payload.usage);
      if (usage.appId !== appId || usage.manifestRevision !== manifestRevision) {
        throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
      }
      return usage;
    },

    async submitTestnetManifest(
      manifest: MatterhornCryptoAppManifest,
    ): Promise<MatterhornCryptoDeveloperSubmissionView> {
      const payload = await request("/developer/crypto-apps/submissions", {
        method: "POST",
        body: JSON.stringify({ manifest, targetEnvironment: "testnet" }),
      });
      return submissionFrom(payload.submission);
    },

    async requestTestnetCertification(
      appId: string,
      manifestRevision: string,
    ): Promise<MatterhornCryptoDeveloperSubmissionView> {
      const payload = await request(
        `/developer/crypto-apps/submissions/${identifier(appId)}/${identifier(manifestRevision)}/certification-request`,
        { method: "POST" },
      );
      return submissionFrom(payload.submission);
    },
  });
}
