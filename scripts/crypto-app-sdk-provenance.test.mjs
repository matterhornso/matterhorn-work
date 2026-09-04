#!/usr/bin/env node

import assert from "node:assert/strict";
import { verifyCryptoAppSdkProvenance } from "./crypto-app-sdk-provenance.mjs";

const packageName = "@matterhorn-work/crypto-app-sdk";
const version = "0.1.0";
const expectedCommit = "a".repeat(40);
const registry = "https://registry.npmjs.org/";
const integrityBytes = Buffer.alloc(64, 7);
const integrity = `sha512-${integrityBytes.toString("base64")}`;
const sha512 = integrityBytes.toString("hex");
const purl = "pkg:npm/%40matterhorn-work/crypto-app-sdk@0.1.0";

function envelope(predicateType, predicate) {
  return {
    predicateType,
    bundle: {
      mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
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
      repository: {
        type: "git",
        url: "git+https://github.com/matterhornso/matterhorn-work.git",
        directory: "packages/crypto-app-sdk",
      },
    },
    lockfile: {
      packages: {
        [`node_modules/${packageName}`]: {
          version,
          resolved: `${registry}${packageName}/-/crypto-app-sdk-${version}.tgz`,
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
                  ref: "refs/tags/crypto-app-sdk-v0.1.0",
                  repository: "https://github.com/matterhornso/matterhorn-work",
                  path: ".github/workflows/publish-crypto-app-sdk.yml",
                },
              },
              resolvedDependencies: [{
                uri: "git+https://github.com/matterhornso/matterhorn-work@refs/tags/crypto-app-sdk-v0.1.0",
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

function clone(value) {
  return structuredClone(value);
}

function expectFailure(code, mutate) {
  const value = fixture();
  mutate(value);
  assert.throws(
    () => verifyCryptoAppSdkProvenance(value),
    (error) => error?.code === code,
    `expected ${code}`,
  );
}

const report = verifyCryptoAppSdkProvenance(fixture());
assert.equal(report.version, "matterhorn.crypto-app-sdk-provenance.v1");
assert.equal(report.decision, "GO");
assert.equal(report.source.commit, expectedCommit);
assert.equal(report.checks.registrySignature, "verified");
assert.equal(JSON.stringify(report).includes("attestationBundles"), false);
assert.equal(JSON.stringify(report).includes("fixture-signature"), false);

expectFailure("invalid_registry_signature", (value) => value.audit.invalid.push({ name: packageName }));
expectFailure("missing_registry_signature", (value) => value.audit.missing.push({ name: packageName }));
expectFailure("registry_artifact_mismatch", (value) => {
  value.lockfile.packages[`node_modules/${packageName}`].resolved = "https://example.test/package.tgz";
});
expectFailure("publish_attestation_mismatch", (value) => {
  const publish = value.audit.verified[0].attestationBundles[0];
  const statement = JSON.parse(Buffer.from(publish.bundle.dsseEnvelope.payload, "base64").toString("utf8"));
  statement.predicate.registry = "https://example.test";
  publish.bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(statement)).toString("base64");
});
expectFailure("provenance_attestation_mismatch", (value) => {
  const provenance = value.audit.verified[0].attestationBundles[1];
  const statement = JSON.parse(Buffer.from(provenance.bundle.dsseEnvelope.payload, "base64").toString("utf8"));
  statement.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = "b".repeat(40);
  provenance.bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(statement)).toString("base64");
});
expectFailure("invalid_attestation_bundle", (value) => {
  value.audit.verified[0].attestationBundles[1].bundle.verificationMaterial.tlogEntries = [];
});
expectFailure("unsupported_npm_version", (value) => { value.npmVersion = "9.4.0"; });
expectFailure("attestation_subject_mismatch", (value) => {
  const provenance = value.audit.verified[0].attestationBundles[1];
  const statement = JSON.parse(Buffer.from(provenance.bundle.dsseEnvelope.payload, "base64").toString("utf8"));
  statement.subject[0].digest.sha512 = "00".repeat(64);
  provenance.bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(statement)).toString("base64");
});

const independent = clone(fixture());
assert.equal(verifyCryptoAppSdkProvenance(independent).decision, "GO");

console.log("Crypto App SDK published-provenance verification passed.");
