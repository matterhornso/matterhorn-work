import { describe, expect, test } from "bun:test";
import { DecryptCommand, GenerateDataKeyCommand } from "@aws-sdk/client-kms";
import type { GenerateDataKeyCommandInput } from "@aws-sdk/client-kms";

import {
  AwsKmsMatterhornEvidenceKeyManager,
  awsKmsEvidenceKeyManagerFromEnv,
} from "./aws-kms-evidence-key-manager.js";

describe("AWS KMS evidence key manager", () => {
  test("generates a 256-bit envelope key with a non-identifying, exact-match context", async () => {
    const plaintextSource = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const wrappedSource = Uint8Array.from([9, 8, 7, 6]);
    let generatedInput: GenerateDataKeyCommandInput | null = null;
    const manager = new AwsKmsMatterhornEvidenceKeyManager({
      region: "us-east-1",
      keyId: "alias/matterhorn-test-evidence",
      client: {
        send: async (command) => {
          expect(command).toBeInstanceOf(GenerateDataKeyCommand);
          generatedInput = structuredClone((command as GenerateDataKeyCommand).input);
          return {
            Plaintext: plaintextSource,
            CiphertextBlob: wrappedSource,
            KeyId: "arn:aws:kms:us-east-1:111122223333:key/test-key",
            $metadata: {},
          };
        },
      },
    });
    const lease = await manager.createDataKey({
      workspaceId: "workspace_private_alpha",
      runId: "run_private_alpha",
      recipientKeyIds: ["recipient-1"],
    });

    expect(lease.plaintextKey).toEqual(Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1)));
    expect(lease.wrappedKey).toBe(Buffer.from([9, 8, 7, 6]).toString("base64"));
    expect(lease.keyContext).toMatch(/^[a-f0-9]{64}$/);
    expect([...plaintextSource]).toEqual(Array.from({ length: 32 }, () => 0));
    expect([...wrappedSource]).toEqual([0, 0, 0, 0]);
    const serializedInput = JSON.stringify(generatedInput);
    const capturedInput = generatedInput as unknown as GenerateDataKeyCommandInput;
    expect(serializedInput).not.toContain("workspace_private_alpha");
    expect(serializedInput).not.toContain("run_private_alpha");
    expect(capturedInput).toMatchObject({ KeyId: "alias/matterhorn-test-evidence", KeySpec: "AES_256" });
    expect(capturedInput.EncryptionContext?.["matterhorn-binding"]).toMatch(/^[a-f0-9]{64}$/);
  });

  test("decrypts only with the same key reference and tenant/run context", async () => {
    const decryptedSource = Uint8Array.from({ length: 32 }, () => 4);
    let decryptInput: Record<string, unknown> | null = null;
    const keyReference = "arn:aws:kms:us-east-1:111122223333:key/test-key";
    const manager = new AwsKmsMatterhornEvidenceKeyManager({
      region: "us-east-1",
      keyId: keyReference,
      client: {
        send: async (command) => {
          expect(command).toBeInstanceOf(DecryptCommand);
          const input = (command as DecryptCommand).input;
          decryptInput = {
            ...input,
            CiphertextBlob: Buffer.from(input.CiphertextBlob ?? []).toString("base64"),
          };
          return { Plaintext: decryptedSource, KeyId: keyReference, $metadata: {} };
        },
      },
    });
    const key = await manager.decryptDataKey({
      workspaceId: "workspace-private",
      runId: "run-private",
      keyReference,
      wrappedKey: Buffer.from([1, 2, 3]).toString("base64"),
      keyContext: "a".repeat(64),
    });
    expect(key).toEqual(Buffer.alloc(32, 4));
    expect([...decryptedSource]).toEqual(Array.from({ length: 32 }, () => 0));
    expect(decryptInput).toMatchObject({ KeyId: keyReference, CiphertextBlob: "AQID" });
    expect(JSON.stringify(decryptInput)).not.toContain("workspace-private");
    expect(JSON.stringify(decryptInput)).not.toContain("run-private");
  });

  test("fails closed on a mismatched KMS key and requires complete production configuration", async () => {
    const plaintext = Uint8Array.from({ length: 32 }, () => 5);
    const manager = new AwsKmsMatterhornEvidenceKeyManager({
      region: "us-east-1",
      keyId: "expected-key",
      client: {
        send: async () => ({ Plaintext: plaintext, KeyId: "wrong-key", $metadata: {} }),
      },
    });
    await expect(manager.decryptDataKey({
      workspaceId: "workspace",
      runId: "run",
      keyReference: "expected-key",
      wrappedKey: Buffer.from([1]).toString("base64"),
      keyContext: "b".repeat(64),
    })).rejects.toThrow("evidence_kms_response_invalid");
    expect([...plaintext]).toEqual(Array.from({ length: 32 }, () => 0));
    expect(awsKmsEvidenceKeyManagerFromEnv({})).toBeNull();
    expect(() => awsKmsEvidenceKeyManagerFromEnv({
      MATTERHORN_EVIDENCE_KMS_REGION: "us-east-1",
    })).toThrow("evidence_kms_configuration_incomplete");
    expect(() => awsKmsEvidenceKeyManagerFromEnv({
      MATTERHORN_EVIDENCE_KMS_KEY_ID: "alias/evidence",
    })).toThrow("evidence_kms_configuration_incomplete");
    expect(awsKmsEvidenceKeyManagerFromEnv({
      MATTERHORN_EVIDENCE_KMS_REGION: "us-east-1",
      MATTERHORN_EVIDENCE_KMS_KEY_ID: "alias/evidence",
    })).toBeInstanceOf(AwsKmsMatterhornEvidenceKeyManager);
  });
});
