import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { auditTaskFirstBundle } from "./task-first-bundle-budget.mjs";

function createFixture() {
  const root = mkdtempSync(resolve(tmpdir(), "matterhorn-task-first-budget-"));
  const assets = resolve(root, "assets");
  mkdirSync(assets);
  writeFileSync(
    resolve(root, "index.html"),
    '<script type="module" src="/assets/app-fixture.js"></script><link rel="modulepreload" href="/assets/vendor-react-fixture.js">',
  );
  writeFileSync(resolve(assets, "app-fixture.js"), "export{};");
  writeFileSync(resolve(assets, "vendor-react-fixture.js"), "export{};");
  writeFileSync(resolve(assets, "authenticated-app-fixture.js"), "export{};");
  writeFileSync(resolve(assets, "session-route-fixture.js"), 'import "./session-shared-fixture.js";');
  writeFileSync(resolve(assets, "session-page-fixture.js"), 'import "./session-shared-fixture.js";');
  writeFileSync(resolve(assets, "session-shared-fixture.js"), 'import "./authenticated-app-fixture.js";');
  writeFileSync(resolve(assets, "settings-route-fixture.js"), 'import "./authenticated-app-fixture.js";');
  writeFileSync(resolve(assets, "vendor-wallet-evm-fixture.js"), "export{};");
  return root;
}

{
  const fixture = createFixture();
  try {
    const result = auditTaskFirstBundle(fixture);
    assert.equal(result.ok, true, result.failures.join("\n"));
    assert.equal(result.metrics.publicEntryGraphBytes, 18);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

{
  const fixture = createFixture();
  try {
    writeFileSync(
      resolve(fixture, "assets", "session-shared-fixture.js"),
      'import "./vendor-wallet-evm-fixture.js";',
    );
    writeFileSync(
      resolve(fixture, "assets", "vendor-wallet-evm-fixture.js"),
      "x".repeat(900_001),
    );
    const result = auditTaskFirstBundle(fixture);
    assert.equal(result.ok, false);
    assert(result.failures.some((failure) => failure.includes("statically imports deferred vendor-wallet")));
    assert(result.failures.some((failure) => failure.includes("wallet-family budget")));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

console.log("task-first-bundle-budget tests: PASS");
