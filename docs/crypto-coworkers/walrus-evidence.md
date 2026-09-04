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

The local encrypted envelope and the public Walrus payload are deliberately different contracts. The local envelope retains the opaque KMS key reference and plaintext payload hash for authorized recovery. The public `matterhorn.walrus-ciphertext.v1` bytes contain only the algorithm, random IV, authentication tag, and ciphertext. The ciphertext hash is computed over those exact public bytes; it is not embedded in the plaintext bundle, which would create a circular integrity field. Walrus certification and Merkle proof metadata are also stored beside the local envelope rather than inside it: putting a proof of a ciphertext inside that ciphertext would create the same circular dependency.

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

- Financial and research/chat evidence remain local unless the user explicitly publishes one exact encrypted revision.
- New user-controlled publications use deletable blobs whose Sui object owner is the connected wallet, plus a stated expiry/renewal policy. Matterhorn independently verifies that exact owner before accepting proof metadata.
- A non-content batch anchor can be permanent and cannot be removed; the UI must disclose this before enabling evidence publication.
- Wallet-controlled deletion prepares and simulates one exact short-lived Sui transaction, then waits for the owning wallet to sign and submit it. Only after pinned Sui verification of the exact digest, signer, object, and successful effects does Matterhorn destroy the local recovery key. Legacy or publisher-owned objects remain key-destruction-only. Account/workspace deletion removes local content and wrapped keys, but must not promise erasure of public caches or independently copied ciphertext.
- A bounded read-only verifier checks published run evidence at startup and every six hours. It rechecks the exact ciphertext hash, Merkle proof, pinned Sui certification, and independent Walrus readback, then stores only a revision-bound redacted status. It never publishes, renews, signs, or submits.
- An optional immutable Sui testnet anchor is a separate, explicit wallet action. It stores only the schema version, a one-publication batch ID, Merkle root, Walrus object ID, and certification epochs. It never stores account, workspace, coworker, wallet, prompt, key, signature, or plaintext fields. Matterhorn prepares and simulates five-minute transaction bytes, but the connected wallet remains the only signer, payer, and submitter.

## Publisher security

- Use an authenticated Matterhorn publisher/upload relay or supported SDK; do not expose an unrestricted publisher to browsers or agents.
- Publisher credentials are server-only and independent from model, email, backup, wallet, and application credentials.
- The publisher accepts ciphertext only after evidence validation succeeds.
- The publisher receives no plaintext data key.
- Size, cost, rate, workspace quota, and retention limits are enforced before upload.
- A returned blob ID is untrusted until Sui certification and the expected ciphertext hash are verified.
- The relay must accept the serialized public ciphertext contract, never the tenant-local encrypted envelope. Key references and plaintext hashes are rejected at the publisher boundary.
- The evidence transport is HTTPS peer-pinned after public-DNS resolution, supports only a fixed `PUT /v1/blobs?epochs=<configured>` and strict `GET /v1/blobs/by-object-id/<publisher-object>?strict_consistency_check=true`, refuses redirects, bounds both directions, and requires a server-only bearer credential.
- A publisher response is not certification. Matterhorn accepts a proof only after a separate pinned Sui testnet verifier confirms the exact blob/object binding and epoch window, then the aggregator returns byte-for-byte identical public ciphertext.

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

## Implemented local foundation

- Finalized guarded receipts compile through a closed projection that hashes tenant, run, coworker, data-category, tool, evidence-reference, reviewed-intent, and public-receipt identifiers.
- Per-bundle random correlation salt prevents stable identity hashes across publications.
- Pending runs and unknown/forbidden evidence fields fail before encryption.
- AES-256-GCM encryption authenticates the tenant-local key reference and plaintext hash as AAD.
- The plaintext data key is zeroed after sealing, including error paths.
- AWS KMS produces AES-256 data keys and retains only the KMS-wrapped `CiphertextBlob`. Its CloudTrail-visible encryption context contains a random-nonce-bound digest rather than a tenant, run, coworker, account, or wallet identifier.
- Scheduled rotation uses KMS `ReEncrypt` with the exact source and destination encryption context; plaintext key material never leaves KMS during rewrapping.
- The tenant-scoped SQLite index contains ciphertext and wrapped key material only. Key destruction clears the wrapped key and local envelope with `secure_delete`, then truncates the WAL before reporting success.
- Evidence-key access receipts are content-free, tenant-scoped, hash-chained, and expire with the minimal 365-day security window.
- Finalized coworker-bound runs are automatically sealed once into tenant-local encrypted evidence. This does not publish, anchor, sign, or submit anything; Walrus publication remains a separate explicit flow.
- Public serialization excludes the key reference and plaintext hash.
- Deterministic, order-independent Merkle batches verify ciphertext modification and reject duplicate or mismatched leaves.
- No publisher, Walrus network call, Sui anchor, or mainnet write is enabled by default. The audited testnet-only Move package lives in `packages/matterhorn-evidence-anchor`; its dependency revision, source hashes, and production module digest are pinned in `release-manifest.json`. Anchoring remains unavailable until an operator publishes that exact package and sets `MATTERHORN_EVIDENCE_ANCHOR_PACKAGE_ID`. At startup Matterhorn independently reads the configured package through its pinned Sui testnet transport and requires the exact first-version package identity, only the `evidence_anchor` module, and the audited bytecode digest. A missing, upgraded, extra-module, substituted, unreachable, or malformed package keeps anchoring unavailable and fails readiness without exposing the package ID.
- The authenticated account boundary exposes redacted proof listing, exact-revision testnet publication, live verification, automatic read-only verification health, exact-revision recovery-key deletion, and wallet-only deletion of eligible connected-wallet-owned objects. Publication, renewal, deletion, and key destruction share durable single-use state so they cannot race across server workers. Verification status is invalidated by any evidence revision, excludes tenant, wallet-address, and key material, and is refreshed in a bounded four-worker batch. The certification verifier remains an independent Sui boundary, so an upload relay can never certify its own response.
- When configured and bytecode-verified, `POST /workspace/:id/crypto-evidence/:evidenceId/anchor` prepares one exact testnet anchor after re-verifying the current Walrus certification. `.../anchor/confirm` accepts the reviewed digest only once after pinned Sui verification proves the exact sender, gas owner, package, function, five BCS arguments, successful effects, and one newly created immutable anchor object. Mutation, replay, tenant substitution, extra commands, and mainnet requests fail closed. Before publication, rebuild with the compiler recorded in `release-manifest.json`, verify the emitted production module SHA-256 matches the manifest, publish from a wallet-controlled release account, then confirm `/health/ready` reports `cryptoEvidenceSuiAnchorPackageStatus: verified` before any account test.
