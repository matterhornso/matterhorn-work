import { describe, expect, test } from "bun:test";

import { buildMatterhornGeneralCryptoToolProfile } from "./agent-tool-routing.js";

describe("general agent tool routing", () => {
  test("narrows explicit crypto venue requests to the relevant managed tools", () => {
    const bittensor = buildMatterhornGeneralCryptoToolProfile({
      text: "Compare the latest Bittensor subnet emissions",
    });
    expect(bittensor?.["*"]).toBe(false);
    expect(bittensor?.["matterhorn-work_matterhorn_bittensor_chat"]).toBe(true);
    expect(bittensor?.["matterhorn-work_matterhorn_crypto_chat"]).toBe(true);
    expect(JSON.stringify(bittensor)).not.toContain("hyperliquid");

    const sui = buildMatterhornGeneralCryptoToolProfile({ text: "Show my live Sui balance" });
    expect(sui).toEqual({
      "*": false,
      "matterhorn-work_matterhorn_sui_get_balance": true,
      "matterhorn-work_matterhorn_sui_preview_transfer": true,
    });
  });

  test("combines families for an explicit cross-venue comparison", () => {
    const profile = buildMatterhornGeneralCryptoToolProfile({
      text: "Compare Hyperliquid funding with Polymarket probabilities",
    });
    expect(profile?.["matterhorn-work_matterhorn_hyperliquid_get_funding"]).toBe(true);
    expect(profile?.["matterhorn-work_matterhorn_prediction_markets_search"]).toBe(true);
    expect(JSON.stringify(profile)).not.toContain("sui_get_balance");
  });

  test("keeps the complete agent policy for ambiguous, file, attachment, and custom-agent work", () => {
    expect(buildMatterhornGeneralCryptoToolProfile({ text: "Continue" })).toBeUndefined();
    expect(buildMatterhornGeneralCryptoToolProfile({ text: "Save a Bittensor report" })).toBeUndefined();
    expect(buildMatterhornGeneralCryptoToolProfile({ text: "Inspect Sui", hasAttachments: true })).toBeUndefined();
    expect(buildMatterhornGeneralCryptoToolProfile({ agentId: "matterhorn-sui", text: "Show Sui balance" })).toBeUndefined();
  });
});
