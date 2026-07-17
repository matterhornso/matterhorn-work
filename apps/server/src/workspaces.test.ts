import { describe, expect, test } from "bun:test";

import { buildWorkspaceInfos, workspaceIdForOpenwork, workspaceIdForRemote } from "./workspaces.js";

describe("workspace remote-type migration", () => {
  test("normalizes legacy remote-worker configuration to Matterhorn without changing its stable id", () => {
    const hostUrl = "https://worker.example.com";
    const workspaceId = "ws_legacy";

    const [workspace] = buildWorkspaceInfos([
      {
        path: "",
        name: "Migrated worker",
        preset: "remote",
        workspaceType: "remote",
        remoteType: "openwork",
        baseUrl: hostUrl,
        openworkHostUrl: hostUrl,
        openworkWorkspaceId: workspaceId,
      },
    ], "/tmp/matterhorn-workspace-tests");

    expect(workspace).toMatchObject({
      remoteType: "matterhorn",
      baseUrl: hostUrl,
      openworkWorkspaceId: workspaceId,
    });
    expect(workspace?.id).toBe(workspaceIdForOpenwork(hostUrl, workspaceId));
  });

  test("keeps OpenCode remote workspaces distinct", () => {
    const [workspace] = buildWorkspaceInfos([
      {
        path: "",
        name: "OpenCode worker",
        preset: "remote",
        workspaceType: "remote",
        remoteType: "opencode",
        baseUrl: "https://opencode.example.com",
        directory: "/workspace/project",
      },
    ], "/tmp/matterhorn-workspace-tests");

    expect(workspace).toMatchObject({ remoteType: "opencode" });
    expect(workspace?.id).toBe(workspaceIdForRemote("https://opencode.example.com", "/workspace/project"));
  });
});
