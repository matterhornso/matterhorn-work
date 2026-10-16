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
    const sidecar = readFileSync(new URL("../../orchestrator/src/sidecar-download.ts", import.meta.url), "utf8");
    const opencode = readFileSync(new URL("../../orchestrator/src/opencode-download.ts", import.meta.url), "utf8");

    expect(source).toContain("return downloadVerifiedSidecar(");
    expect(source).toContain("return downloadVerifiedOpencode(");
    expect(sidecar).toContain("!/^[a-fA-F0-9]{64}$/.test(asset.sha256)");
    expect(sidecar).toContain("Sidecar requires an exact SHA-256 digest");
    expect(sidecar).toContain('createHash("sha256").update(bytes).digest("hex") !== asset.sha256');
    expect(opencode).toContain("!/^sha256:[a-fA-F0-9]{64}$/.test(asset.digest)");
    expect(opencode).toContain("asset.browser_download_url !== url.href");
    expect(opencode).toContain("sha256(archive) !== release.digest");
    expect(opencode).toContain("archiveEntry(listing, target)");
    expect(opencode).toContain("OpenCode archive executable must be a regular file");
    expect(opencode).toContain('maxBuffer: limit, timeout: 120_000, killSignal: "SIGKILL"');
    expect(opencode).not.toContain("readCliVersion");
    expect(opencode).not.toContain("Expand-Archive");
    for (const helper of [sidecar, opencode]) {
      // Download errors are static: URLs (including signed queries), native-tool
      // stderr and remote metadata cannot be interpolated into startup logs.
      expect(helper).not.toMatch(/throw new Error\(`/);
      expect(helper).not.toContain("${String(error)}");
      expect(helper).not.toContain("${stderr}");
    }
    expect(source).not.toContain("Failed to download ${url}");
  });
});
