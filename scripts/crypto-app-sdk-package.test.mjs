#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repository = process.cwd();
const packageDirectory = join(repository, "packages/crypto-app-sdk");
const temporary = mkdtempSync(join(tmpdir(), "matterhorn-crypto-sdk-package-"));
const packDirectory = join(temporary, "pack");
const extractDirectory = join(temporary, "extract");
const consumerDirectory = join(temporary, "consumer");
mkdirSync(packDirectory);
mkdirSync(extractDirectory);
mkdirSync(consumerDirectory);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repository,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_update_notifier: "false",
    },
  });
  assert.equal(result.error, undefined, `${command} failed to start: ${result.error?.message}`);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`,
  );
  return result;
}

const packed = run("pnpm", ["pack", "--pack-destination", packDirectory], {
  cwd: packageDirectory,
});
const tarballName = packed.stdout
  .trim()
  .split(/\r?\n/)
  .findLast((line) => line.endsWith(".tgz"));
assert.ok(tarballName, `pnpm pack did not return a tarball name\n${packed.stdout}`);
const tarball = resolve(packageDirectory, tarballName);

const archive = run("tar", ["-tzf", tarball]).stdout.trim().split(/\r?\n/);
for (const required of [
  "package/package.json",
  "package/README.md",
  "package/bin/create-matterhorn-crypto-app.mjs",
  "package/dist/index.js",
  "package/dist/index.d.ts",
  "package/dist/json-schema.js",
  "package/dist/json-schema.d.ts",
  "package/dist/node-quickstart.js",
]) {
  assert.ok(archive.includes(required), `SDK tarball missing ${required}`);
}
for (const forbidden of [".env", "node_modules", "pnpm-lock.yaml", ".test.", ".spec."]) {
  assert.equal(
    archive.some((entry) => entry.includes(forbidden)),
    false,
    `SDK tarball includes forbidden entry containing ${forbidden}`,
  );
}
assert.equal(
  archive.some((entry) => entry.startsWith("package/src/")),
  false,
  "SDK tarball must expose compiled artifacts rather than private workspace source",
);

run("tar", ["-xzf", tarball, "-C", extractDirectory]);
const packedPackage = JSON.parse(
  readFileSync(join(extractDirectory, "package/package.json"), "utf8"),
);
assert.equal(packedPackage.private, undefined);
assert.equal(packedPackage.sideEffects, false);
assert.equal(packedPackage.engines?.node, ">=20");
assert.equal(packedPackage.exports?.["."]?.import, "./dist/index.js");
assert.equal(packedPackage.exports?.["./json-schema"]?.import, "./dist/json-schema.js");
assert.equal(packedPackage.exports?.["."]?.development, undefined);
assert.equal(packedPackage.exports?.["./json-schema"]?.development, undefined);
assert.equal(
  Object.keys(packedPackage.dependencies ?? {}).some((name) => name.startsWith("@matterhorn-work/")),
  false,
  "published SDK must not depend on private workspace packages",
);
const declaration = readFileSync(join(extractDirectory, "package/dist/index.d.ts"), "utf8");
assert.equal(
  declaration.includes("@matterhorn-work/types"),
  false,
  "published declarations must be standalone",
);

writeFileSync(
  join(consumerDirectory, "package.json"),
  JSON.stringify({ name: "clean-sdk-consumer", private: true, type: "module" }, null, 2),
);
run(
  "pnpm",
  [
    "add",
    "--offline",
    "--ignore-scripts",
    "--save-exact",
    tarball,
  ],
  { cwd: consumerDirectory },
);

writeFileSync(
  join(consumerDirectory, "consumer.mjs"),
  `import assert from "node:assert/strict";
import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  createMatterhornSuiTestnetFixturePack,
  projectCryptoAppOutput,
} from "@matterhorn-work/crypto-app-sdk";
import { validateCryptoAppSchemaDefinition } from "@matterhorn-work/crypto-app-sdk/json-schema";

assert.equal(MATTERHORN_CRYPTO_APP_MANIFEST_VERSION, "matterhorn.crypto-app-manifest.v1");
assert.equal(createMatterhornSuiTestnetFixturePack().network, "sui:testnet");
assert.deepEqual(validateCryptoAppSchemaDefinition({ type: "object", properties: {}, additionalProperties: false }), []);
assert.equal(projectCryptoAppOutput({ type: "string" }, "safe").value, "safe");
`,
);
run("node", ["consumer.mjs"], { cwd: consumerDirectory });
run("node", ["--conditions=development", "consumer.mjs"], { cwd: consumerDirectory });

writeFileSync(
  join(consumerDirectory, "consumer.ts"),
  `import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  type MatterhornCryptoAppManifest,
} from "@matterhorn-work/crypto-app-sdk";

const version: MatterhornCryptoAppManifest["version"] = MATTERHORN_CRYPTO_APP_MANIFEST_VERSION;
void version;
`,
);
writeFileSync(
  join(consumerDirectory, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      lib: ["ES2022", "DOM"],
      strict: true,
      noEmit: true,
      skipLibCheck: false,
    },
    include: ["consumer.ts"],
  }, null, 2),
);
run(
  resolve(packageDirectory, "node_modules/.bin/tsc"),
  ["--project", join(consumerDirectory, "tsconfig.json")],
  { cwd: consumerDirectory },
);

const starterDirectory = join(consumerDirectory, "starter");
const binary = join(
  consumerDirectory,
  "node_modules/@matterhorn-work/crypto-app-sdk/bin/create-matterhorn-crypto-app.mjs",
);
chmodSync(binary, 0o755);
const quickstart = run("node", [
  binary,
  "--protocol", "sui",
  "--app-id", "clean.sui-testnet",
  "--endpoint", "https://adapter.example.test/v1",
  "--output-dir", starterDirectory,
  "--json",
], { cwd: consumerDirectory });
const summary = JSON.parse(quickstart.stdout);
assert.equal(summary.ready, true);
assert.equal(summary.network, "sui:testnet");
assert.equal(summary.safety.walletAuthorityIncluded, false);
assert.equal(summary.safety.signingKeyIncluded, false);
assert.equal(summary.safety.certificationGranted, false);
const serialized = [
  quickstart.stdout,
  readFileSync(join(starterDirectory, "manifest.unsigned.json"), "utf8"),
  readFileSync(join(starterDirectory, "signing-request.json"), "utf8"),
].join("\n");
assert.equal(/private.?key|seed.?phrase|wallet.?export/i.test(serialized), false);
assert.equal(serialized.includes("mainnet"), false);
assert.equal(serialized.includes("ExecuteTransaction"), false);

console.log("Crypto App SDK clean-package acceptance passed.");
