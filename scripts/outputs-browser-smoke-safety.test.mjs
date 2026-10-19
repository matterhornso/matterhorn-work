import assert from "node:assert/strict";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { networkDiagnostic, privateEvidenceDirectory, recordDiagnostic, reportUrl, validateBrowserTarget, writePrivateEvidence } from "./lib/browser-smoke-privacy.mjs";

const secret = "synthetic-output-secret-not-for-reports";
const sourceUrl = new URL("./outputs-browser-smoke.mjs", import.meta.url);
const source = (await readFile(sourceUrl, "utf8"))
  .replace(/^#![^\n]+\n/, "")
  .replace(/^import[^\n]+\n/gm, "")
  .replaceAll("import.meta.dirname", JSON.stringify(dirname(fileURLToPath(sourceUrl))));

async function runFlow({ outputOverride, noteOverride, noteOrigin, badWallet = false, failAt = "", diagnostics = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-outputs-safety-test-"));
  try {
    const stdout = [];
    const deletes = [];
    const noteId = `note_${"a".repeat(18)}`;
    let expectedPath;
    let filename;
    let launches = 0;
    let closed = false;
    let responseIndex = 0;
    const locator = (name = "") => ({
      locator() { return locator(); }, filter() { return this; }, first() { return this; },
      getByRole(_role, options) { return locator(options?.name); }, getByText() { return locator(); },
      async waitFor() {}, async count() { return 1; },
      async click() { if (name === "Delete note" && failAt === "after-note") throw new Error(secret); },
      async inputValue() { return `Linked output: ${expectedPath}`; },
    });
    const browserResponse = (method, path, payload, status = 200) => ({
      status: () => status, ok: () => status < 400, request: () => ({ method: () => method }),
      url: () => `https://backend.example.test${path}`, async json() { return payload; },
    });
    const page = {
      on(name, callback) {
        if (!diagnostics) return;
        if (name === "console") for (let i = 0; i < 120; i++) callback({ type: () => "error", text: () => secret });
        if (name === "pageerror") callback(new Error(secret));
        if (name === "response") callback(browserResponse("GET", `/api/fail?token=${secret}#${secret}`, {}, 500));
      },
      async goto() { if (failAt === "open") throw new Error(secret); }, async waitForFunction() {},
      getByRole(_role, options) { return locator(options?.name); }, getByPlaceholder() { return locator(); },
      async evaluate() { return expectedPath; },
      async waitForEvent() { return { suggestedFilename: () => filename }; },
      async waitForResponse(predicate) {
        responseIndex += 1;
        let response;
        if (responseIndex === 1) {
          const note = { id: noteId, workspaceId: "ws_test", title: `Note about ${filename}`, outputPath: expectedPath, body: `Linked output: ${expectedPath}` };
          response = browserResponse("POST", "/workspace/ws_test/notes", { note: { ...note, ...noteOverride?.(note) } }, 201);
          if (noteOrigin) response.url = () => `${noteOrigin}/workspace/ws_test/notes`;
        } else if (responseIndex === 2) response = browserResponse("DELETE", `/workspace/ws_test/notes/${noteId}`, { ok: true });
        else response = browserResponse("DELETE", "/workspace/ws_test/outputs", { deleted: { path: expectedPath } });
        if (!predicate(response)) throw new Error("Synthetic wait timeout: response did not match the expected origin/method/path");
        return response;
      },
      async screenshot() { return Buffer.from("synthetic image; never a real browser"); },
      url: () => `https://app.example.test/workspace/ws_test/session?token=${secret}#${secret}`,
    };
    const fetch = async (url, init) => {
      assert.equal(init.redirect, "error", "every authenticated backend call must reject redirects");
      const target = new URL(url);
      if (init.method === "DELETE") {
        deletes.push(target.pathname.includes("/notes/") ? { kind: "note", id: target.pathname.split("/").pop() } : { kind: "output", path: target.searchParams.get("path") });
        return { status: 200, ok: true, async json() { return { ok: true }; } };
      }
      if (target.pathname.endsWith("/files/stat")) return { status: 200, ok: true, async json() { return { exists: false }; } };
      assert.equal(target.pathname, "/workspace/ws_test/sui/transactions/preview");
      const session = JSON.parse(init.body).sessionId;
      filename = `transfer_sui-preview-${"b".repeat(16)}.json`;
      expectedPath = `outputs/sui/${session}/${filename}`;
      const preview = { kind: "transfer_sui", previewSha256: "b".repeat(64), custody: badWallet, canSubmit: true,
        liveSubmissionEnabled: true, signerPolicy: "client_wallet_required", requiresWalletStandard: true,
        sender: "0x2", recipient: "0x3", amountMist: "1000000000",
        handoff: { kind: "sui_wallet_standard", action: "sign_and_execute_in_wallet", unsignedIntent: { sender: "0x2", recipient: "0x3", amountMist: "1000000000" } } };
      return { status: 201, ok: true, async json() { return { preview, evidence: { outputPath: outputOverride ? outputOverride(expectedPath, session) : expectedPath } }; } };
    };
    await runInNewContext(`(async () => {${source}\n})()`, {
      resolve, URL, Date, Math, Map, Set, Promise, fetch,
      networkDiagnostic, privateEvidenceDirectory, recordDiagnostic, reportUrl, validateBrowserTarget, writePrivateEvidence,
      async resolveBrowserSmokeTarget() {},
      chromium: { async launch() { launches += 1; return { async newContext() { return { async newPage() { return page; } }; }, async close() { closed = true; } }; } },
      process: { argv: ["node", "script", "--url", `https://app.example.test/workspace/ws_test/session?token=${secret}#${secret}`,
        "--server-url", "https://backend.example.test", "--token", secret, "--json", "--output-dir", root], env: {}, exit() { throw new Error("unexpected exit"); } },
      console: { log(value) { stdout.push(String(value)); }, error(value) { stdout.push(String(value)); } },
    });
    const serialized = stdout.join("\n");
    assert.ok(!serialized.includes(secret), "raw diagnostics/URL secrets must not be printed");
    const report = JSON.parse(serialized);
    const fd = await open(report.artifacts.report, "r");
    try {
      if (process.platform !== "win32") assert.equal((await fd.stat()).mode & 0o777, 0o600);
      assert.ok(!(await fd.readFile("utf8")).includes(secret));
    } finally { await fd.close(); }
    return { report, deletes, expectedPath, noteId, launches, closed };
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("unexpected, traversing and encoded output paths are never retained for cleanup", async () => {
  const invalid = [
    () => "outputs/sui/other-session/victim.json",
    (path) => path.replace("transfer_sui", "../victim/transfer_sui"),
    (path) => path.replace("transfer_sui", "..\\victim\\transfer_sui"),
    (path) => path.replace("transfer_sui", "%2e%2e%2ftransfer_sui"),
    (path) => path.replace("transfer_sui", "%5ctransfer_sui"),
    (path) => path.replace("transfer_sui", "%252ftransfer_sui"),
    (path) => `${path}/../victim`, () => null,
  ];
  for (const outputOverride of invalid) {
    const result = await runFlow({ outputOverride });
    assert.equal(result.report.ready, false);
    assert.deepEqual(result.deletes, []);
    assert.equal(result.launches, 0);
  }
  const wallet = await runFlow({ badWallet: true });
  assert.deepEqual(wallet.deletes, [], "cleanup ownership requires wallet-boundary validation too");
});

test("unbound or unsafe note IDs are never deleted while the valid QA output is cleaned up", async () => {
  for (const noteOverride of [
    () => ({ id: "../victim" }), () => ({ id: "note_%2fvictim" }), () => ({ title: "Unrelated note" }),
    (note) => ({ id: `${note.id}\n` }),
    () => ({ outputPath: "outputs/sui/other-session/victim.json" }),
    () => ({ workspaceId: "other-workspace" }), () => ({ body: "Unrelated note body" }),
  ]) {
    const result = await runFlow({ noteOverride });
    assert.equal(result.report.ready, false);
    assert.deepEqual(result.deletes, [{ kind: "output", path: result.expectedPath }]);
    assert.equal(result.closed, true);
  }
  const unrelated = await runFlow({ noteOrigin: "https://unrelated.example.test" });
  assert.equal(unrelated.report.ready, false);
  assert.deepEqual(unrelated.deletes, [{ kind: "output", path: unrelated.expectedPath }]);
});

test("validated output/note cleanup survives later UI failures and emits sanitized bounded diagnostics", async () => {
  const early = await runFlow({ failAt: "open", diagnostics: true });
  assert.deepEqual(early.deletes, [{ kind: "output", path: early.expectedPath }]);
  assert.equal(early.report.consoleErrors.length, 100);
  assert.equal(early.report.networkFailures[0].url, "https://backend.example.test/api/fail");
  const later = await runFlow({ failAt: "after-note" });
  assert.deepEqual(later.deletes, [{ kind: "note", id: later.noteId }, { kind: "output", path: later.expectedPath }]);
});

test("valid full flow keeps successful cleanup and does not delete either object twice", async () => {
  for (const noteOrigin of ["https://backend.example.test", "https://app.example.test"]) {
    const result = await runFlow({ noteOrigin });
    assert.equal(result.report.ready, true);
    assert.deepEqual(result.deletes, []);
    assert.equal(result.report.artifacts.qaRecord.noteDeleted, true);
    assert.equal(result.report.artifacts.qaRecord.outputDeleted, true);
    assert.equal(result.report.artifacts.finalUrl, "https://app.example.test/workspace/ws_test/session");
    assert.equal(result.closed, true);
  }
});
