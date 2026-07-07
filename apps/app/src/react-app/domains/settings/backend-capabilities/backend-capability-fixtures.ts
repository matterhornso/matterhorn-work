/** @jsxImportSource react */
import type {
  MatterhornBackendCapabilitiesResponse,
  MatterhornCapability,
  MatterhornCapabilityStatus,
  MatterhornSettingsSectionCapability,
} from "@matterhorn-work/types/backend-capabilities";

const MATTERHORN_BACKEND_CAPABILITIES_VERSION = "matterhorn.backend.capabilities.v1" as const;

function cap(status: MatterhornCapabilityStatus, label: string, description?: string): MatterhornCapability {
  return { status, label, description };
}

function settingsCap(
  section: MatterhornSettingsSectionCapability["section"],
  status: MatterhornCapabilityStatus,
  label: string,
  description?: string,
): MatterhornSettingsSectionCapability {
  const routeMap: Record<MatterhornSettingsSectionCapability["section"], string> = {
    overview: "/settings/overview",
    profile: "/settings/cloud-account",
    models: "/settings/ai",
    providers: "/settings/cloud-providers",
    wallet: "/settings/wallet",
    memory: "/workspace/:id/session?panel=memory",
    notes: "/workspace/:id/session?panel=notes",
    outputs: "/workspace/:id/session?panel=outputs",
    teams: "/settings/overview#teams",
    security: "/settings/permissions",
    feedback: "/settings/overview#feedback",
    mcp: "/settings/extensions/mcp",
    "image-generation": "/settings/image-generation",
    nft: "/settings/nft",
  };
  return {
    ...cap(status, label, description),
    section,
    route: routeMap[section],
    workspaceScoped: !["profile", "providers"].includes(section),
    desktopOnly: section === "security",
    backendDependencies: ["/api/backend/capabilities"],
    primaryAction: {
      id: `settings.${section}.open`,
      label: `Open ${label}`,
      kind: "route",
      href: routeMap[section],
    },
  };
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
    routing: {
      answerPath: "opencode_session_prompt_async",
      modelListTool: "opencode_provider_list",
      userSelectable: true,
      selectionSurface: "model_picker",
      preferenceStore: "local_preferences",
      cloudProviderImport: true,
    },
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
        ...cap("preview", "Sui wallet preview"),
        custody: false,
        directConnect: true,
        publicRead: true,
        preview: true,
        signing: "client_wallet",
        supportedChains: ["sui-testnet", "sui-mainnet"],
        description: "Sui wallet-standard connect is in preview. Matterhorn Work never holds keys.",
        runtimeSupport: {
          web: {
            runtime: "web",
            ...cap("preview", "Web wallet-standard connect", "Sui wallet-standard wallets can connect in the web app through Mysten dApp Kit."),
            custody: false,
            directConnect: true,
            publicRead: true,
            preview: true,
            signing: "client_wallet",
          },
          desktop: {
            runtime: "desktop",
            ...cap("preview", "Desktop external handoff", "Desktop prepares Sui previews; signing happens in an external Sui wallet or protocol client."),
            custody: false,
            directConnect: false,
            publicRead: true,
            preview: true,
            signing: "external_signer",
          },
          electron: {
            runtime: "electron",
            ...cap("preview", "Electron external handoff", "Electron prepares Sui previews; signing happens in an external Sui wallet or protocol client."),
            custody: false,
            directConnect: false,
            publicRead: true,
            preview: true,
            signing: "external_signer",
          },
        },
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
  imageGeneration: {
    ...cap("working", "Image generation", "Generate images from chat using mock provider."),
    providers: [{ status: "working", label: "Mock image provider", provider: "mock", model: "mock-image-1", size: "1024x1024", quality: "auto", format: "png" }],
    defaultProvider: "mock",
    defaultModel: "mock-image-1",
  },
  imageEditing: {
    ...cap("preview", "Image editing", "Image editing is in preview."),
    providers: [{ status: "preview", label: "Mock image provider", provider: "mock", model: "mock-image-1", size: "1024x1024", quality: "auto", format: "png" }],
  },
  walrusStorage: {
    ...cap("needs_setup", "Walrus storage", "Walrus publisher and relay are not configured."),
    publisherConfigured: false,
    relayConfigured: false,
  },
  nftMinting: {
    ...cap("needs_setup", "Sui NFT minting", "Sui NFT package is not configured."),
    network: "sui-testnet",
    custody: false,
    signing: "client_wallet",
    packageConfigured: false,
    kioskConfigured: false,
  },
  nftMarketplaceListing: {
    ...cap("needs_setup", "NFT marketplace listing", "Kiosk/TransferPolicy config is not configured."),
    network: "sui-testnet",
    custody: false,
    signing: "client_wallet",
    packageConfigured: false,
    kioskConfigured: false,
  },
  settings: [
    settingsCap("overview", "working", "Overview"),
    settingsCap("profile", "working", "Profile"),
    settingsCap("models", "working", "Models"),
    settingsCap("providers", "working", "Providers"),
    settingsCap("wallet", "working", "Wallet"),
    settingsCap("memory", "working", "Memory"),
    settingsCap("notes", "working", "Notes"),
    settingsCap("outputs", "working", "Outputs"),
    settingsCap("teams", "preview", "Teams"),
    settingsCap("security", "working", "Security"),
    settingsCap("feedback", "working", "Feedback", "Structured feedback is stored locally for evaluation, routing, and product quality only."),
    settingsCap("mcp", "working", "MCP"),
    settingsCap("image-generation", "working", "Image generation", "Generate images from chat and save them as workspace outputs."),
    settingsCap("nft", "needs_setup", "NFT drafts", "NFT drafts are created locally. Set MATTERHORN_SUI_NFT_PACKAGE_ID to enable mint previews."),
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
        description: "Sui wallet support is in early preview for account reads.",
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
