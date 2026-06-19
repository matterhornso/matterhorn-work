# Matterhorn Work Decentralized Services Capability Contract

> Status: **future contract only**. This document defines safe contracts so future hosting, storage, email, payments, and identity providers can plug into Matterhorn Work through one subscription and one chat interface. It does **not** implement any live provider integration.

## Vision

Matterhorn Work should eventually let users say:

- "Host this app"
- "Store this file on decentralized storage"
- "Send emails to my customers"
- "Collect payments"
- "Create a paid creator program"
- "Publish this artifact"

through a single chat thread and a single subscription.

This PR establishes the provider-neutral contract, typed schema, and static tests. No real provider is wired up yet.

## Operator Helper

Operators and agents can inspect the future capability catalog without touching
any provider:

```bash
matterhorn-work services capabilities --json
matterhorn-work services capabilities --capability hosting --json
pnpm test:decentralized-services-operator-helper
```

The helper emits `matterhorn.services.capability-catalog.v1`, keeps every
capability at `status: "future_contract"`, and reports `canExecute: false` and
`liveExecutionEnabled: false`. It rejects credential-shaped flags such as
`--private-key`, `--api-secret`, `--raw-signature`, `--signed-payload`, and
`--wallet-export`.

## Non-overlap

This contract does **not** touch:

- Hyperliquid/Polymarket trading routes
- Bittensor core files
- Current market watch/action PRs
- Wellness creator docs

## Core Principles

1. **Contract first, provider second.** Every capability has a manifest, preview, confirmation, handoff, receipt, and failure/rollback shape before any provider is selected.
2. **No custody.** Matterhorn Work never accepts private keys, seed phrases, raw signatures, API secrets, or wallet exports for these services.
3. **Preview before execution.** Every execution-capable flow must produce a safe preview with a SHA-256 hash, a consequence statement, and a confirmation prompt.
4. **External signer or provider handoff.** Where on-chain signing or third-party authorization is required, the user performs it outside Matterhorn Work using a public handoff packet.
5. **Public receipts only.** Execution results contain public metadata, links, or hashes. No secret material is returned.
6. **Future-only until explicitly promoted.** Each capability manifest defaults to `status: "future_contract"` and `liveExecutionEnabled: false`.

## Capability Registry

| Capability | User intent examples | Future provider examples |
| --- | --- | --- |
| **Hosting** | "Host this app", "Deploy my frontend", "Publish this site" | Akash, Fleek, Spheron |
| **Storage** | "Store this file on decentralized storage", "Pin this CID", "Back up this artifact" | IPFS/Filecoin, Arweave, Storj |
| **Email** | "Send emails to my customers", "Send a newsletter", "Verify a user by email" | Resend, SendGrid, Mailgun |
| **Payments** | "Collect payments", "Create a paid creator program", "Issue an invoice" | Stripe, Coinbase Commerce, Loop |
| **Identity / Access** | "Create a customer login", "Gate this file by wallet", "Issue a membership" | ENS, World ID, Privy, Dynamic |

## Shared Schema

All five capabilities use the same contract shapes.

### Capability Manifest

```ts
interface DecentralizedServiceProviderManifest {
  version: "matterhorn.services.provider-manifest.v1";
  providerId: string;
  capability: "hosting" | "storage" | "email" | "payments" | "identity";
  displayName: string;
  status: "future_contract" | "readonly_preview" | "live_beta" | "live";
  authModels: DecentralizedServiceAuthModel[];
  previewSupported: boolean;
  confirmationRequired: boolean;
  externalSignerOrHandoff: boolean;
  acceptsSecrets: false;
  acceptsPrivateKeys: false;
  acceptsRawSignatures: false;
  liveExecutionEnabled: false;
  supportedIntents: string[];
  unsupportedIntents: string[];
  requiredCustomerDisclosures: string[];
  outputArtifacts: string[];
}
```

### Preview Result

```ts
interface DecentralizedServicePreview {
  version: "matterhorn.services.preview.v1";
  capability: DecentralizedServiceCapability;
  providerId: string;
  intent: string;
  execution: "preview_required" | "confirmation_required" | "external_handoff_required" | "unsupported" | "blocked_by_policy";
  summary: string;
  consequence: string;
  confirmationText: string;
  previewSha256: string;
  estimatedCost?: { amount: number | null; asset: string | null; period?: string | null } | null;
  requiredAuth: DecentralizedServiceAuthModel[];
  requiresExternalSigner: boolean;
  requiresCustomerConfirmation: boolean;
  unsupportedReason?: string | null;
  warnings: string[];
  canExecute: false;
}
```

### External Action Handoff

```ts
interface DecentralizedServiceHandoff {
  version: "matterhorn.services.external-action-handoff.v1";
  capability: DecentralizedServiceCapability;
  providerId: string;
  intent: string;
  previewSha256: string;
  handoffSha256: string;
  action: string;
  externalSignerOrProviderUrl?: string | null;
  payloadPublicHash?: string | null;
  instructions: string;
  operatorConfirmation: string;
  createdAt: string;
  expiresAt: string;
  canExecute: false;
  liveExecutionEnabled: false;
}
```

### Public Receipt / Evidence

```ts
interface DecentralizedServiceReceipt {
  version: "matterhorn.services.receipt.v1";
  capability: DecentralizedServiceCapability;
  providerId: string;
  intent: string;
  previewSha256: string;
  handoffSha256?: string | null;
  status: "previewed" | "confirmed" | "handed_off" | "pending" | "succeeded" | "failed" | "rolled_back";
  action: string;
  publicResult?: Record<string, unknown>;
  evidenceUrl?: string | null;
  rollbackAvailable: boolean;
  failureReason?: string | null;
  recordedAt: string;
  warnings: string[];
}
```

### Unsupported Capability Response

```ts
interface DecentralizedServiceUnsupportedResponse {
  version: "matterhorn.services.unsupported.v1";
  capability: DecentralizedServiceCapability;
  intent: string;
  status: "unsupported";
  reason: string;
  suggestedCapabilities: DecentralizedServiceCapability[];
  customerMessage: string;
}
```

### Failure / Rollback Result

```ts
interface DecentralizedServiceFailureResult {
  version: "matterhorn.services.failure.v1";
  capability: DecentralizedServiceCapability;
  providerId: string;
  intent: string;
  previewSha256?: string | null;
  status: "failed" | "rolled_back";
  failureReason: string;
  rollbackAttempted: boolean;
  rollbackResult?: string | null;
  customerMessage: string;
  recordedAt: string;
  warnings: string[];
}
```

## Capability Definitions

### 1. Hosting

**User intent examples:**

- "Host this app"
- "Deploy my frontend"
- "Publish this site"

**Provider capability manifest:**

- `capability`: `"hosting"`
- `supportedIntents`: `["deploy_frontend", "publish_site", "scale_deployment", "remove_deployment"]`
- `unsupportedIntents`: `["mint_nft", "place_order", "send_email", "collect_payment"]`
- `authModels`: `["oauth2", "api_key_reference", "wallet_address", "subscription"]`
- `externalSignerOrHandoff`: `true`
- `outputArtifacts`: `["deployment_url", "deployment_log_url", "build_hash", "domain_record"]`

**Required auth model:** OAuth2 or wallet-address attestation. API keys are stored as opaque references by the provider connector, never as plaintext in chat context.

**Safe preview step:** Returns a `DecentralizedServicePreview` with the deployment target, estimated cost, domain, build hash, and a consequence statement such as "This will build and deploy a public copy of your project to provider X." `canExecute: false`.

**Confirmation step:** Operator must confirm via `DecentralizedServiceConfirmation` containing the `previewSha256`, an acknowledgement, and an expiry. No execution happens without this confirmation.

**Execution / receipt shape:** After confirmation the provider connector emits a `DecentralizedServiceHandoff` or an internal deployment job. The eventual `DecentralizedServiceReceipt` includes `deployment_url`, `build_hash`, `status`, and `rollbackAvailable: true`.

**Secret handling rules:**

- Never ask for provider API secrets, private repository deploy keys, TLS private keys, or SSH keys in chat.
- Provider credentials are stored only in the connector's secret manager, not in session logs.
- Build logs must redact secrets before returning URLs.

**Customer-facing artifact outputs:**

- Public deployment URL
- Build hash / content hash
- Domain DNS record instructions
- Rollback command reference

### 2. Storage

**User intent examples:**

- "Store this file on decentralized storage"
- "Pin this CID"
- "Back up this artifact"

**Provider capability manifest:**

- `capability`: `"storage"`
- `supportedIntents`: `["upload_file", "pin_cid", "retrieve_file", "delete_file", "grant_access"]`
- `unsupportedIntents`: `["host_app", "send_email", "collect_payment"]`
- `authModels`: `["oauth2", "api_key_reference", "wallet_address", "did"]`
- `externalSignerOrHandoff`: `true`
- `outputArtifacts`: `["cid", "storage_deal_id", "retrieval_url", "access_grant_record"]`

**Required auth model:** Wallet address or DID for on-chain storage deals; OAuth2/API key reference for centralized pinning gateways.

**Safe preview step:** Returns a `DecentralizedServicePreview` with file size, replication target, estimated cost, public CID candidate, and consequence: "This will upload your file to decentralized storage provider X and make the CID publicly retrievable." `canExecute: false`.

**Confirmation step:** Operator confirms via `DecentralizedServiceConfirmation` with the `previewSha256`, acknowledgement of public storage, and expiry.

**Execution / receipt shape:** Receipt contains `cid`, `retrieval_url`, `storage_deal_id` (where applicable), and `rollbackAvailable: true` for deletion or access revocation.

**Secret handling rules:**

- Never accept raw file encryption keys or decryption passwords in chat.
- Encryption happens client-side or provider-side; Matterhorn Work only sees public CIDs and retrieval URLs.
- Access grants use wallet/DID allowlists, not shared secrets.

**Customer-facing artifact outputs:**

- Public or gated retrieval URL
- CID
- Storage deal / replication record
- Access policy summary

### 3. Email

**User intent examples:**

- "Send emails to my customers"
- "Send a newsletter"
- "Verify a user by email"

**Provider capability manifest:**

- `capability`: `"email"`
- `supportedIntents`: `["send_transactional", "send_newsletter", "verify_email", "send_invite"]`
- `unsupportedIntents`: `["collect_payment", "host_app", "sign_transaction"]`
- `authModels`: `["oauth2", "api_key_reference", "subscription"]`
- `externalSignerOrHandoff`: `false`
- `outputArtifacts`: `["message_id", "delivery_status", "bounce_report_url", "template_version"]`

**Required auth model:** OAuth2 or API key reference to the email provider. Matterhorn Work never stores SMTP passwords or API keys in chat context.

**Safe preview step:** Returns a `DecentralizedServicePreview` with recipient count, subject line, template version, sender domain, and consequence: "This will send X emails from your verified domain via provider Y." `canExecute: false`.

**Confirmation step:** Operator confirms via `DecentralizedServiceConfirmation` with the `previewSha256`, acknowledgement of recipient list, and expiry.

**Execution / receipt shape:** Receipt contains `message_id`, `delivery_status`, `recipient_count`, and `rollbackAvailable: false` (email cannot be unsent).

**Secret handling rules:**

- Never ask for SMTP passwords, API keys, or DKIM private keys in chat.
- Provider API credentials are stored as opaque references in the connector.
- Recipient lists must be sourced from existing workspace contacts or user-provided files, not invented by the agent.

**Customer-facing artifact outputs:**

- Message ID
- Delivery status summary
- Bounce/spam report link
- Template version and sender domain

### 4. Payments

**User intent examples:**

- "Collect payments"
- "Create a paid creator program"
- "Issue an invoice"

**Provider capability manifest:**

- `capability`: `"payments"`
- `supportedIntents`: `["create_checkout", "create_invoice", "create_subscription", "create_creator_program", "refund_payment"]`
- `unsupportedIntents`: `["host_app", "send_email", "deploy_frontend"]`
- `authModels`: `["oauth2", "api_key_reference", "wallet_address", "external_signer"]`
- `externalSignerOrHandoff`: `true`
- `outputArtifacts`: `["checkout_url", "invoice_id", "subscription_id", "creator_program_id", "public_payment_link"]`

**Required auth model:** OAuth2 or API key reference for fiat providers; wallet address or external signer for on-chain payment primitives.

**Safe preview step:** Returns a `DecentralizedServicePreview` with amount, asset, currency, fees, checkout/recipient address, and consequence: "This will create a public checkout page / invoice / subscription. No funds move until the customer completes payment." `canExecute: false`.

**Confirmation step:** Operator confirms via `DecentralizedServiceConfirmation` with the `previewSha256`, acknowledgement of amount and recipient, and expiry.

**Execution / receipt shape:** On-chain or provider handoff produces a `DecentralizedServiceHandoff` with the public payment link or checkout URL. The eventual receipt contains `checkout_url`, `invoice_id`, `status`, and `rollbackAvailable: true` for draft cancellation before customer payment.

**Secret handling rules:**

- Never ask for payment processor API secrets, webhook signing secrets, or merchant private keys.
- On-chain payment configuration uses public addresses and handoff packets, not private keys.
- Webhook secrets are stored in the connector, never surfaced in receipts.

**Customer-facing artifact outputs:**

- Public checkout / invoice URL
- Payment link QR code reference
- Subscription or creator program ID
- Refund policy link

### 5. Identity / Access

**User intent examples:**

- "Create a customer login"
- "Gate this file by wallet"
- "Issue a membership"

**Provider capability manifest:**

- `capability`: `"identity"`
- `supportedIntents`: `["create_login", "gate_by_wallet", "issue_membership", "verify_did", "revoke_access"]`
- `unsupportedIntents`: `["collect_payment", "send_email", "host_app"]`
- `authModels`: `["oauth2", "wallet_address", "did", "external_signer"]`
- `externalSignerOrHandoff`: `true`
- `outputArtifacts`: `["access_policy_id", "membership_nft_contract", "did_document_url", "gate_check_url"]`

**Required auth model:** Wallet address, DID, or OAuth2. Where ownership must be proven, an external-signer handoff is used.

**Safe preview step:** Returns a `DecentralizedServicePreview` with the access rule, affected resource, eligible wallets/DIDs, and consequence: "This will create an access policy that allows the listed wallets/DIDs to retrieve the resource." `canExecute: false`.

**Confirmation step:** Operator confirms via `DecentralizedServiceConfirmation` with the `previewSha256`, acknowledgement of the allowlist, and expiry.

**Execution / receipt shape:** Receipt contains `access_policy_id`, `gate_check_url`, affected resource hash, and `rollbackAvailable: true` for policy revocation.

**Secret handling rules:**

- Never ask for user passwords, private keys, recovery codes, or wallet exports.
- Identity proof uses public addresses, DIDs, or external signer handoffs.
- Revocation is explicit and auditable.

**Customer-facing artifact outputs:**

- Access policy ID
- Gate check URL
- Membership contract address (public)
- DID document URL

## JSON Examples

### Hosting manifest

```json
{
  "version": "matterhorn.services.provider-manifest.v1",
  "providerId": "example-hosting-provider",
  "capability": "hosting",
  "displayName": "Example Hosting Provider",
  "status": "future_contract",
  "authModels": ["oauth2", "wallet_address", "subscription"],
  "previewSupported": true,
  "confirmationRequired": true,
  "externalSignerOrHandoff": true,
  "acceptsSecrets": false,
  "acceptsPrivateKeys": false,
  "acceptsRawSignatures": false,
  "liveExecutionEnabled": false,
  "supportedIntents": ["deploy_frontend", "publish_site"],
  "unsupportedIntents": ["mint_nft", "place_order"],
  "requiredCustomerDisclosures": ["Deployment will be public"],
  "outputArtifacts": ["deployment_url", "build_hash"]
}
```

### Storage preview

```json
{
  "version": "matterhorn.services.preview.v1",
  "capability": "storage",
  "providerId": "example-storage-provider",
  "intent": "upload_file",
  "execution": "confirmation_required",
  "summary": "Upload a 2 MB PDF to decentralized storage and pin it.",
  "consequence": "The file will be publicly retrievable by CID. Any user with the CID can download it.",
  "confirmationText": "Upload and pin this file to decentralized storage?",
  "previewSha256": "abc123...",
  "estimatedCost": { "amount": 0.01, "asset": "USD", "period": null },
  "requiredAuth": ["wallet_address"],
  "requiresExternalSigner": false,
  "requiresCustomerConfirmation": true,
  "warnings": [],
  "canExecute": false
}
```

### Payments handoff

```json
{
  "version": "matterhorn.services.external-action-handoff.v1",
  "capability": "payments",
  "providerId": "example-payment-provider",
  "intent": "create_checkout",
  "previewSha256": "def456...",
  "handoffSha256": "ghi789...",
  "action": "create_checkout",
  "externalSignerOrProviderUrl": "https://example.com/checkout/abc",
  "payloadPublicHash": "pub123...",
  "instructions": "Share this checkout URL with your customer. Funds do not move until the customer completes payment.",
  "operatorConfirmation": "I confirmed creating a checkout for $10.00 USD.",
  "createdAt": "2026-06-19T12:00:00Z",
  "expiresAt": "2026-06-19T13:00:00Z",
  "canExecute": false,
  "liveExecutionEnabled": false
}
```

### Email receipt

```json
{
  "version": "matterhorn.services.receipt.v1",
  "capability": "email",
  "providerId": "example-email-provider",
  "intent": "send_transactional",
  "previewSha256": "jkl012...",
  "status": "succeeded",
  "action": "send_transactional",
  "publicResult": { "recipient_count": 42, "accepted_count": 42 },
  "evidenceUrl": "https://example.com/delivery/xyz",
  "rollbackAvailable": false,
  "recordedAt": "2026-06-19T12:05:00Z",
  "warnings": []
}
```

### Unsupported response

```json
{
  "version": "matterhorn.services.unsupported.v1",
  "capability": "payments",
  "intent": "issue_loan",
  "status": "unsupported",
  "reason": "Loans are not supported by the payments capability contract.",
  "suggestedCapabilities": ["payments"],
  "customerMessage": "I can't issue loans yet. I can help you create a checkout, invoice, subscription, or creator program."
}
```

## Safety Defaults

```ts
const DECENTRALIZED_SERVICE_SAFETY_DEFAULTS = {
  custody: "none",
  liveExecutionEnabled: false,
  acceptsPrivateKeys: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  requiresPreviewBeforeExecution: true,
  requiresConfirmationBeforeExecution: true,
  rejectsRawSigningMaterial: true,
};
```

## Forbidden Material

The following must never appear in example payloads, schemas, or chat prompts for these capabilities:

- `privateKey` / `private_key`
- `seed` / `seedPhrase` / `mnemonic`
- `apiSecret` / `api_secret` / `apiKeySecret`
- `rawSignature` / `raw_signature`
- `signedPayload` / `signed_payload`
- `walletExport` / `wallet_export`
- `passphrase` / `password`
- `keyfile` / `suri`

## Safety Checklist

```ts
interface DecentralizedServiceSafetyChecklist {
  version: "matterhorn.services.safety-checklist.v1";
  capabilities: DecentralizedServiceCapability[];
  allContractsFutureOnly: true;
  liveExecutionEnabled: false;
  acceptsPrivateKeys: false;
  acceptsApiSecrets: false;
  acceptsRawSignatures: false;
  requiresPreviewBeforeExecution: true;
  requiresConfirmationBeforeExecution: true;
  requiresExternalSignerOrProviderHandoff: true;
  publicReceiptRequired: true;
  rollbackFieldRequired: true;
}
```

## Future Provider Integration Checklist

Before a provider is promoted from `future_contract` to `readonly_preview` or `live_beta`:

1. Implement the provider connector behind the shared manifest interface.
2. Verify the preview step returns `canExecute: false` and a `previewSha256`.
3. Implement the confirmation step with expiry and operator acknowledgement.
4. Implement the handoff or execution step without accepting secrets in chat.
5. Emit a public `DecentralizedServiceReceipt` with `rollbackAvailable` set correctly.
6. Add provider-specific tests under `scripts/` or `apps/server/src/tools/`.
7. Update this doc with the real provider manifest and any capability-specific disclosures.

## References In Repo

- Typed schema: `packages/types/src/decentralized-services.ts`
- Static contract test: `scripts/decentralized-services-contract.test.mjs`
- Safety pattern reference: `packages/types/src/markets.ts`
