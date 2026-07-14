import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const cache = new Map();

function read(relativePath) {
  if (!cache.has(relativePath)) {
    cache.set(relativePath, fs.readFileSync(path.join(root, relativePath), "utf8"));
  }
  return cache.get(relativePath);
}

function assertIncludes(relativePath, needle, note = needle) {
  if (!read(relativePath).includes(needle)) {
    failures.push(`${relativePath} is missing ${note}`);
  }
}

assertIncludes("apps/app/src/react-app/domains/settings/pages/wallet-view.tsx", "Web browser");
assertIncludes(
  "apps/app/src/react-app/domains/settings/pages/wallet-view.tsx",
  "Browser wallet extensions do not inject into desktop",
);
assertIncludes(
  "apps/app/src/react-app/domains/settings/pages/wallet-view.tsx",
  "External signer handoffs are available here.",
);
assertIncludes("apps/app/src/react-app/domains/settings/pages/wallet-view.tsx", "Remote worker");

assertIncludes("apps/app/src/react-app/domains/settings/pages/mcp-view.tsx", "Install command");
assertIncludes("apps/app/src/react-app/domains/settings/pages/mcp-view.tsx", "server-backed and ready to install below");
assertIncludes("apps/app/src/react-app/domains/settings/pages/mcp-view.tsx", "No external MCPs connected.");
assertIncludes("apps/app/src/react-app/domains/settings/pages/mcp-view.tsx", "Preview desktop bridge");
assertIncludes("apps/app/src/react-app/domains/settings/pages/mcp-view.tsx", '"Coming soon"');

assertIncludes("apps/app/src/react-app/domains/session/chat/session-page.tsx", "Each inserts an editable prompt");
assertIncludes("apps/app/src/react-app/domains/session/chat/session-page.tsx", "draftConfig?.confirmCtaLabel");
assertIncludes("apps/app/src/react-app/domains/session/chat/session-page.tsx", "onCreateTaskWithPrompt");

assertIncludes("apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx", "stages an editable Bittensor Agent task");
assertIncludes("apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx", "nothing auto-sends");

if (failures.length > 0) {
  console.error("Wallet/profile/MCP/draft polish gate failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Wallet/profile/MCP/draft polish gate passed.");
