#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const PACKAGE_NAME = "@matterhorn-work/guarded-mcp";
const PACKAGE_DIRECTORY = "packages/matterhorn-guarded-mcp";
const REGISTRY = "https://registry.npmjs.org/";
const REPOSITORY = "https://github.com/matterhornso/matterhorn-work";
const WORKFLOW = ".github/workflows/publish-guarded-mcp.yml";
const BUILDER = "https://github.com/actions/runner/github-hosted";
const PUBLISH_PREDICATE = "https://github.com/npm/attestation/tree/main/specs/publish/v0.1";
const PROVENANCE_PREDICATE = "https://slsa.dev/provenance/v1";
const WORKFLOW_BUILD_TYPE = "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1";
const REPORT_VERSION = "matterhorn.guarded-mcp-provenance.v1";
const MAX_COMMAND_OUTPUT_BYTES = 5 * 1024 * 1024;
const EXACT_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

class VerificationError extends Error {
  constructor(code) {
    super(code);
    this.name = "VerificationError";
    this.code = code;
  }
}

function fail(code) {
  throw new VerificationError(code);
}

function requireExactInputs(version, expectedCommit) {
  if (!EXACT_VERSION_PATTERN.test(version ?? "")) fail("invalid_package_version");
  if (!COMMIT_PATTERN.test(expectedCommit ?? "")) fail("invalid_expected_commit");
}

function canonicalRepository(value) {
  if (typeof value !== "string") return "";
  return value.replace(/^git\+/, "").replace(/\.git$/, "").replace(/\/$/, "");
}

function canonicalTarball(version) {
  return `${REGISTRY}${PACKAGE_NAME}/-/guarded-mcp-${version}.tgz`;
}

function canonicalPurl(version) {
  return `pkg:npm/${PACKAGE_NAME.replace(/^@/, "%40")}@${version}`;
}

function integrityHex(integrity) {
  const match = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(integrity ?? "");
  if (!match) fail("invalid_registry_integrity");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.byteLength !== 64 || bytes.toString("base64") !== match[1]) {
    fail("invalid_registry_integrity");
  }
  return bytes.toString("hex");
}

function decodeStatement(attestationBundle) {
  const envelope = attestationBundle?.bundle?.dsseEnvelope;
  if (
    typeof envelope?.payload !== "string" ||
    envelope.payloadType !== "application/vnd.in-toto+json" ||
    !Array.isArray(envelope.signatures) ||
    envelope.signatures.length === 0 ||
    !Array.isArray(attestationBundle?.bundle?.verificationMaterial?.tlogEntries) ||
    attestationBundle.bundle.verificationMaterial.tlogEntries.length === 0
  ) {
    fail("invalid_attestation_bundle");
  }
  try {
    const statement = JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8"));
    if (!["https://in-toto.io/Statement/v0.1", "https://in-toto.io/Statement/v1"].includes(statement?._type)) {
      fail("invalid_attestation_statement");
    }
    return statement;
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    fail("invalid_attestation_statement");
  }
}

function findStatement(verified, predicateType) {
  const matches = (verified.attestationBundles ?? []).filter(
    (bundle) => bundle?.predicateType === predicateType,
  );
  if (matches.length !== 1) fail("missing_or_ambiguous_attestation");
  return decodeStatement(matches[0]);
}

function requireSubject(statement, purl, sha512) {
  const subjects = statement?.subject;
  if (
    !Array.isArray(subjects) ||
    subjects.length !== 1 ||
    subjects[0]?.name !== purl ||
    subjects[0]?.digest?.sha512 !== sha512
  ) {
    fail("attestation_subject_mismatch");
  }
}

export function verifyGuardedMcpProvenance({
  version,
  expectedCommit,
  npmVersion,
  packageJson,
  lockfile,
  audit,
}) {
  requireExactInputs(version, expectedCommit);
  const [npmMajor, npmMinor] = String(npmVersion ?? "").split(".").map(Number);
  if (!Number.isInteger(npmMajor) || !Number.isInteger(npmMinor) || npmMajor < 9 || (npmMajor === 9 && npmMinor < 5)) {
    fail("unsupported_npm_version");
  }
  if (
    packageJson?.name !== PACKAGE_NAME ||
    packageJson?.version !== version ||
    canonicalRepository(packageJson?.repository?.url ?? packageJson?.repository) !== REPOSITORY ||
    packageJson?.repository?.directory !== PACKAGE_DIRECTORY ||
    packageJson?.bin?.["matterhorn-guarded-mcp"] !== "index.mjs" ||
    Object.keys(packageJson?.dependencies ?? {}).length !== 0 ||
    Object.keys(packageJson?.scripts ?? {}).length !== 0
  ) {
    fail("installed_package_identity_mismatch");
  }

  const locked = lockfile?.packages?.[`node_modules/${PACKAGE_NAME}`];
  if (locked?.version !== version || locked?.resolved !== canonicalTarball(version)) {
    fail("registry_artifact_mismatch");
  }
  const sha512 = integrityHex(locked.integrity);

  if (!Array.isArray(audit?.invalid) || audit.invalid.length > 0) fail("invalid_registry_signature");
  if (!Array.isArray(audit?.missing) || audit.missing.length > 0) fail("missing_registry_signature");
  if (!Array.isArray(audit?.verified)) fail("invalid_signature_report");
  const verifiedMatches = audit.verified.filter(
    (item) => item?.name === PACKAGE_NAME && item?.version === version && item?.registry === REGISTRY,
  );
  if (verifiedMatches.length !== 1) fail("package_signature_not_verified");
  const verified = verifiedMatches[0];
  const purl = canonicalPurl(version);

  const publish = findStatement(verified, PUBLISH_PREDICATE);
  requireSubject(publish, purl, sha512);
  if (
    publish?.predicateType !== PUBLISH_PREDICATE ||
    publish?.predicate?.name !== PACKAGE_NAME ||
    publish?.predicate?.version !== version ||
    publish?.predicate?.registry !== REGISTRY.replace(/\/$/, "")
  ) {
    fail("publish_attestation_mismatch");
  }

  const provenance = findStatement(verified, PROVENANCE_PREDICATE);
  requireSubject(provenance, purl, sha512);
  const build = provenance?.predicate?.buildDefinition;
  const run = provenance?.predicate?.runDetails;
  const workflow = build?.externalParameters?.workflow;
  const dependencyMatches = (build?.resolvedDependencies ?? []).filter(
    (dependency) =>
      canonicalRepository(String(dependency?.uri ?? "").split("@")[0]) === REPOSITORY &&
      dependency?.digest?.gitCommit === expectedCommit,
  );
  if (
    provenance?.predicateType !== PROVENANCE_PREDICATE ||
    build?.buildType !== WORKFLOW_BUILD_TYPE ||
    canonicalRepository(workflow?.repository) !== REPOSITORY ||
    workflow?.path !== WORKFLOW ||
    workflow?.ref !== `refs/tags/guarded-mcp-v${version}` ||
    dependencyMatches.length !== 1 ||
    run?.builder?.id !== BUILDER ||
    !/^https:\/\/github\.com\/matterhornso\/matterhorn-work\/actions\/runs\/[1-9]\d*\/attempts\/[1-9]\d*$/.test(run?.metadata?.invocationId ?? "")
  ) {
    fail("provenance_attestation_mismatch");
  }

  return {
    version: REPORT_VERSION,
    decision: "GO",
    package: { name: PACKAGE_NAME, version, registry: REGISTRY, integrity: "sha512" },
    source: {
      repository: REPOSITORY,
      commit: expectedCommit,
      workflow: WORKFLOW,
      workflowRef: workflow.ref,
      builder: BUILDER,
      invocation: run.metadata.invocationId,
    },
    checks: {
      registrySignature: "verified",
      publishAttestation: "verified",
      provenanceAttestation: "verified",
      transparencyLog: "verified",
      packageBoundary: "dependency_free_guarded_client",
      lifecycleScripts: "disabled_during_verification",
    },
  };
}

function safeNpmEnvironment(cacheDirectory) {
  const environment = {};
  for (const name of ["PATH", "SystemRoot", "SYSTEMROOT", "LANG", "LC_ALL"]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return {
    ...environment,
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_CACHE: cacheDirectory,
    NPM_CONFIG_FUND: "false",
    NPM_CONFIG_IGNORE_SCRIPTS: "true",
    NPM_CONFIG_REGISTRY: REGISTRY,
    NPM_CONFIG_UPDATE_NOTIFIER: "false",
    NPM_CONFIG_USERCONFIG: "/dev/null",
  };
}

function writePrivateFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    writeFileSync(descriptor, contents, { encoding: "utf8" });
  } catch {
    fail("temporary_file_write_failed");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readSecureJson(path, code) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const value = readFileSync(descriptor, { encoding: "utf8" });
    if (Buffer.byteLength(value) > MAX_COMMAND_OUTPUT_BYTES) fail(code);
    return JSON.parse(value);
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function runNpm(args, directory, environment, code) {
  const result = spawnSync("npm", args, {
    cwd: directory,
    env: environment,
    encoding: "utf8",
    shell: false,
    maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
  });
  if (result.error || result.status !== 0) fail(code);
  return result.stdout;
}

function collectRegistryEvidence(version) {
  const temporary = mkdtempSync(join(tmpdir(), "matterhorn-guarded-mcp-provenance-"));
  const project = join(temporary, "project");
  const cache = join(temporary, "npm-cache");
  mkdirSync(project, { mode: 0o700 });
  mkdirSync(cache, { mode: 0o700 });
  const environment = safeNpmEnvironment(cache);
  try {
    writePrivateFile(
      join(project, "package.json"),
      `${JSON.stringify({ private: true, dependencies: { [PACKAGE_NAME]: version } }, null, 2)}\n`,
    );
    const npmVersion = runNpm(["--version"], project, environment, "npm_version_failed").trim();
    runNpm(
      ["install", "--save-exact", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock"],
      project,
      environment,
      "registry_install_failed",
    );
    const auditJson = runNpm(
      ["audit", "signatures", "--json", "--include-attestations"],
      project,
      environment,
      "registry_signature_verification_failed",
    );
    return {
      npmVersion,
      packageJson: readSecureJson(join(project, `node_modules/${PACKAGE_NAME}/package.json`), "package_read_failed"),
      lockfile: readSecureJson(join(project, "package-lock.json"), "lockfile_read_failed"),
      audit: JSON.parse(auditJson),
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true, maxRetries: 2 });
  }
}

function parseArguments(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--help") options.help = true;
    else if (argument === "--version" || argument === "--expected-commit") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) fail("invalid_arguments");
      if (argument === "--version") options.version = value;
      else options.expectedCommit = value;
      index += 1;
    } else fail("invalid_arguments");
  }
  return options;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write("Verify one exact @matterhorn-work/guarded-mcp registry artifact and its GitHub/npm provenance.\n");
      return;
    }
    requireExactInputs(options.version, options.expectedCommit);
    const report = verifyGuardedMcpProvenance({
      version: options.version,
      expectedCommit: options.expectedCommit,
      ...collectRegistryEvidence(options.version),
    });
    process.stdout.write(`${JSON.stringify(report, null, options.json ? 2 : 0)}\n`);
  } catch (error) {
    const code = error instanceof VerificationError ? error.code : "verification_failed";
    process.stderr.write(`${JSON.stringify({ version: REPORT_VERSION, decision: "NO-GO", code })}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
