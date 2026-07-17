export const CUDOS_PROVIDER_ID = "cudos";
export const CUDOS_PROVIDER_NAME = "CUDOS / ASI:Cloud";
export const CUDOS_INFERENCE_BASE_URL = "https://inference.asicloud.cudos.org/v1";

export const CUDOS_MODELS = [
  { id: "asi1-mini", name: "ASI1 Mini" },
  { id: "google/gemma-3-27b-it", name: "Gemma 3 27B Instruct" },
  { id: "qwen/qwen3-32b", name: "Qwen3 32B" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct" },
  { id: "z-ai/glm-4.5-air", name: "GLM 4.5 Air" },
  { id: "mistralai/mistral-nemo", name: "Mistral Nemo" },
  { id: "openai/gpt-oss-20b", name: "GPT OSS 20B" },
] as const;

export function buildCudosProviderConfig() {
  return {
    npm: "@ai-sdk/openai-compatible",
    name: CUDOS_PROVIDER_NAME,
    env: ["CUDOS_API_KEY"],
    options: {
      baseURL: CUDOS_INFERENCE_BASE_URL,
    },
    models: Object.fromEntries(
      CUDOS_MODELS.map((model) => [model.id, { name: model.name }]),
    ),
  };
}
