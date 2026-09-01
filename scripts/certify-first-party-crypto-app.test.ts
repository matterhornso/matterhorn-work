import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, test } from "bun:test";

const SCRIPT = resolve("scripts/certify-first-party-crypto-app.ts");

describe("first-party crypto app certification CLI", () => {
  test("documents a file-only, secret-free operator interface", () => {
    const result = Bun.spawnSync(["bun", SCRIPT, "--help"], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = result.stdout.toString();
    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("--publisher-public-key");
    expect(stdout).toContain("--inputs");
    expect(stdout).toContain("mode 0600");
    expect(stdout).not.toContain("private-key");
  });

  test("rejects world-readable identity inputs before parsing or network access", () => {
    if (process.platform === "win32") return;
    const directory = mkdtempSync(join(tmpdir(), "matterhorn-cert-cli-"));
    try {
      const manifest = join(directory, "manifest.json");
      const publicKey = join(directory, "publisher.pem");
      const inputs = join(directory, "inputs.json");
      const output = join(directory, "output.json");
      const sentinel = "linked-testnet-identity-must-not-print";
      writeFileSync(manifest, "{}\n", { mode: 0o600 });
      writeFileSync(publicKey, "not-a-key\n", { mode: 0o600 });
      writeFileSync(inputs, `${JSON.stringify({ sentinel })}\n`, { mode: 0o600 });
      chmodSync(inputs, 0o644);
      const result = Bun.spawnSync([
        "bun", SCRIPT,
        "--manifest", manifest,
        "--publisher-public-key", publicKey,
        "--inputs", inputs,
        "--policy-version", "policy-1",
        "--output", output,
      ], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
      const combined = `${result.stdout.toString()}${result.stderr.toString()}`;
      expect(result.exitCode).toBe(1);
      expect(combined).toContain("certification_cli_input_permissions_invalid");
      expect(combined).not.toContain(sentinel);
      expect(combined).not.toContain(directory);
      expect(existsSync(output)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("never overwrites an existing promotion artifact", () => {
    const directory = mkdtempSync(join(tmpdir(), "matterhorn-cert-cli-output-"));
    try {
      const manifest = join(directory, "manifest.json");
      const publicKey = join(directory, "publisher.pem");
      const inputs = join(directory, "inputs.json");
      const output = join(directory, "output.json");
      writeFileSync(manifest, "{}\n", { mode: 0o600 });
      writeFileSync(publicKey, "not-a-key\n", { mode: 0o600 });
      writeFileSync(inputs, "{}\n", { mode: 0o600 });
      writeFileSync(output, "do-not-overwrite\n", { mode: 0o600 });
      const result = Bun.spawnSync([
        "bun", SCRIPT,
        "--manifest", manifest,
        "--publisher-public-key", publicKey,
        "--inputs", inputs,
        "--policy-version", "policy-1",
        "--output", output,
      ], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("certification_cli_output_exists");
      expect(Bun.file(output).text()).resolves.toBe("do-not-overwrite\n");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
