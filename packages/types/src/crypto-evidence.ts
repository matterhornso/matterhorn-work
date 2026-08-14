import type {
  MatterhornCryptoToolAccess,
  MatterhornCryptoToolName,
} from "./crypto-action-registry.js";

export const MATTERHORN_CRYPTO_EVIDENCE_VERSION = "matterhorn.crypto.evidence.v1" as const;

export type MatterhornCryptoEvidenceEnvelope = {
  version: typeof MATTERHORN_CRYPTO_EVIDENCE_VERSION;
  status: "success" | "error";
  tool: {
    name: MatterhornCryptoToolName;
    access: MatterhornCryptoToolAccess;
    deskIds: readonly string[];
    actionIds: readonly string[];
  };
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  observation: {
    bridgeObservedAt: string;
    upstreamSource?: string;
    upstreamObservedAt?: string;
    freshness?: string;
    freshnessRequired: boolean;
  };
  warnings: readonly string[];
  result: unknown;
};
