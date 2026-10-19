import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./server.js";
import { getMatterhornBuiltinDeskGuidance, MATTERHORN_PRELOADED_WORKSPACE_SKILLS } from "./builtin-workspace-skills.js";
import { renderPreloadedWorkspaceSkill } from "./builtin-skill-catalog.js";
import type { ServerConfig } from "./types.js";

const stops: Array<() => void | Promise<void>> = [];
const roots: string[] = [];
const originalDataDir = process.env.OPENWORK_DATA_DIR;

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  if (originalDataDir === undefined) delete process.env.OPENWORK_DATA_DIR;
  else process.env.OPENWORK_DATA_DIR = originalDataDir;
});

async function fixture(options: { writable?: boolean; manualApproval?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-builtin-skill-routes-"));
  roots.push(root);
  const workspace = join(root, "workspace");
  const destination = join(root, "destination");
  const forbidden = join(root, "forbidden");
  await mkdir(join(workspace, ".git"), { recursive: true });
  await mkdir(join(destination, ".git"), { recursive: true });
  await mkdir(forbidden);
  await writeFile(join(workspace, "opencode.jsonc"), "{}\n", "utf8");
  await writeFile(join(destination, "opencode.jsonc"), "{}\n", "utf8");
  process.env.OPENWORK_DATA_DIR = join(root, "state");
  const config: ServerConfig = {
    host: "127.0.0.1", port: 0,
    token: "builtin-skill-route-fixture-token", hostToken: "builtin-skill-route-fixture-host",
    configPath: join(root, "server.json"),
    approval: { mode: options.manualApproval ? "manual" : "auto", timeoutMs: 5000 }, corsOrigins: [],
    workspaces: [
      { id: "allowed", name: "Allowed", path: workspace, preset: "starter", workspaceType: "local" },
      { id: "destination", name: "Destination", path: destination, preset: "starter", workspaceType: "local" },
      { id: "forbidden", name: "Forbidden", path: forbidden, preset: "starter", workspaceType: "local" },
    ],
    authorizedRoots: [workspace, destination], readOnly: !options.writable,
    startedAt: Date.now(), tokenSource: "cli", hostTokenSource: "cli",
    logFormat: "pretty", logRequests: false, reloadWatchers: false,
  };
  const server = await startServer(config);
  stops.push(() => server.stop());
  return {
    workspace, destination, base: `http://127.0.0.1:${server.port}`,
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    hostHeaders: { "X-OpenWork-Host-Token": config.hostToken, "Content-Type": "application/json" },
  };
}

async function approveImport(base: string, hostHeaders: Record<string, string>): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(`${base}/approvals`, { headers: hostHeaders });
    expect(response.status).toBe(200);
    const body = await response.json();
    const approval = body.items[0];
    if (approval) {
      expect(approval.action).toBe("config.import");
      const approved = await fetch(`${base}/approvals/${approval.id}`, {
        method: "POST", headers: hostHeaders, body: JSON.stringify({ reply: "allow" }),
      });
      expect(approved.status).toBe(200);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for workspace import approval");
}

describe("built-in skill HTTP routes", () => {
  test("lists and reads immutable guidance on the existing authenticated API without creating skill files", async () => {
    const { workspace, base, headers } = await fixture();
    const before = (await readdir(workspace)).sort();
    const listed = await fetch(`${base}/workspace/allowed/skills`, { headers });
    expect(listed.status).toBe(200);
    const listing = await listed.json();
    expect(listing.items).toHaveLength(7);
    for (const definition of MATTERHORN_PRELOADED_WORKSPACE_SKILLS) {
      const response = await fetch(`${base}/workspace/allowed/skills/${definition.name}`, { headers });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        item: { name: definition.name, builtin: true, userInvocable: false },
        content: renderPreloadedWorkspaceSkill(definition),
      });
    }
    expect((await readdir(workspace)).sort()).toEqual(before);
  });

  test("exports no release-owned documents and roundtrips into a fresh workspace with automatic guidance", async () => {
    const { destination, base, headers } = await fixture({ writable: true });
    const response = await fetch(`${base}/workspace/allowed/export?sensitive=exclude`, { headers });
    expect(response.status).toBe(200);
    const exported = await response.json();
    expect(exported).toMatchObject({ workspaceId: "allowed", skills: [] });
    // Open the destination normally before previewing an import. Existing
    // workspace bootstrap may create its managed agent/config files.
    expect((await fetch(`${base}/workspace/destination/skills`, { headers })).status).toBe(200);
    const previewResponse = await fetch(`${base}/workspace/destination/import/preview`, {
      method: "POST", headers, body: JSON.stringify(exported),
    });
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();
    const imported = await fetch(`${base}/workspace/destination/import`, {
      method: "POST", headers, body: JSON.stringify({ ...exported, previewFingerprint: preview.fingerprint }),
    });
    expect({ status: imported.status, body: await imported.json() }).toMatchObject({ status: 200, body: { ok: true } });
    const listed = await fetch(`${base}/workspace/destination/skills`, { headers });
    expect(listed.status).toBe(200);
    const listing = await listed.json();
    expect(listing.items).toHaveLength(7);
    expect(listing.items.every((item: { builtin?: boolean }) => item.builtin === true)).toBe(true);
    await expect(readdir(join(destination, ".opencode", "skills"))).rejects.toThrow();
  });

  test("roundtrips actual same-name custom copies through authenticated preview and host approval without changing canonical guidance", async () => {
    const { workspace, destination, base, headers, hostHeaders } = await fixture({ writable: true, manualApproval: true });
    const definition = MATTERHORN_PRELOADED_WORKSPACE_SKILLS[0];
    const custom = `---\nname: ${definition.name}\ndescription: Custom imported guidance\n---\nUser-owned fixture instructions, not canonical policy.\n`;
    const directory = join(workspace, ".opencode", "skills", definition.name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "SKILL.md"), custom, "utf8");
    const guidance = getMatterhornBuiltinDeskGuidance("matterhorn-bittensor");
    const response = await fetch(`${base}/workspace/allowed/export?sensitive=exclude`, { headers });
    expect(response.status).toBe(200);
    const exported = await response.json();
    expect(exported.skills).toEqual([{ name: definition.name, description: "Custom imported guidance", content: custom }]);

    const body = JSON.stringify(exported);
    expect((await fetch(`${base}/workspace/destination/import`, { method: "POST", body })).status).toBe(401);
    expect((await fetch(`${base}/workspace/forbidden/import`, { method: "POST", headers, body })).status).toBe(403);
    const unreviewed = await fetch(`${base}/workspace/destination/import`, { method: "POST", headers, body });
    expect(unreviewed.status).toBe(409);
    expect((await unreviewed.json()).code).toBe("workspace_import_preview_required");
    const previewResponse = await fetch(`${base}/workspace/destination/import/preview`, { method: "POST", headers, body });
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();
    const importPromise = fetch(`${base}/workspace/destination/import`, {
      method: "POST", headers, body: JSON.stringify({ ...exported, previewFingerprint: preview.fingerprint }),
    });
    await approveImport(base, hostHeaders);
    expect((await importPromise).status).toBe(200);

    const loaded = await fetch(`${base}/workspace/destination/skills/${definition.name}`, { headers });
    expect(loaded.status).toBe(200);
    const result = await loaded.json();
    expect(result.item.builtin).toBeUndefined();
    expect(result.item.path).toBe(join(destination, ".opencode", "skills", definition.name, "SKILL.md"));
    expect(result.content).toContain("User-owned fixture instructions, not canonical policy.");
    expect(await readFile(result.item.path, "utf8")).toBe(result.content);
    expect(getMatterhornBuiltinDeskGuidance("matterhorn-bittensor")).toBe(guidance);
    expect(guidance).not.toContain("User-owned fixture instructions");
  });

  test("retains authentication and authorized workspace boundaries and rejects unknown skill IDs", async () => {
    const { base, headers } = await fixture();
    const name = MATTERHORN_PRELOADED_WORKSPACE_SKILLS[0].name;
    expect((await fetch(`${base}/workspace/allowed/skills`)).status).toBe(401);
    expect((await fetch(`${base}/workspace/allowed/skills/${name}`)).status).toBe(401);
    expect((await fetch(`${base}/workspace/forbidden/skills`, { headers })).status).toBe(403);
    expect((await fetch(`${base}/workspace/forbidden/skills/${name}`, { headers })).status).toBe(403);
    expect((await fetch(`${base}/workspace/allowed/skills/matterhorn-does-not-exist`, { headers })).status).toBe(404);
    expect((await fetch(`${base}/workspace/allowed/skills/${encodeURIComponent("matterhorn-builtin://skills/../../secret")}`, { headers })).status).not.toBe(200);
  });
});
