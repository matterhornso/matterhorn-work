import {
  createPinnedJsonRequester,
  type MatterhornPinnedJsonRequester,
} from "./crypto-app-https-transport.js";
import {
  resolvePublicCryptoAdapterEndpoint,
  type MatterhornResolvedAdapterEndpoint,
} from "./crypto-app-egress.js";

export const VENICE_PROVIDER_ID = "venice";
export const VENICE_PROVIDER_NAME = "Venice Private";
export const VENICE_INFERENCE_BASE_URL = "https://api.venice.ai/api/v1";
export const VENICE_MODELS_URL = `${VENICE_INFERENCE_BASE_URL}/models`;
export const VENICE_PRIVACY_POLICY_URL = "https://docs.venice.ai/overview/about-venice";

const MAX_PRIVATE_MODELS = 100;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 5_000;
const MIN_DISCOVERY_TIMEOUT_MS = 250;
const MAX_DISCOVERY_TIMEOUT_MS = 30_000;
const PRIVATE_MODEL_REGISTRY_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_PRIVATE_MODEL_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1_000;
const MIN_PRIVATE_MODEL_REFRESH_INTERVAL_MS = 60 * 60 * 1_000;
const PREFERRED_PRIVATE_MODELS = [
  "z-ai-glm-5-3-flash",
  "z-ai-glm-5-3",
  "qwen3-coder-480b-a35b-instruct-turbo",
  "openai-gpt-oss-120b",
] as const;

export type VenicePrivateModel = {
  id: string;
  name: string;
};

type VeniceEndpointResolver = (
  value: string,
) => Promise<MatterhornResolvedAdapterEndpoint>;

type VenicePrivateModelRegistry = {
  ids: Set<string>;
  verifiedAt: string | null;
  expiresAt: string | null;
};

let privateModelRegistry: VenicePrivateModelRegistry = {
  ids: new Set(),
  verifiedAt: null,
  expiresAt: null,
};

function recordLike(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 160 || !/^[a-zA-Z0-9._:/-]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function safeName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/[\r\n\t]+/g, " ");
  return normalized && normalized.length <= 160 ? normalized : fallback;
}

function preferredModelRank(modelId: string): number {
  const rank = PREFERRED_PRIVATE_MODELS.indexOf(
    modelId as (typeof PREFERRED_PRIVATE_MODELS)[number],
  );
  return rank === -1 ? PREFERRED_PRIVATE_MODELS.length : rank;
}

/**
 * Venice publishes privacy and capability metadata per model. Matterhorn only
 * admits stable, online text models that are explicitly private and
 * tool-capable. E2EE and TEE models require Venice's dedicated encryption or
 * attestation protocol; the OpenAI-compatible transport below does not yet
 * implement either boundary, so those models fail closed instead of silently
 * receiving a plaintext request. Models with anonymized routing, missing
 * online metadata, beta/deprecation state, or no function calling also fail
 * closed.
 */
export function parseVenicePrivateModels(payload: unknown): VenicePrivateModel[] {
  const root = recordLike(payload);
  const data = Array.isArray(root?.data) ? root.data : [];
  const models = new Map<string, VenicePrivateModel>();

  for (const candidate of data) {
    const model = recordLike(candidate);
    const spec = recordLike(model?.model_spec);
    const capabilities = recordLike(spec?.capabilities);
    const id = safeIdentifier(model?.id);
    if (
      !id ||
      model?.type !== "text" ||
      spec?.privacy !== "private" ||
      spec?.offline !== false ||
      spec?.betaModel === true ||
      recordLike(spec?.deprecation) !== null ||
      capabilities?.supportsFunctionCalling !== true ||
      capabilities?.supportsE2EE === true ||
      capabilities?.supportsTeeAttestation === true
    ) {
      continue;
    }
    models.set(id, {
      id,
      name: safeName(spec.name, id),
    });
  }

  return [...models.values()]
    .sort((left, right) => {
      const rank = preferredModelRank(left.id) - preferredModelRank(right.id);
      return rank || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
    })
    .slice(0, MAX_PRIVATE_MODELS);
}

export function configureVenicePrivateModelRegistry(
  models: readonly VenicePrivateModel[],
  options: { now?: Date; ttlMs?: number } = {},
): void {
  if (models.length === 0) {
    privateModelRegistry = { ids: new Set(), verifiedAt: null, expiresAt: null };
    return;
  }
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const ttlMs = options.ttlMs ?? PRIVATE_MODEL_REGISTRY_TTL_MS;
  if (!Number.isFinite(nowMs)
    || !Number.isSafeInteger(ttlMs)
    || ttlMs < 60_000
    || ttlMs > PRIVATE_MODEL_REGISTRY_TTL_MS) {
    throw new Error("venice_private_model_registry_expiry_invalid");
  }
  privateModelRegistry = {
    ids: new Set(models.map((model) => model.id)),
    verifiedAt: now.toISOString(),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
  };
}

function privateModelRegistryActive(now: Date): boolean {
  const expiresAtMs = Date.parse(privateModelRegistry.expiresAt ?? "");
  return privateModelRegistry.ids.size > 0
    && Number.isFinite(now.getTime())
    && Number.isFinite(expiresAtMs)
    && now.getTime() < expiresAtMs;
}

export function venicePrivateModelRegistryStatus(now = new Date()): {
  active: boolean;
  verifiedAt: string | null;
  expiresAt: string | null;
  modelIds: string[];
} {
  return {
    active: privateModelRegistryActive(now),
    verifiedAt: privateModelRegistry.verifiedAt,
    expiresAt: privateModelRegistry.expiresAt,
    modelIds: privateModelRegistryActive(now)
      ? [...privateModelRegistry.ids].sort()
      : [],
  };
}

export function isRegisteredVenicePrivateModel(
  modelId: string | null | undefined,
  now = new Date(),
): boolean {
  const id = modelId?.trim();
  return Boolean(id && privateModelRegistryActive(now) && privateModelRegistry.ids.has(id));
}

export function hasRegisteredVenicePrivateModels(now = new Date()): boolean {
  return privateModelRegistryActive(now);
}

export async function discoverVenicePrivateModels(input: {
  requestJson?: MatterhornPinnedJsonRequester;
  resolveEndpoint?: VeniceEndpointResolver;
  timeoutMs?: number;
} = {}): Promise<VenicePrivateModel[]> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs)
    || timeoutMs < MIN_DISCOVERY_TIMEOUT_MS
    || timeoutMs > MAX_DISCOVERY_TIMEOUT_MS) {
    throw new Error("venice_private_model_discovery_timeout_invalid");
  }
  const requestJson = input.requestJson ?? createPinnedJsonRequester();
  const resolveEndpoint = input.resolveEndpoint ?? resolvePublicCryptoAdapterEndpoint;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const aborted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => reject(new Error("venice_private_model_discovery_timeout")),
      { once: true },
    );
  });
  try {
    const resolved = await Promise.race([
      resolveEndpoint(VENICE_MODELS_URL),
      aborted,
    ]);
    if (resolved.endpoint.href !== VENICE_MODELS_URL
      || resolved.hostname !== new URL(VENICE_MODELS_URL).hostname
      || resolved.approvedAddresses.length === 0) {
      throw new Error("venice_private_model_discovery_endpoint_invalid");
    }
    const response = await requestJson({
      endpoint: resolved.endpoint,
      approvedAddresses: resolved.approvedAddresses,
      method: "GET",
      signal: controller.signal,
    });
    return parseVenicePrivateModels(response.value);
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveManagedVenicePrivateModels(
  env: Record<string, string | undefined> = process.env,
): Promise<VenicePrivateModel[]> {
  if (!env.VENICE_API_KEY?.trim()) {
    configureVenicePrivateModelRegistry([]);
    return [];
  }
  try {
    const models = await discoverVenicePrivateModels();
    configureVenicePrivateModelRegistry(models);
    if (models.length === 0) {
      console.warn("Managed Venice is disabled because no private, tool-capable models were verified.");
    }
    return models;
  } catch {
    configureVenicePrivateModelRegistry([]);
    console.warn("Managed Venice is disabled because its private model catalog could not be verified.");
    return [];
  }
}

export function startManagedVenicePrivateModelRegistryRefresh(input: {
  env?: Record<string, string | undefined>;
  intervalMs?: number;
  refresh?: () => Promise<unknown>;
  schedule?: (callback: () => void, intervalMs: number) => {
    cancel: () => void;
    unref?: () => void;
  };
} = {}): { stop: () => void } {
  const env = input.env ?? process.env;
  if (!env.VENICE_API_KEY?.trim()) return { stop: () => undefined };
  const intervalMs = input.intervalMs ?? DEFAULT_PRIVATE_MODEL_REFRESH_INTERVAL_MS;
  if (!Number.isSafeInteger(intervalMs)
    || intervalMs < MIN_PRIVATE_MODEL_REFRESH_INTERVAL_MS
    || intervalMs >= PRIVATE_MODEL_REGISTRY_TTL_MS) {
    throw new Error("venice_private_model_refresh_interval_invalid");
  }
  const refresh = input.refresh ?? (() => resolveManagedVenicePrivateModels(env));
  const schedule = input.schedule ?? ((callback: () => void, delayMs: number) => {
    const handle = setInterval(callback, delayMs);
    return {
      cancel: () => clearInterval(handle),
      unref: () => handle.unref?.(),
    };
  });
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await refresh();
    } catch {
      configureVenicePrivateModelRegistry([]);
      console.warn("Managed Venice is disabled because its private model catalog refresh failed.");
    } finally {
      running = false;
    }
  };
  const timer = schedule(() => { void tick(); }, intervalMs);
  timer.unref?.();
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      timer.cancel();
    },
  };
}

export function buildManagedVeniceProviderConfig(
  models: readonly VenicePrivateModel[],
) {
  if (models.length === 0) {
    throw new Error("Managed Venice requires at least one verified private model");
  }
  return {
    npm: "@ai-sdk/openai-compatible",
    name: VENICE_PROVIDER_NAME,
    env: ["VENICE_API_KEY"],
    options: {
      baseURL: VENICE_INFERENCE_BASE_URL,
      headerTimeout: 30_000,
      chunkTimeout: 45_000,
      timeout: 120_000,
    },
    models: Object.fromEntries(
      models.map((model) => [model.id, { name: model.name }]),
    ),
  };
}
