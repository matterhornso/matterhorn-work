import type { MatterhornEncryptedEvidenceEnvelope } from "@matterhorn-work/types/crypto-coworkers";

import { sha256 } from "./guarded-runtime-crypto.js";

const HASH = /^[a-f0-9]{64}$/;

export type MatterhornEvidenceMerkleProof = {
  ciphertextHash: string;
  leaf: string;
  root: string;
  proof: string[];
};

function leafForCiphertextHash(ciphertextHash: string): string {
  if (!HASH.test(ciphertextHash)) throw new Error("evidence_ciphertext_hash_invalid");
  return sha256(`matterhorn:evidence-leaf:v1:${ciphertextHash}`);
}

function parentHash(left: string, right: string): string {
  if (!HASH.test(left) || !HASH.test(right)) throw new Error("evidence_merkle_hash_invalid");
  const [first, second] = left <= right ? [left, right] : [right, left];
  return sha256(`matterhorn:evidence-node:v1:${first}:${second}`);
}

/** Builds deterministic, order-independent proofs for a ciphertext-only batch. */
export function buildMatterhornEvidenceMerkleBatch(
  envelopes: MatterhornEncryptedEvidenceEnvelope[],
): MatterhornEvidenceMerkleProof[] {
  if (envelopes.length < 1 || envelopes.length > 1_024) throw new Error("evidence_merkle_batch_size_invalid");
  const ordered = [...envelopes]
    .map((envelope) => ({
      ciphertextHash: envelope.ciphertextHash,
      leaf: leafForCiphertextHash(envelope.ciphertextHash),
      declaredLeaf: envelope.merkleLeaf,
    }))
    .sort((left, right) => left.ciphertextHash.localeCompare(right.ciphertextHash));
  if (new Set(ordered.map((item) => item.ciphertextHash)).size !== ordered.length) {
    throw new Error("evidence_merkle_duplicate_ciphertext");
  }
  if (ordered.some((item) => item.leaf !== item.declaredLeaf)) {
    throw new Error("evidence_merkle_leaf_mismatch");
  }

  const proofs = ordered.map(() => [] as string[]);
  let nodes = ordered.map((item, index) => ({ hash: item.leaf, indexes: [index] }));
  while (nodes.length > 1) {
    const next: Array<{ hash: string; indexes: number[] }> = [];
    for (let index = 0; index < nodes.length; index += 2) {
      const left = nodes[index];
      const right = nodes[index + 1] ?? left;
      for (const leafIndex of left.indexes) proofs[leafIndex]?.push(right.hash);
      if (right !== left) {
        for (const leafIndex of right.indexes) proofs[leafIndex]?.push(left.hash);
      }
      next.push({
        hash: parentHash(left.hash, right.hash),
        indexes: right === left ? [...left.indexes] : [...left.indexes, ...right.indexes],
      });
    }
    nodes = next;
  }
  const root = nodes[0]?.hash;
  if (!root) throw new Error("evidence_merkle_root_missing");
  return ordered.map((item, index) => ({
    ciphertextHash: item.ciphertextHash,
    leaf: item.leaf,
    root,
    proof: proofs[index] ?? [],
  }));
}

export function verifyMatterhornEvidenceMerkleProof(input: MatterhornEvidenceMerkleProof): boolean {
  if (!HASH.test(input.ciphertextHash)
    || !HASH.test(input.leaf)
    || !HASH.test(input.root)
    || input.proof.length > 64
    || input.proof.some((item) => !HASH.test(item))) return false;
  if (leafForCiphertextHash(input.ciphertextHash) !== input.leaf) return false;
  let observed = input.leaf;
  for (const sibling of input.proof) observed = parentHash(observed, sibling);
  return observed === input.root;
}
