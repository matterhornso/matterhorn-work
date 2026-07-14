# Wallet, Profile, MCP Readiness Contracts

> **Implementation status (2026-07-11):** This file records the original shared-type contract. For current customer behavior and runtime semantics, read [Product surfaces](../product-surfaces.md), [Platform architecture](../platform-architecture.md), and [MCP docs](../mcp/README.md). Configured MCP runtime status is separate from catalog-card status, Profile opens account readiness, and Wallet includes Sui plus workspace-backed safety policy.

> **Owner:** Kimi  
> **Audience:** Codex, product, QA  
> **Scope:** Typed contracts for Wallet runtime capability, Profile/account readiness, MCP card connectivity, and Chat draft state. The production app now consumes and extends these contracts.

## Files

- `packages/types/src/wallet-runtime.ts`
- `packages/types/src/profile-readiness.ts`
- `packages/types/src/mcp-card.ts`
- `packages/types/src/chat-draft.ts`
- `scripts/wallet-profile-mcp-readiness-contract.test.mjs`
- `docs/contracts/wallet-profile-mcp-readiness-contract.md`

## 1. Wallet runtime capability

### Types

```ts
type WalletRuntime = "web" | "desktop" | "electron" | "unknown";
type EvmConnectorState = "unavailable" | "available" | "connected" | "needs_extension" | "unsupported_runtime";
type DesktopWalletStrategy = "external_signer" | "walletconnect_planned" | "deep_link_planned" | "unsupported";
type WalletProtocol = "bittensor" | "hyperliquid" | "polymarket";

interface WalletProtocolCapability {
  canRead: boolean;
  canPreview: boolean;
  canSubmit: boolean;
  liveSubmissionEnabled: boolean;
  signerRequirement: "none" | "external_signer" | "client_signer";
  custody: boolean;
  secretInputsAllowed: boolean;
}

interface WalletRuntimeCapability {
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
```

### Registry

| Runtime | EVM connector | Injected EVM | Desktop strategy | Bittensor submit | Hyperliquid submit | Polymarket submit |
| --- | --- | --- | --- | --- | --- | --- |
| `web` | `available` | yes | unsupported | external signer, no submit | client signer, no submit | client signer, no submit |
| `desktop` | `needs_extension` | no | external_signer | external signer, no submit | external signer, no submit | external signer, no submit |
| `electron` | `unsupported_runtime` | no | unsupported | external signer, no submit | external signer, no submit | external signer, no submit |
| `unknown` | `unavailable` | no | unsupported | none | none | none |

### Codex UI usage

```tsx
import { getWalletRuntimeCapability } from "@matterhorn-work/types";

const capability = getWalletRuntimeCapability("desktop");
<WalletPanel
  runtime={capability.runtime}
  evmConnectorState={capability.evmConnectorState}
  desktopStrategy={capability.desktopWalletStrategy}
  safetyCopy={capability.safetyCopy}
  protocols={capability.protocols}
/>;
```

## 2. Profile/account readiness

### Types

```ts
type ProfileAuthState = "signed_out" | "signed_in" | "cloud_unconfigured" | "cloud_only" | "unavailable";

interface ProfileSupportLinks {
  docsUrl: string;
  feedbackUrl: string;
  issueUrl: string;
  accountUrl?: string;
}

interface ProfileReadiness {
  authState: ProfileAuthState;
  supportLinks: ProfileSupportLinks;
  cloudSyncEnabled: boolean;
  requiresCloudAccount: boolean;
  externalLinkLabels: string[];
  stateCopy: { headline: string; body: string };
}
```

### Registry

| Auth state | Cloud sync | Requires cloud | Notes |
| --- | --- | --- | --- |
| `signed_out` | false | true | Sign-in CTA |
| `signed_in` | true | true | Full account |
| `cloud_unconfigured` | false | true | Cloud setup prompt |
| `cloud_only` | true | true | Cloud-managed; some desktop settings hidden |
| `unavailable` | false | false | Auth service unreachable |

All support links are `https://matterhorn.so/...` except `externalLinkLabels` which explicitly marks third-party/cloud-only labels.

### Codex UI usage

```tsx
import { getProfileReadiness } from "@matterhorn-work/types";

const profile = getProfileReadiness("signed_in");
<ProfilePanel
  authState={profile.authState}
  supportLinks={profile.supportLinks}
  cloudSyncEnabled={profile.cloudSyncEnabled}
  stateCopy={profile.stateCopy}
/>;
```

## 3. MCP card connectivity

### Types

```ts
type McpCardStatus = "available" | "installed" | "configured" | "testable" | "needs_setup" | "preview" | "unavailable";
type McpInstallTarget = "codex" | "claude_code" | "claude_desktop" | "cursor";

interface McpCardConnectivity {
  id: string;
  catalogItemId: string;
  displayName: string;
  deskId: string;
  status: McpCardStatus;
  installCommands: { target: McpInstallTarget; command: string }[];
  supportedTools: { name: string; description: string; isReadOnly: boolean }[];
  testEndpoint?: string;
  testCommand?: string;
  safetyBoundary: McpCardSafetyBoundary;
  worksOutsideMatterhorn: boolean;
}
```

### Registry

| Card | Desk | Status | Testability | Works outside Matterhorn |
| --- | --- | --- | --- | --- |
| Bittensor | `bittensor` | `preview` | `testCommand` | yes |
| Hyperliquid | `hyperliquid` | `testable` | `testEndpoint` + `testCommand` | yes |
| Polymarket | `polymarket` | `testable` | `testEndpoint` + `testCommand` | yes |
| Memory | `memory` | `installed` | `testCommand` | yes |
| Workflow | `workflow` | `needs_setup` | `testCommand` | yes |
| UI Control | `ui_control` | `unavailable` | none | no |

### Safety invariants

- `liveSubmissionEnabled: false`
- `canSubmit: false`
- `acceptsPrivateKeys`, `acceptsSeedPhrases`, `acceptsApiSecrets`, `acceptsRawSignatures`, `acceptsSignedPayloads`, `acceptsWalletExports`: all `false`
- `allowsRealFunds: false`

### Codex UI usage

```tsx
import { listMcpCards } from "@matterhorn-work/types";

const cards = listMcpCards();
<McpMarketplace cards={cards} />
```

## 4. Chat draft contract

### Types

```ts
type ChatPromptAction = "draft_only" | "send_after_confirm" | "disabled";

interface ChatDraftConfig {
  deskId: string;
  promptAction: ChatPromptAction;
  draftStateLabel: string;
  confirmCtaLabel?: string;
  disabledReason?: string;
}
```

### Registry

| Desk | Action | Draft label |
| --- | --- | --- |
| Bittensor | `draft_only` | "Draft ready — Bittensor preview or handoff" |
| Hyperliquid | `draft_only` | "Draft ready — Hyperliquid preview only" |
| Polymarket | `draft_only` | "Draft ready — Polymarket preview only" |
| Wellness | `send_after_confirm` | "Draft ready — Wellness program builder" |
| Memory | `send_after_confirm` | "Draft ready — Memory review" |
| MCPs | `draft_only` | "Draft ready — Browse MCP tools" |

Markets are always `draft_only` so live submit/sign paths cannot fire from a starter prompt.

### Codex UI usage

```tsx
import { getChatDraftConfig } from "@matterhorn-work/types";

const draft = getChatDraftConfig("bittensor");
<DeskStarter
  label={draft.draftStateLabel}
  action={draft.promptAction}
  confirmCta={draft.confirmCtaLabel}
/>;
```

## Verification

```bash
pnpm --dir packages/types build
pnpm test:market-execution-safety-gate
pnpm test:matterhorn-workflow-contract
pnpm test:wallet-profile-mcp-readiness-contract
```
