import { chmodSync, existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
    expect(stdout).toContain("certify:crypto-app-readonly");
    expect(stdout).toContain("certify:crypto-app-polymarket-preview");
    expect(stdout).toContain("grants no account, signing, relay, or submit authority");
    expect(stdout).not.toContain("private-key");
  });

  test("keeps the mainnet public-read scope explicit in the package command", async () => {
    const packageJson = await Bun.file(resolve("package.json")).json() as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["certify:crypto-app"]).not.toContain("public-readonly");
    expect(packageJson.scripts?.["certify:crypto-app-readonly"])
      .toBe("bun scripts/certify-first-party-crypto-app.ts --scope public-readonly");
    expect(packageJson.scripts?.["certify:crypto-app-polymarket-preview"])
      .toBe("bun scripts/certify-first-party-crypto-app.ts --scope polymarket-wallet-preview");
  });

  test("rejects unknown certification scopes before reading operator files", () => {
    const result = Bun.spawnSync([
      "bun", SCRIPT,
      "--scope", "mainnet",
      "--manifest", "/must-not-read/manifest.json",
      "--publisher-public-key", "/must-not-read/publisher.pem",
      "--inputs", "/must-not-read/inputs.json",
      "--policy-version", "policy-1",
      "--output", "/must-not-write/output.json",
    ], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("certification_cli_argument_invalid");
    expect(result.stderr.toString()).not.toContain("must-not-read");
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
        "--scope", "public-readonly",
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

  test("rejects symlinked operator inputs", () => {
    if (process.platform === "win32") return;
    const directory = mkdtempSync(join(tmpdir(), "matterhorn-cert-cli-symlink-"));
    try {
      const manifest = join(directory, "manifest.json");
      const publicKey = join(directory, "publisher.pem");
      const inputsTarget = join(directory, "inputs-target.json");
      const inputs = join(directory, "inputs.json");
      const output = join(directory, "output.json");
      writeFileSync(manifest, "{}\n", { mode: 0o600 });
      writeFileSync(publicKey, "not-a-key\n", { mode: 0o600 });
      writeFileSync(inputsTarget, "{}\n", { mode: 0o600 });
      symlinkSync(inputsTarget, inputs);
      const result = Bun.spawnSync([
        "bun", SCRIPT,
        "--manifest", manifest,
        "--publisher-public-key", publicKey,
        "--inputs", inputs,
        "--policy-version", "policy-1",
        "--output", output,
      ], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("certification_cli_input_invalid");
      expect(existsSync(output)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
