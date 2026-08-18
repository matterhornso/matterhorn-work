import type {
  MatterhornCryptoToolAccess,
  MatterhornCryptoToolName,
} from "./crypto-action-registry.js";
import type { ReviewedActionHandoffV2 } from "./reviewed-actions.js";

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
  provenance?: {
    trust: "trusted_runtime" | "untrusted_external";
    sanitization: "typed_projection" | "quarantined";
    evidenceReference: string;
  };
  warnings: readonly string[];
  /** Exact, simulated wallet-only handoff. Never contains a signing or submit capability. */
  reviewedAction?: ReviewedActionHandoffV2;
  result: unknown;
};
