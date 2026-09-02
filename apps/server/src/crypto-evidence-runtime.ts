import { MatterhornCryptoEvidenceVerificationService } from "./crypto-evidence-verification.js";
import { resolvePublicCryptoAdapterEndpoint } from "./crypto-app-egress.js";
import { cryptoCoworkerFeatureConfig } from "./crypto-coworker-config.js";
import type { MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
import {
  createPinnedWalrusEvidenceTransport,
  MatterhornTestnetWalrusEvidencePublisher,
} from "./crypto-evidence-walrus-publisher.js";
import { createPinnedSuiWalrusCertificationVerifier } from "./sui-walrus-certification-verifier.js";
import { SUI_GRPC_URLS } from "./tools/sui.js";

export type MatterhornCryptoEvidenceRuntime = {
  mode: "off" | "testnet";
  available: boolean;
  verification: MatterhornCryptoEvidenceVerificationService | null;
};

function storageEpochs(env: NodeJS.ProcessEnv): number {
  const value = env.MATTERHORN_WALRUS_STORAGE_EPOCHS?.trim();
  if (!value) return 5;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 53) {
    throw new Error("crypto_evidence_walrus_epochs_invalid");
  }
  return parsed;
}

/**
 * Read-only Phase 4 account boundary. Publication remains a separate
 * server-owned process; this runtime can only list tenant records and verify
 * an already-bound testnet proof.
 */
export function createMatterhornCryptoEvidenceRuntime(
  env: NodeJS.ProcessEnv,
  store: MatterhornCryptoEvidenceStore | null,
): MatterhornCryptoEvidenceRuntime {
  const feature = cryptoCoworkerFeatureConfig(env);
  if (!store) return { mode: "off", available: false, verification: null };
  if (feature.walrusEvidenceMode === "mainnet") {
    throw new Error("crypto_evidence_mainnet_disabled");
  }
  if (feature.walrusEvidenceMode !== "testnet") {
    return {
      mode: "off",
      available: true,
      verification: new MatterhornCryptoEvidenceVerificationService(store, null),
    };
  }
  if (!feature.ready) throw new Error(`crypto_evidence_runtime_not_ready:${feature.issues.join(",")}`);
  const transport = createPinnedWalrusEvidenceTransport({
    publisherUrl: env.MATTERHORN_WALRUS_PUBLISHER_URL ?? "",
    aggregatorUrl: env.MATTERHORN_WALRUS_AGGREGATOR_URL ?? "",
    bearerToken: env.MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN ?? "",
    storageEpochs: storageEpochs(env),
  });
  const liveVerify = async (input: {
    workspaceId: string;
    ownerId: string;
    evidenceId: string;
    signal: AbortSignal;
  }) => {
    const sui = await resolvePublicCryptoAdapterEndpoint(SUI_GRPC_URLS.testnet);
    const verifyCertification = createPinnedSuiWalrusCertificationVerifier({
      endpoint: sui.endpoint,
      approvedAddresses: sui.approvedAddresses,
    });
    const verifier = new MatterhornTestnetWalrusEvidencePublisher(
      store,
      transport,
      verifyCertification,
      storageEpochs(env),
    );
    return verifier.verify(input);
  };
  return {
    mode: "testnet",
    available: true,
    verification: new MatterhornCryptoEvidenceVerificationService(store, liveVerify),
  };
}
