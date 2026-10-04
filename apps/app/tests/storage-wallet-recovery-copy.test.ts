import { describe, expect, test } from "bun:test";
import { MatterhornServerError } from "../src/app/lib/matterhorn-server";
import { userMessage } from "../src/react-app/domains/crypto-apps/crypto-evidence-route";
import { agentFileErrorMessage } from "../src/react-app/domains/agent-files/agent-files-panel";

describe("storage wallet recovery copy", () => {
  for (const [format, codes] of [
    [userMessage, [
      "crypto_evidence_workspace_deleted", "crypto_evidence_wallet_review_unavailable",
      "crypto_evidence_walrus_renewal_expired_or_replayed", "crypto_evidence_walrus_renewal_unavailable",
      "crypto_evidence_walrus_renewal_intent_mismatch",
    ]],
    [agentFileErrorMessage, [
      "agent_file_workspace_deleted", "agent_file_wallet_review_unavailable",
      "agent_file_walrus_renewal_expired_or_replayed", "agent_file_walrus_unavailable",
      "agent_file_walrus_renewal_intent_mismatch",
    ]],
  ] satisfies Array<[(error: unknown) => string, string[]]>) {
    for (const code of codes) {
      test(`${code} preserves uncertainty and explains wallet recovery`, () => {
        const message = format(new MatterhornServerError(503, code, "upstream-private-detail"));
        expect(message).toContain("wallet");
        expect(message).toContain("status");
        expect(message).not.toMatch(/Nothing was (?:changed|sent|recorded)|prepare it again|Prepare a new/);
        expect(message).not.toContain("upstream-private-detail");
        if (code.endsWith("workspace_deleted")) expect(message).toContain("cannot continue");
      });
    }
  }
});
