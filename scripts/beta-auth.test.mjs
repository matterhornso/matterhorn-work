#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const provider = readFileSync("apps/app/src/react-app/domains/auth/beta-auth-provider.tsx", "utf8");
const menu = readFileSync("apps/app/src/react-app/domains/auth/beta-auth-menu.tsx", "utf8");
const button = readFileSync("apps/app/src/react-app/domains/auth/beta-auth-button.tsx", "utf8");
const types = readFileSync("apps/app/src/react-app/domains/auth/beta-auth-types.ts", "utf8");
const index = readFileSync("apps/app/src/react-app/domains/auth/index.ts", "utf8");
const statusBar = readFileSync("apps/app/src/react-app/domains/session/chat/status-bar.tsx", "utf8");
const providers = readFileSync("apps/app/src/react-app/shell/providers.tsx", "utf8");
const setupDoc = readFileSync("docs/beta-auth-setup.md", "utf8");

// 1. Package exposes the beta auth gate.
assert.equal(
  pkg.scripts["test:beta-auth"],
  "node scripts/beta-auth.test.mjs",
  "package.json should expose test:beta-auth",
);

// 2. Auth provider exports Clerk-compatible hooks.
for (const token of ["BetaAuthProvider", "useBetaAuth", "useAuth", "useUser", "useClerk"]) {
  assert.ok(index.includes(token), `auth index must export ${token}`);
  assert.ok(provider.includes(`export function ${token}`) || provider.includes(`function ${token}`),
    `auth provider must define ${token}`);
}

// 3. Auth types define the expected Clerk-compatible surface.
for (const token of ["BetaAuthStatus", "BetaAuthStore", "BetaUser", "BetaClerkStub"]) {
  assert.ok(types.includes(token), `auth types must define ${token}`);
}

// 4. Auth UI distinguishes account auth from wallet auth.
for (const phrase of [
  "Matterhorn account",
  "local workspaces stay available",
  "Sign in",
  "Sign out",
  "Create Matterhorn account",
]) {
  assert.ok(menu.includes(phrase), `auth menu must include "${phrase}"`);
}

// 5. No credential material is requested by the auth layer.
const scan = [provider, menu, button, types, index].join("\n").toLowerCase();
for (const forbidden of [
  "seed phrase",
  "private key",
  "mnemonic",
  "api secret",
  "raw signature",
  "signed payload",
  "signed order",
  "wallet export",
]) {
  assert.equal(
    scan.includes(forbidden),
    false,
    `auth layer must not reference ${forbidden}`,
  );
}

// 6. Provider is wired into the app shell.
assert.ok(providers.includes("BetaAuthProvider"), "providers.tsx must render BetaAuthProvider");
assert.ok(providers.includes("DenAuthProvider"), "providers.tsx must still render DenAuthProvider");
assert.ok(
  providers.indexOf("BetaAuthProvider") > providers.indexOf("DenAuthProvider"),
  "BetaAuthProvider must be inside DenAuthProvider",
);

// 7. Status bar uses the new auth menu.
assert.ok(statusBar.includes("BetaAuthMenu"), "status bar must render BetaAuthMenu");
assert.equal(
  statusBar.includes("buildDenAuthUrl"),
  false,
  "status bar should not directly call buildDenAuthUrl after wiring BetaAuthMenu",
);
assert.equal(
  statusBar.includes("useDenAuth"),
  false,
  "status bar should not directly use useDenAuth after wiring BetaAuthMenu",
);

// 8. Docs cover env vars and local/offline testing.
for (const phrase of [
  "VITE_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "Local/offline",
  "Continue offline",
  "Matterhorn account is separate from any Web3 wallet",
]) {
  assert.ok(setupDoc.includes(phrase), `beta auth setup doc must mention "${phrase}"`);
}

// 9. No secret env values are committed in source.
assert.equal(
  scan.includes("clerk_secret_key"),
  false,
  "auth source must not hardcode CLERK_SECRET_KEY",
);

console.log("Monday beta auth static check passed.");
