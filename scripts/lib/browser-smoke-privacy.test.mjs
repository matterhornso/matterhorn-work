import assert from "node:assert/strict";
import { mkdtemp, open, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { networkDiagnostic, privateEvidenceDirectory, recordDiagnostic, reportUrl, validateBrowserTarget, writePrivateEvidence } from "./browser-smoke-privacy.mjs";

test("report URLs omit userinfo, query and fragments; invalid target errors never contain their input", () => {
  assert.equal(reportUrl("https://user:secret@example.test/workspace/id?token=secret#secret"), "https://example.test/workspace/id");
  for (const target of ["https://user:secret@example.test", "not-a-url-secret", "javascript:secret"]) {
    assert.throws(() => validateBrowserTarget(target), (error) => !error.message.includes("secret"));
  }
  assert.equal(validateBrowserTarget("http://127.0.0.1:1234/workspace/id?token=secret").hostname, "127.0.0.1");
  assert.equal(reportUrl("invalid secret"), "[invalid URL omitted]");
});

test("new private artifact directories and exclusive files preserve old files and symlink targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-browser-privacy-test-"));
  try {
    const directory = await privateEvidenceDirectory(root);
    assert.notEqual(directory, root);
    const dir = await open(directory, "r");
    try { if (process.platform !== "win32") assert.equal((await dir.stat()).mode & 0o777, 0o700); }
    finally { await dir.close(); }
    const file = join(directory, "summary.json");
    await writePrivateEvidence(file, "private original");
    await assert.rejects(writePrivateEvidence(file, "overwrite"), { code: "EEXIST" });
    const link = join(directory, "linked.png");
    await symlink(file, link);
    await assert.rejects(writePrivateEvidence(link, "overwrite"), { code: "EEXIST" });
    const fd = await open(file, "r");
    try {
      if (process.platform !== "win32") assert.equal((await fd.stat()).mode & 0o777, 0o600);
      assert.equal(await fd.readFile("utf8"), "private original");
    } finally { await fd.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("actual billing flow emits only bounded sanitized diagnostics with mocked browser errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-billing-flow-test-"));
  try {
    const secret = "synthetic-secret-not-for-reports";
    const target = `https://app.example.test/workspace/id/session?token=${secret}#${secret}`;
    const sourceUrl = new URL("../billing-browser-smoke.mjs", import.meta.url);
    const source = (await readFile(sourceUrl, "utf8"))
      .replace(/^#![^\n]+\n/, "")
      .replace(/^import[^\n]+\n/gm, "")
      .replaceAll("import.meta.dirname", JSON.stringify(dirname(fileURLToPath(sourceUrl))));
    const outputs = [];
    let closed = false;
    const page = {
      on(name, callback) {
        if (name === "console") for (let i = 0; i < 120; i++) callback({ type: () => "error", text: () => secret });
        if (name === "pageerror") callback(new Error(secret));
        if (name === "response") callback({ status: () => 500, url: () => `https://app.example.test/api/fail?key=${secret}#${secret}`, request: () => ({ method: () => "GET" }) });
      },
      async goto() { throw new Error(secret); },
      async screenshot() { return Buffer.from("synthetic private image"); },
      getByRole() { return { async isVisible() { return false; } }; },
    };
    await runInNewContext(`(async () => {${source}\n})()`, {
      resolve, URL, Date, Map, Set, Promise,
      networkDiagnostic, privateEvidenceDirectory, recordDiagnostic, reportUrl, validateBrowserTarget, writePrivateEvidence,
      chromium: { async launch() { return { async newContext() { return { async newPage() { return page; } }; }, async close() { closed = true; } }; } },
      process: { argv: ["node", "script", "--url", target, "--json", "--output-dir", root], env: {}, exit() { throw new Error("unexpected exit"); } },
      console: { log(value) { outputs.push(String(value)); }, error(value) { outputs.push(String(value)); } },
    });
    const serialized = outputs.join("\n");
    assert.ok(!serialized.includes(secret));
    const report = JSON.parse(serialized);
    assert.equal(report.ready, false);
    assert.equal(report.consoleErrors.length, 100);
    assert.equal(report.networkFailures[0].url, "https://app.example.test/api/fail");
    assert.equal(report.url, "https://app.example.test/workspace/id/session");
    assert.ok(!JSON.stringify(report.stages).includes(secret));
    assert.equal(closed, true);
    assert.ok(!(await readFile(report.artifacts.report, "utf8")).includes(secret));
  } finally { await rm(root, { recursive: true, force: true }); }
});
