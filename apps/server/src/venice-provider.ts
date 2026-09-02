export const VENICE_PROVIDER_ID = "venice";
export const VENICE_PROVIDER_NAME = "Venice Private";
export const VENICE_INFERENCE_BASE_URL = "https://api.venice.ai/api/v1";
export const VENICE_MODELS_URL = `${VENICE_INFERENCE_BASE_URL}/models`;
export const VENICE_PRIVACY_POLICY_URL = "https://docs.venice.ai/overview/about-venice";

const MAX_PRIVATE_MODELS = 100;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 5_000;
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

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

let privateModelIds = new Set<string>();

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
 * admits text models that are explicitly private and tool-capable. Models with
 * anonymized routing, missing metadata, or no function calling fail closed.
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
      spec?.offline === true ||
      capabilities?.supportsFunctionCalling !== true
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
): void {
  privateModelIds = new Set(models.map((model) => model.id));
}

export function isRegisteredVenicePrivateModel(modelId: string | null | undefined): boolean {
  const id = modelId?.trim();
  return Boolean(id && privateModelIds.has(id));
}

export function hasRegisteredVenicePrivateModels(): boolean {
  return privateModelIds.size > 0;
}

export async function discoverVenicePrivateModels(input: {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
} = {}): Promise<VenicePrivateModel[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS,
  );
  try {
    const response = await fetchImpl(VENICE_MODELS_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Venice private model discovery failed with HTTP ${response.status}`);
    }
    return parseVenicePrivateModels(await response.json());
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
