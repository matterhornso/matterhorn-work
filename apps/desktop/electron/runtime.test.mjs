import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import { createRuntimeManager, prioritizeWorkspacePaths } from "./runtime.mjs";

describe("prioritizeWorkspacePaths", () => {
  it("keeps the active runtime workspace first", () => {
    assert.deepEqual(
      prioritizeWorkspacePaths("/workspace/current", ["/workspace/other", "/workspace/current"]),
      ["/workspace/current", "/workspace/other"],
    );
  });

  it("dedupes equivalent paths", () => {
    assert.deepEqual(
      prioritizeWorkspacePaths("/workspace/current/../current", ["/workspace/current"]),
      ["/workspace/current/../current"],
    );
  });
});

describe("createRuntimeManager", () => {
  it("exposes the Matterhorn server info bridge used by Electron startup", async () => {
    const root = path.join(os.tmpdir(), "matterhorn-runtime-manager-test");
    const fakeApp = {
      getPath(name) {
        if (name === "userData") return path.join(root, "userData");
        if (name === "home") return root;
        if (name === "exe") return path.join(root, "Matterhorn.app", "Contents", "MacOS", "Matterhorn");
        return root;
      },
    };

    const manager = createRuntimeManager({
      app: fakeApp,
      desktopRoot: root,
      listLocalWorkspacePaths: async () => [],
    });

    assert.equal(typeof manager.openworkServerInfo, "undefined");
    assert.equal(typeof manager.openworkServerRestart, "undefined");
    assert.equal(typeof manager.matterhornServerInfo, "function");
    assert.equal(typeof manager.matterhornServerRestart, "function");
    const info = await manager.matterhornServerInfo();
    assert.equal(info.running, false);
    assert.equal(info.baseUrl, null);
  });
});
