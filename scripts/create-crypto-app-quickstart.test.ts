import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const repository = process.cwd();
const script = join(repository, "scripts/create-crypto-app-quickstart.ts");

function run(args: string[]) {
  return spawnSync("bun", [script, ...args], {
    cwd: repository,
    encoding: "utf8",
    env: { ...process.env },
  });
}

describe("create crypto app quickstart command", () => {
  test("writes a complete starter atomically and refuses overwrite", () => {
    const parent = mkdtempSync(join(tmpdir(), "matterhorn-crypto-quickstart-"));
    const output = join(parent, "acme-sui");
    const args = [
      "--protocol", "sui",
      "--app-id", "acme.sui-testnet",
      "--endpoint", "https://adapter.acme.example/v1",
      "--output-dir", output,
      "--json",
    ];
    const created = run(args);
    expect(created.status).toBe(0);
    const summary = JSON.parse(created.stdout);
    expect(summary).toMatchObject({
      ready: true,
      appId: "acme.sui-testnet",
      protocol: "sui",
      network: "sui:testnet",
      safety: {
        testnetOnly: true,
        credentialsIncluded: false,
        walletAuthorityIncluded: false,
        signingKeyIncluded: false,
        certificationGranted: false,
      },
    });
    for (const file of [
      "manifest.unsigned.json",
      "signing-request.json",
      "fixture-pack.json",
      "adapter.example.ts",
      "validation-report.json",
      "README.md",
    ]) {
      expect(readFileSync(join(output, file), "utf8").length).toBeGreaterThan(20);
    }
    const serialized = [
      created.stdout,
      ...[
        "manifest.unsigned.json",
        "signing-request.json",
        "fixture-pack.json",
        "adapter.example.ts",
        "validation-report.json",
      ].map((file) => readFileSync(join(output, file), "utf8")),
    ].join("\n");
    expect(serialized).not.toContain("BEGIN PRIVATE KEY");
    expect(serialized).not.toContain("sui:mainnet");
    expect(serialized).not.toContain("ExecuteTransaction");

    const second = run(args);
    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain("Output directory already exists");
    expect(readFileSync(join(output, "manifest.unsigned.json"), "utf8"))
      .toContain("acme.sui-testnet");
  });

  test("rejects unknown options, unsupported protocols, and missing parents", () => {
    expect(run(["--unknown"]).status).not.toBe(0);
    const parent = mkdtempSync(join(tmpdir(), "matterhorn-crypto-quickstart-"));
    expect(run([
      "--protocol", "ethereum",
      "--app-id", "acme.ethereum-testnet",
      "--endpoint", "https://adapter.acme.example/v1",
      "--output-dir", join(parent, "ethereum"),
    ]).status).not.toBe(0);
    expect(run([
      "--protocol", "sui",
      "--app-id", "acme.sui-testnet",
      "--endpoint", "https://adapter.acme.example/v1",
      "--output-dir", join(parent, "missing", "sui"),
    ]).stderr).toContain("Output parent does not exist");
  });
});
