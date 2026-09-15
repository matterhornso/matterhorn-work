import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

export const HOST_BACKUP_UPLOAD_VERIFICATION = "s3-head-sha256-kms-v1";

export async function uploadVerifiedHostBackup({ client, bundle, bucket, key, kmsKeyId, dataRoot }) {
  if (!bucket || !key || !kmsKeyId || !dataRoot) throw new Error("Verified backup upload configuration is incomplete.");
  const checksum = createHash("sha256").update(bundle.compressed).digest("base64");
  const metadata = {
    "matterhorn-version": bundle.manifest.version,
    "matterhorn-build": bundle.manifest.buildCommit ?? "unknown",
  };
  const uploaded = await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: bundle.compressed,
    ContentType: "application/gzip",
    ChecksumSHA256: checksum,
    ServerSideEncryption: "aws:kms",
    SSEKMSKeyId: kmsKeyId,
    BucketKeyEnabled: true,
    Metadata: metadata,
  }));
  // S3 resolves aliases/IDs to the actual encryption key in its response.
  // Compare HEAD to that resolved key, rather than comparing an alias to an ARN.
  if (uploaded.ServerSideEncryption !== "aws:kms"
    || typeof uploaded.SSEKMSKeyId !== "string" || !uploaded.SSEKMSKeyId
    || typeof uploaded.ETag !== "string" || !uploaded.ETag) {
    throw new Error("S3 backup upload did not confirm its encryption and object identity.");
  }
  const aliasRequested = kmsKeyId.startsWith("alias/") || kmsKeyId.includes(":alias/");
  if (!aliasRequested && uploaded.SSEKMSKeyId !== kmsKeyId && !uploaded.SSEKMSKeyId.endsWith(`:key/${kmsKeyId}`)) {
    throw new Error("S3 backup upload did not use the configured KMS key.");
  }
  const versionId = typeof uploaded.VersionId === "string" && uploaded.VersionId !== "null"
    ? uploaded.VersionId : undefined;
  const verified = await client.send(new HeadObjectCommand({
    Bucket: bucket,
    Key: key,
    IfMatch: uploaded.ETag,
    ...(versionId ? { VersionId: versionId } : {}),
    ChecksumMode: "ENABLED",
  }));
  if (verified.ChecksumSHA256 !== checksum
    || verified.ContentLength !== bundle.compressed.length
    || verified.ContentType !== "application/gzip"
    || verified.ServerSideEncryption !== "aws:kms"
    || verified.SSEKMSKeyId !== uploaded.SSEKMSKeyId
    || verified.BucketKeyEnabled !== true
    || verified.ETag !== uploaded.ETag
    || (versionId && verified.VersionId !== versionId)
    || verified.Metadata?.["matterhorn-version"] !== metadata["matterhorn-version"]
    || verified.Metadata?.["matterhorn-build"] !== metadata["matterhorn-build"]) {
    throw new Error("S3 backup verification failed; no new freshness marker was written.");
  }

  const marker = {
    version: bundle.manifest.version,
    verification: HOST_BACKUP_UPLOAD_VERIFICATION,
    capturedAt: bundle.manifest.capturedAt,
    verifiedAt: new Date().toISOString(),
    bucket,
    key,
    ...(versionId ? { versionId } : {}),
    sha256: createHash("sha256").update(bundle.compressed).digest("hex"),
  };
  // Use the directory actually snapshotted, not a possibly different env path.
  // Rename publishes a complete marker atomically and preserves the old marker
  // if upload/verification or the temporary write fails.
  const backupRoot = join(resolve(dataRoot), "backups");
  await mkdir(backupRoot, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(join(backupRoot, ".verified-upload-"));
  try {
    const pending = join(temporary, "last-success.json");
    await writeFile(pending, `${JSON.stringify(marker)}\n`, { mode: 0o600, flag: "wx" });
    await rename(pending, join(backupRoot, "last-success.json"));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return { bucket, key, ...(versionId ? { versionId } : {}), verification: HOST_BACKUP_UPLOAD_VERIFICATION };
}
