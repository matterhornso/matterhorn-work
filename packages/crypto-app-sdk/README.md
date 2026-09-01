# Matterhorn Crypto App SDK

This package builds signed-manifest requests and runs an advisory local policy check for Matterhorn Crypto App Gateway adapters.

The SDK is deliberately non-custodial:

- It never accepts a private key, seed phrase, wallet export, or API credential.
- It returns deterministic UTF-8 bytes for an external Ed25519 signer.
- It accepts only the detached 64-byte signature in base64url form.
- Local policy results are not certification. Matterhorn revalidates the signature, static policy, live transport, adversarial output, and runtime behavior independently.
- All financial actions must remain `prepare` or `simulate`; the connected wallet is the only submission surface.

## Minimal flow

```ts
import {
  attachCryptoAppManifestSignature,
  buildCryptoAppSigningRequest,
  defineCryptoAppManifest,
  emulateCryptoAppPolicy,
  validateCryptoAppFixture,
} from "@matterhorn-work/crypto-app-sdk";

const draft = defineCryptoAppManifest({
  appId: "your-team.sui-testnet",
  displayName: "Your Sui Testnet Adapter",
  description: "Bounded public reads and wallet-reviewed transaction preparation.",
  manifestRevision: "1.0.0",
  publisher: { id: "your-team", keyId: "publisher-1", algorithm: "ed25519" },
  transport: { kind: "openapi", endpoint: "https://adapter.example/v1" },
  authentication: { type: "none", scopes: [] },
  networks: [{ protocol: "sui", chainId: "sui:testnet", environment: "testnet" }],
  actions: [/* closed, typed read/watch/prepare/simulate actions */],
  support: {
    privacyPolicyUrl: "https://example.com/privacy",
    securityContact: "security@example.com",
    statusUrl: "https://status.example.com",
  },
});

const signingRequest = buildCryptoAppSigningRequest(draft);

// Send signingRequest.canonicalPayload to your own HSM, KMS, or offline
// Ed25519 signing process. Do not pass the private key to this SDK.
const detachedSignature = await yourSigner(signingRequest.canonicalPayload);

const manifest = attachCryptoAppManifestSignature(draft, detachedSignature);
const localReport = emulateCryptoAppPolicy(manifest, "testnet");

const fixtureReport = validateCryptoAppFixture(manifest, {
  actionId: "your_read_action",
  input: { /* declared closed-schema input */ },
  output: { /* sample adapter output; undeclared fields are removed */ },
});
```

Submit the signed manifest through an invite-only Matterhorn developer account. A passing local report is only a fast feedback loop; it cannot register, certify, connect, execute, sign, relay, or submit anything.
