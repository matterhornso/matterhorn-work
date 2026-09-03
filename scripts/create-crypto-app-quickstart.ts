#!/usr/bin/env bun
import {
  existsSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import {
  createMatterhornCryptoAppQuickstart,
  MatterhornCryptoAppQuickstartError,
  type MatterhornCryptoAppQuickstartProtocol,
} from "../packages/crypto-app-sdk/src/index.js";

type ParsedArguments = {
  protocol?: string;
  appId?: string;
  publisherId?: string;
  publisherKeyId?: string;
  displayName?: string;
  manifestRevision?: string;
  endpoint?: string;
  privacyPolicyUrl?: string;
  securityContact?: string;
  statusUrl?: string;
  outputDir?: string;
  json: boolean;
  help: boolean;
};

function parseArguments(argv: string[]): ParsedArguments {
  const result: ParsedArguments = { json: false, help: false };
  const values: Record<string, Exclude<keyof ParsedArguments, "json" | "help">> = {
    "--protocol": "protocol",
    "--app-id": "appId",
    "--publisher-id": "publisherId",
    "--publisher-key-id": "publisherKeyId",
    "--display-name": "displayName",
    "--manifest-revision": "manifestRevision",
    "--endpoint": "endpoint",
    "--privacy-policy-url": "privacyPolicyUrl",
    "--security-contact": "securityContact",
    "--status-url": "statusUrl",
    "--output-dir": "outputDir",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      result.json = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      result.help = true;
      continue;
    }
    const property = values[argument];
    if (!property) throw new Error(`Unknown option: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    result[property] = value;
    index += 1;
  }
  return result;
}

function usage(): string {
  return `Create a locally validated, read-only Matterhorn testnet adapter starter.

Usage:
  pnpm create:crypto-app -- \\
    --protocol sui \\
    --app-id acme.sui-testnet \\
    --endpoint https://adapter.acme.example/v1 \\
    --output-dir ./acme-sui

Required:
  --protocol <sui|hyperliquid|bittensor>
  --app-id <lowercase-public-id>
  --endpoint <public-https-test-adapter-url>
  --output-dir <new-directory>

Optional:
  --publisher-id <id>            Defaults to the first app-id segment
  --publisher-key-id <id>        Defaults to publisher-1
  --display-name <name>
  --manifest-revision <revision> Defaults to 0.1.0
  --privacy-policy-url <url>
  --security-contact <email-or-url>
  --status-url <url>
  --json

The command never creates keys, credentials, wallet access, certification, or
mainnet authority. The output directory must not already exist.
`;
}

function required(value: string | undefined, flag: string): string {
  if (!value?.trim()) throw new Error(`${flag} is required`);
  return value.trim();
}

function publisherFromAppId(appId: string): string {
  return appId.split(/[._-]/, 1)[0] || "publisher";
}

function writeStarter(
  outputDirectory: string,
  artifacts: Array<{ path: string; content: string }>,
): void {
  const target = resolve(outputDirectory);
  if (existsSync(target)) {
    throw new Error(`Output directory already exists: ${target}`);
  }
  const parent = dirname(target);
  if (!existsSync(parent)) {
    throw new Error(`Output parent does not exist: ${parent}`);
  }
  const temporary = mkdtempSync(join(parent, `.${basename(target)}.tmp-`));
  let committed = false;
  try {
    for (const artifact of artifacts) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(artifact.path)) {
        throw new Error("Generated artifact path is unsafe");
      }
      writeFileSync(join(temporary, artifact.path), artifact.content, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
    }
    renameSync(temporary, target);
    committed = true;
  } finally {
    if (!committed) rmSync(temporary, { recursive: true, force: true });
  }
}

function main(): void {
  let args: ParsedArguments;
  try {
    args = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid arguments");
    console.error(usage());
    process.exitCode = 1;
    return;
  }
  if (args.help) {
    console.log(usage());
    return;
  }
  try {
    const protocol = required(args.protocol, "--protocol");
    const appId = required(args.appId, "--app-id");
    const outputDir = required(args.outputDir, "--output-dir");
    const quickstart = createMatterhornCryptoAppQuickstart({
      protocol: protocol as MatterhornCryptoAppQuickstartProtocol,
      appId,
      publisherId: args.publisherId?.trim() || publisherFromAppId(appId),
      publisherKeyId: args.publisherKeyId,
      displayName: args.displayName,
      manifestRevision: args.manifestRevision,
      endpoint: required(args.endpoint, "--endpoint"),
      privacyPolicyUrl: args.privacyPolicyUrl,
      securityContact: args.securityContact,
      statusUrl: args.statusUrl,
    });
    writeStarter(outputDir, quickstart.artifacts);
    const summary = {
      version: quickstart.version,
      ready: true,
      outputDirectory: resolve(outputDir),
      appId: quickstart.manifest.appId,
      protocol: quickstart.protocol,
      network: quickstart.network,
      actionId: quickstart.manifest.actions[0]?.id ?? null,
      validation: quickstart.validation,
      safety: quickstart.safety,
      nextSteps: quickstart.nextSteps,
    };
    if (args.json) console.log(JSON.stringify(summary));
    else {
      console.log(`Created ${summary.appId} in ${summary.outputDirectory}`);
      console.log(`Local checks: passed (${summary.network}, read-only)`);
      console.log("Next: open README.md in the generated directory.");
    }
  } catch (error) {
    const issues = error instanceof MatterhornCryptoAppQuickstartError
      ? error.issues
      : [];
    console.error(error instanceof Error ? error.message : "Quickstart failed");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  }
}

main();
