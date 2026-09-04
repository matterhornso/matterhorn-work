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
      canSubmit: true,
      liveSubmissionEnabled: true,
      signerRequirement: "client_signer",
      custody: false,
      secretInputsAllowed: false,
    },
    hyperliquid: {
      connectionMode: "injected_evm",
      canRead: true,
      canPreview: true,
      canSubmit: true,
      liveSubmissionEnabled: true,
      signerRequirement: "client_signer",
      custody: false,
      secretInputsAllowed: false,
    },
    polymarket: {
      connectionMode: "injected_evm",
      canRead: true,
      canPreview: true,
      canSubmit: true,
      liveSubmissionEnabled: true,
      signerRequirement: "client_signer",
      custody: false,
      secretInputsAllowed: false,
    },
    sui: {
      connectionMode: "wallet_standard",
      canRead: true,
      canPreview: true,
      canSubmit: true,
      liveSubmissionEnabled: true,
      signerRequirement: "client_signer",
      custody: false,
      secretInputsAllowed: false,
    },
  },
  safetyCopy: {
    publicAddressLine:
      "Only public wallet addresses are used. Paste or connect an address to preview read-only data.",
    externalSignerLine:
      "Bittensor transfer, stake, and unstake calls and supported Sui actions stay in connected wallets. Unsupported advanced calls are not presented as executable. Matterhorn never creates or holds keys.",
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
      "Desktop supports public-address reads. Open the same workspace in a supported web browser for connected-wallet review.",
    externalSignerLine:
      "The desktop app cannot approve on-chain actions. Open the same workspace in a supported web browser and use your connected wallet.",
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
      "Desktop previews use public addresses only. Open the same workspace in a supported web browser for wallet approval.",
    externalSignerLine:
      "Wallet extensions are unavailable in the desktop app. Review and approve on-chain actions in the web app with your connected wallet.",
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
    externalSignerLine: "Wallet approval is unavailable until Matterhorn identifies this runtime. Open the web app to use a connected wallet.",
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
