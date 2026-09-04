import { MatterhornCryptoEvidenceVerificationService } from "./crypto-evidence-verification.js";
import { resolvePublicCryptoAdapterEndpoint } from "./crypto-app-egress.js";
import { cryptoCoworkerFeatureConfig } from "./crypto-coworker-config.js";
import type { MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
import {
  createPinnedWalrusEvidenceTransport,
  MatterhornTestnetWalrusEvidencePublisher,
  type MatterhornWalrusCertificationVerifier,
  type MatterhornWalrusEvidenceTransport,
} from "./crypto-evidence-walrus-publisher.js";
import { createPinnedSuiWalrusCertificationVerifier } from "./sui-walrus-certification-verifier.js";
import { SUI_GRPC_URLS } from "./tools/sui.js";

export type MatterhornCryptoEvidenceRuntime = {
  mode: "off" | "testnet";
  available: boolean;
  publicationAvailable: boolean;
  verification: MatterhornCryptoEvidenceVerificationService | null;
  publisher: MatterhornTestnetWalrusEvidencePublisher | null;
  certificationVerifier: MatterhornWalrusCertificationVerifier | null;
};

export type MatterhornCryptoEvidenceRuntimeDependencies = {
  transport?: MatterhornWalrusEvidenceTransport;
  certificationVerifier?: MatterhornWalrusCertificationVerifier;
};

export function matterhornCryptoEvidenceStorageEpochs(env: NodeJS.ProcessEnv): number {
  const value = env.MATTERHORN_WALRUS_STORAGE_EPOCHS?.trim();
  if (!value) return 5;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 53) {
    throw new Error("crypto_evidence_walrus_epochs_invalid");
  }
  return parsed;
}

/**
 * Phase 4 account boundary. Local records are always owner scoped. Testnet
 * publication is available only through an explicit account route that
 * confirms the exact record revision and ciphertext-only disclosure.
 */
export function createMatterhornCryptoEvidenceRuntime(
  env: NodeJS.ProcessEnv,
  store: MatterhornCryptoEvidenceStore | null,
  dependencies: MatterhornCryptoEvidenceRuntimeDependencies = {},
): MatterhornCryptoEvidenceRuntime {
  const feature = cryptoCoworkerFeatureConfig(env);
  if (!store) {
    return {
      mode: "off",
      available: false,
      publicationAvailable: false,
      verification: null,
      publisher: null,
      certificationVerifier: null,
    };
  }
  if (feature.walrusEvidenceMode === "mainnet") {
    throw new Error("crypto_evidence_mainnet_disabled");
  }
  if (feature.walrusEvidenceMode !== "testnet") {
    return {
      mode: "off",
      available: true,
      publicationAvailable: false,
      verification: new MatterhornCryptoEvidenceVerificationService(store, null),
      publisher: null,
      certificationVerifier: null,
    };
  }
  if (!feature.ready) throw new Error(`crypto_evidence_runtime_not_ready:${feature.issues.join(",")}`);
  const transport = dependencies.transport ?? createPinnedWalrusEvidenceTransport({
    publisherUrl: env.MATTERHORN_WALRUS_PUBLISHER_URL ?? "",
    aggregatorUrl: env.MATTERHORN_WALRUS_AGGREGATOR_URL ?? "",
    bearerToken: env.MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN ?? "",
    storageEpochs: matterhornCryptoEvidenceStorageEpochs(env),
  });
  const verifyCertification = dependencies.certificationVerifier ?? (async (input) => {
    const sui = await resolvePublicCryptoAdapterEndpoint(SUI_GRPC_URLS.testnet);
    return createPinnedSuiWalrusCertificationVerifier({
      endpoint: sui.endpoint,
      approvedAddresses: sui.approvedAddresses,
    })(input);
  });
  const publisher = new MatterhornTestnetWalrusEvidencePublisher(
    store,
    transport,
    verifyCertification,
    matterhornCryptoEvidenceStorageEpochs(env),
  );
  return {
    mode: "testnet",
    available: true,
    publicationAvailable: true,
    verification: new MatterhornCryptoEvidenceVerificationService(
      store,
      (input) => publisher.verify(input),
    ),
    publisher,
    certificationVerifier: verifyCertification,
  };
}
