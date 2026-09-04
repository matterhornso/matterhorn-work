#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";

const PATCH_COMMIT = "04cb6f54ce552b3ebde6be06d6050419e1c7333e";
const PATCH_SPEC = `github:indutny/elliptic#${PATCH_COMMIT}`;
const PATCH_TARBALL = `https://codeload.github.com/indutny/elliptic/tar.gz/${PATCH_COMMIT}`;
const PATCHED_SOURCE_SHA256 = "668741c0c921bf5174439104e8fd20636578373cbbd28736ccbcd8e59a5aeafc";

const root = process.cwd();
const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const appPackage = JSON.parse(readFileSync(join(root, "apps/app/package.json"), "utf8"));
const lockfile = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");

assert.equal(
  rootPackage.pnpm?.overrides?.elliptic,
  PATCH_SPEC,
  "elliptic must resolve to the exact upstream security-fix commit",
);
assert.equal(
  appPackage.dependencies?.["@polymarket/clob-client-v2"],
  "1.1.0",
  "the wallet must keep the reviewed Polymarket CLOB V2 client pinned exactly",
);
assert.equal(
  appPackage.dependencies?.["@polymarket/clob-client"],
  undefined,
  "the unsupported Polymarket CLOB V1 client must not return",
);
assert.ok(lockfile.includes(`elliptic: ${PATCH_SPEC}`), "lockfile must preserve the exact elliptic override");
assert.ok(lockfile.includes(`resolution: {tarball: ${PATCH_TARBALL}}`), "lockfile must resolve the exact patch tarball");
assert.doesNotMatch(
  lockfile,
  /^  elliptic@6\.6\.1(?:\([^\n]+\))?:$/m,
  "the vulnerable registry artifact must not remain in the locked graph",
);

// Resolve the actual transitive signing path used by the Polymarket client. This
// prevents an unused patched copy from satisfying the proof while the wallet
// continues to load the vulnerable registry package.
const appRequire = createRequire(join(root, "apps/app/package.json"));
const clobEntry = appRequire.resolve("@polymarket/clob-client-v2");
const clobRequire = createRequire(clobEntry);
const walletEntry = clobRequire.resolve("@ethersproject/wallet");
const walletRequire = createRequire(walletEntry);
const signingKeyEntry = walletRequire.resolve("@ethersproject/signing-key");
const signingKeyRequire = createRequire(signingKeyEntry);
const ellipticEntry = signingKeyRequire.resolve("elliptic/lib/elliptic/ec/index.js");

assert.ok(
  ellipticEntry.includes(PATCH_COMMIT),
  "the Polymarket signing path must load elliptic from the pinned patch commit",
);
const source = readFileSync(ellipticEntry);
assert.equal(
  createHash("sha256").update(source).digest("hex"),
  PATCHED_SOURCE_SHA256,
  "the installed elliptic signing source must match the reviewed upstream patch",
);

const { ec: EC } = signingKeyRequire("elliptic");
const ec = new EC("secp256k1");
const privateKey = "1".padStart(64, "0");
assert.throws(
  () => ec.sign(-1, privateKey, "hex"),
  /Can not sign a negative message/,
  "negative messages must fail before deterministic nonce generation",
);
assert.throws(
  () => ec.sign({}, privateKey),
  /Expected message to be an array-like/,
  "non-array-like messages must fail before deterministic nonce generation",
);
assert.throws(
  () => ec.sign([256], privateKey),
  /Assertion failed/,
  "non-byte array-like messages must fail before deterministic nonce generation",
);
const signature = ec.sign("01", privateKey, "hex");
assert.equal(
  ec.verify("01", signature, ec.keyFromPrivate(privateKey, "hex").getPublic()),
  true,
  "the pinned patch must preserve valid secp256k1 signing",
);

console.log(`elliptic security patch proof: PASS (${PATCH_COMMIT})`);
