import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("server startup logging", () => {
  test("never interpolates access-token values into logs", () => {
    const source = readFileSync(new URL("./cli.ts", import.meta.url), "utf8");

    expect(source).not.toContain("Client token: ${config.token}");
    expect(source).not.toContain("Host token: ${config.hostToken}");
    expect(source).not.toMatch(/logger\.log\([^\n]+config\.(?:token|hostToken)\b/);
  });

  test("requires checksums for downloaded sidecar executables and redacts URL queries", () => {
    const source = readFileSync(new URL("../../orchestrator/src/cli.ts", import.meta.url), "utf8");

    expect(source).toContain("Refusing checksum-less ${options.name} sidecar");
    expect(source).toContain("!/^[a-f0-9]{64}$/.test(expectedSha256)");
    expect(source).toContain("resolveVerifiedOpencodeReleaseAsset");
    expect(source).toContain("Refusing unverified OpenCode release asset");
    expect(source).toContain("assertSafeArchiveEntries");
    expect(source).toContain("Refusing OpenCode archive with an unsafe entry path");
    expect(source).toContain('child.stderr?.on("data"');
    expect(source).toContain('child.kill("SIGKILL")');
    expect(source).not.toContain("Failed to download ${url}");
  });
});
