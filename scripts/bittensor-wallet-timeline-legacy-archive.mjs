#!/usr/bin/env node
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

const MAGIC = Buffer.from("MHBTL01\n", "ascii");

function parseArgs(argv) {
  const config = { source: "", output: "", apply: false, confirmSource: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--source") config.source = next();
    else if (arg === "--output") config.output = next();
    else if (arg === "--apply") config.apply = true;
    else if (arg === "--confirm-source") config.confirmSource = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return config;
}

function key() {
  const raw = process.env.MATTERHORN_LEGACY_TIMELINE_ARCHIVE_KEY?.trim() || "";
  const decoded = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (decoded.length !== 32) throw new Error("MATTERHORN_LEGACY_TIMELINE_ARCHIVE_KEY must decode to exactly 32 bytes.");
  return decoded;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (!config.source || !config.output) throw new Error("--source and --output are required.");
  const source = resolve(config.source);
  const output = resolve(config.output);
  if (source === output) throw new Error("The encrypted archive must not overwrite its source timeline.");
  if (config.apply && resolve(config.confirmSource) !== source) {
    throw new Error("--apply requires --confirm-source to exactly match --source.");
  }
  const plaintext = await readFile(source);
  JSON.parse(plaintext.toString("utf8"));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const archive = Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  try {
    await writeFile(output, archive, { mode: 0o600, flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("The encrypted archive output already exists.");
    throw error;
  }

  const decodedIv = archive.subarray(MAGIC.length, MAGIC.length + 12);
  const decodedTag = archive.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const decipher = createDecipheriv("aes-256-gcm", key(), decodedIv);
  decipher.setAuthTag(decodedTag);
  const verified = Buffer.concat([decipher.update(archive.subarray(MAGIC.length + 28)), decipher.final()]);
  if (!verified.equals(plaintext)) throw new Error("Legacy timeline archive verification failed.");

  let retiredSource = null;
  if (config.apply) {
    retiredSource = `${source}.operator-archived`;
    try {
      // The archive lives beside the source, so an atomic hard link gives us
      // no-replace semantics. A competing process cannot swap in a destination
      // between a separate existence check and rename.
      await link(source, retiredSource);
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error("The retired source destination already exists.");
      throw error;
    }
    await unlink(source);
  }
  process.stdout.write(`${JSON.stringify({
    version: "matterhorn.bittensor-legacy-timeline-archive.v1",
    ready: true,
    archiveSha256: createHash("sha256").update(archive).digest("hex"),
    sourceRetired: Boolean(retiredSource),
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
