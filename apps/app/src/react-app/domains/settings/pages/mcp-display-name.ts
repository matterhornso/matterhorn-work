const MATTERHORN_MCP_DISPLAY_NAMES: Record<string, string> = {
  "matterhorn-work": "Matterhorn Desks MCP",
  "matterhorn-work-mcp": "Matterhorn Desks MCP",
  "matterhorn-work-crypto": "Matterhorn Desks Crypto MCP",
  "matterhorn-work-ui": "Matterhorn Desks UI Control",
  "matterhorn-work-wallet": "Matterhorn Desks Wallet MCP",
};

function normalizedMcpName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function matterhornMcpDisplayName(name: string) {
  return MATTERHORN_MCP_DISPLAY_NAMES[normalizedMcpName(name)] ?? null;
}

export function mcpServerDisplayName(name: string) {
  const matterhornName = matterhornMcpDisplayName(name);
  if (matterhornName) return matterhornName;

  const words = name
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  const label = words.join(" ") || "MCP";
  return /\bmcp\b/i.test(label) ? label : `${label} MCP`;
}
