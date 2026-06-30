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
  "Browser wallet extensions do not inject into Electron",
);
assertIncludes(
  "apps/app/src/react-app/domains/settings/pages/wallet-view.tsx",
  "WalletConnect or deep-link bridge",
);
assertIncludes("apps/app/src/react-app/domains/settings/pages/wallet-view.tsx", "Remote worker");

assertIncludes("apps/app/src/react-app/domains/settings/pages/mcp-view.tsx", "Install command available");
assertIncludes("apps/app/src/react-app/domains/settings/pages/mcp-view.tsx", "Backend tools available");
assertIncludes("apps/app/src/react-app/domains/settings/pages/mcp-view.tsx", "Not connected until configured");
assertIncludes("apps/app/src/react-app/domains/settings/pages/mcp-view.tsx", "UI Control is marked preview");

assertIncludes("apps/app/src/react-app/domains/session/chat/session-page.tsx", "Draft ready");
assertIncludes("apps/app/src/react-app/domains/session/chat/session-page.tsx", "been sent. Review");
assertIncludes("apps/app/src/react-app/domains/session/chat/session-page.tsx", "Create editable draft");

assertIncludes("apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx", "Create chat draft");
assertIncludes("apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx", "nothing auto-sends");

if (failures.length > 0) {
  console.error("Wallet/profile/MCP/draft polish gate failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Wallet/profile/MCP/draft polish gate passed.");
