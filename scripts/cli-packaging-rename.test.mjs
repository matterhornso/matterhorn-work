#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);

const readText = (path) => readFileSync(join(root, path), "utf8");
const readJson = (path) => JSON.parse(readText(path));

const serverPkg = readJson("apps/server/package.json");
assert.equal(serverPkg.name, "matterhorn-work-server");
assert.equal(serverPkg.bin["matterhorn-work-server"], "bin/matterhorn-work-server.mjs");
assert.equal(serverPkg.bin["openwork-server"], "bin/openwork-server.mjs");
assert.match(serverPkg.scripts["build:bin"], /dist\/bin/);

const serverBuild = readText("apps/server/script/build.ts");
assert.match(serverBuild, /filename: "matterhorn-work-server"/);
assert.match(serverBuild, /outputName\("openwork-server"/);

const serverCanonical = readText("apps/server/bin/matterhorn-work-server.mjs");
assert.match(serverCanonical, /matterhorn-work-server/);
assert.match(serverCanonical, /openwork-server/);
const serverLegacy = readText("apps/server/bin/openwork-server.mjs");
assert.match(serverLegacy, /matterhorn-work-server\.mjs/);

const serverSource = readText("apps/server/src/server.ts");
assert.match(serverSource, /"service\.name": "matterhorn-work-server"/);
assert.match(serverSource, /\[matterhorn-work-server\] Unhandled error:/);

const toyUi = readText("apps/server/src/toy-ui.ts");
assert.match(toyUi, /Matterhorn Desks Local UI/);
assert.match(toyUi, /\/ui\/assets\/matterhorn-mark\.svg/);
assert.doesNotMatch(toyUi, /OpenWork Toy UI/);

const skillHub = readText("apps/server/src/skill-hub.ts");
assert.match(skillHub, /"User-Agent": "matterhorn-work-server"/);
assert.doesNotMatch(skillHub, /"User-Agent": "openwork-server"/);

const orchestratorPkg = readJson("apps/orchestrator/package.json");
assert.equal(orchestratorPkg.name, "matterhorn-work-orchestrator");
assert.match(orchestratorPkg.scripts["build:bin"], /--filename matterhorn-work/);
assert.equal(orchestratorPkg.dependencies["matterhorn-work-server"], orchestratorPkg.version);
assert.equal(orchestratorPkg.dependencies["opencode-router"], orchestratorPkg.version);
assert.equal(orchestratorPkg.dependencies["openwork-server"], undefined);

const orchestratorBuild = readText("apps/orchestrator/script/build.ts");
assert.match(orchestratorBuild, /filename: "matterhorn-work"/);
assert.match(orchestratorBuild, /outputName\("openwork"/);

const orchestratorCanonical = readText("apps/orchestrator/bin/matterhorn-work");
assert.match(orchestratorCanonical, /MATTERHORN_WORK_ORCHESTRATOR_BIN_PATH/);
assert.match(orchestratorCanonical, /matterhorn-work/);
assert.match(orchestratorCanonical, /openwork/);
const orchestratorLegacy = readText("apps/orchestrator/bin/openwork");
assert.match(orchestratorLegacy, /matterhorn-work/);

for (const path of [
  "apps/server/bin/matterhorn-work-server.mjs",
  "apps/server/bin/openwork-server.mjs",
  "apps/orchestrator/bin/matterhorn-work",
  "apps/orchestrator/bin/openwork",
]) {
  assert.equal(statSync(join(root, path)).mode & 0o111, 0o111, `${path} should be executable`);
}

const publishScript = readText("apps/orchestrator/scripts/publish-npm.mjs");
assert.match(publishScript, /matterhorn-work-\$\{target\.bun\}/);
assert.match(publishScript, /"matterhorn-work":/);
assert.match(publishScript, /openwork:/);

const postinstallScript = readText("apps/orchestrator/scripts/postinstall.mjs");
assert.match(postinstallScript, /matterhorn-work-bun/);
assert.match(postinstallScript, /MATTERHORN_WORK_ORCHESTRATOR_DOWNLOAD_BASE_URL/);
assert.match(postinstallScript, /OPENWORK_ORCHESTRATOR_DOWNLOAD_BASE_URL/);

const sidecarScript = readText("apps/orchestrator/scripts/build-sidecars.mjs");
assert.match(sidecarScript, /matterhorn-work-server/);
assert.match(sidecarScript, /openwork-server/);

const desktopRuntime = readText("apps/desktop/electron/runtime.mjs");
assert.match(desktopRuntime, /resolveBinary\("matterhorn-work"\)/);
assert.match(desktopRuntime, /resolveBinary\("openwork"\)/);

const headlessWeb = readText("scripts/dev-headless-web.ts");
assert.match(headlessWeb, /matterhorn-work-server/);
assert.match(headlessWeb, /--matterhorn-work-server-bin/);

const releaseWorkflow = readText(".github/workflows/release-macos-aarch64.yml");
assert.match(releaseWorkflow, /Release title \(defaults to Matterhorn Desks <tag>\)/);
assert.doesNotMatch(releaseWorkflow, /Release title \(defaults to OpenWork <tag>\)/);

console.log("CLI packaging rename smoke checks passed.");
