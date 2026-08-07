import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

const localeDirectory = new URL("../src/i18n/locales/", import.meta.url);
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const customerSurfaceRoots = [
  join(repoRoot, "apps/app/src"),
  join(repoRoot, "apps/app/public"),
];
const customerTextExtensions = new Set([".css", ".html", ".json", ".md", ".svg", ".ts", ".tsx"]);

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

function collectCustomerTextFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectCustomerTextFiles(path);
    return customerTextExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

function legacyBrandingViolations(): string[] {
  return readdirSync(localeDirectory)
    .filter((file) => file.endsWith(".ts"))
    .filter((file) => {
      const source = readFileSync(join(localeDirectory.pathname, file), "utf8");
      return /openwork/i.test(source);
    });
}

function legacyProductNameViolations(): string[] {
  return [
    join(repoRoot, "apps/app/index.html"),
    join(repoRoot, "apps/desktop/electron-builder.yml"),
    ...customerSurfaceRoots.flatMap(collectCustomerTextFiles),
  ]
    .filter((path) => /\bMatterhorn Work\b/.test(readFileSync(path, "utf8")))
    .map((path) => relative(repoRoot, path));
}

describe("customer-facing Matterhorn Desks branding", () => {
  test("does not ship legacy product copy in translated UI strings", () => {
    expect(legacyBrandingViolations()).toEqual([]);
  });

  test("uses the new product name across customer-facing app surfaces", () => {
    const index = readRepoFile("apps/app/index.html");
    const manifest = JSON.parse(readRepoFile("apps/app/public/site.webmanifest")) as {
      name: string;
      short_name: string;
    };
    const publicSignIn = readRepoFile("apps/app/src/react-app/domains/cloud/public-web-signin-page.tsx");
    const welcome = readRepoFile("apps/app/src/react-app/domains/onboarding/welcome-page.tsx");
    const builder = readRepoFile("apps/desktop/electron-builder.yml");
    const desktopMain = readRepoFile("apps/desktop/electron/main.mjs");
    const orchestrator = readRepoFile("apps/orchestrator/src/cli.ts");
    const serverCli = readRepoFile("apps/server/src/cli.ts");
    const workflowTypes = readRepoFile("packages/types/src/matterhorn-workflows.ts");

    expect(legacyProductNameViolations()).toEqual([]);
    expect(index).toContain("<title>Matterhorn Desks</title>");
    expect(manifest).toMatchObject({ name: "Matterhorn Desks", short_name: "Desks" });
    expect(publicSignIn).toContain("<span>Matterhorn Desks</span>");
    expect(publicSignIn).toContain("Serious work deserves more than a chat.");
    expect(publicSignIn).toContain(
      "Open a private workspace for focused AI desks, tools, and durable",
    );
    expect(welcome).toContain("Matterhorn Desks");
    expect(builder).toContain("productName: Matterhorn Desks");
    expect(desktopMain).toContain('const APP_NAME = isDevMode ? "Matterhorn Desks - Dev" : "Matterhorn Desks";');
    expect(orchestrator).not.toMatch(/\bMatterhorn Work\b/);
    expect(serverCli).not.toMatch(/\bMatterhorn Work\b/);
    expect(workflowTypes).not.toContain("Matterhorn Desksflow");
  });

  test("preserves launch-critical compatibility identifiers", () => {
    const packageJson = JSON.parse(readRepoFile("package.json")) as { name: string };
    const builder = readRepoFile("apps/desktop/electron-builder.yml");
    const desktopMain = readRepoFile("apps/desktop/electron/main.mjs");

    expect(packageJson.name).toBe("@matterhornso/matterhorn-work");
    expect(builder).toContain("appId: com.matterhorn.desks");
    expect(builder).toContain("productName: Matterhorn Desks");
    expect(builder).toContain("      - matterhorn-desks");
    expect(builder).toContain("      - matterhorn-work");
    expect(builder).toContain("      - openwork");
    expect(desktopMain).toContain('"com.differentai.openwork",');
    expect(desktopMain).toContain('"com.matterhorn.work",');
    expect(desktopMain).toContain(
      'const DESKTOP_PROTOCOL_SCHEMES = ["matterhorn-desks", "matterhorn-work", "openwork"];',
    );
    expect(desktopMain).toContain('".config", "matterhorn-work", "desktop-bootstrap.json"');
  });

  test("publishes a useful llms.txt discovery document", () => {
    const llms = readRepoFile("apps/app/public/llms.txt");

    expect(llms).toStartWith("# Matterhorn Desks\n");
    expect(llms).toContain("## Public resources");
    expect(llms).toContain("https://github.com/matterhornso/matterhorn-work/tree/dev/docs");
    expect(llms).toContain("Reviewed financial actions are fail-closed");
    expect(llms).toContain("does not hold private keys");
  });

  test("uses the Matterhorn UI MCP package in customer setup and desktop launch commands", () => {
    const constants = readRepoFile("apps/app/src/app/constants.ts");
    const extensionDetails = readRepoFile(
      "apps/app/src/react-app/design-system/extension-detail-modal.tsx",
    );
    const desktopMain = readRepoFile("apps/desktop/electron/main.mjs");

    expect(constants).toContain('command: ["npx", "-y", "matterhorn-work-ui-mcp"]');
    expect(extensionDetails).toContain('"args": ["-y", "matterhorn-work-ui-mcp"]');
    expect(extensionDetails).not.toContain("openwork-ui-mcp");
    expect(extensionDetails).not.toContain("com.differentai.openwork");
    expect(desktopMain).toContain(
      'packages/matterhorn-work-ui-mcp/index.mjs',
    );
    expect(desktopMain).toContain(
      'return ["npx", "-y", "matterhorn-work-ui-mcp"];',
    );
  });
});
