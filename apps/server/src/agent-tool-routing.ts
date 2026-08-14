import { MATTERHORN_CRYPTO_ACTION_REGISTRY } from "@matterhorn-work/types/crypto-action-registry";

type CryptoDeskId = "bittensor" | "hyperliquid" | "polymarket" | "sui";

const DESK_INTENT: Record<CryptoDeskId, RegExp> = {
  bittensor: /\b(?:bittensor|tao|ss58|coldkey|hotkey|metagraph|subnet)\b/i,
  hyperliquid: /\b(?:hyperliquid|hyper liquid|perpetuals?|perps?|funding rate|orderbook)\b/i,
  polymarket: /\b(?:polymarket|prediction markets?|kalshi|manifold)\b/i,
  sui: /\b(?:sui|move object|coin type)\b/i,
};

// These intents require built-in file, browser, or extension capabilities in
// addition to crypto tools. Keep the complete selected-agent policy instead of
// narrowing the request and risking a false-negative tool route.
const BROAD_CAPABILITY_INTENT = /\b(?:file|folder|workspace|repository|repo|codebase|attachment|upload|download|create|write|edit|update|delete|remove|rename|move|copy|save|export|build|fix|implement|run|test|install|configure|connect|deploy|debug|memory|note|output|artifact|spreadsheet|document|report|mcp|extension|browser|website|web page)\b/i;

export function buildMatterhornGeneralCryptoToolProfile(input: {
  agentId?: string | null;
  text: string;
  hasAttachments?: boolean;
}): Record<string, boolean> | undefined {
  const agentId = input.agentId?.trim() || "matterhorn";
  if (agentId !== "matterhorn" || input.hasAttachments) return undefined;

  const text = input.text.replace(/\s+/g, " ").trim();
  if (!text || BROAD_CAPABILITY_INTENT.test(text)) return undefined;
  const desks = (Object.entries(DESK_INTENT) as Array<[CryptoDeskId, RegExp]>)
    .filter(([, pattern]) => pattern.test(text))
    .map(([desk]) => desk);
  if (desks.length === 0) return undefined;

  const names = new Set<string>();
  for (const tool of MATTERHORN_CRYPTO_ACTION_REGISTRY) {
    if (tool.deskIds.some((desk) => desks.includes(desk))) {
      names.add(`matterhorn-work_${tool.name}`);
    }
  }
  if (names.size === 0) return undefined;
  return {
    "*": false,
    ...Object.fromEntries([...names].sort().map((name) => [name, true])),
  };
}
