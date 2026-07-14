#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const packageJson = JSON.parse(read("package.json"));
assert.equal(
  packageJson.scripts?.["test:matterhorn-design-system"],
  "node scripts/matterhorn-design-system.test.mjs",
  "package.json should expose the Matterhorn design system gate",
);

const design = read("DESIGN.md");
const uiDesign = read("docs/ui/matterhorn-design-system.md");
const css = read("apps/app/src/app/index.css");
const all = `${design}\n${uiDesign}\n${css}`;

for (const phrase of [
  "desk-first",
  "Home, Bittensor, Hyperliquid, Polymarket, Longevity, Memory, MCPs, and Settings",
  "#0C0C0C",
  "#D1F2FF",
  "Matterhorn logo",
  "Aeonik",
  "electric cyan",
  "blue / green",
  "purple / amber",
  "coral / mint",
  "gold / slate",
  "Safety Strip",
  "Can submit",
  "Live submission",
  "External signer/client required",
  "SS58",
  "coldkey",
  "hotkey",
  "Prepare stake preview",
  "Prepare unstake preview",
  "Prepare transfer preview",
  "Compliance-blocked previews must not expose executable price, size, or share fields",
  "safe offline optimization workflows",
  "No hidden saves",
  "No hidden memory saves",
  "No horizontal overflow",
  "composer does not overlap cards",
]) {
  assert.ok(all.includes(phrase), `design contract should include: ${phrase}`);
}

for (const token of [
  "--desk-bittensor",
  "--desk-hyperliquid",
  "--desk-polymarket",
  "--desk-wellness",
  "--desk-memory",
  "--status-preview",
  "--status-blocked",
  "--nav-rail-width",
]) {
  assert.ok(css.includes(token), `app theme should expose semantic token: ${token}`);
}

for (const forbidden of [
  "Customer-facing `Services` primary nav is allowed",
  "Hyperliquid live submit is enabled",
  "Polymarket live submit is enabled",
  "Show a seed phrase field",
  "Show a private key field",
  "Show a raw signature field",
]) {
  assert.equal(all.includes(forbidden), false, `design contract must not include forbidden claim: ${forbidden}`);
}

const surfacePaths = [
  "apps/app/src/react-app/domains/memory/memory-panel.tsx",
  "apps/app/src/react-app/domains/recent-activity/project-history-page.tsx",
  "apps/app/src/react-app/domains/recent-activity/recent-activity-section.tsx",
  "apps/app/src/react-app/domains/session/chat/session-page.tsx",
  "apps/app/src/react-app/domains/session/media/nft-draft-panel.tsx",
  "apps/app/src/react-app/domains/session/media/session-image-generation-panel.tsx",
  "apps/app/src/react-app/domains/session/surface/composer/composer.tsx",
  "apps/app/src/react-app/domains/session/surface/message-list.tsx",
  "apps/app/src/react-app/domains/session/surface/session-surface.tsx",
  "apps/app/src/react-app/domains/session/surface/tool-call.tsx",
  "apps/app/src/react-app/domains/session/workflows/workflow-stage-card.tsx",
  "apps/app/src/react-app/domains/settings/backend-capabilities/backend-capability-section.tsx",
  "apps/app/src/react-app/domains/settings/backend-capabilities/backend-capability-status.tsx",
  "apps/app/src/react-app/domains/settings/pages/billing-view.tsx",
  "apps/app/src/react-app/domains/settings/pages/generated-media-view.tsx",
  "apps/app/src/react-app/domains/settings/pages/general-view.tsx",
  "apps/app/src/react-app/domains/settings/pages/marketplace-view.tsx",
  "apps/app/src/react-app/domains/settings/pages/mcp-view.tsx",
  "apps/app/src/react-app/domains/settings/pages/overview-view.tsx",
  "apps/app/src/react-app/domains/settings/pages/wallet-view.tsx",
  "apps/app/src/react-app/domains/wallet/TransactionApproval.tsx",
  "apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx",
  "apps/app/src/react-app/domains/wallet/sui-workflow-panel.tsx",
];

const englishCopy = read("apps/app/src/i18n/locales/en.ts");
for (const forbiddenCopy of [
  '"settings.services_section_title": "Services"',
  "OpenWork worker",
  "OpenWork server",
  "OpenWork cache",
  "OpenWork workspace",
]) {
  assert.equal(
    englishCopy.includes(forbiddenCopy),
    false,
    `English customer copy must avoid inherited product seam: ${forbiddenCopy}`,
  );
}

for (const requiredCopy of [
  '"settings.services_section_title": "Local runtime"',
  '"settings.opencode_engine_label": "Matterhorn Work engine"',
  '"settings.opencode_section_label": "Matterhorn Work engine"',
]) {
  assert.ok(
    englishCopy.includes(requiredCopy),
    `English customer copy should keep Matterhorn-specific wording: ${requiredCopy}`,
  );
}

const forbiddenSurfacePatterns = [
  "rounded-[16px]",
  "rounded-[18px]",
  "rounded-[20px]",
  "rounded-[24px]",
  "rounded-3xl",
  "rounded-4xl",
  "border-y border-dls-border/25",
  "border-y border-dls-border/35",
  "border-y border-dls-border/45",
  "border-b border-dls-border/50",
  "border-l border-dls-border/30",
  "border-t border-dls-border/25",
  "border-t border-dls-border/35",
  "border-t border-dls-border/45",
  "divide-y divide-dls-border/25",
  "divide-y divide-dls-border/20",
  "divide-y divide-dls-border/35",
  "divide-y divide-dls-border/45",
  "divide-y divide-dls-border/50",
  "divide-y divide-dls-border/70",
  "border-l border-white",
  "border-b border-white",
  "w-px bg-dls-border/30",
  "border-b border-gray",
  "divide-y divide-gray",
  "tracking-wider",
  "h-[2px]",
];

for (const path of surfacePaths) {
  const source = read(path);
  for (const pattern of forbiddenSurfacePatterns) {
    assert.equal(
      source.includes(pattern),
      false,
      `${path} must avoid boxy design contract violation: ${pattern}`,
    );
  }
  assert.equal(
    source.includes("@paper-design/shaders-react"),
    false,
    `${path} must use the guarded @matterhorn-work/ui/react paper shader wrappers`,
  );
}

console.log("Matterhorn design system gate passed.");
