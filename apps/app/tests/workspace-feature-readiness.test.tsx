import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { readFileSync } from "node:fs";
import { CryptoDeskLinks } from "../src/react-app/domains/crypto-apps/crypto-desk-links";
import { SigninBoundary } from "../src/react-app/shell/signin-boundary";
import { PrivateModelSetup } from "../src/react-app/domains/settings/pages/private-model-setup";
import type { MatterhornProviderPrivacyPolicy } from "@matterhorn-work/types/backend-models";

describe("authentication during navigation", () => {
  test("never renders signed-out landing or protected content while checking", () => {
    function Forbidden() { throw new Error("Must not mount during auth check"); }
    const html = renderToStaticMarkup(<SigninBoundary required status="checking" loading={<p>Checking</p>} signedOut={<Forbidden />}><Forbidden /></SigninBoundary>);
    expect(html).toBe("<p>Checking</p>");
  });
  test("signed-out visitors stay blocked and signed-in visitors see the desk", () => {
    for (const status of ["signed_in", "signed_out"] as const) {
      const html = renderToStaticMarkup(<SigninBoundary required status={status} loading="Checking" signedOut="Sign in">Desk</SigninBoundary>);
      expect(html).toBe(status === "signed_in" ? "Desk" : "Sign in");
    }
  });
  test("public trust pages do not require authentication", () => {
    expect(renderToStaticMarkup(<SigninBoundary required={false} status="checking" loading="Checking" signedOut="Sign in">Privacy</SigninBoundary>)).toBe("Privacy");
  });
});

const policy: MatterhornProviderPrivacyPolicy = {
  providerId: "venice", providerName: "Venice", status: "verified_no_training",
  trainingUse: "none", retentionDays: 0, policyUrl: null,
  verifiedAt: new Date(Date.now() - 60_000).toISOString(),
  verificationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  verifiedModelIds: ["private-tools"], allowed: true, label: "Private", description: "Verified",
};
const catalog = { providers: [{
  id: "venice", name: "Venice", connected: true, modelCount: 1,
  modelIds: ["private-tools"], sampleModels: ["private-tools"],
}] };
function setup(overrides: Partial<React.ComponentProps<typeof PrivateModelSetup>> = {}) {
  return renderToStaticMarkup(<PrivateModelSetup catalog={catalog} policy={policy} loading={false} failed={false} onRefresh={() => {}} onChooseModel={() => {}} {...overrides} />);
}
describe("Private setup", () => {
  test("offers models only after exact server verification", () => {
    expect(setup()).toContain("A verified Venice model is available");
    expect(setup()).toContain("Choose model");
  });
  test("unconfigured setup explains the operator dependency without a key input", () => {
    const html = setup({ catalog: undefined });
    expect(html).toContain("VENICE_API_KEY");
    expect(html).toContain("Ask your workspace operator");
    expect(html).not.toContain("Choose model");
    expect(html).not.toContain("<input");
  });
  test("expired, missing and substituted proof cannot advertise Private as ready", () => {
    for (const next of [undefined, { ...policy, verificationExpiresAt: new Date(0).toISOString() }, { ...policy, verifiedModelIds: ["different-model"] }]) {
      expect(setup({ policy: next })).not.toContain("Choose model");
    }
  });
  test("loading and failure hide stale availability", () => {
    expect(setup({ loading: true })).not.toContain("Choose model");
    expect(setup({ failed: true })).toContain("could not be checked");
    expect(setup({ failed: true })).not.toContain("Choose model");
  });
});

test("built-in desks have direct workspace links without connecting an app", () => {
  const html = renderToStaticMarkup(<MemoryRouter><CryptoDeskLinks workspaceId="workspace /test" /></MemoryRouter>);
  for (const desk of ["bittensor", "hyperliquid", "polymarket", "sui"]) {
    expect(html).toContain(`/workspace/workspace%20%2Ftest/session?panel=${desk}`);
  }
});

test("Memory distinguishes selecting records from attaching model context", () => {
  const source = readFileSync(new URL("../src/react-app/domains/memory/memory-panel.tsx", import.meta.url), "utf8");
  expect(source).toContain('selected ? "Selected" : "Select for chat"');
  expect(source).toContain("aria-pressed={selected}");
  expect(source).toContain("dispatchMemoryContext(visibleSelectedRecords)");
  expect(source).toContain("Nothing is sent yet.");
});
