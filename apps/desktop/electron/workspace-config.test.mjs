import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { ensureWorkspaceOpenworkConfig } from "./workspace-config.mjs";

async function withWorkspace(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "matterhorn-workspace-config-test-"));
  try {
    await run(root, path.join(root, ".opencode", "openwork.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("native local workspace config initialization", () => {
  it("preserves an unregistered prior workspace config byte for byte", async () => {
    await withWorkspace(async (root, configPath) => {
      const existing = JSON.stringify({
        version: 1,
        workspace: { name: "Saved name", createdAt: 123, preset: "research" },
        authorizedRoots: [root, path.join(root, "shared")],
        reload: { auto: false, resume: true },
        custom: { setting: "keep me" },
      }, null, 4) + "\n";
      await mkdir(path.dirname(configPath));
      await writeFile(configPath, existing);

      const created = await ensureWorkspaceOpenworkConfig(root, {
        version: 1,
        workspace: { name: "Replacement", createdAt: 456, preset: "starter" },
        authorizedRoots: [root],
        reload: null,
      });

      assert.equal(created, false);
      assert.equal(await readFile(configPath, "utf8"), existing);
    });
  });

  it("initializes missing config and keeps that config on subsequent opens", async () => {
    await withWorkspace(async (root, configPath) => {
      const initial = { version: 1, workspace: { preset: "starter" }, authorizedRoots: [root], reload: null };
      assert.equal(await ensureWorkspaceOpenworkConfig(root, initial), true);
      assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), initial);
      assert.equal(await ensureWorkspaceOpenworkConfig(root, { version: 2 }), false);
      assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), initial);
    });
  });

  it("does not replace malformed existing config", async () => {
    await withWorkspace(async (root, configPath) => {
      const existing = "{ unfinished user edit\n";
      await mkdir(path.dirname(configPath));
      await writeFile(configPath, existing);
      assert.equal(await ensureWorkspaceOpenworkConfig(root, { version: 1 }), false);
      assert.equal(await readFile(configPath, "utf8"), existing);
    });
  });

  it("initializes only once across concurrent opens", async () => {
    await withWorkspace(async (root, configPath) => {
      const configs = [{ owner: "first" }, { owner: "second" }];
      const results = await Promise.all(configs.map((config) => ensureWorkspaceOpenworkConfig(root, config)));
      assert.equal(results.filter(Boolean).length, 1);
      assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), configs[results.indexOf(true)]);
    });
  });

  it("propagates filesystem failures rather than reporting a successful open", async () => {
    await withWorkspace(async (root) => {
      await writeFile(path.join(root, ".opencode"), "not a directory");
      await assert.rejects(ensureWorkspaceOpenworkConfig(root, { version: 1 }));
    });
  });

  it("uses initialization rather than replacement in the native workspaceCreate handler", async () => {
    const main = await readFile(new URL("./main.mjs", import.meta.url), "utf8");
    const createHandler = main.split('case "workspaceCreate": {')[1].split('case "workspaceCreateRemote": {')[0];
    assert.match(createHandler, /await ensureWorkspaceOpenworkConfig\(folderPath, defaultWorkspaceOpenworkConfig\(folderPath, preset\)\)/);
    assert.doesNotMatch(createHandler, /writeWorkspaceOpenworkConfig/);
  });
});
