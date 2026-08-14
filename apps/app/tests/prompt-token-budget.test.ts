import { describe, expect, test } from "bun:test";

import { MATTERHORN_DESK_AGENT_MANIFESTS, buildMatterhornDeskRequestOverlay } from "@matterhorn-work/types/desk-agents";
import { buildMatterhornExecutionModeSystemPrompt } from "@matterhorn-work/types/execution-mode";
import {
  compileMatterhornSessionSystemContext,
  estimateMatterhornContextTokens,
  MATTERHORN_DESK_CONTEXT_MAX_CHARS,
  MATTERHORN_GENERAL_CONTEXT_MAX_CHARS,
} from "../src/react-app/domains/session/context/session-system-context";
import { buildResponsePerspectiveSystemPrompt } from "../src/react-app/domains/session/perspectives/response-perspective";
import {
  buildDirectResponseSystemPrompt,
  buildGeneralCryptoSafetySystemPrompt,
  buildProtocolDeskCryptoSafetySystemPrompt,
} from "../src/react-app/domains/wallet/prompts/crypto-system-prompt";

function estimatedTokens(
  blocks: Parameters<typeof compileMatterhornSessionSystemContext>[0],
  maxChars: number,
) {
  return estimateMatterhornContextTokens(compileMatterhornSessionSystemContext(blocks, maxChars));
}

describe("Matterhorn prompt token budgets", () => {
  test("keeps a hosted answer-only turn under 125 Matterhorn-added context tokens", () => {
    const tokens = estimatedTokens([
      { id: "direct_response", content: buildDirectResponseSystemPrompt() },
      { id: "response_perspective", content: buildResponsePerspectiveSystemPrompt("balanced") },
    ], MATTERHORN_GENERAL_CONTEXT_MAX_CHARS);

    expect(tokens).toBeLessThanOrEqual(125);
  });

  test("keeps a direct local answer-only turn under 325 Matterhorn-added context tokens", () => {
    const tokens = estimatedTokens([
      { id: "execution_mode", content: buildMatterhornExecutionModeSystemPrompt("work") },
      { id: "direct_response", content: buildDirectResponseSystemPrompt() },
      { id: "response_perspective", content: buildResponsePerspectiveSystemPrompt("balanced") },
    ], MATTERHORN_GENERAL_CONTEXT_MAX_CHARS);

    expect(tokens).toBeLessThanOrEqual(325);
  });

  test("keeps general crypto safety under 350 Matterhorn-added context tokens", () => {
    const tokens = estimatedTokens([
      { id: "direct_response", content: buildDirectResponseSystemPrompt() },
      { id: "crypto_safety", content: buildGeneralCryptoSafetySystemPrompt() },
      { id: "response_perspective", content: buildResponsePerspectiveSystemPrompt("balanced") },
    ], MATTERHORN_GENERAL_CONTEXT_MAX_CHARS);

    expect(tokens).toBeLessThanOrEqual(350);
  });

  test("keeps a specialized desk request overlay under 450 Matterhorn-added context tokens", () => {
    const tokens = estimatedTokens([
      { id: "desk_contract", content: buildMatterhornDeskRequestOverlay(MATTERHORN_DESK_AGENT_MANIFESTS.bittensor) },
      { id: "direct_response", content: buildDirectResponseSystemPrompt() },
      { id: "crypto_safety", content: buildProtocolDeskCryptoSafetySystemPrompt() },
      { id: "response_perspective", content: buildResponsePerspectiveSystemPrompt("balanced") },
    ], MATTERHORN_DESK_CONTEXT_MAX_CHARS);

    expect(tokens).toBeLessThanOrEqual(450);
  });
});
