// Wallet runtime capability contract
// Describes what a given runtime can and cannot do for each supported protocol.

export const WALLET_RUNTIMES = ["web", "desktop", "electron", "unknown"] as const;
export type WalletRuntime = (typeof WALLET_RUNTIMES)[number];

export const EVM_CONNECTOR_STATES = [
  "unavailable",
  "available",
  "connected",
  "needs_extension",
  "unsupported_runtime",
] as const;
export type EvmConnectorState = (typeof EVM_CONNECTOR_STATES)[number];

export const DESKTOP_WALLET_STRATEGIES = [
  "external_signer",
  "walletconnect_planned",
  "deep_link_planned",
  "unsupported",
] as const;
export type DesktopWalletStrategy = (typeof DESKTOP_WALLET_STRATEGIES)[number];

export const WALLET_PROTOCOLS = ["bittensor", "hyperliquid", "polymarket", "sui"] as const;
export type WalletProtocol = (typeof WALLET_PROTOCOLS)[number];

export const WALLET_PROTOCOL_CONNECTION_MODES = [
  "wallet_standard",
  "injected_evm",
  "external_handoff",
  "public_read",
  "unsupported",
] as const;
export type WalletProtocolConnectionMode = (typeof WALLET_PROTOCOL_CONNECTION_MODES)[number];

export interface WalletProtocolCapability {
  connectionMode: WalletProtocolConnectionMode;
  canRead: boolean;
  canPreview: boolean;
  canSubmit: boolean;
  liveSubmissionEnabled: boolean;
  signerRequirement: "none" | "external_signer" | "client_signer";
  custody: boolean;
  secretInputsAllowed: boolean;
}

export interface WalletRuntimeCapability {
  version: "matterhorn.wallet.runtime.capability.v1";
  runtime: WalletRuntime;
  evmConnectorState: EvmConnectorState;
  desktopWalletStrategy: DesktopWalletStrategy;
  supportsInjectedEvm: boolean;
  protocols: Record<WalletProtocol, WalletProtocolCapability>;
  safetyCopy: {
    publicAddressLine: string;
    externalSignerLine: string;
    forbiddenSecretsLine: string;
  };
}

export const WEB_WALLET_RUNTIME_CAPABILITY: WalletRuntimeCapability = {
  version: "matterhorn.wallet.runtime.capability.v1",
  runtime: "web",
  evmConnectorState: "available",
  desktopWalletStrategy: "unsupported",
  supportsInjectedEvm: true,
  protocols: {
    bittensor: {
      connectionMode: "external_handoff",
      canRead: true,
      canPreview: true,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "external_signer",
      custody: false,
      secretInputsAllowed: false,
    },
    hyperliquid: {
      connectionMode: "injected_evm",
      canRead: true,
      canPreview: true,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "client_signer",
      custody: false,
      secretInputsAllowed: false,
    },
    polymarket: {
      connectionMode: "injected_evm",
      canRead: true,
      canPreview: true,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "client_signer",
      custody: false,
      secretInputsAllowed: false,
    },
    sui: {
      connectionMode: "wallet_standard",
      canRead: true,
      canPreview: true,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "client_signer",
      custody: false,
      secretInputsAllowed: false,
    },
  },
  safetyCopy: {
    publicAddressLine:
      "Only public wallet addresses are used. Paste or connect an address to preview read-only data.",
    externalSignerLine:
      "Bittensor submissions require your external signer. Sui signing stays in your connected wallet. Matterhorn never creates or holds keys.",
    forbiddenSecretsLine:
      "Never paste a private key, seed phrase, API secret, raw signature, signed payload, or wallet export into Matterhorn.",
  },
};

export const DESKTOP_WALLET_RUNTIME_CAPABILITY: WalletRuntimeCapability = {
  version: "matterhorn.wallet.runtime.capability.v1",
  runtime: "desktop",
  evmConnectorState: "needs_extension",
  desktopWalletStrategy: "external_signer",
  supportsInjectedEvm: false,
  protocols: {
    bittensor: {
      connectionMode: "external_handoff",
      canRead: true,
      canPreview: true,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "external_signer",
      custody: false,
      secretInputsAllowed: false,
    },
    hyperliquid: {
      connectionMode: "external_handoff",
      canRead: true,
      canPreview: true,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "external_signer",
      custody: false,
      secretInputsAllowed: false,
    },
    polymarket: {
      connectionMode: "external_handoff",
      canRead: true,
      canPreview: true,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "external_signer",
      custody: false,
      secretInputsAllowed: false,
    },
    sui: {
      connectionMode: "external_handoff",
      canRead: true,
      canPreview: true,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "external_signer",
      custody: false,
      secretInputsAllowed: false,
    },
  },
  safetyCopy: {
    publicAddressLine:
      "Desktop uses external-signer handoffs. Provide public addresses for reads and complete signing in your own wallet or protocol client.",
    externalSignerLine:
      "All on-chain writes are signed outside Matterhorn. Desktop Sui and Bittensor actions use external signer or wallet handoffs.",
    forbiddenSecretsLine:
      "Never paste a private key, seed phrase, API secret, raw signature, signed payload, or wallet export into Matterhorn.",
  },
};

export const ELECTRON_WALLET_RUNTIME_CAPABILITY: WalletRuntimeCapability = {
  version: "matterhorn.wallet.runtime.capability.v1",
  runtime: "electron",
  evmConnectorState: "unsupported_runtime",
  desktopWalletStrategy: "unsupported",
  supportsInjectedEvm: false,
  protocols: {
    bittensor: {
      connectionMode: "external_handoff",
      canRead: true,
      canPreview: true,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "external_signer",
      custody: false,
      secretInputsAllowed: false,
    },
    hyperliquid: {
      connectionMode: "external_handoff",
      canRead: true,
      canPreview: true,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "external_signer",
      custody: false,
      secretInputsAllowed: false,
    },
    polymarket: {
      connectionMode: "external_handoff",
      canRead: true,
      canPreview: true,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "external_signer",
      custody: false,
      secretInputsAllowed: false,
    },
    sui: {
      connectionMode: "external_handoff",
      canRead: true,
      canPreview: true,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "external_signer",
      custody: false,
      secretInputsAllowed: false,
    },
  },
  safetyCopy: {
    publicAddressLine:
      "Electron previews use public addresses only. Connect an external signer for writes.",
    externalSignerLine:
      "Electron builds do not support injected wallets. Use external-signer or wallet handoffs for any on-chain action.",
    forbiddenSecretsLine:
      "Never paste a private key, seed phrase, API secret, raw signature, signed payload, or wallet export into Matterhorn.",
  },
};

export const UNKNOWN_WALLET_RUNTIME_CAPABILITY: WalletRuntimeCapability = {
  version: "matterhorn.wallet.runtime.capability.v1",
  runtime: "unknown",
  evmConnectorState: "unavailable",
  desktopWalletStrategy: "unsupported",
  supportsInjectedEvm: false,
  protocols: {
    bittensor: {
      connectionMode: "unsupported",
      canRead: false,
      canPreview: false,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "none",
      custody: false,
      secretInputsAllowed: false,
    },
    hyperliquid: {
      connectionMode: "unsupported",
      canRead: false,
      canPreview: false,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "none",
      custody: false,
      secretInputsAllowed: false,
    },
    polymarket: {
      connectionMode: "unsupported",
      canRead: false,
      canPreview: false,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "none",
      custody: false,
      secretInputsAllowed: false,
    },
    sui: {
      connectionMode: "unsupported",
      canRead: false,
      canPreview: false,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "none",
      custody: false,
      secretInputsAllowed: false,
    },
  },
  safetyCopy: {
    publicAddressLine: "Wallet capabilities are unknown for this runtime. Use the web or desktop app.",
    externalSignerLine: "External signer support is unavailable until the runtime is identified.",
    forbiddenSecretsLine:
      "Never paste a private key, seed phrase, API secret, raw signature, signed payload, or wallet export into Matterhorn.",
  },
};

export const WALLET_RUNTIME_CAPABILITY_REGISTRY: Record<WalletRuntime, WalletRuntimeCapability> = {
  web: WEB_WALLET_RUNTIME_CAPABILITY,
  desktop: DESKTOP_WALLET_RUNTIME_CAPABILITY,
  electron: ELECTRON_WALLET_RUNTIME_CAPABILITY,
  unknown: UNKNOWN_WALLET_RUNTIME_CAPABILITY,
};

export function getWalletRuntimeCapability(runtime: WalletRuntime): WalletRuntimeCapability {
  return WALLET_RUNTIME_CAPABILITY_REGISTRY[runtime] ?? UNKNOWN_WALLET_RUNTIME_CAPABILITY;
}
