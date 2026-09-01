import type { MatterhornCryptoAppManifest } from "@matterhorn-work/types/crypto-coworkers";

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
  state: "static_failed" | "static_passed" | "certification_requested";
  createdAt: string;
  updatedAt: string;
  certificationRequestedAt: string | null;
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
    || !["static_failed", "static_passed", "certification_requested"].includes(String(value.state))
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
    || (value.certificationRequestedAt !== null && typeof value.certificationRequestedAt !== "string")) {
    throw new MatterhornCryptoDeveloperClientError("developer_client_response_invalid", 200);
  }
  const report = conformanceReportFrom(value.staticReport);
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
