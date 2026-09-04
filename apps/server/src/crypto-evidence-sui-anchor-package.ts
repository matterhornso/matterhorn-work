import { createHash } from "node:crypto";

import { SuiGrpcClient } from "@mysten/sui/grpc";
import { isValidSuiObjectId, normalizeSuiObjectId } from "@mysten/sui/utils";
import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";

import {
  createPinnedSuiGrpcWebFetch,
  type MatterhornGrpcTransportObservation,
} from "./crypto-app-http2-grpc-fetch.js";
import {
  type MatterhornAdapterDnsResolver,
  resolvePublicCryptoAdapterEndpoint,
} from "./crypto-app-egress.js";

const SUI_TESTNET_NETWORK = "sui:testnet" as const;
const EXPECTED_MODULE = "evidence_anchor";
const MAX_MODULE_BYTES = 512 * 1_024;

// This digest is generated from the production (non-test) module emitted by
// `sui move build --dump-bytecode-as-base64` using the compiler and framework
// revision pinned in packages/matterhorn-evidence-anchor/release-manifest.json.
// An operator-provided digest is never trusted as the release authority.
export const MATTERHORN_EVIDENCE_ANCHOR_MODULE_SHA256 =
  "539ced005bc0305c990729c8f0c7f29db271fde69ed043e68e03cb5930735ce2";

export type MatterhornSuiEvidenceAnchorPackageProjection = {
  storageId: string | null;
  originalId: string | null;
  version: bigint | null;
  modules: Array<{ name: string | null; contents: Uint8Array | null }>;
};

export type MatterhornSuiEvidenceAnchorPackageVerification = {
  network: "testnet";
  moduleName: typeof EXPECTED_MODULE;
  moduleSha256: typeof MATTERHORN_EVIDENCE_ANCHOR_MODULE_SHA256;
  verifiedAt: string;
};

export type MatterhornSuiEvidenceAnchorPackageVerifier = (input: {
  network: typeof SUI_TESTNET_NETWORK;
  packageId: string;
  signal: AbortSignal;
}) => Promise<MatterhornSuiEvidenceAnchorPackageVerification>;

type SuiPackageReadClient = {
  getPackage(input: {
    packageId: string;
    signal: AbortSignal;
  }): Promise<MatterhornSuiEvidenceAnchorPackageProjection>;
};

export class MatterhornSuiEvidenceAnchorPackageError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MatterhornSuiEvidenceAnchorPackageError";
  }
}

function fail(code: string): never {
  throw new MatterhornSuiEvidenceAnchorPackageError(code);
}

function canonicalPackageId(value: string): string {
  try {
    const normalized = normalizeSuiObjectId(value);
    if (!isValidSuiObjectId(normalized)) return fail("crypto_evidence_sui_anchor_package_invalid");
    return normalized;
  } catch {
    return fail("crypto_evidence_sui_anchor_package_invalid");
  }
}

function moduleSha256(contents: Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex");
}

function defaultReadClient(input: {
  endpoint: URL;
  approvedAddresses: readonly string[];
  signal: AbortSignal;
  onObservation?: (observation: MatterhornGrpcTransportObservation) => void;
}): SuiPackageReadClient {
  const transport = new GrpcWebFetchTransport({
    baseUrl: input.endpoint.href.replace(/\/$/, ""),
    format: "binary",
    fetch: createPinnedSuiGrpcWebFetch({
      endpoint: input.endpoint,
      approvedAddresses: input.approvedAddresses,
      outerSignal: input.signal,
      onObservation: input.onObservation,
      maxResponseBytes: 2 * 1_024 * 1_024,
    }),
  });
  const client = new SuiGrpcClient({ network: "testnet", transport });
  return {
    async getPackage(request) {
      const response = await client.movePackageService.getPackage({
        packageId: request.packageId,
      }).response;
      const pkg = response.package;
      if (!pkg) fail("crypto_evidence_sui_anchor_package_missing");
      return {
        storageId: pkg.storageId ?? null,
        originalId: pkg.originalId ?? null,
        version: pkg.version ?? null,
        modules: pkg.modules.map((module) => ({
          name: module.name ?? null,
          contents: module.contents ?? null,
        })),
      };
    },
  };
}

/**
 * Verifies the configured testnet package against Matterhorn's checked-in,
 * independently audited bytecode. This read-only verifier is backend-only and
 * cannot sign, execute, relay, publish, upgrade, or submit a transaction.
 */
export function createPinnedSuiEvidenceAnchorPackageVerifier(options: {
  endpoint: URL;
  resolver?: MatterhornAdapterDnsResolver;
  now?: () => Date;
  onObservation?: (observation: MatterhornGrpcTransportObservation) => void;
  createClient?: typeof defaultReadClient;
}): MatterhornSuiEvidenceAnchorPackageVerifier {
  if (options.endpoint.protocol !== "https:"
    || options.endpoint.username
    || options.endpoint.password
    || options.endpoint.search
    || options.endpoint.hash) {
    fail("crypto_evidence_sui_anchor_package_endpoint_invalid");
  }
  const now = options.now ?? (() => new Date());
  const createClient = options.createClient ?? defaultReadClient;
  return async (input) => {
    if (input.network !== SUI_TESTNET_NETWORK) {
      fail("crypto_evidence_sui_anchor_package_mainnet_disabled");
    }
    if (input.signal.aborted) fail("crypto_evidence_sui_anchor_package_aborted");
    const packageId = canonicalPackageId(input.packageId);
    let projection: MatterhornSuiEvidenceAnchorPackageProjection;
    try {
      const resolved = await resolvePublicCryptoAdapterEndpoint(options.endpoint.href, options.resolver);
      projection = await createClient({
        endpoint: resolved.endpoint,
        approvedAddresses: resolved.approvedAddresses,
        signal: input.signal,
        onObservation: options.onObservation,
      }).getPackage({ packageId, signal: input.signal });
    } catch (error) {
      if (error instanceof MatterhornSuiEvidenceAnchorPackageError) throw error;
      if (input.signal.aborted) fail("crypto_evidence_sui_anchor_package_aborted");
      fail("crypto_evidence_sui_anchor_package_lookup_failed");
    }
    if (projection.storageId === null
      || canonicalPackageId(projection.storageId) !== packageId
      || projection.originalId === null
      || canonicalPackageId(projection.originalId) !== packageId
      || projection.version !== 1n) {
      fail("crypto_evidence_sui_anchor_package_identity_mismatch");
    }
    if (projection.modules.length !== 1) {
      fail("crypto_evidence_sui_anchor_package_modules_mismatch");
    }
    const module = projection.modules[0]!;
    if (module.name !== EXPECTED_MODULE
      || !(module.contents instanceof Uint8Array)
      || module.contents.byteLength < 1
      || module.contents.byteLength > MAX_MODULE_BYTES) {
      fail("crypto_evidence_sui_anchor_package_modules_mismatch");
    }
    if (moduleSha256(module.contents) !== MATTERHORN_EVIDENCE_ANCHOR_MODULE_SHA256) {
      fail("crypto_evidence_sui_anchor_package_bytecode_mismatch");
    }
    const verifiedAt = now();
    if (!Number.isFinite(verifiedAt.getTime())) {
      fail("crypto_evidence_sui_anchor_package_clock_invalid");
    }
    return {
      network: "testnet",
      moduleName: EXPECTED_MODULE,
      moduleSha256: MATTERHORN_EVIDENCE_ANCHOR_MODULE_SHA256,
      verifiedAt: verifiedAt.toISOString(),
    };
  };
}
