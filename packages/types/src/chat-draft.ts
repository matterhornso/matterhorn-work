// Chat draft contract
// Per-desk prompt action semantics so the UI can show unmistakable draft states.

export const CHAT_PROMPT_ACTIONS = [
  "draft_only",
  "send_after_confirm",
  "disabled",
] as const;
export type ChatPromptAction = (typeof CHAT_PROMPT_ACTIONS)[number];

export interface ChatDraftConfig {
  version: "matterhorn.chat.draft.v1";
  deskId: string;
  promptAction: ChatPromptAction;
  draftStateLabel: string;
  confirmCtaLabel?: string;
  disabledReason?: string;
}

export const BITTENSOR_CHAT_DRAFT: ChatDraftConfig = {
  version: "matterhorn.chat.draft.v1",
  deskId: "bittensor",
  promptAction: "draft_only",
  draftStateLabel: "Draft ready — Bittensor preview or handoff",
  confirmCtaLabel: "Open in chat",
};

export const HYPERLIQUID_CHAT_DRAFT: ChatDraftConfig = {
  version: "matterhorn.chat.draft.v1",
  deskId: "hyperliquid",
  promptAction: "draft_only",
  draftStateLabel: "Draft ready — Hyperliquid preview only",
  confirmCtaLabel: "Open in chat",
};

export const POLYMARKET_CHAT_DRAFT: ChatDraftConfig = {
  version: "matterhorn.chat.draft.v1",
  deskId: "polymarket",
  promptAction: "draft_only",
  draftStateLabel: "Draft ready — Polymarket preview only",
  confirmCtaLabel: "Open in chat",
};

export const WELLNESS_CHAT_DRAFT: ChatDraftConfig = {
  version: "matterhorn.chat.draft.v1",
  deskId: "wellness",
  promptAction: "send_after_confirm",
  draftStateLabel: "Draft ready — Wellness program builder",
  confirmCtaLabel: "Build program",
};

export const MEMORY_CHAT_DRAFT: ChatDraftConfig = {
  version: "matterhorn.chat.draft.v1",
  deskId: "memory",
  promptAction: "send_after_confirm",
  draftStateLabel: "Draft ready — Memory review",
  confirmCtaLabel: "Review memory",
};

export const MCPS_CHAT_DRAFT: ChatDraftConfig = {
  version: "matterhorn.chat.draft.v1",
  deskId: "mcps",
  promptAction: "draft_only",
  draftStateLabel: "Draft ready — Browse MCP tools",
  confirmCtaLabel: "Open in chat",
};

export const CHAT_DRAFT_REGISTRY: Record<string, ChatDraftConfig> = {
  bittensor: BITTENSOR_CHAT_DRAFT,
  hyperliquid: HYPERLIQUID_CHAT_DRAFT,
  polymarket: POLYMARKET_CHAT_DRAFT,
  wellness: WELLNESS_CHAT_DRAFT,
  memory: MEMORY_CHAT_DRAFT,
  mcps: MCPS_CHAT_DRAFT,
};

export function getChatDraftConfig(deskId: string): ChatDraftConfig | undefined {
  return CHAT_DRAFT_REGISTRY[deskId];
}

export function listChatDraftConfigs(): ChatDraftConfig[] {
  return Object.values(CHAT_DRAFT_REGISTRY);
}
