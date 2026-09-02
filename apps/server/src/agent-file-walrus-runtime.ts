import { MATTERHORN_AGENT_FILE_MAX_BYTES } from "./agent-file-boundary.js";
import type { MatterhornAgentFileStore } from "./agent-file-store.js";
import { MatterhornAgentFileWalrusPublisher } from "./agent-file-walrus-publisher.js";
import { resolvePublicCryptoAdapterEndpoint } from "./crypto-app-egress.js";
import { cryptoCoworkerFeatureConfig } from "./crypto-coworker-config.js";
import {
  createPinnedWalrusEvidenceTransport,
  type MatterhornWalrusCertificationVerifier,
  type MatterhornWalrusEvidenceTransport,
} from "./crypto-evidence-walrus-publisher.js";
import { createPinnedSuiWalrusCertificationVerifier } from "./sui-walrus-certification-verifier.js";
import { SUI_GRPC_URLS } from "./tools/sui.js";

const PUBLIC_ENVELOPE_MAX_BYTES = Math.ceil(MATTERHORN_AGENT_FILE_MAX_BYTES * 4 / 3) + 4_096;

function storageEpochs(env: NodeJS.ProcessEnv): number {
  const value = env.MATTERHORN_WALRUS_STORAGE_EPOCHS?.trim();
  if (!value) return 5;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 53) {
    throw new Error("agent_file_walrus_epochs_invalid");
  }
  return parsed;
}

export function createMatterhornAgentFileWalrusPublisher(
  env: NodeJS.ProcessEnv,
  store: MatterhornAgentFileStore | null,
  dependencies: {
    transport?: MatterhornWalrusEvidenceTransport;
    certificationVerifier?: MatterhornWalrusCertificationVerifier;
  } = {},
): MatterhornAgentFileWalrusPublisher | null {
  const feature = cryptoCoworkerFeatureConfig(env);
  if (!store || feature.agentFilesMode !== "encrypted" || feature.walrusEvidenceMode === "off") return null;
  if (feature.walrusEvidenceMode !== "testnet") throw new Error("agent_file_walrus_mainnet_disabled");
  if (!feature.ready) throw new Error(`agent_file_walrus_runtime_not_ready:${feature.issues.join(",")}`);
  const transport = dependencies.transport ?? createPinnedWalrusEvidenceTransport({
    publisherUrl: env.MATTERHORN_WALRUS_PUBLISHER_URL ?? "",
    aggregatorUrl: env.MATTERHORN_WALRUS_AGGREGATOR_URL ?? "",
    bearerToken: env.MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN ?? "",
    storageEpochs: storageEpochs(env),
    maxEvidenceBytes: PUBLIC_ENVELOPE_MAX_BYTES,
  });
  const certificationVerifier = dependencies.certificationVerifier ?? (async (input) => {
    const sui = await resolvePublicCryptoAdapterEndpoint(SUI_GRPC_URLS.testnet);
    return createPinnedSuiWalrusCertificationVerifier({
      endpoint: sui.endpoint,
      approvedAddresses: sui.approvedAddresses,
    })(input);
  });
  return new MatterhornAgentFileWalrusPublisher(
    store,
    transport,
    certificationVerifier,
    storageEpochs(env),
  );
}
