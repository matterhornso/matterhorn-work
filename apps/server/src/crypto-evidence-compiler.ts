import { randomBytes } from "node:crypto";

import {
  MATTERHORN_EVIDENCE_BUNDLE_VERSION,
  type MatterhornEvidenceBundle,
  validateMatterhornEvidenceBundle,
} from "@matterhorn-work/types/crypto-coworkers";
import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

import { sha256 } from "./guarded-runtime-crypto.js";

const DEFAULT_RETENTION_DAYS = 365;
const MIN_ENTROPY_BYTES = 16;

function hashList(domain: string, values: unknown[]): string[] {
  return [...new Set(values.map((value) => sha256({ domain, value })))].sort();
}

function assertFinalizedReceipt(receipt: MatterhornAgentRunReceipt): asserts receipt is MatterhornAgentRunReceipt & {
  status: Exclude<MatterhornAgentRunReceipt["status"], "pending">;
  completedAt: string;
  responseDurationMs: number;
} {
  if (receipt.status === "pending" || !receipt.completedAt || receipt.responseDurationMs === null) {
    throw new Error("evidence_run_receipt_not_finalized");
  }
  if (!receipt.workspaceId.trim() || !receipt.runId.trim()) {
    throw new Error("evidence_run_receipt_identity_invalid");
  }
}

/**
 * Projects one finalized guarded run receipt into the closed evidence schema.
 * Raw prompts, messages, memories, wallet identities, signatures, capability
 * tokens, and unrestricted tool results have no field in this projection.
 */
export function compileMatterhornEvidenceBundle(input: {
  receipt: MatterhornAgentRunReceipt;
  coworkerId: string;
  keyReference: string;
  recipientKeyIds: string[];
  contentClass?: MatterhornEvidenceBundle["retention"]["contentClass"];
  deletable?: boolean;
  retentionDays?: number | null;
  now?: Date;
  correlationSalt?: Buffer;
  idEntropy?: Buffer;
}): MatterhornEvidenceBundle {
  assertFinalizedReceipt(input.receipt);
  const coworkerId = input.coworkerId.trim();
  if (!coworkerId) throw new Error("evidence_coworker_required");

  const correlationSalt = input.correlationSalt ?? randomBytes(32);
  const idEntropy = input.idEntropy ?? randomBytes(24);
  if (correlationSalt.length < MIN_ENTROPY_BYTES || idEntropy.length < MIN_ENTROPY_BYTES) {
    throw new Error("evidence_entropy_insufficient");
  }
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("evidence_created_at_invalid");
  const retentionDays = input.retentionDays === undefined ? DEFAULT_RETENTION_DAYS : input.retentionDays;
  if (retentionDays !== null && (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3_650)) {
    throw new Error("evidence_retention_days_invalid");
  }

  const receipt = input.receipt;
  const identityDomain = correlationSalt.toString("hex");
  const reviewedPolicyHashes = receipt.reviewedActions.map((action) => action.policyHash);
  const bundle: MatterhornEvidenceBundle = {
    version: MATTERHORN_EVIDENCE_BUNDLE_VERSION,
    id: `evidence_${sha256({ domain: "matterhorn:evidence-id:v1", entropy: idEntropy.toString("hex") }).slice(0, 40)}`,
    workspaceIdHash: sha256({ domain: "matterhorn:evidence-workspace:v1", salt: identityDomain, id: receipt.workspaceId }),
    runIdHash: sha256({ domain: "matterhorn:evidence-run:v1", salt: identityDomain, id: receipt.runId }),
    coworkerIdHash: sha256({ domain: "matterhorn:evidence-coworker:v1", salt: identityDomain, id: coworkerId }),
    createdAt: now.toISOString(),
    retention: {
      contentClass: input.contentClass ?? "encrypted_user_evidence",
      deletable: input.deletable ?? true,
      expiresAt: retentionDays === null
        ? null
        : new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1_000).toISOString(),
    },
    encryption: {
      algorithm: "aes-256-gcm",
      keyReference: input.keyReference.trim(),
      recipientKeyIds: [...new Set(input.recipientKeyIds.map((id) => id.trim()).filter(Boolean))].sort(),
    },
    receipt: {
      status: receipt.status,
      providerId: receipt.provider.id,
      modelId: receipt.provider.modelId,
      privacyMode: receipt.privacy.mode,
      consent: receipt.privacy.consent,
      dataCategoryHashes: hashList("matterhorn:evidence-data-category:v1", receipt.privacy.dataCategories),
      redactionCount: receipt.privacy.redactionCount,
      policyHash: sha256({
        domain: "matterhorn:evidence-policy:v1",
        provider: {
          id: receipt.provider.id,
          privacyStatus: receipt.provider.privacyStatus,
          trainingUse: receipt.provider.trainingUse,
          retentionDays: receipt.provider.retentionDays,
        },
        privacy: {
          mode: receipt.privacy.mode,
          consent: receipt.privacy.consent,
          dataLeavesMatterhorn: receipt.privacy.dataLeavesMatterhorn,
        },
        reviewedPolicyHashes: [...new Set(reviewedPolicyHashes)].sort(),
      }),
      toolOutcomeHashes: hashList(
        "matterhorn:evidence-tool-outcome:v1",
        receipt.tools.map((tool) => ({
          name: tool.name,
          access: tool.access,
          outcome: tool.outcome,
          latencyMs: tool.latencyMs,
          source: tool.source,
          freshness: tool.freshness,
          trust: tool.trust,
          evidence: tool.evidence ?? null,
        })),
      ),
      evidenceReferenceHashes: hashList(
        "matterhorn:evidence-reference:v1",
        receipt.tools
          .filter((tool) => tool.source !== null || tool.freshness !== null || tool.evidence !== undefined)
          .map((tool) => ({
            source: tool.source,
            freshness: tool.freshness,
            trust: tool.trust,
            evidence: tool.evidence ?? null,
          })),
      ),
      reviewedIntentHashes: hashList(
        "matterhorn:evidence-reviewed-intent:v1",
        receipt.reviewedActions.map((action) => ({
          intentHash: action.intentHash,
          policyHash: action.policyHash,
          simulationReference: action.simulationReference,
        })),
      ),
      publicChainReceiptHashes: hashList(
        "matterhorn:evidence-public-receipt:v1",
        receipt.reviewedActions
          .map((action) => action.publicReceipt)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
      inputTokens: receipt.usage.inputTokens,
      outputTokens: receipt.usage.outputTokens,
      responseDurationMs: receipt.responseDurationMs,
    },
  };

  const issues = validateMatterhornEvidenceBundle(bundle);
  if (issues.length > 0) throw new Error(`evidence_bundle_invalid:${issues.join(",")}`);
  return bundle;
}
