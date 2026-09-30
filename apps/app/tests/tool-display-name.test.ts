import { expect, test } from "bun:test";
import { deskToolDisplayName } from "../src/app/lib/tool-display-name";

test("known desk tools have concise labels independent of transport namespace", () => {
  for (const [id, label] of [
    ["matterhorn_bittensor_chat", "Bittensor data and previews"],
    ["matterhorn_hyperliquid_get_orderbook", "Hyperliquid orderbook"],
    ["matterhorn_hyperliquid_get_funding", "Hyperliquid funding"],
    ["matterhorn_polymarket_search_markets", "Polymarket market search"],
    ["matterhorn_prediction_markets_search", "Prediction market search"],
    ["matterhorn_sui_get_balance", "Sui balance"],
  ]) {
    expect(deskToolDisplayName(id)).toBe(label);
    expect(deskToolDisplayName(`matterhorn-work_${id}`)).toBe(label);
  }
});

test("unknown and third-party tools keep their existing identity", () => {
  for (const id of ["custom_matterhorn_sui_get_balance", "matterhorn_sui_transfer", "bash", "constructor", "toString", ""]) {
    expect(deskToolDisplayName(id)).toBeUndefined();
  }
});
