export const CUDOS_PROVIDER_ID = "cudos";
export const CUDOS_PROVIDER_NAME = "CUDOS / ASI:Cloud";
export const CUDOS_INFERENCE_BASE_URL = "https://inference.asicloud.cudos.org/v1";
const CUDOS_MODEL_CATALOG_MAX_BYTES = 1_000_000;
const CUDOS_MODEL_CATALOG_MAX_MODELS = 256;
const CUDOS_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,199}$/;

export type CudosModel = Readonly<{ id: string; name: string }>;

export const CUDOS_MODELS: readonly CudosModel[] = [
  { id: "asi1-mini", name: "ASI1 Mini" },
  { id: "google/gemma-3-27b-it", name: "Gemma 3 27B Instruct" },
  { id: "qwen/qwen3-32b", name: "Qwen3 32B" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct" },
  { id: "z-ai/glm-4.5-air", name: "GLM 4.5 Air" },
  { id: "mistralai/mistral-nemo", name: "Mistral Nemo" },
  { id: "openai/gpt-oss-20b", name: "GPT OSS 20B" },
] as const;

export type CudosModelCatalog = Readonly<{
  models: readonly CudosModel[];
  source: "provider" | "fallback";
}>;

function catalogModelName(id: string, name: unknown): string {
  if (typeof name === "string" && name.trim()) return name.trim().slice(0, 160);
  return id
    .split("/")
    .at(-1)!
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => part.length <= 4 ? part.toUpperCase() : `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function parseCudosModelCatalog(value: unknown): readonly CudosModel[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { data?: unknown }).data)) {
    throw new Error("cudos_model_catalog_invalid");
  }
  const byId = new Map<string, CudosModel>();
  for (const entry of (value as { data: unknown[] }).data) {
    if (!entry || typeof entry !== "object") continue;
    const id = typeof (entry as { id?: unknown }).id === "string"
      ? (entry as { id: string }).id.trim()
      : "";
    if (!CUDOS_MODEL_ID.test(id) || ["__proto__", "prototype", "constructor"].includes(id)) continue;
    byId.set(id, { id, name: catalogModelName(id, (entry as { name?: unknown }).name) });
    if (byId.size >= CUDOS_MODEL_CATALOG_MAX_MODELS) break;
  }
  const models = [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
  if (models.length === 0) throw new Error("cudos_model_catalog_empty");
  return models;
}

export async function resolveManagedCudosModelCatalog(input: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): Promise<CudosModelCatalog> {
  const apiKey = (input.apiKey ?? process.env.CUDOS_API_KEY ?? "").trim();
  if (!apiKey) return { models: CUDOS_MODELS, source: "fallback" };
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${CUDOS_INFERENCE_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(input.timeoutMs ?? 8_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`cudos_model_catalog_http_${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") || "0");
    if (declaredLength > CUDOS_MODEL_CATALOG_MAX_BYTES) {
      throw new Error("cudos_model_catalog_too_large");
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > CUDOS_MODEL_CATALOG_MAX_BYTES) {
      throw new Error("cudos_model_catalog_too_large");
    }
    return { models: parseCudosModelCatalog(JSON.parse(text)), source: "provider" };
  } catch {
    return { models: CUDOS_MODELS, source: "fallback" };
  }
}

export function buildManagedCudosProviderConfig(models: readonly CudosModel[] = CUDOS_MODELS) {
  return {
    npm: "@ai-sdk/openai-compatible",
    name: CUDOS_PROVIDER_NAME,
    env: ["CUDOS_API_KEY"],
    options: {
      baseURL: CUDOS_INFERENCE_BASE_URL,
      // OpenCode 1.18 enforces these at the transport boundary. A degraded
      // inference request should fail cleanly into the existing Retry flow
      // instead of leaving a chat visibly active for many minutes.
      headerTimeout: 30_000,
      chunkTimeout: 45_000,
      timeout: 120_000,
    },
    models: Object.fromEntries(
      models.map((model) => [model.id, { name: model.name }]),
    ),
  };
}
