# Matterhorn Crypto App SDK

This package builds signed-manifest requests and runs an advisory local policy check for Matterhorn Crypto App Gateway adapters.

## Distribution status

The package is prepared for registry publication but is not published yet. Its
release artifact is self-contained: normal ESM imports and TypeScript
declarations have no dependency on a private Matterhorn workspace package. The
mandatory clean-package test packs the exact artifact, installs it offline into
an empty Node project, compiles a TypeScript consumer, imports both public entry
points, and runs the quickstart binary. Registry publication and provenance
attestation remain an operator release step. Publication uses the manual,
environment-approved `.github/workflows/publish-crypto-app-sdk.yml` workflow;
the complete operator procedure is in
`docs/crypto-coworkers/crypto-app-sdk-release.md`. The workflow accepts no npm
token, binds the package version and immutable tag to the exact `dev` commit,
publishes one tested archive with npm OIDC trusted publishing, and immediately
verifies the public artifact's signatures and provenance.

After an approved release, verify the exact public artifact before allowing it
into developer acceptance evidence:

```bash
pnpm verify:crypto-app-sdk-provenance -- \
  --version 0.1.0 \
  --expected-commit <exact-40-character-git-commit> \
  --json
```

The verifier downloads only the fixed Matterhorn package from npm's public
registry, disables lifecycle scripts, strips npm credentials from the child
environment, validates registry signatures and transparency-backed publish and
SLSA provenance attestations, and binds the artifact to the fixed Matterhorn
repository, release workflow, and exact commit. It never publishes or promotes
anything and does not include raw attestations in its report.

After an approved registry release, developers will be able to install and run
the same reviewed artifact with:

```bash
pnpm add @matterhorn-work/crypto-app-sdk
pnpm dlx --package @matterhorn-work/crypto-app-sdk create-matterhorn-crypto-app --help
```

Until that release exists, use the repository command below. Do not substitute
an unverified package with a similar name.

The SDK is deliberately non-custodial:

- It never accepts a private key, seed phrase, wallet export, or API credential.
- It returns deterministic UTF-8 bytes for an external Ed25519 signer.
- It accepts only the detached 64-byte signature in base64url form.
- Local policy results are not certification. Matterhorn revalidates the signature, static policy, live transport, adversarial output, and runtime behavior independently.
- All financial actions must remain `prepare` or `simulate`; the connected wallet is the only submission surface.
- Action identifiers use canonical lowercase snake case. Names that claim signing, submission, relay, broadcast, or unqualified execution authority are rejected before signing. Timing and freshness contracts must be finite, integral, and internally consistent.
- Every input and model-facing output property uses a bounded ASCII identifier. Secret, credential, signature, signing-payload, transaction-byte, and sign/submit/relay/broadcast authority names are rejected at every schema depth.
- Schema admission and runtime projection have global traversal budgets in addition to depth, array, object-property, and string bounds, so wide or nested payloads fail closed before they can exhaust the gateway.
- Schema descriptions, constants, enums, bounds, and unions are closed and bounded. Embedded credential literals, contradictory bounds, ignored `oneOf` siblings, and attacker-controlled error-path text fail closed.
- Unsafe schemas fail before the SDK emits signing bytes or the local runner invokes a developer callback.

## One-command testnet starter

From a Matterhorn checkout, create a locally validated read-only starter:

```bash
pnpm create:crypto-app -- \
  --protocol sui \
  --app-id acme.sui-testnet \
  --endpoint https://adapter.acme.example/v1 \
  --output-dir ./acme-sui
```

The new directory contains an unsigned manifest, canonical external-signing
request, inert fixture pack, developer-owned callback, validation report, and
next-step guide. Generation is atomic and refuses an existing output directory.
It performs no network request and creates no key, credential, wallet access,
certification, financial action, or mainnet authority. Hyperliquid and Bittensor
testnet starters use the same command with `--protocol hyperliquid` or
`--protocol bittensor`. Enrolled developers can build and copy the same validated
command from Matterhorn's invite-only crypto app certification page.

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
- Generated MCP targets set `MATTERHORN_WORK_MCP_PROFILE=guarded_client`, exposing only the authoritative workspace session workflow and rejecting hidden tools before any server request.
- It accepts HTTPS origins plus loopback HTTP for local development and rejects credential-bearing or path-bearing URLs.
- MCP targets require an absolute trusted repository path. The MCP packages are not published to npm yet, so generated setup never claims that `npx` can install them.
- Generated Matterhorn Skill instructions treat tool output as untrusted data and preserve connected-wallet-only signing and submission.

The output is versioned as `matterhorn.crypto-app-integration-setup.v1`. Its deterministic verification checklist confirms the client connection, workspace scope, focused tool scope, and wallet boundary without accepting a credential value. It does not connect a client, start a process, contact a server, read a filesystem, or certify an integration.
