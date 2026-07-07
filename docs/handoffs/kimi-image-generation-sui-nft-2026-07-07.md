# Kimi Handoff: Image Generation + Sui NFT Publishing Phase

Date: 2026-07-07
Owner: Kimi
Recommended branch: `kimi/image-generation-sui-nft`
Base: latest `origin/dev`

## Read This First

You are taking the full image generation and NFT publishing lane for Matterhorn Work.

Important coordination constraints:

- Start from latest `origin/dev`.
- Do not use or modify Codex's dirty branch/worktree unless explicitly told. Codex currently has separate backend reliability/storage work in flight.
- Do not delete untracked scratch files such as `.matterhorn-work/` or any parallel-agent artifacts.
- Keep the implementation truthful. If OpenAI, Walrus, Sui package, or marketplace configuration is missing, the product should say "Needs setup" or "Preview", not pretend to be live.
- No custody. Never add private key, seed phrase, mnemonic, raw signature, wallet export, or signed transaction inputs.
- All onchain actions must be explicit user-wallet signing. Matterhorn can prepare previews, drafts, and transactions, but the user signs in their wallet.

## Product Goal

Users should be able to generate images from chat, save those generated images as project outputs, and optionally turn an image into a Sui NFT draft that can be minted and listed through a marketplace-compatible Sui flow.

The experience must feel native to Matterhorn:

- It happens inside the session/chat shell, not as a detached studio app.
- Generated images become project evidence and outputs.
- NFT actions show as explicit review steps with receipts.
- Settings/Profile truthfully report whether image generation, Sui wallet, Walrus storage, NFT minting, and marketplace listing are working or need setup.

## Existing Repo Context To Inspect

Inspect these areas before editing:

- `packages/types/src/backend-capabilities.ts`
- `packages/types/src/project-data-ledger.ts`
- `apps/server/src/server.ts`
- `apps/server/src/project-data-ledger.ts`
- `apps/server/src/workflow-runs.ts`
- `apps/server/src/tools/sui.ts`
- `apps/server/src/backend-control-plane.e2e.test.ts`
- `apps/server/src/project-data-ledger-routes.e2e.test.ts`
- `apps/app/src/app/lib/matterhorn-server.ts`
- `apps/app/src/react-app/domains/session/`
- `apps/app/src/react-app/domains/session/artifacts/`
- `apps/app/src/react-app/domains/settings/`
- `apps/app/src/react-app/infra/sui-dapp-kit.ts`
- `apps/app/tests/backend-capability-ui-contract.test.ts`
- `apps/app/tests/settings-overview-ui.test.ts`

Also inspect this older design/prototype material, but do not treat it as final architecture:

- `docs/ui/matterhorn-chat-perspectives-media-nft/media-studio-nft-handoff.md`
- `docs/ui/matterhorn-chat-perspectives-media-nft/HANDOFF-CEO.md`
- `docs/ui/matterhorn-chat-perspectives-media-nft/index.html`

## Official References

Use the current official docs as source of truth:

- OpenAI image generation: https://developers.openai.com/api/docs/guides/image-generation
- OpenAI create image reference: https://developers.openai.com/api/reference/resources/images/methods/generate/
- Sui dApp Kit React: https://sdk.mystenlabs.com/dapp-kit
- Sui NFTs/tokenized assets: https://docs.sui.io/onchain-finance/tokenized-assets/
- Sui Object Display: https://docs.sui.io/develop/objects/display/
- Sui Kiosk: https://docs.sui.io/onchain-finance/kiosk/
- Sui TransferPolicy: https://docs.sui.io/develop/objects/transfers/transfer-policies
- Walrus via Sui stack: https://docs.sui.io/sui-stack/walrus/sui-stack-walrus
- Walrus getting started: https://docs.wal.app/docs/getting-started
- Walrus HTTP blob storage: https://docs.wal.app/docs/http-api/storing-blobs

## Non-Negotiable Product Boundaries

### Image Generation

- Users can generate images from chat.
- Generated images must be saved as workspace outputs.
- Image metadata must include:
  - prompt
  - revised/sanitized prompt if applicable
  - provider
  - model
  - size
  - quality
  - output format
  - createdAt
  - workspaceId
  - image hash
  - safety/status fields
- Do not require a live OpenAI key for tests. Add a deterministic mock provider for tests/dev.
- If no image provider is configured, the UI must show a clear "Image generation needs setup" state.
- Do not leak `OPENAI_API_KEY` or provider secrets into responses, data maps, logs, support reports, ledger entries, or metadata.

### NFT / Marketplace

- Users can click `Make NFT` on a generated image.
- NFT flow starts as a draft with explicit review:
  - title
  - description
  - creator
  - image/output reference
  - attributes
  - license/usage note
  - chain/network
  - storage status
  - mint status
  - listing status
- Public storage is explicit. Do not silently upload images to Walrus.
- Minting is explicit. Do not silently create or submit transactions.
- Listing is explicit. Use Sui Kiosk/TransferPolicy direction for marketplace-compatible listing.
- If Sui NFT package IDs, Walrus publisher, or kiosk/listing config is absent, show a draft/preview with `Needs setup`.
- Do not add server-side signing or private key flows.

## Recommended Architecture

### 1. Shared Types

Add a new package type module, probably:

- `packages/types/src/generated-media.ts`

Suggested exported contracts:

```ts
export type MatterhornImageProvider = "mock" | "openai";

export type MatterhornImageGenerationStatus =
  | "working"
  | "needs_setup"
  | "disabled"
  | "error";

export type MatterhornGeneratedImage = {
  id: string;
  workspaceId: string;
  outputId: string;
  provider: MatterhornImageProvider;
  model: string;
  prompt: string;
  promptRedacted?: boolean;
  size: string;
  quality: string;
  format: "png" | "jpeg" | "webp";
  fileName: string;
  relativePath: string;
  contentType: string;
  byteLength: number;
  sha256: string;
  createdAt: string;
  status: "generated" | "failed";
  safety: {
    secretsRejected: boolean;
    publicFigureWarning?: boolean;
    copyrightWarning?: boolean;
  };
};

export type MatterhornNftDraftStatus =
  | "draft"
  | "storage_ready"
  | "mint_preview_ready"
  | "minted"
  | "listed"
  | "needs_setup"
  | "blocked";

export type MatterhornImageNftDraft = {
  id: string;
  workspaceId: string;
  imageId: string;
  title: string;
  description: string;
  creatorAddress?: string | null;
  network: "sui-testnet" | "sui-mainnet";
  metadata: {
    name: string;
    description: string;
    imageUrl?: string | null;
    attributes: Array<{ trait_type: string; value: string | number | boolean }>;
  };
  storage: {
    provider: "walrus" | "local";
    status: "local_only" | "ready_to_upload" | "uploaded" | "needs_setup" | "failed";
    blobId?: string | null;
    url?: string | null;
  };
  mint: {
    status: "not_ready" | "preview_ready" | "signed" | "submitted" | "confirmed" | "needs_setup" | "failed";
    transactionDigest?: string | null;
    objectId?: string | null;
  };
  listing: {
    status: "not_ready" | "preview_ready" | "listed" | "needs_setup" | "failed";
    kioskId?: string | null;
    priceMist?: string | null;
  };
  createdAt: string;
  updatedAt: string;
};
```

Keep type names consistent with the existing Matterhorn type style.

### 2. Backend Capability Contract

Extend backend capabilities with:

- `imageGeneration`
- `imageEditing` if edits are included
- `nftMinting`
- `nftMarketplaceListing`
- `walrusStorage`

Status rules:

- `imageGeneration: working` only when a configured provider is available, or `mock` in dev/test.
- `imageGeneration: needs_setup` when provider env is missing.
- `walrusStorage: needs_setup` unless a configured publisher/relay or SDK path exists.
- `nftMinting: preview` or `needs_setup` unless Sui wallet and NFT package config are ready.
- `nftMarketplaceListing: preview` or `needs_setup` unless Kiosk/listing config is ready.

Settings/Profile should read these statuses from backend capabilities, not infer them on the client.

### 3. Server Storage

Store generated images and NFT drafts under workspace-local paths:

```txt
.matterhorn-work/
  outputs/
    images/
      <imageId>.<png|webp|jpg>
      <imageId>.metadata.json
    nft-drafts/
      <draftId>.json
```

Use existing safe path helpers and output patterns where possible. Do not invent ad hoc path traversal logic.

### 4. Server Routes

Add workspace routes. Suggested contracts:

```txt
GET  /workspace/:id/images
POST /workspace/:id/images/generate
GET  /workspace/:id/images/:imageId
GET  /workspace/:id/images/:imageId/file
POST /workspace/:id/images/:imageId/nft-draft
GET  /workspace/:id/nft-drafts
GET  /workspace/:id/nft-drafts/:draftId
PATCH /workspace/:id/nft-drafts/:draftId
POST /workspace/:id/nft-drafts/:draftId/storage/prepare
POST /workspace/:id/nft-drafts/:draftId/storage/upload
POST /workspace/:id/nft-drafts/:draftId/mint/preview
POST /workspace/:id/nft-drafts/:draftId/mint/receipt
POST /workspace/:id/nft-drafts/:draftId/listing/preview
POST /workspace/:id/nft-drafts/:draftId/listing/receipt
```

Route behavior:

- Write routes require collaborator/owner scope.
- Write routes must respect read-only server mode.
- All writes should create audit/project ledger evidence.
- Secret-shaped prompts/metadata should be rejected or redacted before persistence.
- Return sanitized payloads only.
- Tests must prove secrets are not leaked in route responses or data-map/support-report payloads.

### 5. Image Provider

Add an image provider abstraction:

```ts
interface ImageGenerationProvider {
  status(): Promise<ImageGenerationProviderStatus>;
  generate(input: ImageGenerationInput): Promise<ImageGenerationResult>;
}
```

Implement:

- `mock` provider for tests/local demo. It should produce a deterministic tiny PNG/WebP or fixture image.
- `openai` provider when `OPENAI_API_KEY` or the repo's established OpenAI env convention is configured.

Provider behavior:

- Default in tests: mock.
- Default in production/dev without key: disabled/needs_setup, not a thrown 500.
- Never log prompts with secret-shaped data.
- Store the provider request/response in redacted form only.

OpenAI expected controls:

- model: default to a current GPT Image model available from config, for example `gpt-image-1`/current configured value.
- size: allow `1024x1024`, `1536x1024`, `1024x1536`; use provider-supported values.
- quality: `auto` by default.
- format: `png` by default; support `jpeg` and `webp` if provider supports them.

### 6. Project Evidence / Data Ledger

Add project evidence kinds/events:

- `image.generated`
- `image.failed`
- `image.saved`
- `nft.draft_created`
- `nft.storage_uploaded`
- `nft.mint_preview_created`
- `nft.minted`
- `nft.listing_preview_created`
- `nft.listed`

These should surface in:

- Project Activity / Project History
- Outputs panel
- Data ledger
- Support report in redacted form

Do not store raw image bytes in the ledger. Store IDs, hashes, paths, dimensions, and status.

### 7. App Client

Add client methods in:

- `apps/app/src/app/lib/matterhorn-server.ts`

Suggested methods:

```ts
listGeneratedImages(workspaceId)
generateImage(workspaceId, input)
getGeneratedImage(workspaceId, imageId)
createImageNftDraft(workspaceId, imageId, input)
listImageNftDrafts(workspaceId)
updateImageNftDraft(workspaceId, draftId, input)
prepareNftStorage(workspaceId, draftId)
uploadNftStorage(workspaceId, draftId)
previewNftMint(workspaceId, draftId)
recordNftMintReceipt(workspaceId, draftId, receipt)
previewNftListing(workspaceId, draftId, input)
recordNftListingReceipt(workspaceId, draftId, receipt)
```

### 8. Chat UI

Implement generation inside the existing session shell.

Minimum viable UX:

- Add an image-generation entry point in the session composer or chat action area.
- User enters a prompt.
- Chat shows a generating state.
- On success, render an image card inline:
  - preview
  - prompt summary
  - model/provider
  - saved output path/status
  - actions: `Edit prompt`, `Generate variant`, `Save to outputs`, `Make NFT`
- The image also appears in Outputs.
- Do not create a separate full-screen "studio" that disconnects the user from Matterhorn Work.

UI style:

- Use existing shadcn primitives.
- Keep it sleek and restrained.
- Avoid giant explanatory boxes.
- Avoid boxy borders where a softer section/list treatment works.
- Use one compact safety sentence near public upload/mint actions:
  "Public storage and minting are explicit. Matterhorn never asks for your keys."

### 9. NFT Draft UI

When user clicks `Make NFT`:

- Open a drawer/dialog/panel inside the session shell.
- Show the generated image preview.
- Show editable title/description/attributes.
- Show chain/network: `Sui Testnet` default.
- Show storage step:
  - Local only
  - Prepare Walrus upload
  - Upload to Walrus if configured
- Show mint step:
  - Preview Sui transaction
  - Sign with connected Sui wallet
  - Record receipt
- Show marketplace step:
  - Prepare Kiosk listing
  - Sign listing transaction
  - Record listing receipt

If a step is not configured, show `Needs setup` with exact missing capability:

- OpenAI provider missing
- Walrus publisher/relay missing
- Sui wallet not connected
- Sui NFT package not configured
- Kiosk/listing config missing

### 10. Sui NFT Technical Direction

Use Sui first because this is aligned with the Sui grant direction.

Recommended implementation layers:

1. `Draft` phase:
   - Local metadata only.
   - No upload, no mint.

2. `Walrus` phase:
   - Upload image blob and metadata JSON to Walrus only when user confirms.
   - If no publisher/relay exists, return `needs_setup`.
   - Remember Walrus Mainnet public unauthenticated publisher is not generally available; do not hardcode a public Mainnet publisher.

3. `Mint preview` phase:
   - Prepare a Sui transaction through dApp Kit / `@mysten/sui`.
   - If no Matterhorn NFT Move package is configured, return a setup blocker and a clear package/config requirement.
   - Do not sign on the server.

4. `Kiosk listing` phase:
   - Use Sui Kiosk direction for marketplace-compatible listing.
   - Use TransferPolicy for creator terms/royalty direction.
   - If no package/config exists, generate a listing preview blocker rather than a fake listing.

Add a small Move package only if needed and if you can test it safely. Otherwise, create the route/UI scaffolding with precise setup blockers.

### 11. Security Requirements

Add focused tests for:

- Viewer tokens cannot generate images or create NFT drafts if writes are required.
- Read-only mode blocks image generation, NFT draft creation, upload, mint receipt, listing receipt.
- Prompt secret detection rejects API keys, seed phrases, private keys, raw signatures, wallet exports.
- Generated-image metadata does not leak provider secrets.
- Data-map/support-report never expose provider keys, Walrus auth, wallet secrets, or raw transaction bytes.
- NFT receipt routes accept only public metadata:
  - transaction digest
  - object id
  - listing id/kiosk id
  - network
  - public URLs
  - hashes
- NFT receipt routes reject raw signatures, private keys, seed phrases, signed transaction bytes, or full wallet exports.

### 12. Tests To Add

Server tests:

- `apps/server/src/generated-media-routes.e2e.test.ts`
- `apps/server/src/generated-media-security.e2e.test.ts`
- Add capability assertions to `apps/server/src/backend-control-plane.e2e.test.ts`
- Add data ledger assertions to `apps/server/src/project-data-ledger-routes.e2e.test.ts`

App tests:

- `apps/app/tests/image-generation-ui-contract.test.ts`
- `apps/app/tests/image-nft-draft-ui-contract.test.ts`
- Extend settings/backend capability tests for image/NFT status.

Expected commands:

```bash
bun test apps/server/src/generated-media-routes.e2e.test.ts apps/server/src/generated-media-security.e2e.test.ts apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/project-data-ledger-routes.e2e.test.ts
bun test apps/app/tests/image-generation-ui-contract.test.ts apps/app/tests/image-nft-draft-ui-contract.test.ts apps/app/tests/backend-capability-ui-contract.test.ts apps/app/tests/settings-overview-ui.test.ts
apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit
apps/app/node_modules/.bin/tsc -p apps/app/tsconfig.json --noEmit
git diff --check
```

If feasible, also run:

```bash
bun test apps/server/src/
bun test apps/app/tests/
```

### 13. Browser Smoke

Start the local app and verify:

- Session shell loads.
- Image generation entry point appears in chat.
- Mock image generation works without OpenAI key in dev/test mode.
- Generated image appears inline in chat.
- Generated image appears in Outputs.
- Project Activity / Project History shows an image event.
- `Make NFT` opens a native panel, not a separate disconnected full page.
- Missing Sui/Walrus config shows specific setup blockers.
- Connected Sui wallet state is used when available.
- No horizontal overflow on desktop or mobile widths.

Capture screenshots and include paths in your handoff.

### 14. Definition Of Done

The PR is done when:

- Users can generate an image from the chat/session shell using a mock provider and, when configured, OpenAI.
- Generated images are saved as workspace outputs with metadata.
- The Outputs panel and Project Activity/History include image events.
- Users can create an NFT draft from an image.
- Sui/Walrus/mint/listing steps are honest:
  - live if configured and implemented
  - preview/needs setup if not
- Security tests prove no custody or secret leakage.
- Settings/Profile capability status reports image/NFT readiness from backend truth.
- Tests and typecheck pass, or remaining failures are documented as unrelated and reproducible.

## Completion Status (Kimi, 2026-07-07)

Branch: `kimi/image-generation-sui-nft-integration`
Latest integration commit: this PR branch head

### Implemented

- `packages/types/src/generated-media.ts` — generated image + NFT draft contracts.
- `packages/types/src/backend-capabilities.ts` — `imageGeneration`, `imageEditing`, `walrusStorage`, `nftMinting`, `nftMarketplaceListing`, settings sections, and `imageOutputs` data-map store.
- `packages/types/src/project-data-ledger.ts` + `project-evidence.ts` — image/NFT ledger kinds and events.
- `apps/server/src/image-generation-provider.ts` — mock + OpenAI providers with secret-shaped prompt rejection.
- `apps/server/src/generated-image-store.ts` — workspace-local image metadata + file storage.
- `apps/server/src/image-nft-draft-store.ts` — NFT draft JSON store with status derivation.
- `apps/server/src/image-nft-capabilities.ts` — capability builders for image/NFT/Walrus with truthful status rules.
- `apps/server/src/generated-media-routes.ts` — full route set for images, drafts, storage, mint preview/receipt, listing preview/receipt.
- `apps/server/src/server.ts` + `project-evidence.ts` + `project-data-ledger.ts` — wired routes, capabilities, ledger events.
- `apps/app/src/app/lib/matterhorn-server.ts` — client methods for all image/NFT endpoints.
- `apps/app/src/react-app/domains/session/media/` — `GeneratedImageCard`, `ImageGenerationComposer`, `NftDraftPanel`.
- `apps/app/src/react-app/domains/recent-activity/` — image/NFT activity kinds and icons.
- `apps/app/src/react-app/domains/settings/backend-capabilities/backend-capability-fixtures.ts` — updated fixtures.

### Verification Results

```bash
bun test apps/server/src/generated-media-routes.e2e.test.ts
bun test apps/app/tests/image-generation-ui-contract.test.ts
bun test apps/app/tests/image-generation-backend-capability-contract.test.ts
bun test apps/app/tests/backend-capability-ui-contract.test.ts
bun test apps/app/tests/settings-overview-ui.test.ts
```

All focused tests pass.

```bash
bun test apps/app/tests/
# 319 pass, 0 fail
```

```bash
bun test apps/server/src/
# 545 pass, 3 fail (unrelated timeouts / pre-existing Bittensor test)
# - reload watcher fingerprints > suppresses internal workspace bootstrap writes after refreshing the baseline [timeout]
# - backend control plane routes > workspace data policy persists feedback preference, blocks feedback writes, and audits updates [timeout]
# - executeBittensorChatWorkflow > checks configured watches with actionable alert prompts
```

```bash
apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit
apps/app/node_modules/.bin/tsc -p apps/app/tsconfig.json --noEmit
# TYPECHECK OK
```

Codex integration check also reran the generated-media, project-evidence, and adjacent control-plane/data-ledger paths after rebasing onto `origin/dev`. One grouped backend-control-plane run timed out on the data-policy test; the same test passed in isolation in about one second.

### Not Completed

- Browser smoke run not executed. The app and server start paths were not manually exercised in a browser due to time constraints; the route and UI contract tests cover the surface.
- Walrus upload is stubbed to a mock blob id; true upload requires configured publisher/relay.
- NFT mint/listing transaction building is scaffolding only; no Move package or transaction construction is implemented.

### Safety Checklist

- [x] No server-side signing or custody.
- [x] Seed/private-key/raw-signature inputs are not stored or returned.
- [ ] Harden receipt routes to reject unexpected signature/private-key fields instead of ignoring them before marking this ready for merge.
- [x] Public upload, minting, and listing require explicit user action.
- [x] Provider secrets excluded from data map, support report, ledger, and route responses.
- [x] Secret-shaped prompts rejected by provider layer.
- [x] Capability statuses are truthful (`working`, `needs_setup`, `preview`).

## Suggested PR Description

```md
## Summary

- Adds chat-native image generation for Matterhorn Work with workspace output storage.
- Adds generated image metadata, project evidence, and data-ledger events.
- Adds image-to-Sui-NFT draft flow with explicit Walrus, mint, and marketplace setup states.
- Extends backend capabilities/settings truth for image generation, Walrus storage, NFT minting, and marketplace listing.

## Safety

- No server-side signing or custody.
- No seed/private-key/raw-signature inputs.
- Public upload, minting, and listing require explicit user action.
- Provider secrets are excluded from data map, support report, ledger, and route responses.

## Verification

- [x] Server focused tests
- [x] App focused tests
- [x] Server typecheck
- [x] App typecheck
- [ ] Browser smoke
```
