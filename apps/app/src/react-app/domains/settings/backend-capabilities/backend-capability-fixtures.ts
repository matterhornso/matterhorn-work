/** @jsxImportSource react */
import type {
  MatterhornBackendCapabilitiesResponse,
  MatterhornCapability,
  MatterhornCapabilityStatus,
} from "@matterhorn-work/types/backend-capabilities";

const MATTERHORN_BACKEND_CAPABILITIES_VERSION = "matterhorn.backend.capabilities.v1" as const;

function cap(status: MatterhornCapabilityStatus, label: string, description?: string): MatterhornCapability {
  return { status, label, description };
}

function baseServer() {
  return {
    version: "0.13.12",
    opencodeVersion: "1.14.38",
    host: "127.0.0.1",
    port: 3000,
    readOnly: false,
    approvalMode: "manual" as const,
  };
}

export const backendCapabilitiesWorkingFixture: MatterhornBackendCapabilitiesResponse = {
  success: true,
  version: MATTERHORN_BACKEND_CAPABILITIES_VERSION,
  generatedAt: new Date().toISOString(),
  server: baseServer(),
  models: {
    ...cap("working", "Models"),
    defaultModel: { providerId: "opencode", modelId: "big-pickle" },
    providerListSource: "opencode",
    selectedModelSource: "local_preferences",
    description: "Default model is opencode/big-pickle.",
  },
  providers: {
    ...cap("working", "Providers"),
    sources: ["opencode"],
    description: "Agent answers flow through OpenCode/OpenWork.",
  },
  storage: {
    ...cap("working", "Storage"),
    stores: {
      chat: {
        id: "chat",
        ...cap("working", "Chat store"),
        scope: "workspace",
        format: "sqlite",
        containsUserContent: true,
        containsSecrets: "never",
        retention: "user_controlled",
        exportable: true,
        deletable: true,
      },
      notes: {
        id: "notes",
        ...cap("working", "Notes store"),
        scope: "workspace",
        path: ".matterhorn-work/notes/index.json",
        format: "json",
        containsUserContent: true,
        containsSecrets: "never",
        retention: "user_controlled",
        exportable: true,
        deletable: true,
      },
      memory: {
        id: "memory",
        ...cap("working", "Memory store"),
        scope: "machine_global",
        path: "~/.matterhorn-work/memory",
        format: "markdown",
        containsUserContent: true,
        containsSecrets: "possible",
        retention: "user_controlled",
        exportable: true,
        deletable: true,
      },
      outputs: {
        id: "outputs",
        ...cap("working", "Outputs store"),
        scope: "workspace",
        format: "directory",
        containsUserContent: true,
        containsSecrets: "possible",
        retention: "user_controlled",
        exportable: true,
        deletable: true,
      },
    },
    description: "Your data is stored locally on your machine by default.",
  },
  memory: {
    ...cap("working", "Memory"),
    scope: "machine_global",
    rootPath: "~/.matterhorn-work/memory",
    pendingSuggestionCount: 0,
    confirmedRecordCount: 12,
    description: "Memory uses the machine-level vault unless the backend says workspace-scoped.",
  },
  notes: {
    ...cap("working", "Notes"),
    scope: "workspace",
    notesDir: ".matterhorn-work/notes",
    indexPath: ".matterhorn-work/notes/index.json",
    description: "Notes are workspace-local markdown plus index.json.",
  },
  evidence: {
    ...cap("working", "Evidence / Activity"),
    sources: ["notes", "memory", "task_events", "task_runs", "outputs", "workflow_runs"],
    description: "Project activity is built from task events, notes, outputs, and workflow receipts.",
  },
  wallets: {
    ...cap("working", "Wallets"),
    families: {
      evm: {
        family: "evm",
        ...cap("working", "EVM wallet"),
        custody: false,
        directConnect: true,
        publicRead: false,
        preview: false,
        signing: "client_wallet",
        supportedChains: ["base", "base-sepolia"],
        description: "Direct-connect EVM wallet through wagmi/viem on Base/Base Sepolia.",
      },
      sui: {
        family: "sui",
        ...cap("unsupported", "Sui wallet"),
        custody: false,
        directConnect: false,
        publicRead: false,
        preview: false,
        signing: "unsupported",
        description: "Sui wallet is not supported yet.",
      },
      bittensor: {
        family: "bittensor",
        ...cap("preview", "Bittensor"),
        custody: false,
        directConnect: false,
        publicRead: true,
        preview: true,
        signing: "external_signer",
        description: "Bittensor is public-read/external-signer with no custody.",
      },
    },
  },
  teams: {
    ...cap("working", "Teams"),
    localTokenSharing: cap("working", "Local token sharing"),
    cloudTeams: cap("preview", "Cloud teams"),
    description: "Local token sharing works. Cloud teams are in preview.",
  },
  security: {
    ...cap("working", "Security"),
    loopback: cap("working", "Loopback-only mode"),
    bearerTokens: cap("working", "Bearer tokens"),
    hostToken: cap("working", "Host token"),
    approvals: cap("working", "Approval mode"),
    cors: cap("working", "CORS policy"),
    authorizedRoots: cap("working", "Authorized roots"),
    requestLogging: cap("working", "Request logging"),
    memoryWriteGuards: cap("working", "Memory write guards"),
  },
  settings: [
    { ...cap("working", "Overview"), section: "overview" },
    { ...cap("working", "Profile"), section: "profile" },
    { ...cap("working", "Models"), section: "models" },
    { ...cap("working", "Providers"), section: "providers" },
    { ...cap("working", "Wallet"), section: "wallet" },
    { ...cap("working", "Memory"), section: "memory" },
    { ...cap("working", "Notes"), section: "notes" },
    { ...cap("working", "Outputs"), section: "outputs" },
    { ...cap("preview", "Teams"), section: "teams" },
    { ...cap("working", "Security"), section: "security" },
    { ...cap("unsupported", "Feedback"), section: "feedback", description: "Feedback is currently a link, not structured feedback." },
    { ...cap("working", "MCP"), section: "mcp" },
  ],
};

export const backendCapabilitiesNeedsSetupFixture: MatterhornBackendCapabilitiesResponse = {
  ...backendCapabilitiesWorkingFixture,
  models: {
    ...backendCapabilitiesWorkingFixture.models,
    ...cap("needs_setup", "Models"),
    description: "No default model configured yet.",
  },
  wallets: {
    ...backendCapabilitiesWorkingFixture.wallets,
    families: {
      ...backendCapabilitiesWorkingFixture.wallets.families,
      evm: {
        ...backendCapabilitiesWorkingFixture.wallets.families.evm,
        ...cap("needs_setup", "EVM wallet"),
        description: "Connect an EVM wallet to use on-chain actions.",
      },
    },
  },
  settings: backendCapabilitiesWorkingFixture.settings.map((s) =>
    s.section === "profile" || s.section === "wallet" ? { ...s, status: "needs_setup" as const, description: "Needs setup before use." } : s,
  ),
};

export const backendCapabilitiesPreviewFixture: MatterhornBackendCapabilitiesResponse = {
  ...backendCapabilitiesWorkingFixture,
  teams: {
    ...backendCapabilitiesWorkingFixture.teams,
    cloudTeams: cap("preview", "Cloud teams"),
    description: "Cloud teams are in preview.",
  },
  wallets: {
    ...backendCapabilitiesWorkingFixture.wallets,
    families: {
      ...backendCapabilitiesWorkingFixture.wallets.families,
      sui: {
        ...backendCapabilitiesWorkingFixture.wallets.families.sui,
        ...cap("preview", "Sui wallet"),
        description: "Sui wallet support is in early preview and not ready for use.",
      },
    },
  },
  settings: backendCapabilitiesWorkingFixture.settings.map((s) =>
    s.section === "teams" || s.section === "feedback"
      ? { ...s, status: "preview" as const, description: s.section === "feedback" ? "Structured feedback is in preview." : "Preview capability." }
      : s,
  ),
};

export const backendCapabilitiesUnsupportedFixture: MatterhornBackendCapabilitiesResponse = {
  ...backendCapabilitiesWorkingFixture,
  settings: backendCapabilitiesWorkingFixture.settings.map((s) =>
    s.section === "feedback" ? { ...s, status: "unsupported" as const, description: "Feedback is a link in this build." } : s,
  ),
};

export const backendCapabilitiesErrorFixture: MatterhornBackendCapabilitiesResponse = {
  ...backendCapabilitiesWorkingFixture,
  models: {
    ...backendCapabilitiesWorkingFixture.models,
    ...cap("error", "Models"),
    description: "Could not reach the model provider list.",
  },
  settings: backendCapabilitiesWorkingFixture.settings.map((s) =>
    s.section === "security" ? { ...s, status: "error" as const, description: "Security status could not be verified." } : s,
  ),
};

export const backendCapabilitiesFixtures = {
  working: backendCapabilitiesWorkingFixture,
  needsSetup: backendCapabilitiesNeedsSetupFixture,
  preview: backendCapabilitiesPreviewFixture,
  unsupported: backendCapabilitiesUnsupportedFixture,
  error: backendCapabilitiesErrorFixture,
} as const;

export type BackendCapabilitiesFixtureKey = keyof typeof backendCapabilitiesFixtures;
