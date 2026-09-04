import {
  MATTERHORN_COWORKER_RESOURCE_RECOMMENDATION_VERSION,
  type MatterhornCoworkerProfile,
  type MatterhornCoworkerResourceRecommendation,
  validateMatterhornCoworkerResourceRecommendation,
} from "@matterhorn-work/types/crypto-coworkers";

import { sha256 } from "./guarded-runtime-crypto.js";

export type CoworkerResourceRecommendationFile = {
  id: string;
  revision: number;
  name: string;
  contentSha256: string;
  sizeBytes: number;
  coworkerIds: string[];
};

export type CoworkerResourceRecommendationMemory = {
  id: string;
  version: string;
  title: string;
  contentHash: string;
  tags: string[];
  canUseInChat: boolean;
  sensitivity: "public" | "private" | "restricted" | "forbidden_secret";
};

export type CoworkerResourceRecommendationConnection = {
  id: string;
  appId: string;
  manifestRevision: string;
  state: "active" | "paused" | "revoked";
  availability: "available" | "certification_unavailable";
  grantedActionIds: string[];
  grantedNetworks: string[];
};

const APPROVED_TOPIC_TAGS = new Set([
  "bittensor",
  "btc",
  "eth",
  "hyperliquid",
  "polymarket",
  "sui",
  "tao",
  "usdc",
]);

function topicTags(profile: MatterhornCoworkerProfile): Set<string> {
  return new Set([
    ...profile.allowedAppIds,
    ...profile.allowedNetworks,
    ...profile.allowedAssets,
  ]
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/))
    .filter((value) => APPROVED_TOPIC_TAGS.has(value)));
}

export function compileCoworkerResourceRecommendation(input: {
  workspaceId: string;
  ownerId: string;
  profile: MatterhornCoworkerProfile;
  expectedScopeRevision: number;
  files: CoworkerResourceRecommendationFile[];
  memories: CoworkerResourceRecommendationMemory[];
  connections: CoworkerResourceRecommendationConnection[];
  now?: Date;
}): MatterhornCoworkerResourceRecommendation {
  const privateResourcesAllowed = input.profile.privacy.allowedDataLabels.includes("workspace_private");
  const files = privateResourcesAllowed
    ? input.files
      .filter((item) => item.coworkerIds.includes(input.profile.id))
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, 8)
    : [];
  const allowedTags = topicTags(input.profile);
  const memories = privateResourcesAllowed
    ? input.memories
      .filter((item) => item.canUseInChat && item.sensitivity !== "forbidden_secret")
      .map((item) => ({
        item,
        matchedTags: [...new Set(item.tags
          .map((tag) => tag.trim().toLowerCase())
          .filter((tag) => allowedTags.has(tag)))].sort(),
      }))
      .filter((item) => item.matchedTags.length > 0)
      .sort((left, right) => left.item.id.localeCompare(right.item.id))
      .slice(0, 8)
    : [];
  const connections = input.connections
    .filter((connection) => connection.state === "active"
      && connection.availability === "available"
      && input.profile.allowedAppIds.includes(connection.appId))
    .map((connection) => ({
      connection,
      actionIds: connection.grantedActionIds
        .filter((actionId) => input.profile.allowedActionIds.includes(actionId))
        .sort(),
      networks: connection.grantedNetworks
        .filter((network) => input.profile.allowedNetworks.includes(network))
        .sort(),
    }))
    .filter((item) => item.actionIds.length > 0 && item.networks.length > 0)
    .sort((left, right) => left.connection.id.localeCompare(right.connection.id))
    .slice(0, 8);
  const approval = {
    required: true,
    automaticGrant: false,
    walletSubmission: "connected_wallet_only",
  } as const;
  const hashMaterial = {
    version: MATTERHORN_COWORKER_RESOURCE_RECOMMENDATION_VERSION,
    workspaceId: input.workspaceId,
    ownerId: input.ownerId,
    coworkerId: input.profile.id,
    profileRevision: input.profile.revision,
    expectedScopeRevision: input.expectedScopeRevision,
    agentFiles: files.map((item) => ({
      id: item.id,
      revision: item.revision,
      contentSha256: item.contentSha256,
      sizeBytes: item.sizeBytes,
    })),
    memories: memories.map(({ item }) => ({
      id: item.id,
      version: item.version,
      contentHash: item.contentHash,
    })),
    connections: connections.map(({ connection, actionIds, networks }) => ({
      id: connection.id,
      appId: connection.appId,
      manifestRevision: connection.manifestRevision,
      actionIds,
      networks,
    })),
    approval,
  };
  const generatedAt = input.now ?? new Date();
  if (!Number.isFinite(generatedAt.getTime())) throw new Error("coworker_resource_recommendation_time_invalid");
  const recommendation: MatterhornCoworkerResourceRecommendation = {
    version: MATTERHORN_COWORKER_RESOURCE_RECOMMENDATION_VERSION,
    workspaceId: input.workspaceId,
    coworkerId: input.profile.id,
    profileRevision: input.profile.revision,
    expectedScopeRevision: input.expectedScopeRevision,
    agentFiles: files.map((item) => ({
      id: item.id,
      revision: item.revision,
      name: item.name,
      reason: "assigned_to_this_coworker",
    })),
    memories: memories.map(({ item, matchedTags }) => ({
      id: item.id,
      version: item.version,
      title: item.title,
      matchedTags,
      reason: "matches_approved_topics",
    })),
    connections: connections.map(({ connection, actionIds, networks }) => ({
      id: connection.id,
      appId: connection.appId,
      manifestRevision: connection.manifestRevision,
      actionIds,
      networks,
      reason: "matches_approved_app",
    })),
    approval,
    recommendationHash: sha256(hashMaterial),
    generatedAt: generatedAt.toISOString(),
  };
  if (validateMatterhornCoworkerResourceRecommendation(recommendation).length > 0) {
    throw new Error("coworker_resource_recommendation_invalid");
  }
  return recommendation;
}
