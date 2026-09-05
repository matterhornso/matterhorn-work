import type { MatterhornCryptoAppResult } from "@matterhorn-work/types/crypto-coworkers";

import { sha256 } from "./guarded-runtime-crypto.js";

export type MatterhornCryptoAppEvidenceIdentityInput = {
  appId: string;
  manifestRevision: string;
  actionId: string;
  network: string;
  result: unknown;
  observation: MatterhornCryptoAppResult["observation"];
};

const EXACT_EVIDENCE_HASH = /^[a-f0-9]{64}$/;

export function cryptoAppEvidenceIdentity(
  input: MatterhornCryptoAppEvidenceIdentityInput,
): { projectionHash: string; observationHash: string } {
  const projectionHash = sha256({
    domain: "matterhorn:crypto-app-projection:v1",
    appId: input.appId,
    manifestRevision: input.manifestRevision,
    actionId: input.actionId,
    network: input.network,
    result: input.result,
  });
  return {
    projectionHash,
    observationHash: sha256({
      domain: "matterhorn:crypto-app-observation:v1",
      appId: input.appId,
      manifestRevision: input.manifestRevision,
      actionId: input.actionId,
      network: input.network,
      observation: {
        source: input.observation.source,
        observedAt: input.observation.observedAt,
        blockOrVersion: input.observation.blockOrVersion,
      },
      projectionHash,
    }),
  };
}

export function verifyCryptoAppResultEvidence(result: MatterhornCryptoAppResult): boolean {
  const projectionHash = result.provenance.projectionHash;
  const observationHash = result.provenance.observationHash;
  if (!projectionHash || !observationHash
    || !EXACT_EVIDENCE_HASH.test(projectionHash)
    || !EXACT_EVIDENCE_HASH.test(observationHash)) return false;
  const expected = cryptoAppEvidenceIdentity({
    appId: result.app.id,
    manifestRevision: result.app.manifestRevision,
    actionId: result.action.id,
    network: result.action.network,
    result: result.result,
    observation: result.observation,
  });
  return projectionHash === expected.projectionHash
    && observationHash === expected.observationHash;
}
