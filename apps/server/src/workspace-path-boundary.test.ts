import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfinedWorkspacePath } from "./workspace-path-boundary.js";
import { MatterhornGuard } from "./opencode-plugins/matterhorn-guard.js";

const roots: string[] = [];
const original = process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED;
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (original === undefined) delete process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED;
  else process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED = original;
});

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "mh-path-boundary-")));
  roots.push(root);
  const workspace = join(root, "workspace");
  const outside = join(root, "outside");
  mkdirSync(workspace);
  mkdirSync(outside);
  writeFileSync(join(workspace, "inside.txt"), "inside");
  writeFileSync(join(outside, "outside.txt"), "outside");
  symlinkSync(join(outside, "outside.txt"), join(workspace, "file-link"));
  symlinkSync(outside, join(workspace, "directory-link"));
  symlinkSync(join(workspace, "inside.txt"), join(workspace, "safe-link"));
  symlinkSync(join(outside, "missing"), join(workspace, "dangling-link"));
  return { workspace, outside };
}

test("confines direct, file-link, directory-link and dangling-link paths", () => {
  const { workspace, outside } = fixture();
  for (const path of [join(outside, "outside.txt"), "../outside/outside.txt", "file-link", "directory-link/outside.txt", "directory-link/new.txt", "dangling-link"]) {
    expect(() => resolveConfinedWorkspacePath(workspace, path)).toThrow();
  }
  expect(resolveConfinedWorkspacePath(workspace, "safe-link")).toBe(join(workspace, "inside.txt"));
  expect(resolveConfinedWorkspacePath(workspace, "new/folder/upload.txt")).toBe(join(workspace, "new/folder/upload.txt"));
});

test("production tool hook rejects escaped reads and supplies canonical safe paths", async () => {
  const { workspace } = fixture();
  process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED = "1";
  const plugin = await MatterhornGuard({ directory: workspace });
  const input = { tool: "read", sessionID: "ses_path", callID: "call_path" };
  await expect(plugin["tool.execute.before"](input, { args: { filePath: join(workspace, "file-link") } })).rejects.toThrow("outside");
  const output = { args: { filePath: join(workspace, "safe-link") } };
  await plugin["tool.execute.before"](input, output);
  expect(output.args.filePath).toBe(join(workspace, "inside.txt"));
});
