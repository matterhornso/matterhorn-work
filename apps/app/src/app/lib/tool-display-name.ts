// Presentation labels only. Raw tool IDs and payloads remain authoritative.
const deskToolLabels: Readonly<Record<string, string>> = {
  matterhorn_bittensor_chat: "Bittensor data and previews",
  matterhorn_hyperliquid_get_orderbook: "Hyperliquid orderbook",
  matterhorn_hyperliquid_get_funding: "Hyperliquid funding",
  matterhorn_polymarket_search_markets: "Polymarket market search",
  matterhorn_prediction_markets_search: "Prediction market search",
  matterhorn_sui_get_balance: "Sui balance",
};

export function deskToolDisplayName(toolName: string): string | undefined {
  const canonical = toolName.startsWith("matterhorn-work_")
    ? toolName.slice("matterhorn-work_".length)
    : toolName;
  return Object.hasOwn(deskToolLabels, canonical) ? deskToolLabels[canonical] : undefined;
}
