import type {
  MatterhornBackendModelCatalogSnapshot,
  MatterhornBackendModelSelectionRecord,
  MatterhornBackendModelSelectionRequest,
  MatterhornBackendModelSelectionResponse,
  MatterhornBackendModelsResponse,
} from "@matterhorn-work/types/backend-models";
import type { MatterhornCapability } from "@matterhorn-work/types/backend-capabilities";
import { dirname, join } from "node:path";
import { readFile, writeFile, rm } from "node:fs/promises";
import type { Actor, WorkspaceInfo } from "./types.js";
import { ensureDir, exists } from "./utils.js";

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

export function workspaceModelSelectionPath(workspace: WorkspaceInfo): string {
  return join(workspace.path, ".matterhorn-work", "models", "selection.json");
}

export function normalizeModelSelectionRequest(input: MatterhornBackendModelSelectionRequest): MatterhornBackendModelSelectionRequest {
  return {
    providerId: normalizeModelPart(input.providerId, "providerId"),
    modelId: normalizeModelPart(input.modelId, "modelId"),
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
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
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
    }
    : {
      providerId: input.fallbackModel.providerId,
      modelId: input.fallbackModel.modelId,
      source: "server_default" as const,
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
        "Matterhorn stores only the selected provider/model identifiers for this workspace. Provider credentials are not stored here.",
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
  const catalogDefault = defaultModelForCatalog(catalog);
  const selectedDefault = input.selection
    ? {
      providerId: input.selection.providerId,
      modelId: input.selection.modelId,
      source: "server_workspace_preference" as const,
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
          "working",
          "Local session prompts",
          "Agent answers are sent through the local agent engine with an explicit providerID/modelID when the user has selected a model.",
        ),
        transport: "opencode_session_prompt_async",
        requestModelField: "model.providerID_modelID",
      },
      selection: {
        ...capability(
          "working",
          "User-selected model",
          input.selection
            ? "This workspace has a server-owned default model preference. The app can still keep a local session override."
            : "The app stores the selected model in local preferences and sends it with each prompt request until a workspace default is saved.",
        ),
        userSelectable: true,
        surface: "model_picker",
        preferenceStore: input.selection ? "server" : "local_preferences",
        serverPersisted: Boolean(input.selection),
      },
      registry: {
        ...capability(
          "preview",
          "Local provider list",
          "The live model list currently comes from the local engine provider list. A server-owned Matterhorn model registry is planned.",
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
      "The global endpoint reports the routing contract. Use the workspace endpoint to see the server-normalized local provider catalog for a selected workspace.",
      input.selection
        ? "A workspace default model is saved server-side; individual app sessions may still hold local overrides until the prompt path is fully unified."
        : "Model preference falls back to this browser/app profile until a workspace default is saved.",
      "User feedback is stored for eval, routing, and product quality review only. It is not used for RL or model training by default.",
    ],
  };
}
