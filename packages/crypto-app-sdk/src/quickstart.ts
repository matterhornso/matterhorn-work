import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  validateMatterhornCryptoAppManifest,
  type MatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import { validateCryptoAppFixture } from "./fixture.js";
import { validateCryptoAppSchemaDefinition } from "./json-schema.js";
import {
  createMatterhornBittensorTestnetFixturePack,
  createMatterhornHyperliquidTestnetFixturePack,
  createMatterhornSuiTestnetFixturePack,
  type MatterhornCryptoProtocolFixturePack,
} from "./protocol-fixtures.js";
import type { MatterhornUnsignedCryptoAppManifest } from "./index.js";

export const MATTERHORN_CRYPTO_APP_QUICKSTART_VERSION =
  "matterhorn.crypto-app-quickstart.v1" as const;

export type MatterhornCryptoAppQuickstartProtocol =
  | "sui"
  | "hyperliquid"
  | "bittensor";

export type MatterhornCryptoAppQuickstartOptions = {
  protocol: MatterhornCryptoAppQuickstartProtocol;
  appId: string;
  publisherId: string;
  publisherKeyId?: string;
  displayName?: string;
  manifestRevision?: string;
  endpoint: string;
  privacyPolicyUrl?: string;
  securityContact?: string;
  statusUrl?: string | null;
};

export type MatterhornCryptoAppQuickstartCommandOptions = Pick<
  MatterhornCryptoAppQuickstartOptions,
  "protocol" | "appId" | "endpoint"
> & {
  outputDirectory: string;
};

export type MatterhornCryptoAppQuickstartArtifact = {
  path: string;
  content: string;
};

export type MatterhornCryptoAppQuickstart = {
  version: typeof MATTERHORN_CRYPTO_APP_QUICKSTART_VERSION;
  protocol: MatterhornCryptoAppQuickstartProtocol;
  network: "sui:testnet" | "hyperliquid:testnet" | "bittensor:test";
  manifest: MatterhornUnsignedCryptoAppManifest;
  validation: {
    passed: true;
    manifest: "passed";
    schemas: "passed";
    fixture: "passed";
    certificationAuthority: "none";
    runtimeProbesRequired: true;
  };
  safety: {
    testnetOnly: true;
    credentialsIncluded: false;
    walletAuthorityIncluded: false;
    signingKeyIncluded: false;
    certificationGranted: false;
  };
  artifacts: MatterhornCryptoAppQuickstartArtifact[];
  nextSteps: string[];
};

export class MatterhornCryptoAppQuickstartError extends Error {
  constructor(
    public readonly code:
      | "quickstart_options_invalid"
      | "quickstart_manifest_invalid"
      | "quickstart_fixture_invalid",
    public readonly issues: string[] = [],
  ) {
    super(code);
    this.name = "MatterhornCryptoAppQuickstartError";
  }
}

type JsonSchema = Record<string, unknown>;
type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

const PROTOCOL_COPY: Record<MatterhornCryptoAppQuickstartProtocol, {
  displayName: string;
  actionTitle: string;
  actionDescription: string;
  risk: "informational" | "private_data";
}> = {
  sui: {
    displayName: "Sui Testnet Reader",
    actionTitle: "Read a Sui balance",
    actionDescription: "Read one public Sui balance with current checkpoint evidence.",
    risk: "private_data",
  },
  hyperliquid: {
    displayName: "Hyperliquid Testnet Reader",
    actionTitle: "Read Hyperliquid markets",
    actionDescription: "Read current public testnet market evidence.",
    risk: "informational",
  },
  bittensor: {
    displayName: "Bittensor Testnet Reader",
    actionTitle: "List Bittensor subnets",
    actionDescription: "Read a bounded list of public testnet subnet evidence.",
    risk: "informational",
  },
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function schemaFor(value: unknown): JsonSchema {
  if (value === null) return { type: "null" };
  if (typeof value === "string") return { type: "string", maxLength: 100_000 };
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number") {
    return { type: Number.isInteger(value) ? "integer" : "number" };
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new MatterhornCryptoAppQuickstartError(
        "quickstart_fixture_invalid",
        ["fixture_array_must_not_be_empty"],
      );
    }
    return {
      type: "array",
      items: schemaFor(value[0]),
      maxItems: 1_000,
    };
  }
  if (!record(value)) {
    throw new MatterhornCryptoAppQuickstartError(
      "quickstart_fixture_invalid",
      ["fixture_value_unsupported"],
    );
  }
  const entries = Object.entries(value);
  return {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(
      entries.map(([key, item]) => [key, schemaFor(item)]),
    ),
    required: entries.map(([key]) => key),
  };
}

function packFor(
  protocol: MatterhornCryptoAppQuickstartProtocol,
): MatterhornCryptoProtocolFixturePack {
  if (protocol === "sui") return createMatterhornSuiTestnetFixturePack();
  if (protocol === "hyperliquid") {
    return createMatterhornHyperliquidTestnetFixturePack();
  }
  if (protocol === "bittensor") {
    return createMatterhornBittensorTestnetFixturePack();
  }
  throw new MatterhornCryptoAppQuickstartError(
    "quickstart_options_invalid",
    ["protocol_unsupported"],
  );
}

function canonicalSupportDefaults(endpoint: string): {
  privacyPolicyUrl: string;
  securityContact: string;
  statusUrl: string;
} {
  try {
    const parsed = new URL(endpoint);
    return {
      privacyPolicyUrl: `${parsed.origin}/privacy`,
      securityContact: `security@${parsed.hostname}`,
      statusUrl: `${parsed.origin}/status`,
    };
  } catch {
    throw new MatterhornCryptoAppQuickstartError(
      "quickstart_options_invalid",
      ["endpoint_invalid"],
    );
  }
}

function shellArgument(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/**
 * Builds a copyable local command after applying the same manifest boundary as
 * the generated starter. It never executes the command or contacts a network.
 */
export function createMatterhornCryptoAppQuickstartCommand(
  options: MatterhornCryptoAppQuickstartCommandOptions,
): string {
  const outputDirectory = options.outputDirectory?.trim();
  if (
    !outputDirectory
    || outputDirectory.length > 512
    || /[\u0000-\u001f\u007f]/.test(outputDirectory)
  ) {
    throw new MatterhornCryptoAppQuickstartError(
      "quickstart_options_invalid",
      ["output_directory_invalid"],
    );
  }
  const publisherId = options.appId?.split(/[._-]/, 1)[0] ?? "";
  const quickstart = createMatterhornCryptoAppQuickstart({
    protocol: options.protocol,
    appId: options.appId,
    publisherId,
    endpoint: options.endpoint,
  });
  return [
    "pnpm create:crypto-app -- \\",
    `  --protocol ${shellArgument(quickstart.protocol)} \\`,
    `  --app-id ${shellArgument(quickstart.manifest.appId)} \\`,
    `  --endpoint ${shellArgument(quickstart.manifest.transport.endpoint)} \\`,
    `  --output-dir ${shellArgument(outputDirectory)}`,
  ].join("\n");
}

function candidateManifest(
  manifest: MatterhornUnsignedCryptoAppManifest,
): MatterhornCryptoAppManifest {
  return {
    version: MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
    ...structuredClone(manifest),
    publisher: {
      ...manifest.publisher,
      signature: "pending-detached-signature",
    },
  };
}

function jsonArtifact(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function canonicalValue(value: unknown): CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (record(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return String(value);
}

function adapterSource(input: {
  appId: string;
  manifestRevision: string;
  actionId: string;
  network: string;
  output: unknown;
}): string {
  return `type MatterhornLocalCall = {
  appId: string;
  manifestRevision: string;
  actionId: string;
  network: string;
  arguments: Record<string, unknown>;
};

const FIXTURE_OUTPUT = ${JSON.stringify(input.output, null, 2)} as Record<string, unknown>;

// This callback is local, testnet-only, and has no credential, wallet, signer,
// relay, or submission API. Replace the fixture data with your own bounded
// testnet read while preserving the returned envelope.
export async function invokeMatterhornTestAdapter(call: MatterhornLocalCall) {
  if (
    call.appId !== ${JSON.stringify(input.appId)}
    || call.manifestRevision !== ${JSON.stringify(input.manifestRevision)}
    || call.actionId !== ${JSON.stringify(input.actionId)}
    || call.network !== ${JSON.stringify(input.network)}
  ) {
    throw new Error("unsupported_test_call");
  }

  const observedAt = new Date().toISOString();
  const data = structuredClone(FIXTURE_OUTPUT);
  if ("observedAt" in data) data.observedAt = observedAt;
  return {
    data,
    source: "developer-owned-test-adapter",
    observedAt,
    blockOrVersion: "local-test-fixture",
  };
}
`;
}

function readmeSource(input: {
  appId: string;
  actionId: string;
  network: string;
}): string {
  return `# ${input.appId} Matterhorn starter

This starter contains one inert, read-only ${input.network} action. Generation
already passed Matterhorn's manifest, schema, fixture, testnet, and wallet-boundary
checks. It has not contacted an adapter or granted certification.

## Files

- \`manifest.unsigned.json\` — review this public manifest before signing.
- \`signing-request.json\` — send only its canonical payload to your external Ed25519 signer.
- \`fixture-pack.json\` — inert input and output for \`${input.actionId}\`.
- \`adapter.example.ts\` — developer-owned local callback with no network or wallet client.
- \`validation-report.json\` — local advisory checks from generation time.

## Next steps

1. Replace the example callback data with a bounded testnet read.
2. Run the callback through \`runMatterhornCryptoAppLocalAdapter()\` from the SDK.
3. Sign the canonical payload in your own HSM, KMS, or offline Ed25519 boundary.
4. Attach only the detached signature with \`attachCryptoAppManifestSignature()\`.
5. Submit the signed testnet manifest through an invited Matterhorn developer account.

Matterhorn independently repeats policy, egress, schema, isolation, timeout,
replay, quota, circuit, and wallet-boundary probes. A local pass is never
certification. Financial actions must stop at connected-wallet review.
`;
}

/**
 * Produces an inert, locally validated testnet starter. It performs no I/O,
 * generates no key material, contacts no adapter, and grants no authority.
 */
export function createMatterhornCryptoAppQuickstart(
  options: MatterhornCryptoAppQuickstartOptions,
): MatterhornCryptoAppQuickstart {
  if (!options || !["sui", "hyperliquid", "bittensor"].includes(options.protocol)) {
    throw new MatterhornCryptoAppQuickstartError(
      "quickstart_options_invalid",
      ["protocol_unsupported"],
    );
  }
  const pack = packFor(options.protocol);
  const fixture = pack.fixtures[0];
  if (!fixture) {
    throw new MatterhornCryptoAppQuickstartError(
      "quickstart_fixture_invalid",
      ["fixture_missing"],
    );
  }
  const defaults = canonicalSupportDefaults(options.endpoint);
  const copy = PROTOCOL_COPY[options.protocol];
  const manifest: MatterhornUnsignedCryptoAppManifest = {
    appId: options.appId,
    displayName: options.displayName ?? copy.displayName,
    description: `${copy.actionDescription} Matterhorn never gives this adapter signing or submission authority.`,
    manifestRevision: options.manifestRevision ?? "0.1.0",
    publisher: {
      id: options.publisherId,
      keyId: options.publisherKeyId ?? "publisher-1",
      algorithm: "ed25519",
    },
    transport: { kind: "matterhorn_sdk", endpoint: options.endpoint },
    authentication: { type: "none", scopes: [] },
    networks: [{
      protocol: pack.protocol,
      chainId: pack.network,
      environment: "testnet",
    }],
    actions: [{
      id: fixture.actionId,
      title: copy.actionTitle,
      description: copy.actionDescription,
      access: "read",
      risk: copy.risk,
      inputSchema: schemaFor(fixture.input),
      outputProjectionSchema: schemaFor(fixture.output),
      requiredScopes: [],
      requiresFreshness: true,
      freshnessMaxAgeMs: 30_000,
      timeoutMs: 10_000,
      simulationRequired: false,
      walletSubmissionOnly: true,
      agentMaySubmit: false,
    }],
    support: {
      privacyPolicyUrl: options.privacyPolicyUrl ?? defaults.privacyPolicyUrl,
      securityContact: options.securityContact ?? defaults.securityContact,
      statusUrl: options.statusUrl === undefined
        ? defaults.statusUrl
        : options.statusUrl,
    },
  };

  const candidate = candidateManifest(manifest);
  const manifestIssues = validateMatterhornCryptoAppManifest(candidate);
  const schemaIssues = manifest.actions.flatMap((action) => [
    ...validateCryptoAppSchemaDefinition(action.inputSchema)
      .map((issue) => `action:${action.id}:input:${issue}`),
    ...validateCryptoAppSchemaDefinition(action.outputProjectionSchema)
      .map((issue) => `action:${action.id}:output:${issue}`),
  ]);
  const issues = [...new Set([...manifestIssues, ...schemaIssues])];
  if (issues.length > 0) {
    throw new MatterhornCryptoAppQuickstartError(
      "quickstart_manifest_invalid",
      issues,
    );
  }
  const fixtureReport = validateCryptoAppFixture(candidate, fixture);
  if (!fixtureReport.passed) {
    throw new MatterhornCryptoAppQuickstartError(
      "quickstart_fixture_invalid",
      [...fixtureReport.input.issues, ...fixtureReport.output.issues],
    );
  }

  const validation = {
    passed: true,
    manifest: "passed",
    schemas: "passed",
    fixture: "passed",
    certificationAuthority: "none",
    runtimeProbesRequired: true,
  } as const;
  const safety = {
    testnetOnly: true,
    credentialsIncluded: false,
    walletAuthorityIncluded: false,
    signingKeyIncluded: false,
    certificationGranted: false,
  } as const;
  const signingRequest = {
    version: "matterhorn.crypto-app-signing-request.v1",
    appId: manifest.appId,
    manifestRevision: manifest.manifestRevision,
    publisherId: manifest.publisher.id,
    publisherKeyId: manifest.publisher.keyId,
    algorithm: "ed25519",
    canonicalPayload: JSON.stringify(canonicalValue({
      ...candidate,
      publisher: {
        id: manifest.publisher.id,
        keyId: manifest.publisher.keyId,
        algorithm: "ed25519",
      },
    })),
    payloadEncoding: "utf8",
    signatureEncoding: "base64url",
  };
  const singleFixturePack: MatterhornCryptoProtocolFixturePack = {
    ...pack,
    fixtures: [structuredClone(fixture)],
  };
  const artifacts: MatterhornCryptoAppQuickstartArtifact[] = [
    { path: "manifest.unsigned.json", content: jsonArtifact(manifest) },
    { path: "signing-request.json", content: jsonArtifact(signingRequest) },
    { path: "fixture-pack.json", content: jsonArtifact(singleFixturePack) },
    {
      path: "adapter.example.ts",
      content: adapterSource({
        appId: manifest.appId,
        manifestRevision: manifest.manifestRevision,
        actionId: fixture.actionId,
        network: pack.network,
        output: fixture.output,
      }),
    },
    {
      path: "validation-report.json",
      content: jsonArtifact({
        version: MATTERHORN_CRYPTO_APP_QUICKSTART_VERSION,
        appId: manifest.appId,
        network: pack.network,
        validation,
        safety,
      }),
    },
    {
      path: "README.md",
      content: readmeSource({
        appId: manifest.appId,
        actionId: fixture.actionId,
        network: pack.network,
      }),
    },
  ];

  return {
    version: MATTERHORN_CRYPTO_APP_QUICKSTART_VERSION,
    protocol: options.protocol,
    network: pack.network,
    manifest: structuredClone(manifest),
    validation,
    safety,
    artifacts,
    nextSteps: [
      "Replace the inert fixture callback with one bounded testnet read.",
      "Run it through the SDK local adapter runner.",
      "Sign the canonical payload outside Matterhorn.",
      "Submit the signed manifest from an invited developer account.",
    ],
  };
}
