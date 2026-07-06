import type {
  MatterhornBackendModelCatalogSnapshot,
  MatterhornBackendModelsResponse,
} from "@matterhorn-work/types/backend-models";
import type { MatterhornCapability } from "@matterhorn-work/types/backend-capabilities";

function capability(status: MatterhornCapability["status"], label: string, description: string): MatterhornCapability {
  return { status, label, description };
}

function fallbackCatalog(catalog?: MatterhornBackendModelCatalogSnapshot): MatterhornBackendModelCatalogSnapshot {
  return catalog ?? {
    ...capability(
      "preview",
      "Client provider list",
      "The global backend contract is available, but a workspace must be selected before Matterhorn can ask OpenCode for the live provider catalog.",
    ),
    source: "opencode_provider_list",
    serverFetched: false,
    providerCount: 0,
    connectedProviderCount: 0,
    modelCount: 0,
    connectedProviderIds: [],
    defaultModels: {},
    providers: [],
  };
}

function defaultModelForCatalog(catalog?: MatterhornBackendModelCatalogSnapshot): MatterhornBackendModelsResponse["defaultModel"] {
  const fallback = {
    providerId: "opencode",
    modelId: "big-pickle",
    source: "server_default" as const,
  };
  if (!catalog?.serverFetched) return fallback;

  const providerIds = [
    ...catalog.connectedProviderIds,
    ...Object.keys(catalog.defaultModels).sort((a, b) => a.localeCompare(b)),
  ];
  for (const providerId of providerIds) {
    const modelId = catalog.defaultModels[providerId]?.trim();
    if (!modelId) continue;
    const provider = catalog.providers.find((candidate) => candidate.id === providerId);
    if (!provider || provider.modelCount === 0) continue;
    return {
      providerId,
      modelId,
      source: "server_default",
    };
  }

  return fallback;
}

export function buildBackendModels(input: { catalog?: MatterhornBackendModelCatalogSnapshot } = {}): MatterhornBackendModelsResponse {
  const catalog = fallbackCatalog(input.catalog);
  return {
    success: true,
    version: "matterhorn.backend.models.v1",
    generatedAt: new Date().toISOString(),
    defaultModel: defaultModelForCatalog(catalog),
    catalog,
    routing: {
      answerPath: {
        ...capability(
          "working",
          "OpenCode session prompts",
          "Agent answers are sent through OpenCode/OpenWork session.promptAsync with an explicit providerID/modelID when the user has selected a model.",
        ),
        transport: "opencode_session_prompt_async",
        requestModelField: "model.providerID_modelID",
      },
      selection: {
        ...capability(
          "working",
          "User-selected model",
          "The app stores the selected model in local preferences and sends it with each prompt request.",
        ),
        userSelectable: true,
        surface: "model_picker",
        preferenceStore: "local_preferences",
        serverPersisted: false,
      },
      registry: {
        ...capability(
          "preview",
          "OpenCode provider list",
          "The live model list currently comes from the OpenCode client provider.list path. A server-owned Matterhorn model registry is planned.",
        ),
        source: "opencode_provider_list",
        serverOwned: false,
        clientTool: "opencode_client_provider_list",
        cloudProviderImport: true,
      },
    },
    privacy: {
      trainingUse: "none_by_default",
      feedbackUse: "eval_routing_product_quality_only",
    },
    limitations: [
      "The global endpoint reports the routing contract. Use the workspace endpoint to see the server-normalized OpenCode provider catalog for a selected workspace.",
      "Model preference is local to this browser/app profile today; it is not yet a server-owned team policy.",
      "User feedback is stored for eval, routing, and product quality review only. It is not used for RL or model training by default.",
    ],
  };
}
