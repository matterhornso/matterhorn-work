import type { ReloadReason } from "./types";

export type MatterhornExtensionSourceFormat =
  | "matterhorn-builtin"
  | "matterhorn-extension-manifest"
  | "claude-plugin"
  | "opencode-plugin"
  | "mcp-directory"
  | "manual";

export type MatterhornExtensionSource = {
  format: MatterhornExtensionSourceFormat;
  trusted: boolean;
  origin?: "builtin" | "den" | "workspace" | "local";
  reference?: string;
};

export type MatterhornExtensionResourceType =
  | "skill"
  | "agent"
  | "command"
  | "tool"
  | "mcp"
  | "opencode-plugin"
  | "provider"
  | "hook"
  | "context"
  | "secret"
  | "file"
  | "local-service"
  | "native-binary";

export type MatterhornExtensionResource = {
  type: MatterhornExtensionResourceType;
  id: string;
  label?: string;
  description?: string;
  path?: string;
  command?: string[];
  envKey?: string;
  packageName?: string;
  providerId?: string;
  mcpServerName?: string;
  localCommandRef?: "openwork.computerUseMcp" | "openwork.uiMcp";
  required?: boolean;
};

export type MatterhornExtensionContributionType =
  | "settings-panel"
  | "setup-instructions"
  | "composer-prompt"
  | "session-side-panel"
  | "session-rail-item"
  | "control-actions"
  | "server-route"
  | "native-capability"
  | "test-action";

export type MatterhornExtensionContribution = {
  type: MatterhornExtensionContributionType;
  ref?: string;
  label?: string;
  description?: string;
  prompt?: string;
  location?: "settings-detail" | "composer" | "session-right-pane" | "session-rail" | "server" | "native";
};

export type MatterhornExtensionSetup = {
  instructions?: string;
  primaryCta?: string;
  secondaryCta?: string;
  requiredEnv?: string[];
  testActionRef?: string;
};

export type MatterhornExtensionLifecycle = {
  reload?: ReloadReason[];
  detection?: string[];
};

// ---------------------------------------------------------------------------
// Enablement — declarative conditions for extension "active" state
// ---------------------------------------------------------------------------

export type EnablementConditionType =
  | "mcp-connected"
  | "plugin-loaded"
  | "provider-connected"
  | "env-set"
  | "permission-granted"
  | "toggle-enabled";

export type EnablementCondition = {
  type: EnablementConditionType;
  /** What to check — MCP server name, plugin id, env key, etc. */
  ref: string;
  /** Human-readable label shown in the UI. */
  label: string;
};

/** Result of evaluating a single enablement condition at runtime. */
export type EnablementResult = {
  condition: EnablementCondition;
  met: boolean;
};

export type MatterhornExtensionManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  preview?: boolean;
  source: MatterhornExtensionSource;
  icon?: {
    src?: string;
    simpleIconSlug?: string;
  };
  composer?: {
    prompt: string;
  };
  setup?: MatterhornExtensionSetup;
  resources: MatterhornExtensionResource[];
  contributions?: MatterhornExtensionContribution[];
  lifecycle?: MatterhornExtensionLifecycle;
  /** Declarative conditions that must ALL be true for the extension to be "active". */
  enablement?: EnablementCondition[];
  defaultEnabled?: boolean;
  defaultHidden?: boolean;
  platform?: Array<"darwin" | "linux" | "windows" | "web">;
};

export function extensionContribution(
  manifest: MatterhornExtensionManifest | undefined,
  type: MatterhornExtensionContributionType,
): MatterhornExtensionContribution | undefined {
  return manifest?.contributions?.find((contribution) => contribution.type === type);
}

export function extensionResource(
  manifest: MatterhornExtensionManifest | undefined,
  type: MatterhornExtensionResourceType,
): MatterhornExtensionResource | undefined {
  return manifest?.resources.find((resource) => resource.type === type);
}

export function isTrustedBuiltInExtension(manifest: MatterhornExtensionManifest | undefined): boolean {
  return manifest?.source.origin === "builtin" && manifest.source.trusted;
}

export const BUILT_IN_OPENWORK_EXTENSION_MANIFESTS: MatterhornExtensionManifest[] = [
  {
    schemaVersion: 1,
    id: "matterhorn-browser",
    name: "Matterhorn Work Browser",
    description: "Automate the built-in browser panel that stays visible inside Matterhorn Work.",
    source: { format: "matterhorn-builtin", origin: "builtin", trusted: true },
    icon: { src: "/matterhorn-mark.svg" },
    composer: { prompt: "Use the Matterhorn Work Browser extension to " },
    setup: {
      instructions: "Matterhorn Work Browser is ready by default in desktop workspaces.",
      primaryCta: "Enable browser automation",
    },
    resources: [
      {
        type: "opencode-plugin",
        id: "opencode-chrome-devtools",
        packageName: "opencode-chrome-devtools",
        required: true,
      },
    ],
    contributions: [
      { type: "settings-panel", ref: "matterhorn.browser.settings", location: "settings-detail" },
      { type: "session-side-panel", ref: "matterhorn.browser.panel", location: "session-right-pane" },
      { type: "composer-prompt", prompt: "Use the Matterhorn Work Browser extension to ", location: "composer" },
    ],
    enablement: [
      { type: "toggle-enabled", ref: "matterhorn-browser", label: "Enabled" },
      { type: "plugin-loaded", ref: "opencode-chrome-devtools", label: "Browser plugin loaded" },
    ],
    lifecycle: { reload: ["plugins", "agents"], detection: ["plugin:opencode-chrome-devtools"] },
    defaultEnabled: true,
  },
  {
    schemaVersion: 1,
    id: "matterhorn-crypto",
    name: "Matterhorn Protocols",
    description: "Shared safety, readiness, and evidence layer behind the Bittensor, Hyperliquid, and Polymarket protocol desks.",
    source: { format: "matterhorn-builtin", origin: "builtin", trusted: true },
    icon: { src: "/matterhorn-wallet.svg" },
    composer: { prompt: "Use Matterhorn protocol chat. " },
    setup: {
      instructions: "Protocol workflows are available as separate Bittensor, Hyperliquid, and Polymarket desks in the session rail. Market routes are read/preview-only; signing stays external.",
      primaryCta: "Open protocol desks",
    },
    resources: [
      { type: "tool", id: "crypto-chat-execute", label: "Matterhorn protocol chat", path: "/api/crypto/chat/execute", required: true },
      { type: "tool", id: "crypto-readiness", label: "Protocol readiness", path: "/api/crypto/readiness", required: true },
      { type: "mcp", id: "matterhorn-crypto-chat", label: "Matterhorn protocol chat MCP", mcpServerName: "matterhorn-work", required: false },
    ],
    contributions: [
      { type: "session-side-panel", ref: "matterhorn.crypto.panel", label: "Protocol workspaces", location: "session-right-pane" },
      { type: "session-rail-item", ref: "matterhorn.crypto.rail", label: "Protocols", location: "session-rail" },
      { type: "server-route", ref: "POST /api/crypto/chat/execute", location: "server" },
      { type: "composer-prompt", prompt: "Use Matterhorn protocol chat. ", location: "composer" },
    ],
    defaultEnabled: true,
  },
  {
    schemaVersion: 1,
    id: "matterhorn-memory",
    name: "Matterhorn Memory",
    description: "Explicit user-controlled memory for preferences, public protocol context, receipts, watchlists, and workflow artifacts.",
    source: { format: "matterhorn-builtin", origin: "builtin", trusted: true },
    icon: { src: "/matterhorn-mark.svg" },
    composer: { prompt: "Use Matterhorn Memory context to " },
    setup: {
      instructions: "No hidden memory. Matterhorn Memory is visible and opt-in. Use it to save confirmed public or private context, review sources, forget records, export evidence, and apply selected memories to chat. It never auto-captures hidden memory and never stores seed phrases, private keys, API secrets, raw signatures, signed payloads, or wallet exports.",
      primaryCta: "Open Memory",
    },
    resources: [
      { type: "tool", id: "matterhorn-memory-search", label: "Search Matterhorn Memory", path: "/api/memory/search", required: true },
      { type: "tool", id: "matterhorn-memory-capture", label: "Explicitly remember context", path: "/api/memory/capture", required: true },
      { type: "tool", id: "matterhorn-memory-export", label: "Export public-safe memory bundle", path: "/api/memory/export", required: true },
      { type: "mcp", id: "matterhorn-memory-mcp", label: "Matterhorn Memory MCP tools", mcpServerName: "matterhorn-work", required: false },
    ],
    contributions: [
      { type: "session-side-panel", ref: "matterhorn.memory.panel", label: "Memory", location: "session-right-pane" },
      { type: "session-rail-item", ref: "matterhorn.memory.rail", label: "Memory", location: "session-rail" },
      { type: "server-route", ref: "GET /api/memory/search", location: "server" },
      { type: "server-route", ref: "POST /api/memory/capture", location: "server" },
      { type: "composer-prompt", prompt: "Use Matterhorn Memory context to ", location: "composer" },
    ],
    defaultEnabled: true,
  },
  {
    schemaVersion: 1,
    id: "bittensor",
    name: "Bittensor",
    description: "Explain subnets, read public SS58 wallets, compare validators, prepare unsigned TAO staking previews, and create watches.",
    source: { format: "matterhorn-builtin", origin: "builtin", trusted: true },
    icon: { src: "/assets/desks/bittensor/logo-light.svg" },
    composer: { prompt: "Use Matterhorn protocol chat. For Bittensor, " },
    setup: {
      instructions: "Bittensor support is public-read and external-signer-first. Paste public SS58 coldkeys only; never paste seed phrases, private keys, or mnemonics.",
      primaryCta: "Open Bittensor desk",
    },
    resources: [
      { type: "tool", id: "bittensor-chat-execute", label: "Bittensor chat execution", path: "/api/bittensor/chat/execute", required: true },
      { type: "tool", id: "bittensor-capabilities", label: "Subnet capabilities", path: "/api/bittensor/capabilities", required: true },
      { type: "mcp", id: "bittensor-chat-mcp", label: "Bittensor MCP tools", mcpServerName: "matterhorn-work", required: false },
    ],
    contributions: [
      { type: "session-side-panel", ref: "matterhorn.bittensor.panel", label: "Bittensor", location: "session-right-pane" },
      { type: "session-rail-item", ref: "matterhorn.bittensor.rail", label: "Bittensor", location: "session-rail" },
      { type: "server-route", ref: "POST /api/bittensor/chat/execute", location: "server" },
      { type: "composer-prompt", prompt: "Use Matterhorn protocol chat. For Bittensor, ", location: "composer" },
    ],
    defaultEnabled: true,
  },
  {
    schemaVersion: 1,
    id: "hyperliquid",
    name: "Hyperliquid",
    description: "Read markets, orderbooks, account exposure, watches, and preview external-signer order flows with live submission off.",
    source: { format: "matterhorn-builtin", origin: "builtin", trusted: true },
    icon: { src: "/assets/desks/hyperliquid/logo-light.svg" },
    composer: { prompt: "Use Matterhorn protocol chat. For Hyperliquid, " },
    setup: {
      instructions: "Hyperliquid is preview-only in this build. Matterhorn does not accept API secrets, raw signatures, signed payloads, or live order submission.",
      primaryCta: "Open Hyperliquid desk",
    },
    resources: [
      { type: "tool", id: "hyperliquid-readiness", label: "Hyperliquid readiness", path: "/api/hyperliquid/readiness", required: true },
      { type: "mcp", id: "hyperliquid-mcp", label: "Hyperliquid MCP tools", mcpServerName: "matterhorn-work", required: false },
    ],
    contributions: [
      { type: "session-side-panel", ref: "matterhorn.hyperliquid.panel", label: "Hyperliquid", location: "session-right-pane" },
      { type: "session-rail-item", ref: "matterhorn.hyperliquid.rail", label: "Hyperliquid", location: "session-rail" },
      { type: "server-route", ref: "GET /api/hyperliquid/readiness", location: "server" },
      { type: "composer-prompt", prompt: "Use Matterhorn protocol chat. For Hyperliquid, ", location: "composer" },
    ],
    defaultEnabled: true,
  },
  {
    schemaVersion: 1,
    id: "polymarket",
    name: "Polymarket",
    description: "Discover prediction markets, inspect compliance, read orderbooks, create watches, and prepare non-custodial preview-only flows.",
    source: { format: "matterhorn-builtin", origin: "builtin", trusted: true },
    icon: { src: "/assets/desks/polymarket/logo-light.svg" },
    composer: { prompt: "Use Matterhorn protocol chat. For Polymarket, " },
    setup: {
      instructions: "Polymarket support is read/preview-only. Compliance-blocked markets must not expose executable price, size, or share terms.",
      primaryCta: "Open Polymarket desk",
    },
    resources: [
      { type: "tool", id: "polymarket-readiness", label: "Polymarket readiness", path: "/api/polymarket/readiness", required: true },
      { type: "mcp", id: "polymarket-mcp", label: "Polymarket MCP tools", mcpServerName: "matterhorn-work", required: false },
    ],
    contributions: [
      { type: "session-side-panel", ref: "matterhorn.polymarket.panel", label: "Polymarket", location: "session-right-pane" },
      { type: "session-rail-item", ref: "matterhorn.polymarket.rail", label: "Polymarket", location: "session-rail" },
      { type: "server-route", ref: "GET /api/polymarket/readiness", location: "server" },
      { type: "composer-prompt", prompt: "Use Matterhorn protocol chat. For Polymarket, ", location: "composer" },
    ],
    defaultEnabled: true,
  },
  {
    schemaVersion: 1,
    id: "computer-use",
    name: "Desktop Automation Helper",
    description: "Internal macOS automation bridge for semantic accessibility refs, screenshots, background-safe clicks, keyboard input, and strict mode.",
    preview: true,
    source: { format: "matterhorn-builtin", origin: "builtin", trusted: true },
    icon: { src: "/matterhorn-mark.svg" },
    composer: { prompt: "Use the Matterhorn desktop automation helper to " },
    setup: {
      instructions: "The Matterhorn desktop automation helper runs as a local MCP server backed by a macOS accessibility runtime. Grant Accessibility and Screen Recording permissions when macOS asks, then connect the MCP server in this workspace.",
      primaryCta: "Connect automation helper",
      secondaryCta: "Check macOS permissions",
      testActionRef: "openwork.computerUse.healthCheck",
    },
    resources: [
      {
        type: "mcp",
        id: "computer-use-mcp",
        label: "Desktop automation MCP",
        mcpServerName: "computer-use",
        command: ["npx", "-y", "@matterhorn-work/handsfree", "mcp"],
        localCommandRef: "openwork.computerUseMcp",
        required: true,
      },
      {
        type: "native-binary",
        id: "computer-use-native",
        label: "macOS accessibility runtime",
        packageName: "@matterhorn-work/handsfree",
        required: true,
      },
    ],
    contributions: [
      { type: "setup-instructions", ref: "openwork.computerUse.setup", location: "settings-detail" },
      { type: "native-capability", ref: "openwork.computerUse.axPermissions", label: "Accessibility and Screen Recording" },
      { type: "test-action", ref: "openwork.computerUse.healthCheck", label: "Verify desktop automation helper" },
      { type: "composer-prompt", prompt: "Use the Matterhorn desktop automation helper to ", location: "composer" },
    ],
    enablement: [
      { type: "mcp-connected", ref: "computer-use", label: "MCP server connected" },
      { type: "permission-granted", ref: "accessibility", label: "Accessibility permission" },
      { type: "permission-granted", ref: "screenRecording", label: "Screen Recording permission" },
    ],
    lifecycle: { reload: ["mcp"], detection: ["mcp:computer-use"] },
    defaultHidden: true,
    platform: ["darwin"],
  },
  {
    schemaVersion: 1,
    id: "openai-image-gen",
    name: "OpenAI Image Gen",
    description: "Generate image artifacts with gpt-image-2.",
    source: { format: "matterhorn-builtin", origin: "builtin", trusted: true },
    icon: { src: "/ext-openai.svg" },
    composer: { prompt: "Use the OpenAI Image Gen extension to " },
    setup: {
      instructions: "Add an OpenAI API key, then Matterhorn installs an OpenCode plugin that exposes image_generate.",
      primaryCta: "Enable image generation",
      secondaryCta: "Generate test image",
      requiredEnv: ["OPENAI_API_KEY"],
      testActionRef: "matterhorn.imageGen.testGenerate",
    },
    resources: [
      { type: "opencode-plugin", id: "openwork-image-generation", path: ".opencode/plugins/matterhorn-image-generation.ts", required: true },
      { type: "secret", id: "openai-api-key", envKey: "OPENAI_API_KEY", required: true },
      { type: "file", id: "openai-image-config", path: ".opencode/matterhorn-extensions/openai-image-generation.json", required: true },
    ],
    contributions: [
      { type: "settings-panel", ref: "matterhorn.imageGen.settings", location: "settings-detail" },
      { type: "test-action", ref: "matterhorn.imageGen.testGenerate", label: "Generate test image" },
      { type: "composer-prompt", prompt: "Use the OpenAI Image Gen extension to ", location: "composer" },
    ],
    enablement: [
      { type: "plugin-loaded", ref: "openwork-image-generation", label: "Image plugin installed" },
      { type: "env-set", ref: "OPENAI_API_KEY", label: "OpenAI API key" },
    ],
    lifecycle: { reload: ["plugins"], detection: ["plugin:openwork-image-generation"] },
  },
  {
    schemaVersion: 1,
    id: "matterhorn-voice",
    name: "Voice Mode",
    description: "Talk to Matterhorn Work through a Realtime voice panel that drives the same semantic UI controls as Matterhorn Work UI MCP.",
    preview: true,
    source: { format: "matterhorn-builtin", origin: "builtin", trusted: true },
    icon: { src: "/matterhorn-mark.svg" },
    composer: { prompt: "Use Voice Mode to " },
    setup: {
      instructions: "Voice Mode uses OpenAI Realtime. Save an OpenAI API key in Matterhorn Work env vars, then open the session rail panel and speak or send a typed voice command.",
      primaryCta: "Save OpenAI key",
      secondaryCta: "Test Realtime",
      requiredEnv: ["OPENAI_REALTIME_API_KEY", "OPENAI_API_KEY"],
      testActionRef: "matterhorn.voice.testRealtime",
    },
    resources: [
      { type: "secret", id: "openai-realtime-api-key", envKey: "OPENAI_REALTIME_API_KEY", required: false },
      { type: "secret", id: "openai-api-key", envKey: "OPENAI_API_KEY", required: true },
      { type: "local-service", id: "openwork-voice-realtime-session", label: "Realtime client-secret minting", required: true },
    ],
    contributions: [
      { type: "settings-panel", ref: "matterhorn.voice.settings", location: "settings-detail" },
      { type: "session-side-panel", ref: "matterhorn.voice.panel", location: "session-right-pane" },
      { type: "session-rail-item", ref: "matterhorn.voice.rail", label: "Voice Mode", location: "session-rail" },
      { type: "server-route", ref: "POST /voice/realtime/session", location: "server" },
      { type: "control-actions", ref: "matterhorn.voice.controlActions" },
      { type: "test-action", ref: "matterhorn.voice.testRealtime", label: "Test Realtime" },
      { type: "composer-prompt", prompt: "Use Voice Mode to ", location: "composer" },
    ],
    enablement: [
      { type: "toggle-enabled", ref: "matterhorn-voice", label: "Enabled" },
      { type: "env-set", ref: "OPENAI_API_KEY", label: "OpenAI API key" },
    ],
    lifecycle: { reload: ["config"], detection: ["env:OPENAI_REALTIME_API_KEY", "env:OPENAI_API_KEY"] },
  },
  {
    schemaVersion: 1,
    id: "google-workspace",
    name: "Google Workspace",
    description: "Let Matterhorn Work help with meetings, selected Drive files, and Gmail drafts.",
    preview: true,
    source: { format: "matterhorn-builtin", origin: "builtin", trusted: true },
    icon: { simpleIconSlug: "google" },
    composer: { prompt: "Use Google Workspace to " },
    setup: {
      instructions: "Connect your Google account to use Calendar, Drive, and Gmail drafts in Matterhorn Work.",
      primaryCta: "Connect Google Workspace",
      secondaryCta: "Test connection",
      testActionRef: "matterhorn.googleWorkspace.testConnection",
    },
    resources: [
      { type: "provider", id: "google-oauth", label: "Google account", providerId: "google-workspace", required: true },
      { type: "local-service", id: "google-workspace-connector", label: "Secure local connection", required: true },
      { type: "tool", id: "google-calendar-read", label: "Calendar", required: true },
      { type: "tool", id: "google-gmail-drafts", label: "Gmail drafts", required: true },
      { type: "tool", id: "google-drive-selected-files", label: "Selected Drive files", required: true },
    ],
    contributions: [
      { type: "settings-panel", ref: "matterhorn.googleWorkspace.settings", location: "settings-detail" },
      { type: "test-action", ref: "matterhorn.googleWorkspace.testConnection", label: "Test Google Workspace" },
      { type: "composer-prompt", prompt: "Use Google Workspace to ", location: "composer" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:google-workspace"] },
    defaultHidden: true,
  },
  {
    schemaVersion: 1,
    id: "ollama",
    name: "Ollama",
    description: "Local model provider at http://localhost:11434.",
    source: { format: "matterhorn-builtin", origin: "builtin", trusted: true },
    icon: { src: "/ext-ollama.svg" },
    composer: { prompt: "Use the Ollama extension to " },
    setup: {
      instructions: "Run Ollama locally, choose or pull a model, then add it as an OpenCode provider.",
      primaryCta: "Add Ollama model",
      secondaryCta: "Pull model",
    },
    resources: [
      { type: "local-service", id: "ollama-api", label: "Ollama API", description: "http://localhost:11434", required: true },
      { type: "provider", id: "ollama", providerId: "ollama", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "settings-panel", ref: "matterhorn.ollama.settings", location: "settings-detail" },
      { type: "test-action", ref: "matterhorn.ollama.listModels", label: "Check local models" },
      { type: "composer-prompt", prompt: "Use the Ollama extension to ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "ollama", label: "Ollama provider" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:ollama"] },
  },
];
