import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { test } from "node:test";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { HOST_BACKUP_UPLOAD_VERIFICATION, uploadVerifiedHostBackup } from "./lib/verified-host-backup-upload.mjs";

const kmsKeyId = "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555";
const bundle = {
  compressed: Buffer.from("disposable compressed fixture"),
  manifest: { version: "matterhorn.host-recovery.v1", buildCommit: "a".repeat(40), capturedAt: "2026-09-15T18:00:00.000Z" },
};
const uploadResponse = { ServerSideEncryption: "aws:kms", SSEKMSKeyId: kmsKeyId, ETag: '"fixture-etag"', VersionId: "version-1" };
const headResponse = {
  ...uploadResponse,
  BucketKeyEnabled: true,
  ContentLength: bundle.compressed.length,
  ContentType: "application/gzip",
  ChecksumSHA256: createHash("sha256").update(bundle.compressed).digest("base64"),
  Metadata: { "matterhorn-version": bundle.manifest.version, "matterhorn-build": bundle.manifest.buildCommit },
};

async function withFixture(run) {
  const dataRoot = await mkdtemp(join(tmpdir(), "mh-verified-backup-test-"));
  const markerPath = join(dataRoot, "backups", "last-success.json");
  try { await run({ dataRoot, markerPath }); }
  finally { await rm(dataRoot, { recursive: true, force: true }); }
}

function clientFor({ put = uploadResponse, head = headResponse, beforeHead = async () => {} } = {}) {
  const commands = [];
  return { commands, async send(command) {
    commands.push(command);
    if (command instanceof PutObjectCommand) {
      if (put instanceof Error) throw put;
      return put;
    }
    assert.ok(command instanceof HeadObjectCommand, "verification must not download backup contents");
    await beforeHead();
    if (head instanceof Error) throw head;
    return head;
  } };
}

function upload(dataRoot, client, keyId = kmsKeyId) {
  return uploadVerifiedHostBackup({ client, bundle, bucket: "fixture-bucket", key: "host-recovery/fixture.json.gz", kmsKeyId: keyId, dataRoot });
}

test("HEAD verifies the exact uploaded version before atomically publishing a private marker", () => withFixture(async ({ dataRoot, markerPath }) => {
  const client = clientFor({ beforeHead: async () => assert.rejects(readFile(markerPath), { code: "ENOENT" }) });
  const result = await upload(dataRoot, client);
  assert.equal(result.verification, HOST_BACKUP_UPLOAD_VERIFICATION);
  assert.equal(client.commands[0].input.SSEKMSKeyId, kmsKeyId);
  assert.equal(client.commands[0].input.ChecksumSHA256, headResponse.ChecksumSHA256);
  assert.deepEqual(client.commands[1].input, {
    Bucket: "fixture-bucket", Key: "host-recovery/fixture.json.gz", VersionId: "version-1",
    IfMatch: '"fixture-etag"', ChecksumMode: "ENABLED",
  });
  const marker = JSON.parse(await readFile(markerPath, "utf8"));
  assert.equal(marker.verification, HOST_BACKUP_UPLOAD_VERIFICATION);
  assert.equal(marker.sha256, createHash("sha256").update(bundle.compressed).digest("hex"));
  assert.equal(marker.capturedAt, bundle.manifest.capturedAt);
  assert.equal(marker.versionId, "version-1");
  assert.equal((await stat(markerPath)).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(join(dataRoot, "backups")), ["last-success.json"]);
}));

test("verification mismatch preserves the previous marker and never claims fresh success", async () => {
  for (const mutation of [
    { ChecksumSHA256: undefined }, { ChecksumSHA256: "wrong" }, { ContentLength: 1 },
    { ContentType: "text/plain" }, { ServerSideEncryption: "AES256" }, { SSEKMSKeyId: "another-key" },
    { BucketKeyEnabled: false }, { ETag: '"changed"' }, { VersionId: "changed" },
    { Metadata: {} }, { Metadata: { ...headResponse.Metadata, "matterhorn-build": "other" } },
  ]) await withFixture(async ({ dataRoot, markerPath }) => {
    await mkdir(join(dataRoot, "backups"));
    await writeFile(markerPath, "previous-marker");
    await assert.rejects(upload(dataRoot, clientFor({ head: { ...headResponse, ...mutation } })), /verification failed/);
    assert.equal(await readFile(markerPath, "utf8"), "previous-marker");
    assert.deepEqual(await readdir(join(dataRoot, "backups")), ["last-success.json"]);
  });
});

test("upload and HEAD failures create no marker", async () => {
  for (const options of [{ put: new Error("upload denied") }, { head: new Error("head denied") }]) {
    await withFixture(async ({ dataRoot, markerPath }) => {
      await assert.rejects(upload(dataRoot, clientFor(options)), /denied/);
      await assert.rejects(readFile(markerPath), { code: "ENOENT" });
    });
  }
});

test("missing upload identity, wrong encryption or a substituted configured key fail before HEAD", async () => {
  for (const mutation of [{ ETag: undefined }, { SSEKMSKeyId: undefined }, { ServerSideEncryption: "AES256" }, { SSEKMSKeyId: "other-key" }]) {
    await withFixture(async ({ dataRoot, markerPath }) => {
      const client = clientFor({ put: { ...uploadResponse, ...mutation } });
      await assert.rejects(upload(dataRoot, client), /S3 backup upload/);
      assert.equal(client.commands.length, 1);
      await assert.rejects(readFile(markerPath), { code: "ENOENT" });
    });
  }
});

test("KMS aliases and key IDs resolve consistently, and unversioned buckets still use ETag and checksum", async () => {
  for (const keyId of ["alias/matterhorn-backups", kmsKeyId.split(":key/")[1]]) {
    await withFixture(async ({ dataRoot }) => {
      const client = clientFor({ put: { ...uploadResponse, VersionId: undefined }, head: { ...headResponse, VersionId: undefined } });
      const result = await upload(dataRoot, client, keyId);
      assert.equal(result.verification, HOST_BACKUP_UPLOAD_VERIFICATION);
      assert.equal(client.commands[1].input.VersionId, undefined);
      assert.equal(client.commands[1].input.IfMatch, uploadResponse.ETag);
    });
  }
});

test("uploader is wired to the explicit snapshot directory, never an unrelated environment root", async () => {
  const source = await readFile(new URL("./matterhorn-host-recovery.mjs", import.meta.url), "utf8");
  assert.match(source, /uploadBundle\(bundle, config\.dataRoot\)/);
  assert.match(source, /uploadVerifiedHostBackup\(\{ client, bundle, bucket, key, kmsKeyId, dataRoot \}\)/);
  assert.doesNotMatch(source, /join\(resolve\(process\.env\.MATTERHORN_WORK_DATA_DIR/);
});

test("real AWS SDK uses PUT then checksum-enabled HEAD against a local fixture, never GET", () => withFixture(async ({ dataRoot, markerPath }) => {
  const methods = [];
  const server = createServer((request, response) => {
    methods.push(request.method);
    if (request.method === "PUT") {
      assert.equal(request.headers["x-amz-server-side-encryption"], "aws:kms");
      assert.equal(request.headers["x-amz-server-side-encryption-aws-kms-key-id"], kmsKeyId);
      request.resume();
      request.on("end", () => {
        response.writeHead(200, {
          etag: uploadResponse.ETag,
          "x-amz-version-id": "version-1",
          "x-amz-server-side-encryption": "aws:kms",
          "x-amz-server-side-encryption-aws-kms-key-id": kmsKeyId,
        });
        response.end();
      });
      return;
    }
    assert.equal(request.method, "HEAD");
    assert.equal(request.headers["x-amz-checksum-mode"], "ENABLED");
    assert.equal(request.headers["if-match"], uploadResponse.ETag);
    assert.equal(request.headers["x-amz-server-side-encryption"], undefined);
    assert.equal(new URL(request.url, "http://fixture.invalid").searchParams.get("versionId"), "version-1");
    response.writeHead(200, {
      etag: uploadResponse.ETag,
      "content-length": bundle.compressed.length,
      "content-type": "application/gzip",
      "x-amz-checksum-sha256": headResponse.ChecksumSHA256,
      "x-amz-version-id": "version-1",
      "x-amz-server-side-encryption": "aws:kms",
      "x-amz-server-side-encryption-aws-kms-key-id": kmsKeyId,
      "x-amz-server-side-encryption-bucket-key-enabled": "true",
      "x-amz-meta-matterhorn-version": bundle.manifest.version,
      "x-amz-meta-matterhorn-build": bundle.manifest.buildCommit,
    });
    response.end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const client = new S3Client({
    region: "us-east-1", endpoint: `http://127.0.0.1:${address.port}`, forcePathStyle: true, maxAttempts: 1,
    credentials: { accessKeyId: "fixture-access", secretAccessKey: "fixture-secret-not-real" },
  });
  try {
    await upload(dataRoot, client);
    assert.deepEqual(methods, ["PUT", "HEAD"]);
    assert.equal(JSON.parse(await readFile(markerPath, "utf8")).verification, HOST_BACKUP_UPLOAD_VERIFICATION);
  } finally {
    client.destroy();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}));
