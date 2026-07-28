import type {
  MatterhornBackendModelCatalogSnapshot,
  MatterhornBackendModelSelectionRecord,
  MatterhornBackendModelSelectionRequest,
  MatterhornBackendModelSelectionResponse,
  MatterhornBackendModelsResponse,
} from "@matterhorn-work/types/backend-models";
import type { MatterhornCapability } from "@matterhorn-work/types/backend-capabilities";
import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { atomicWriteTextFile } from "./atomic-file.js";
import type { Actor, WorkspaceInfo } from "./types.js";
import { exists } from "./utils.js";

export const MATTERHORN_RELEASE_DEFAULT_PROVIDER_ID = "opencode";
export const MATTERHORN_RELEASE_DEFAULT_MODEL_ID = "mimo-v2.5-free";

function isCatalogOnlyProviderId(providerId: string | null | undefined) {
  return providerId?.trim().toLowerCase() === MATTERHORN_RELEASE_DEFAULT_PROVIDER_ID;
}

function configuredPromptProviders(
  catalog: MatterhornBackendModelCatalogSnapshot,
) {
  return catalog.providers.filter(
    (provider) =>
      provider.connected &&
      !isCatalogOnlyProviderId(provider.id) &&
      provider.modelCount > 0,
  );
}

function capability(status: MatterhornCapability["status"], label: string, description: string): MatterhornCapability {
  return { status, label, description };
}

function fallbackCatalog(catalog?: MatterhornBackendModelCatalogSnapshot): MatterhornBackendModelCatalogSnapshot {
  return catalog ?? {
    ...capability(
      "preview",
      "Client provider list",
      "The global backend contract is available, but a workspace must be selected before Matterhorn can ask the engine runtime for the live provider catalog.",
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
    providerId: MATTERHORN_RELEASE_DEFAULT_PROVIDER_ID,
    modelId: MATTERHORN_RELEASE_DEFAULT_MODEL_ID,
    source: "server_default" as const,
  };
  if (!catalog?.serverFetched) return fallback;

  const releaseProvider = catalog.providers.find(
    (provider) =>
      provider.id === MATTERHORN_RELEASE_DEFAULT_PROVIDER_ID &&
      provider.connected &&
      provider.modelIds.includes(MATTERHORN_RELEASE_DEFAULT_MODEL_ID),
  );
  if (releaseProvider) {
    return fallback;
  }

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

function normalizeModelPart(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new Error(`${label} is required`);
  }
  if (text.length > 160) {
    throw new Error(`${label} is too long`);
  }
  if (/[\r\n\t]/.test(text)) {
    throw new Error(`${label} must be a single-line identifier`);
  }
  if (/\b(seed phrase|mnemonic|private key|api secret|bearer token|wallet export)\b/i.test(text)) {
    throw new Error(`${label} cannot contain secret-shaped material`);
  }
  return text;
}

function normalizeOptionalModelPart(value: unknown, label: string): string | undefined {
  if (value == null || value === "") return undefined;
  return normalizeModelPart(value, label);
}

export function workspaceModelSelectionPath(workspace: WorkspaceInfo): string {
  return join(workspace.path, ".matterhorn-work", "models", "selection.json");
}

type NormalizedModelSelectionRequest = {
  providerId: string;
  modelId: string;
  variant?: string;
};

export function normalizeModelSelectionRequest(
  input: MatterhornBackendModelSelectionRequest,
): NormalizedModelSelectionRequest {
  const variant = normalizeOptionalModelPart(input.variant, "variant");
  return {
    providerId: normalizeModelPart(input.providerId, "providerId"),
    modelId: normalizeModelPart(input.modelId, "modelId"),
    ...(variant ? { variant } : {}),
  };
}

function actorDescriptor(actor: Actor | undefined): MatterhornBackendModelSelectionRecord["savedBy"] {
  if (!actor) return undefined;
  return {
    type: actor.type,
    ...(actor.scope ? { scope: actor.scope } : {}),
  };
}

export async function readWorkspaceModelSelection(
  workspace: WorkspaceInfo,
): Promise<MatterhornBackendModelSelectionRecord | null> {
  const path = workspaceModelSelectionPath(workspace);
  if (!(await exists(path))) return null;
  try {
    const content = await readFile(path, "utf8");
    const parsed = JSON.parse(content) as Partial<MatterhornBackendModelSelectionRecord>;
    if (parsed.source !== "server_workspace_preference") return null;
    if (!parsed.savedAt) return null;
    return {
      ...normalizeModelSelectionRequest({
        providerId: parsed.providerId ?? "",
        modelId: parsed.modelId ?? "",
        variant: parsed.variant,
      }),
      source: "server_workspace_preference",
      savedAt: parsed.savedAt,
      ...(parsed.savedBy ? { savedBy: actorDescriptor(parsed.savedBy as Actor) } : {}),
    };
  } catch {
    return null;
  }
}

export async function writeWorkspaceModelSelection(
  workspace: WorkspaceInfo,
  input: MatterhornBackendModelSelectionRequest,
  actor?: Actor,
): Promise<MatterhornBackendModelSelectionRecord> {
  const selection: MatterhornBackendModelSelectionRecord = {
    ...normalizeModelSelectionRequest(input),
    source: "server_workspace_preference",
    savedAt: new Date().toISOString(),
    ...(actor ? { savedBy: actorDescriptor(actor) } : {}),
  };
  const path = workspaceModelSelectionPath(workspace);
  await atomicWriteTextFile(path, `${JSON.stringify(selection, null, 2)}\n`, { mode: 0o600 });
  return selection;
}

export async function clearWorkspaceModelSelection(workspace: WorkspaceInfo): Promise<boolean> {
  const path = workspaceModelSelectionPath(workspace);
  if (!(await exists(path))) return false;
  await rm(path);
  return true;
}

export function buildWorkspaceModelSelectionResponse(input: {
  workspace: WorkspaceInfo;
  fallbackModel: MatterhornBackendModelsResponse["defaultModel"];
  selection?: MatterhornBackendModelSelectionRecord | null;
  auditLogged?: boolean;
}): MatterhornBackendModelSelectionResponse {
  const selection = input.selection ?? null;
  const effectiveModel = selection
    ? {
      providerId: selection.providerId,
      modelId: selection.modelId,
      source: "server_workspace_preference" as const,
      variant: selection.variant ?? null,
    }
    : {
      providerId: input.fallbackModel.providerId,
      modelId: input.fallbackModel.modelId,
      source: "server_default" as const,
      variant: input.fallbackModel.variant ?? null,
    };
  return {
    success: true,
    version: "matterhorn.backend.model-selection.v1",
    generatedAt: new Date().toISOString(),
    workspace: {
      id: input.workspace.id,
      name: input.workspace.name,
      type: input.workspace.workspaceType,
    },
    selection,
    effectiveModel,
    storage: {
      ...capability(
        "working",
        "Workspace model preference",
        "Matterhorn stores only the selected provider/model identifiers and optional reasoning level for this workspace. Provider credentials are not stored here.",
      ),
      scope: "workspace",
      path: workspaceModelSelectionPath(input.workspace),
      containsSecrets: false,
      auditLogged: Boolean(input.auditLogged),
    },
    policy: {
      storesCredentials: false,
      userSelectable: true,
      writeRequires: ["collaborator", "writable_server"],
      feedbackTrainingUse: "none_by_default",
    },
  };
}

export function buildBackendModels(input: {
  catalog?: MatterhornBackendModelCatalogSnapshot;
  selection?: MatterhornBackendModelSelectionRecord | null;
} = {}): MatterhornBackendModelsResponse {
  const catalog = fallbackCatalog(input.catalog);
  const promptProviders = configuredPromptProviders(catalog);
  const canAnswerPrompts = promptProviders.length > 0;
  const catalogDefault = defaultModelForCatalog(catalog);
  const selectedDefault = input.selection
    ? {
      providerId: input.selection.providerId,
      modelId: input.selection.modelId,
      source: "server_workspace_preference" as const,
      variant: input.selection.variant ?? null,
    }
    : catalogDefault;
  return {
    success: true,
    version: "matterhorn.backend.models.v1",
    generatedAt: new Date().toISOString(),
    defaultModel: selectedDefault,
    workspaceSelection: input.selection ?? null,
    catalog,
    routing: {
      answerPath: {
        ...capability(
          canAnswerPrompts ? "working" : "needs_setup",
          canAnswerPrompts ? "Chats and desk tasks" : "Connect a model provider",
          canAnswerPrompts
            ? "A connected model provider is available for chats and desk tasks. You can choose a model before you start."
            : "Connect a model provider before starting chats or desk tasks. The bundled catalog is not an active provider by itself.",
        ),
        transport: "opencode_session_prompt_async",
        requestModelField: "model.providerID_modelID",
      },
      selection: {
        ...capability(
          "working",
          "User-selected model",
          input.selection
            ? "This workspace has a server-owned default model. Stable workspace prompt routes use it when a request omits a model; explicit app picker overrides still win for that app session."
            : "Local app picker choices are sent explicitly with prompt requests; stable workspace prompt routes use the engine/server default until a workspace default is saved.",
        ),
        userSelectable: true,
        surface: "model_picker",
        preferenceStore: input.selection ? "server" : "local_preferences",
        serverPersisted: Boolean(input.selection),
      },
      registry: {
        ...capability(
          catalog.serverFetched ? "working" : "needs_setup",
          "Model catalog",
          catalog.serverFetched
            ? "Matterhorn Desks checked the model providers available in this workspace."
            : "Matterhorn Desks could not check model providers for this workspace yet.",
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
      "Connect a model provider before starting chats or desk tasks. A model catalog alone does not make a provider ready.",
      input.selection
        ? "A workspace default model is saved. You can still choose another available model for a specific chat."
        : "When a provider is connected, choose a model for this chat or save one as the workspace default.",
      "User feedback is stored for eval, routing, and product quality review only. It is not used for RL or model training by default.",
    ],
  };
}
