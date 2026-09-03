import type { MatterhornCryptoAppManifest } from "./manifest-contract.js";

import {
  projectCryptoAppOutput,
  validateCryptoAppInput,
  type CryptoAppSchemaResult,
} from "./json-schema.js";

export type MatterhornCryptoAppFixture = {
  actionId: string;
  input: unknown;
  output: unknown;
};

export type MatterhornCryptoAppFixtureReport = {
  version: "matterhorn.crypto-app-fixture-report.v1";
  appId: string;
  manifestRevision: string;
  actionId: string;
  passed: boolean;
  input: CryptoAppSchemaResult;
  output: CryptoAppSchemaResult;
};

/**
 * Validates one inert fixture without invoking an adapter or performing I/O.
 * Unknown input fields fail; undeclared output fields are dropped exactly as
 * they are at Matterhorn's production projection boundary.
 */
export function validateCryptoAppFixture(
  manifest: MatterhornCryptoAppManifest,
  fixture: MatterhornCryptoAppFixture,
): MatterhornCryptoAppFixtureReport {
  const action = manifest.actions.find((candidate) => candidate.id === fixture.actionId);
  if (!action) {
    const missing = { ok: false, value: null, issues: ["$:action_not_found"] };
    return {
      version: "matterhorn.crypto-app-fixture-report.v1",
      appId: manifest.appId,
      manifestRevision: manifest.manifestRevision,
      actionId: fixture.actionId,
      passed: false,
      input: missing,
      output: missing,
    };
  }
  const input = validateCryptoAppInput(action.inputSchema, fixture.input);
  const output = projectCryptoAppOutput(action.outputProjectionSchema, fixture.output);
  return {
    version: "matterhorn.crypto-app-fixture-report.v1",
    appId: manifest.appId,
    manifestRevision: manifest.manifestRevision,
    actionId: action.id,
    passed: input.ok && output.ok,
    input,
    output,
  };
}
