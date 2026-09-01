# Walrus Evidence Boundary

## Decision

Walrus is an integrity and availability layer, not Matterhorn's private operational database. Matterhorn never uploads raw agent logs. It uploads only encrypted, redacted evidence bundles and publishes only non-content hashes/certification references on Sui.

Walrus blobs are public and discoverable, blob IDs are not secrets, and Walrus does not provide native confidentiality or storage-layer access control. Client/server-side encryption is therefore mandatory before publication.

Official references:

- https://docs.wal.app/docs/data-security
- https://docs.wal.app/docs/sites/security/access-control-options
- https://docs.wal.app/docs/walrus-client/storing-blobs
- https://docs.wal.app/docs/production-readiness

## Evidence construction

1. Finalize the local redacted `matterhorn.agent-run-receipt.v1`.
2. Project only the allowlisted `matterhorn.evidence-bundle.v1` fields.
3. Serialize using deterministic canonical JSON.
4. Generate a unique data-encryption key and nonce.
5. Encrypt with AES-256-GCM or XChaCha20-Poly1305.
6. Wrap the data key for authorized workspace recipients through a server-side KMS or a separately accepted Sui-native key system.
7. Hash the ciphertext.
8. Add the ciphertext hash to a batch Merkle tree.
9. Store the ciphertext as a Walrus blob or Quilt patch through an authenticated publisher.
10. Verify blob certification and validity against Sui state.
11. Anchor only the batch ID, Merkle root, schema version, Walrus reference, and epoch/lifetime metadata.
12. Store the user's Merkle proof and decryption-key reference inside the tenant boundary.

## Forbidden public content

- Prompt or response text.
- Attachment or Memory content.
- Account, email, workspace, or wallet identity.
- Private key, seed phrase, wallet export, API credential, or capability bearer token.
- Raw wallet signature.
- Full external tool output.
- Unhashed private transaction intent.
- Stable cross-service user identifiers.

## Lifecycle

- Financial run evidence is eligible for automatic encrypted publication after explicit product disclosure.
- Research/chat evidence remains local unless the user or organization enables publication.
- User-controlled evidence uses deletable blobs and a stated expiry/renewal policy.
- A non-content batch anchor can be permanent and cannot be removed; the UI must disclose this before enabling evidence publication.
- Account/workspace deletion removes local content, queues deletable blob cleanup, and destroys Matterhorn-held wrapped keys. It must not promise erasure of public caches or independently copied ciphertext.
- A scheduled verifier checks certification, remaining epochs, Merkle reconciliation, and renewal state.

## Publisher security

- Use an authenticated Matterhorn publisher/upload relay or supported SDK; do not expose an unrestricted publisher to browsers or agents.
- Publisher credentials are server-only and independent from model, email, backup, wallet, and application credentials.
- The publisher accepts ciphertext only after evidence validation succeeds.
- The publisher receives no plaintext data key.
- Size, cost, rate, workspace quota, and retention limits are enforced before upload.
- A returned blob ID is untrusted until Sui certification and the expected ciphertext hash are verified.

## Phase 0 proof

The first testnet prototype must use synthetic data and demonstrate:

- Canonical receipt projection.
- Forbidden-field rejection.
- Encryption before any network call.
- Authenticated upload boundary.
- Blob certification lookup.
- Merkle proof generation and verification.
- Decryptability only with the authorized test recipient key.
- No plaintext recovery from the public blob, logs, telemetry, or Sui anchor.

