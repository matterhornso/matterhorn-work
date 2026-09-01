import {
  validateMatterhornCryptoAppManifest,
  type MatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import { projectCryptoAppOutput, validateCryptoAppInput } from "./json-schema.js";

const CALL_VERSION = "matterhorn.crypto-app-call.v1";
const REPORT_VERSION = "matterhorn.crypto-app-local-run.v1";
const ENVELOPE_KEYS = new Set(["data", "source", "observedAt", "blockOrVersion"]);
const SECRET_KEY = /^(?:api[_-]?key|authorization|bearer|client[_-]?secret|mnemonic|password|private[_-]?key|recovery[_-]?phrase|seed[_-]?phrase|secret[_-]?key|wallet[_-]?export)$/i;
const SECRET_VALUE = /BEGIN [A-Z ]*PRIVATE KEY|\b(?:seed|recovery) phrase\b|\bwallet export\b/i;
const MAX_ARGUMENT_BYTES = 64 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_LOCAL_TIMEOUT_MS = 30_000;

export type MatterhornCryptoAppLocalCall = {
  version: typeof CALL_VERSION;
  appId: string;
  manifestRevision: string;
  actionId: string;
  network: string;
  arguments: Record<string, unknown>;
};

export type MatterhornCryptoAppLocalEnvelope = {
  data: unknown;
  source: string;
  observedAt: string | null;
  blockOrVersion: string | null;
};

export type MatterhornCryptoAppLocalRunReport = {
  version: typeof REPORT_VERSION;
  appId: string;
  manifestRevision: string;
  actionId: string;
  network: string;
  access: "read" | "watch" | "prepare" | "simulate";
  output: unknown;
  observation: {
    source: string;
    observedAt: string | null;
    blockOrVersion: string | null;
    ageMs: number | null;
  };
  provenance: {
    trust: "untrusted_external";
    sanitization: "typed_projection";
  };
  certificationAuthority: "none";
  runtimeProbesRequired: true;
};

export type MatterhornCryptoAppLocalRunnerOptions = {
  /**
   * Developer-owned test invocation. Matterhorn supplies no fetch client,
   * headers, credentials, wallet, signer, or submission method.
   */
  invoke: (
    call: MatterhornCryptoAppLocalCall,
    context: { signal: AbortSignal },
  ) => Promise<unknown>;
  now?: () => Date;
  /** May shorten, but never extend, the manifest action timeout. */
  timeoutMs?: number;
  maxResponseBytes?: number;
};

export class MatterhornCryptoAppLocalRunnerError extends Error {
  constructor(
    public readonly code:
      | "local_runner_configuration_invalid"
      | "local_runner_manifest_invalid"
      | "local_runner_testnet_required"
      | "local_runner_action_not_found"
      | "local_runner_authentication_unsupported"
      | "local_runner_arguments_invalid"
      | "local_runner_secret_forbidden"
      | "local_runner_aborted"
      | "local_runner_timeout"
      | "local_runner_invocation_failed"
      | "local_runner_response_invalid"
      | "local_runner_response_too_large"
      | "local_runner_output_invalid"
      | "local_runner_output_stale",
    public readonly issues: string[] = [],
  ) {
    super(code);
    this.name = "MatterhornCryptoAppLocalRunnerError";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function byteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function containsSecret(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === "string") return SECRET_VALUE.test(value);
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return true;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsSecret(item, seen));
  return Object.entries(value).some(([key, item]) => SECRET_KEY.test(key) || containsSecret(item, seen));
}

function parseEnvelope(value: unknown, maxResponseBytes: number): MatterhornCryptoAppLocalEnvelope {
  if (byteLength(value) > maxResponseBytes) {
    throw new MatterhornCryptoAppLocalRunnerError("local_runner_response_too_large");
  }
  const envelope = record(value);
  if (!envelope
    || Object.keys(envelope).some((key) => !ENVELOPE_KEYS.has(key))
    || !("data" in envelope)
    || typeof envelope.source !== "string"
    || envelope.source.length < 1
    || envelope.source.length > 200
    || (envelope.observedAt !== null && typeof envelope.observedAt !== "string")
    || (envelope.blockOrVersion !== null
      && (typeof envelope.blockOrVersion !== "string" || envelope.blockOrVersion.length > 200))) {
    throw new MatterhornCryptoAppLocalRunnerError("local_runner_response_invalid");
  }
  return {
    data: envelope.data,
    source: envelope.source,
    observedAt: envelope.observedAt,
    blockOrVersion: envelope.blockOrVersion,
  };
}

/**
 * Exercises one testnet adapter action through a developer-owned callback.
 * This runner is advisory: it performs no network resolution, authentication,
 * certification, capability grant, wallet signing, relay, or submission.
 */
export async function runMatterhornCryptoAppLocalAdapter(input: {
  manifest: MatterhornCryptoAppManifest;
  actionId: string;
  network: string;
  arguments: Record<string, unknown>;
  signal?: AbortSignal;
}, options: MatterhornCryptoAppLocalRunnerOptions): Promise<MatterhornCryptoAppLocalRunReport> {
  if (!options || typeof options.invoke !== "function") {
    throw new MatterhornCryptoAppLocalRunnerError("local_runner_configuration_invalid");
  }
  if ((options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1))
    || (options.maxResponseBytes !== undefined
      && (!Number.isSafeInteger(options.maxResponseBytes) || options.maxResponseBytes < 1_024))) {
    throw new MatterhornCryptoAppLocalRunnerError("local_runner_configuration_invalid");
  }
  const evaluationNow = options.now?.() ?? new Date();
  if (!(evaluationNow instanceof Date) || !Number.isFinite(evaluationNow.getTime())) {
    throw new MatterhornCryptoAppLocalRunnerError("local_runner_configuration_invalid");
  }
  const manifestIssues = validateMatterhornCryptoAppManifest(input.manifest);
  if (manifestIssues.length) {
    throw new MatterhornCryptoAppLocalRunnerError("local_runner_manifest_invalid", manifestIssues);
  }
  if (!input.manifest.networks.some((network) => (
    network.chainId === input.network && network.environment === "testnet"
  ))) {
    throw new MatterhornCryptoAppLocalRunnerError("local_runner_testnet_required");
  }
  const action = input.manifest.actions.find((candidate) => candidate.id === input.actionId);
  if (!action) throw new MatterhornCryptoAppLocalRunnerError("local_runner_action_not_found");
  if (input.manifest.authentication.type !== "none") {
    throw new MatterhornCryptoAppLocalRunnerError("local_runner_authentication_unsupported");
  }
  if (!input.arguments || typeof input.arguments !== "object" || Array.isArray(input.arguments)) {
    throw new MatterhornCryptoAppLocalRunnerError("local_runner_arguments_invalid");
  }
  if (containsSecret(input.arguments)) {
    throw new MatterhornCryptoAppLocalRunnerError("local_runner_secret_forbidden");
  }
  if (byteLength(input.arguments) > MAX_ARGUMENT_BYTES) {
    throw new MatterhornCryptoAppLocalRunnerError("local_runner_arguments_invalid", ["arguments_size_exceeded"]);
  }
  const validated = validateCryptoAppInput(action.inputSchema, input.arguments);
  if (!validated.ok || !record(validated.value)) {
    throw new MatterhornCryptoAppLocalRunnerError("local_runner_arguments_invalid", validated.issues);
  }

  const controller = new AbortController();
  const timeoutMs = Math.min(
    Math.max(1, action.timeoutMs),
    Math.max(1, options.timeoutMs ?? MAX_LOCAL_TIMEOUT_MS),
    MAX_LOCAL_TIMEOUT_MS,
  );
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  input.signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (input.signal?.aborted) controller.abort();
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const call: MatterhornCryptoAppLocalCall = {
    version: CALL_VERSION,
    appId: input.manifest.appId,
    manifestRevision: input.manifest.manifestRevision,
    actionId: action.id,
    network: input.network,
    arguments: structuredClone(validated.value as Record<string, unknown>),
  };
  let raw: unknown;
  let removeAbortListener = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(new MatterhornCryptoAppLocalRunnerError(
      timedOut ? "local_runner_timeout" : "local_runner_aborted",
    ));
    removeAbortListener = () => controller.signal.removeEventListener("abort", onAbort);
    controller.signal.addEventListener("abort", onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
  });
  try {
    try {
      raw = await Promise.race([
        options.invoke(Object.freeze(call), { signal: controller.signal }),
        aborted,
      ]);
    } catch (error) {
      if (error instanceof MatterhornCryptoAppLocalRunnerError) throw error;
      throw new MatterhornCryptoAppLocalRunnerError("local_runner_invocation_failed");
    }
  } finally {
    clearTimeout(timeout);
    removeAbortListener();
    input.signal?.removeEventListener("abort", abortFromCaller);
  }

  const maxResponseBytes = Math.max(1_024, Math.min(
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    DEFAULT_MAX_RESPONSE_BYTES,
  ));
  const envelope = parseEnvelope(raw, maxResponseBytes);
  const projected = projectCryptoAppOutput(action.outputProjectionSchema, envelope.data);
  if (!projected.ok) {
    throw new MatterhornCryptoAppLocalRunnerError("local_runner_output_invalid", projected.issues);
  }
  let observedAt: Date | null = null;
  let ageMs: number | null = null;
  if (envelope.observedAt !== null) {
    observedAt = new Date(envelope.observedAt);
    if (!Number.isFinite(observedAt.getTime())) observedAt = null;
    else ageMs = evaluationNow.getTime() - observedAt.getTime();
  }
  if (action.requiresFreshness && (!observedAt
    || ageMs === null
    || ageMs < -60_000
    || action.freshnessMaxAgeMs === null
    || ageMs > action.freshnessMaxAgeMs)) {
    throw new MatterhornCryptoAppLocalRunnerError("local_runner_output_stale");
  }

  return {
    version: REPORT_VERSION,
    appId: input.manifest.appId,
    manifestRevision: input.manifest.manifestRevision,
    actionId: action.id,
    network: input.network,
    access: action.access,
    output: structuredClone(projected.value),
    observation: {
      source: envelope.source,
      observedAt: observedAt?.toISOString() ?? null,
      blockOrVersion: envelope.blockOrVersion,
      ageMs,
    },
    provenance: {
      trust: "untrusted_external",
      sanitization: "typed_projection",
    },
    certificationAuthority: "none",
    runtimeProbesRequired: true,
  };
}
