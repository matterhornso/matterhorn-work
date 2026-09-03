import { SuiGrpcClient } from "@mysten/sui/grpc";
import {
  isValidSuiAddress,
  isValidSuiObjectId,
  normalizeSuiAddress,
  normalizeSuiObjectId,
} from "@mysten/sui/utils";
import { blobIdToInt, walrus } from "@mysten/walrus";
import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";

import {
  createPinnedSuiGrpcWebFetch,
  type MatterhornGrpcTransportObservation,
} from "./crypto-app-http2-grpc-fetch.js";
import type {
  MatterhornWalrusCertification,
  MatterhornWalrusCertificationVerifier,
} from "./crypto-evidence-walrus-publisher.js";

type WalrusBlobObject = {
  id: string;
  blob_id: string;
  certified_epoch: number | null;
  storage: { end_epoch: number };
  deletable: boolean;
};

type SuiWalrusReadClient = {
  walrus: { getBlobObject: (objectId: string) => Promise<WalrusBlobObject> };
  core: {
    getObjects: (input: { objectIds: string[] }) => Promise<{
      objects: Array<{
        objectId: string;
        owner: { $kind: string; AddressOwner?: string };
      } | Error>;
    }>;
  };
  ledgerService: {
    getServiceInfo: (
      request: Record<string, never>,
      options: { abort: AbortSignal },
    ) => { response: Promise<{ epoch?: bigint }> };
  };
};

export type MatterhornSuiWalrusVerifierOptions = {
  endpoint: URL;
  approvedAddresses: readonly string[];
  onObservation?: (observation: MatterhornGrpcTransportObservation) => void;
  createClient?: (input: {
    endpoint: URL;
    approvedAddresses: readonly string[];
    signal: AbortSignal;
    onObservation?: (observation: MatterhornGrpcTransportObservation) => void;
  }) => SuiWalrusReadClient;
};

function safeEpoch(value: unknown, code: string): number {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(number) || Number(number) < 0) throw new Error(code);
  return Number(number);
}

function objectId(value: string): string {
  const normalized = normalizeSuiObjectId(value);
  if (!isValidSuiObjectId(normalized)) throw new Error("crypto_evidence_walrus_object_id_invalid");
  return normalized;
}

function addressOwner(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("crypto_evidence_walrus_owner_invalid");
  }
  const owner = value as { $kind?: unknown; AddressOwner?: unknown };
  if (owner.$kind !== "AddressOwner" || typeof owner.AddressOwner !== "string") {
    throw new Error("crypto_evidence_walrus_wallet_owner_required");
  }
  try {
    const normalized = normalizeSuiAddress(owner.AddressOwner);
    if (!isValidSuiAddress(normalized)) throw new Error();
    return normalized;
  } catch {
    throw new Error("crypto_evidence_walrus_owner_invalid");
  }
}

function defaultClient(input: Parameters<NonNullable<MatterhornSuiWalrusVerifierOptions["createClient"]>>[0]): SuiWalrusReadClient {
  const transport = new GrpcWebFetchTransport({
    baseUrl: input.endpoint.href.replace(/\/$/, ""),
    format: "binary",
    fetch: createPinnedSuiGrpcWebFetch({
      endpoint: input.endpoint,
      approvedAddresses: input.approvedAddresses,
      outerSignal: input.signal,
      onObservation: input.onObservation,
    }),
  });
  const client = new SuiGrpcClient({ network: "testnet", transport }).$extend(walrus());
  return client as unknown as SuiWalrusReadClient;
}

/**
 * Authenticates the Walrus Blob object through the pinned Sui testnet gRPC
 * boundary. This verifier has read authority only: BatchGetObjects for the
 * exact object and GetServiceInfo for the current epoch. ExecuteTransaction,
 * transaction lookup, signing and submission remain outside the allowlist.
 */
export function createPinnedSuiWalrusCertificationVerifier(
  options: MatterhornSuiWalrusVerifierOptions,
): MatterhornWalrusCertificationVerifier {
  const createClient = options.createClient ?? defaultClient;
  return async (input): Promise<MatterhornWalrusCertification> => {
    if (input.network !== "testnet") throw new Error("crypto_evidence_walrus_mainnet_disabled");
    if (input.signal.aborted) throw new Error("crypto_evidence_walrus_aborted");
    const expectedObjectId = objectId(input.suiObjectId);
    let expectedBlobId: bigint;
    try {
      expectedBlobId = blobIdToInt(input.blobId);
    } catch {
      throw new Error("crypto_evidence_walrus_blob_id_invalid");
    }
    const client = createClient({
      endpoint: options.endpoint,
      approvedAddresses: options.approvedAddresses,
      signal: input.signal,
      onObservation: options.onObservation,
    });
    const serviceInfoCall = client.ledgerService.getServiceInfo({}, { abort: input.signal });
    const [blob, serviceInfo, objectResponse] = await Promise.all([
      client.walrus.getBlobObject(expectedObjectId),
      serviceInfoCall.response,
      client.core.getObjects({ objectIds: [expectedObjectId] }),
    ]);
    if (objectResponse.objects.length !== 1 || objectResponse.objects[0] instanceof Error) {
      throw new Error("crypto_evidence_walrus_object_binding_missing");
    }
    const object = objectResponse.objects[0];
    if (objectId(object.objectId) !== expectedObjectId) {
      throw new Error("crypto_evidence_walrus_object_binding_mismatch");
    }
    const ownerAddress = addressOwner(object.owner);
    const observedObjectId = objectId(blob.id);
    if (observedObjectId !== expectedObjectId) throw new Error("crypto_evidence_walrus_object_binding_mismatch");
    let observedBlobId: bigint;
    try {
      observedBlobId = BigInt(blob.blob_id);
    } catch {
      throw new Error("crypto_evidence_walrus_blob_object_invalid");
    }
    if (observedBlobId !== expectedBlobId) throw new Error("crypto_evidence_walrus_blob_binding_mismatch");
    if (blob.certified_epoch === null) throw new Error("crypto_evidence_walrus_not_certified");
    const certifiedEpoch = safeEpoch(blob.certified_epoch, "crypto_evidence_walrus_certified_epoch_invalid");
    const currentEpoch = safeEpoch(serviceInfo.epoch, "crypto_evidence_walrus_current_epoch_invalid");
    const validUntilEpoch = safeEpoch(blob.storage?.end_epoch, "crypto_evidence_walrus_end_epoch_invalid");
    if (certifiedEpoch > currentEpoch || currentEpoch >= validUntilEpoch) {
      throw new Error("crypto_evidence_walrus_certification_expired");
    }
    return {
      network: "testnet",
      blobId: input.blobId,
      suiObjectId: expectedObjectId,
      certifiedEpoch,
      currentEpoch,
      validUntilEpoch,
      deletable: blob.deletable === true,
      ownerAddress,
      suiTransactionDigest: null,
    };
  };
}
