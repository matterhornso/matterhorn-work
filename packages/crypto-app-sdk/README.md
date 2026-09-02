# Matterhorn Crypto App SDK

This package builds signed-manifest requests and runs an advisory local policy check for Matterhorn Crypto App Gateway adapters.

The SDK is deliberately non-custodial:

- It never accepts a private key, seed phrase, wallet export, or API credential.
- It returns deterministic UTF-8 bytes for an external Ed25519 signer.
- It accepts only the detached 64-byte signature in base64url form.
- Local policy results are not certification. Matterhorn revalidates the signature, static policy, live transport, adversarial output, and runtime behavior independently.
- All financial actions must remain `prepare` or `simulate`; the connected wallet is the only submission surface.
- Every input and model-facing output property uses a bounded ASCII identifier. Secret, credential, signature, signing-payload, transaction-byte, and sign/submit/relay/broadcast authority names are rejected at every schema depth.
- Schema admission and runtime projection have global traversal budgets in addition to depth, array, object-property, and string bounds, so wide or nested payloads fail closed before they can exhaust the gateway.
- Schema descriptions, constants, enums, bounds, and unions are closed and bounded. Embedded credential literals, contradictory bounds, ignored `oneOf` siblings, and attacker-controlled error-path text fail closed.
- Unsafe schemas fail before the SDK emits signing bytes or the local runner invokes a developer callback.

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

Reference Sui, Hyperliquid, and read-only Bittensor testnet fixture packs are also available for inert schema checks:

```ts
import {
  createMatterhornBittensorTestnetFixturePack,
  createMatterhornSuiTestnetFixturePack,
  validateMatterhornCryptoProtocolFixturePack,
} from "@matterhorn-work/crypto-app-sdk";

const pack = createMatterhornSuiTestnetFixturePack();
const report = validateMatterhornCryptoProtocolFixturePack(manifest, pack);

// The Bittensor pack contains only subnet and validator public-read examples.
const bittensorPack = createMatterhornBittensorTestnetFixturePack();
```

Fixture packs contain no credentials or signing material and perform no I/O. They do not replace Matterhorn's live adversarial probes or testnet certification.

For a live developer test, use the advisory local runner with your own test-only invocation callback:

```ts
import { runMatterhornCryptoAppLocalAdapter } from "@matterhorn-work/crypto-app-sdk";

const report = await runMatterhornCryptoAppLocalAdapter({
  manifest,
  actionId: "your_read_action",
  network: "sui:testnet",
  arguments: { address: "0x..." },
}, {
  invoke: async (call, { signal }) => {
    // Call your test adapter in your own development boundary. Return only:
    // { data, source, observedAt, blockOrVersion }.
    return invokeYourTestAdapter(call, signal);
  },
});
```

The local runner never creates a network client or accepts headers, API credentials, wallets, signers, submit methods, or mainnet targets. It rejects secret-shaped inputs, validates the exact call and closed output projection, enforces freshness, timeout, abort, and response-size bounds, and normalizes adapter failures without returning upstream messages. Its result always states `certificationAuthority: "none"`; only Matterhorn's independent runtime harness can certify an adapter.

Submit the signed manifest through an invite-only Matterhorn developer account. A passing local report is only a fast feedback loop; it cannot register, certify, connect, execute, sign, relay, or submit anything.

The optional account client follows the same narrow boundary:

```ts
import { createMatterhornCryptoDeveloperClient } from "@matterhorn-work/crypto-app-sdk";

const developer = createMatterhornCryptoDeveloperClient(); // same-origin, signed-in account cookie
const { status } = await developer.getStatus(); // one deterministic next step; testnet only
await developer.registerPublisherKey({
  keyId: "publisher-key-1",
  algorithm: "ed25519",
  publicKeyPem: yourPublicKeyPem,
});
const staged = await developer.submitTestnetManifest(manifest);
if (staged.staticReport.passed) {
  await developer.requestTestnetCertification(staged.appId, staged.manifestRevision);
}
// Poll getStatus() or listSubmissions() for a redacted passed/failed runtime review.
```

The account client has no operator, registry-promotion, execution, wallet, credential, or mainnet methods. Runtime evidence hashes remain host-only; the developer sees the failed probe names and affected action IDs needed for a new immutable revision. A passed review still does not list or promote the app. Keep the private signing key in your own HSM/KMS or offline signer.

## Safe agent setup

`createMatterhornCryptoIntegrationSetup()` produces inert setup material for Codex, Claude Code, generic MCP clients, the Matterhorn Skill instructions, the Matterhorn CLI, or the authenticated HTTP API.

```ts
import { createMatterhornCryptoIntegrationSetup } from "@matterhorn-work/crypto-app-sdk";

const setup = createMatterhornCryptoIntegrationSetup({
  target: "codex",
  repositoryPath: "/absolute/path/to/matterhorn-work",
  serverOrigin: "http://127.0.0.1:8787",
});

console.log(setup.artifacts[0]?.content);
```

The setup contract is deliberately client-only:

- It never accepts or returns token values, host approval authority, wallet submission authority, private keys, or signatures.
- It uses only `MATTERHORN_WORK_TOKEN`, supplied through the trusted client environment.
- It accepts HTTPS origins plus loopback HTTP for local development and rejects credential-bearing or path-bearing URLs.
- MCP targets require an absolute trusted repository path. The MCP packages are not published to npm yet, so generated setup never claims that `npx` can install them.
- Generated Matterhorn Skill instructions treat tool output as untrusted data and preserve connected-wallet-only signing and submission.

The output is versioned as `matterhorn.crypto-app-integration-setup.v1`. It does not connect a client, start a process, contact a server, read a filesystem, or certify an integration.
