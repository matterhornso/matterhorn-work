#!/usr/bin/env node
import { readFileSync } from "node:fs";

const files = {
  english: "apps/app/src/i18n/locales/en.ts",
  sessionRoute: "apps/app/src/react-app/shell/session-route.tsx",
  extensionsView: "apps/app/src/react-app/domains/settings/pages/extensions-view.tsx",
  orchestratorCli: "apps/orchestrator/src/cli.ts",
  runtimeDoc: "docs/opencode-runtime-abstraction.md",
  readme: "README.md",
};

const read = (path) => readFileSync(path, "utf8");

const checks = [
  {
    path: files.english,
    mustContain: [
      '"config.engine_reload_desc": "Restart the Matterhorn Work engine for this workspace."',
      '"settings.opencode_engine_label": "Matterhorn Work engine"',
      '"settings.opencode_engine_sidecar_desc": "Local engine process managed by Matterhorn Work. Technical runtime: OpenCode."',
      '"settings.debug_opencode_version": "Underlying OpenCode runtime: {version}"',
      '"settings.restart_opencode": "Restart engine"',
      '"system.reload_body_default": "Matterhorn Work detected changes that require reloading the engine instance."',
    ],
    mustNotContain: [
      '"settings.opencode_engine_label": "OpenCode engine"',
      '"settings.opencode_section_label": "OpenCode"',
      '"settings.restart_opencode": "Restart OpenCode"',
      '"session.permission_message": "OpenCode is requesting permission to continue."',
      '"system.reload_body_default": "Matterhorn Work detected changes that require reloading the OpenCode instance."',
    ],
  },
  {
    path: files.sessionRoute,
    mustContain: [
      "The Matterhorn Work engine is unavailable for this workspace.",
      'title: "Matterhorn Work engine unavailable"',
    ],
    mustNotContain: [
      "OpenCode is unavailable for this workspace.",
      'title: "OpenCode unavailable"',
    ],
  },
  {
    path: files.extensionsView,
    mustContain: ["<span>Engine plugins</span>"],
    mustNotContain: ["<span>OpenCode Plugins</span>"],
  },
  {
    path: files.orchestratorCli,
    mustContain: [
      '"matterhorn-work"',
      '"  matterhorn-work start [--workspace <path>] [options]"',
      '"  start                   Start Matterhorn Work engine + server + OpenCodeRouter"',
      '"  --opencode-bin <path>     Path to underlying opencode binary (requires --allow-external)"',
      "`Matterhorn Work engine: ${payload.opencode.baseUrl}`",
      'console.log("Matterhorn Work orchestrator running")',
    ],
    mustNotContain: [
      '"openwork",\n    "",\n    "Usage:"',
      '"  start                   Start OpenCode + OpenWork server + OpenCodeRouter"',
      '"  status                  Check OpenCode/OpenWork health"',
      'console.log("OpenWork orchestrator running")',
      "`OpenCode server: ${opencode.ok ? \"ok\" : \"error\"} (${opencode.url})`",
    ],
  },
  {
    path: files.runtimeDoc,
    mustContain: [
      "Matterhorn Work presents its local agent runtime as the **Matterhorn Work engine**",
      "OpenCode remains the underlying runtime",
      "Keep **OpenCode** or `opencode` in:",
    ],
  },
  {
    path: files.readme,
    mustContain: [
      "**Matterhorn Work engine**",
      "[docs/opencode-runtime-abstraction.md](docs/opencode-runtime-abstraction.md)",
    ],
    mustNotContain: ["**OpenCode integration**"],
  },
  {
    path: "docs/mcp-ui-control-profile.md",
    mustContain: [
      "# Control Matterhorn Work from any MCP client",
      "Matterhorn Work exposes its UI as an MCP server",
    ],
    mustNotContain: [
      "# Control OpenWork from any MCP client",
      "OpenWork exposes its UI as an MCP server",
      "Connected to OpenWork",
    ],
  },
];

let failures = 0;

for (const check of checks) {
  const content = read(check.path);
  for (const snippet of check.mustContain ?? []) {
    if (!content.includes(snippet)) {
      console.error(`Missing expected copy in ${check.path}:\n${snippet}`);
      failures += 1;
    }
  }
  for (const snippet of check.mustNotContain ?? []) {
    if (content.includes(snippet)) {
      console.error(`Found retired copy in ${check.path}:\n${snippet}`);
      failures += 1;
    }
  }
}

if (failures > 0) {
  console.error(`OpenCode abstraction copy check failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log("OpenCode abstraction copy check passed.");
