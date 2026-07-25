#!/usr/bin/env node
import { readFileSync } from "node:fs";

const files = {
  english: "apps/app/src/i18n/locales/en.ts",
  sessionRoute: "apps/app/src/react-app/shell/session-route.tsx",
  sessionPage: "apps/app/src/react-app/domains/session/chat/session-page.tsx",
  extensionsView: "apps/app/src/react-app/domains/settings/pages/extensions-view.tsx",
  orchestratorCli: "apps/orchestrator/src/cli.ts",
  serverCli: "apps/server/src/cli.ts",
  server: "apps/server/src/server.ts",
  runtimeDoc: "docs/opencode-runtime-abstraction.md",
  readme: "README.md",
  agentGuide: "AGENTS.md",
  composer: "apps/app/src/react-app/domains/session/surface/composer/composer.tsx",
  evalSkill: ".opencode/skills/run-evals/SKILL.md",
};

const read = (path) => readFileSync(path, "utf8");

const checks = [
  {
    path: files.english,
    mustContain: [
      '"config.engine_reload_desc": "Restart the Matterhorn Desks engine for this workspace."',
      '"settings.opencode_engine_label": "Matterhorn Desks engine"',
      '"settings.opencode_engine_sidecar_desc": "Local engine process managed by Matterhorn Desks. Technical runtime: OpenCode."',
      '"settings.debug_opencode_version": "Underlying OpenCode runtime: {version}"',
      '"settings.restart_opencode": "Restart engine"',
      '"system.reload_body_default": "Matterhorn Desks detected changes that require reloading the engine instance."',
    ],
    mustNotContain: [
      '"settings.opencode_engine_label": "OpenCode engine"',
      '"settings.opencode_section_label": "OpenCode"',
      '"settings.restart_opencode": "Restart OpenCode"',
      '"session.permission_message": "OpenCode is requesting permission to continue."',
      '"system.reload_body_default": "Matterhorn Desks detected changes that require reloading the OpenCode instance."',
    ],
  },
  {
    path: files.sessionRoute,
    mustContain: [
      "The Matterhorn Desks engine is unavailable for this workspace.",
      'title: "Matterhorn Desks engine unavailable"',
      'lower.includes("opencode_unconfigured")',
    ],
    mustNotContain: [
      "OpenCode is unavailable for this workspace.",
      'title: "OpenCode unavailable"',
    ],
  },
  {
    path: files.sessionPage,
    mustContain: [
      '"Matterhorn Desks engine unavailable"',
    ],
    mustNotContain: [
      '"OpenCode unavailable"',
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
      '"  start                   Start Matterhorn Desks engine + server + OpenCodeRouter"',
      '"  --opencode-bin <path>     Path to underlying opencode binary (requires --allow-external)"',
      "`Matterhorn Desks engine: ${payload.opencode.baseUrl}`",
      'console.log("Matterhorn Desks orchestrator running")',
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
    path: files.serverCli,
    mustContain: ["`Matterhorn Desks server listening on ${url}`"],
    mustNotContain: ["`OpenWork server listening on ${url}`"],
  },
  {
    path: files.server,
    mustContain: [
      '"Environment variable name is reserved for Matterhorn Desks internals"',
      'summary: "Deleted workspace from Matterhorn Desks server"',
    ],
    mustNotContain: [
      '"Environment variable name is reserved for OpenWork internals"',
      'summary: "Deleted workspace from OpenWork server"',
    ],
  },
  {
    path: files.runtimeDoc,
    mustContain: [
      "Matterhorn Desks presents its local agent runtime as the **Matterhorn Desks engine**",
      "OpenCode remains the underlying runtime",
      "Keep **OpenCode** or `opencode` in:",
    ],
  },
  {
    path: files.readme,
    mustContain: [
      "**Matterhorn Desks engine**",
      "[Engine/OpenCode naming boundary](docs/opencode-runtime-abstraction.md)",
    ],
    mustNotContain: ["**OpenCode integration**"],
  },
  {
    path: files.agentGuide,
    mustContain: [
      "Use the Matterhorn Desks engine and approved tools directly.",
      "workflows stay portable, inspectable, and available through the engine",
    ],
    mustNotContain: ["Use OpenCode capabilities", "powered by OpenCode", "OpenWork"],
  },
  {
    path: files.composer,
    mustContain: [
      '"Local Matterhorn Desks engine"',
      '"Remote server connection"',
      "agentSelectionLocked",
    ],
    mustNotContain: [
      'entry.config.url ?? entry.config.command?.join(" ")',
      '"Remote MCP"',
      '"Local MCP"',
    ],
  },
  {
    path: files.evalSkill,
    mustContain: ["Run Matterhorn Desks UI evaluations"],
    mustNotContain: ["Run OpenWork UI evals", "Run the OpenWork UI evaluation flows"],
  },
  {
    path: "docs/mcp-ui-control-profile.md",
    mustContain: [
      "# Control Matterhorn Desks from any MCP client",
      "Matterhorn Desks exposes its UI as an MCP server",
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
