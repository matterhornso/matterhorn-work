#!/usr/bin/env node

import assert from "node:assert/strict";
import { verifyGuardedMcpProvenance } from "./guarded-mcp-provenance.mjs";

const packageName = "@matterhorn-work/guarded-mcp";
const version = "0.1.0";
const expectedCommit = "a".repeat(40);
const registry = "https://registry.npmjs.org/";
const integrityBytes = Buffer.alloc(64, 9);
const integrity = `sha512-${integrityBytes.toString("base64")}`;
const sha512 = integrityBytes.toString("hex");
const purl = "pkg:npm/%40matterhorn-work/guarded-mcp@0.1.0";

function envelope(predicateType, predicate) {
  return {
    predicateType,
    bundle: {
      verificationMaterial: { tlogEntries: [{ logIndex: "1" }] },
      dsseEnvelope: {
        payload: Buffer.from(JSON.stringify({
          _type: "https://in-toto.io/Statement/v1",
          subject: [{ name: purl, digest: { sha512 } }],
          predicateType,
          predicate,
        })).toString("base64"),
        payloadType: "application/vnd.in-toto+json",
        signatures: [{ sig: "fixture-signature" }],
      },
    },
  };
}

function fixture() {
  return {
    version,
    expectedCommit,
    npmVersion: "11.19.0",
    packageJson: {
      name: packageName,
      version,
      bin: { "matterhorn-guarded-mcp": "index.mjs" },
      repository: {
        type: "git",
        url: "git+https://github.com/matterhornso/matterhorn-work.git",
        directory: "packages/matterhorn-guarded-mcp",
      },
    },
    lockfile: {
      packages: {
        [`node_modules/${packageName}`]: {
          version,
          resolved: `${registry}${packageName}/-/guarded-mcp-${version}.tgz`,
          integrity,
        },
      },
    },
    audit: {
      invalid: [],
      missing: [],
      verified: [{
        name: packageName,
        version,
        registry,
        attestationBundles: [
          envelope("https://github.com/npm/attestation/tree/main/specs/publish/v0.1", {
            name: packageName,
            version,
            registry: registry.slice(0, -1),
          }),
          envelope("https://slsa.dev/provenance/v1", {
            buildDefinition: {
              buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
              externalParameters: {
                workflow: {
                  ref: "refs/tags/guarded-mcp-v0.1.0",
                  repository: "https://github.com/matterhornso/matterhorn-work",
                  path: ".github/workflows/publish-guarded-mcp.yml",
                },
              },
              resolvedDependencies: [{
                uri: "git+https://github.com/matterhornso/matterhorn-work@refs/tags/guarded-mcp-v0.1.0",
                digest: { gitCommit: expectedCommit },
              }],
            },
            runDetails: {
              builder: { id: "https://github.com/actions/runner/github-hosted" },
              metadata: {
                invocationId: "https://github.com/matterhornso/matterhorn-work/actions/runs/123/attempts/1",
              },
            },
          }),
        ],
      }],
    },
  };
}

function expectFailure(code, mutate) {
  const value = fixture();
  mutate(value);
  assert.throws(
    () => verifyGuardedMcpProvenance(value),
    (error) => error?.code === code,
    `expected ${code}`,
  );
}

const report = verifyGuardedMcpProvenance(fixture());
assert.equal(report.version, "matterhorn.guarded-mcp-provenance.v1");
assert.equal(report.decision, "GO");
assert.equal(report.source.commit, expectedCommit);
assert.equal(report.checks.packageBoundary, "dependency_free_guarded_client");
assert.equal(JSON.stringify(report).includes("fixture-signature"), false);

expectFailure("installed_package_identity_mismatch", (value) => {
  value.packageJson.dependencies = { "matterhorn-work-mcp": "*" };
});
expectFailure("installed_package_identity_mismatch", (value) => {
  value.packageJson.bin["matterhorn-guarded-mcp"] = "../matterhorn-work-mcp/index.mjs";
});
expectFailure("invalid_registry_signature", (value) => value.audit.invalid.push({ name: packageName }));
expectFailure("missing_registry_signature", (value) => value.audit.missing.push({ name: packageName }));
expectFailure("registry_artifact_mismatch", (value) => {
  value.lockfile.packages[`node_modules/${packageName}`].resolved = "https://example.test/package.tgz";
});
expectFailure("publish_attestation_mismatch", (value) => {
  const bundle = value.audit.verified[0].attestationBundles[0];
  const statement = JSON.parse(Buffer.from(bundle.bundle.dsseEnvelope.payload, "base64").toString("utf8"));
  statement.predicate.name = "matterhorn-work-mcp";
  bundle.bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(statement)).toString("base64");
});
expectFailure("provenance_attestation_mismatch", (value) => {
  const bundle = value.audit.verified[0].attestationBundles[1];
  const statement = JSON.parse(Buffer.from(bundle.bundle.dsseEnvelope.payload, "base64").toString("utf8"));
  statement.predicate.buildDefinition.externalParameters.workflow.path = ".github/workflows/publish-crypto-app-sdk.yml";
  bundle.bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(statement)).toString("base64");
});
expectFailure("provenance_attestation_mismatch", (value) => {
  const bundle = value.audit.verified[0].attestationBundles[1];
  const statement = JSON.parse(Buffer.from(bundle.bundle.dsseEnvelope.payload, "base64").toString("utf8"));
  statement.predicate.buildDefinition.externalParameters.workflow.ref = "refs/tags/guarded-mcp-v9.9.9";
  bundle.bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(statement)).toString("base64");
});
expectFailure("provenance_attestation_mismatch", (value) => {
  const bundle = value.audit.verified[0].attestationBundles[1];
  const statement = JSON.parse(Buffer.from(bundle.bundle.dsseEnvelope.payload, "base64").toString("utf8"));
  statement.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = "b".repeat(40);
  bundle.bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(statement)).toString("base64");
});
expectFailure("invalid_attestation_bundle", (value) => {
  value.audit.verified[0].attestationBundles[1].bundle.verificationMaterial.tlogEntries = [];
});
expectFailure("unsupported_npm_version", (value) => { value.npmVersion = "9.4.0"; });

console.log("Guarded MCP published-provenance verification passed.");
