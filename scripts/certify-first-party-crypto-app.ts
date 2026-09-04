#!/usr/bin/env bun

import { constants } from "node:fs";
import {
  access,
  chmod,
  link,
  open,
  realpath,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { MatterhornCryptoAppManifest } from "@matterhorn-work/types/crypto-coworkers";
import type { MatterhornFirstPartyCertificationInputs } from "../apps/server/src/first-party-crypto-app-certification-driver.js";
import {
  certifyMatterhornFirstPartyCryptoApp,
  certifyMatterhornFirstPartyPublicReadCryptoApp,
} from "../apps/server/src/first-party-crypto-app-certifier.js";

type CertificationScope = "testnet" | "public-readonly";

type CliConfig = {
  manifestPath: string;
  publisherPublicKeyPath: string;
  inputsPath: string;
  outputPath: string;
  policyVersion: string;
  probeTimeoutMs: number;
  scope: CertificationScope;
};

const HELP = `Matterhorn first-party crypto app certification

Usage:
  pnpm certify:crypto-app -- \\
    --manifest /secure/signed-manifest.json \\
    --publisher-public-key /secure/publisher-public-key.pem \\
    --inputs /secure/testnet-action-inputs.json \\
    --policy-version <version> \\
    --output /secure/certification-promotion.json

Public Polymarket reads use the separate package command
\`pnpm certify:crypto-app-readonly\` with the same file arguments.

The default command certifies only the first-party testnet contracts. The
public-readonly command certifies only Matterhorn's fixed, unauthenticated
Polymarket discovery or order-book read contract and grants no transaction authority.
The input file may contain linked identities or exact public queries and must be owner-only.
No private key, seed phrase, API credential, signature, or wallet export is accepted.
The output is created with mode 0600 only after every static and runtime probe passes.`;

function valueAfter(argv: string[], index: number): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error("certification_cli_argument_invalid");
  return value;
}

function parseArgs(argv: string[]): CliConfig | "help" {
  if (argv.includes("--help") || argv.includes("-h")) return "help";
  const values = new Map<string, string>();
  const allowed = new Set([
    "--manifest",
    "--publisher-public-key",
    "--inputs",
    "--output",
    "--policy-version",
    "--probe-timeout-ms",
    "--scope",
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key || !allowed.has(key) || values.has(key)) {
      throw new Error("certification_cli_argument_invalid");
    }
    values.set(key, valueAfter(argv, index));
  }
  const timeout = Number(values.get("--probe-timeout-ms") ?? "15000");
  const required = [
    "--manifest",
    "--publisher-public-key",
    "--inputs",
    "--output",
    "--policy-version",
  ];
  if (required.some((key) => !values.get(key))
    || !Number.isSafeInteger(timeout)
    || timeout < 1
    || timeout > 30_000) {
    throw new Error("certification_cli_argument_invalid");
  }
  const scope = values.get("--scope") ?? "testnet";
  if (scope !== "testnet" && scope !== "public-readonly") {
    throw new Error("certification_cli_argument_invalid");
  }
  return {
    manifestPath: resolve(values.get("--manifest")!),
    publisherPublicKeyPath: resolve(values.get("--publisher-public-key")!),
    inputsPath: resolve(values.get("--inputs")!),
    outputPath: resolve(values.get("--output")!),
    policyVersion: values.get("--policy-version")!,
    probeTimeoutMs: timeout,
    scope,
  };
}

async function readBounded(path: string, maxBytes: number, ownerOnly = false): Promise<Buffer> {
  const flags = process.platform === "win32"
    ? constants.O_RDONLY
    : constants.O_RDONLY | constants.O_NOFOLLOW;
  let handle;
  try {
    handle = await open(path, flags);
  } catch {
    throw new Error("certification_cli_input_invalid");
  }
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > maxBytes) {
      throw new Error("certification_cli_input_invalid");
    }
    if (ownerOnly && process.platform !== "win32" && (before.mode & 0o077) !== 0) {
      throw new Error("certification_cli_input_permissions_invalid");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (bytes.byteLength > maxBytes
      || after.size !== bytes.byteLength
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs) {
      throw new Error("certification_cli_input_invalid");
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function parseJsonObject<T>(bytes: Buffer): T {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("certification_cli_input_invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("certification_cli_input_invalid");
  }
  return value as T;
}

async function ensureDistinctPaths(config: CliConfig): Promise<void> {
  const inputs = await Promise.all([
    realpath(config.manifestPath),
    realpath(config.publisherPublicKeyPath),
    realpath(config.inputsPath),
  ]);
  if (new Set(inputs).size !== inputs.length || inputs.includes(config.outputPath)) {
    throw new Error("certification_cli_path_conflict");
  }
  try {
    await access(config.outputPath, constants.F_OK);
    throw new Error("certification_cli_output_exists");
  } catch (error) {
    if (error instanceof Error && error.message === "certification_cli_output_exists") throw error;
  }
}

function safeFailureCode(error: unknown): string {
  if (!(error instanceof Error) || !/^[a-z][a-z0-9_]{2,100}$/.test(error.message)) {
    return "certification_failed";
  }
  return error.message;
}

export async function runFirstPartyCryptoAppCertificationCli(argv: string[]): Promise<number> {
  let tempPath: string | null = null;
  try {
    const config = parseArgs(argv);
    if (config === "help") {
      process.stdout.write(`${HELP}\n`);
      return 0;
    }
    await ensureDistinctPaths(config);
    const [manifestBytes, publicKeyBytes, inputBytes] = await Promise.all([
      readBounded(config.manifestPath, 320 * 1024),
      readBounded(config.publisherPublicKeyPath, 64 * 1024),
      readBounded(config.inputsPath, 128 * 1024, true),
    ]);
    const manifest = parseJsonObject<MatterhornCryptoAppManifest>(manifestBytes);
    const actionInputs = parseJsonObject<MatterhornFirstPartyCertificationInputs>(inputBytes);
    const certificationOptions = {
      manifest,
      publisherPublicKey: publicKeyBytes,
      policyVersion: config.policyVersion,
      actionInputs,
      probeTimeoutMs: config.probeTimeoutMs,
    };
    const promotion = config.scope === "public-readonly"
      ? await certifyMatterhornFirstPartyPublicReadCryptoApp(certificationOptions)
      : await certifyMatterhornFirstPartyCryptoApp(certificationOptions);

    tempPath = resolve(dirname(config.outputPath), `.matterhorn-certification-${process.pid}-${Date.now()}.tmp`);
    await writeFile(tempPath, `${JSON.stringify(promotion, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await chmod(tempPath, 0o600);
    // Hard-link publication is atomic and fails if another process creates the
    // output after the preflight check; unlike rename, it cannot overwrite it.
    await link(tempPath, config.outputPath);
    await unlink(tempPath);
    tempPath = null;
    process.stdout.write(JSON.stringify({
      appId: promotion.report.appId,
      manifestRevision: promotion.report.manifestRevision,
      state: promotion.state,
      passed: true,
      staticReportHash: promotion.report.reportHash,
      runtimeReportHash: promotion.runtimeReport.reportHash,
    }) + "\n");
    return 0;
  } catch (error) {
    if (tempPath) await unlink(tempPath).catch(() => undefined);
    process.stderr.write(`Matterhorn certification failed: ${safeFailureCode(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runFirstPartyCryptoAppCertificationCli(process.argv.slice(2));
}
