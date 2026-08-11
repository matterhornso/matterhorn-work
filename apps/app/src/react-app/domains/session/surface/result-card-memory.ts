import type { MatterhornMemoryKind, MatterhornMemoryRecord } from "@matterhorn-work/types";

import { applyMatterhornMemoryDeskPolicyDefaults } from "../../memory/memory-policy";
import type { BittensorPublicEvidenceCard } from "./message-list";

export type ResultCardDeskId = "bittensor" | "hyperliquid" | "polymarket" | "sui";

const RESULT_CARD_DESK_IDS = new Set<ResultCardDeskId>([
  "bittensor",
  "hyperliquid",
  "polymarket",
  "sui",
]);

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function resultCardDeskId(card: BittensorPublicEvidenceCard): ResultCardDeskId | null {
  const venue = normalizedText(card.venue).toLowerCase();
  if (RESULT_CARD_DESK_IDS.has(venue as ResultCardDeskId)) {
    return venue as ResultCardDeskId;
  }

  const identity = [card.title, card.subtitle, card.kind, card.originalKind]
    .map(normalizedText)
    .join(" ")
    .toLowerCase();

  if (/\bpolymarket\b/.test(identity)) return "polymarket";
  if (/\bhyperliquid\b/.test(identity)) return "hyperliquid";
  if (/\bsui\b/.test(identity)) return "sui";
  if (/\b(bittensor|tao|subnet|validator)\b/.test(identity)) return "bittensor";
  return null;
}

function memoryKindForCard(
  card: BittensorPublicEvidenceCard,
  deskId: ResultCardDeskId | null,
): MatterhornMemoryKind {
  if (!deskId) return "workflow_artifact";
  const identity = `${normalizedText(card.kind)} ${normalizedText(card.originalKind)}`.toLowerCase();
  return identity.includes("receipt") ? "receipt" : "watchlist";
}

function recordIdPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
}

export function buildResultCardMemoryRecord(input: {
  card: BittensorPublicEvidenceCard;
  workspaceId: string;
  sessionId: string;
  now?: string;
  nonce?: string;
}): MatterhornMemoryRecord {
  const now = input.now ?? new Date().toISOString();
  const title = normalizedText(input.card.title) || "Saved desk result";
  const summary = normalizedText(input.card.summary)
    || normalizedText(input.card.subtitle)
    || "Desk result saved from chat.";
  const deskId = resultCardDeskId(input.card);
  const nonce = input.nonce ?? Math.random().toString(36).slice(2, 9);
  const kind = memoryKindForCard(input.card, deskId);
  const cardKind = normalizedText(input.card.originalKind) || normalizedText(input.card.kind) || "result";
  const items = (input.card.items ?? [])
    .slice(0, 24)
    .map((item) => ({
      label: normalizedText(item.label).slice(0, 120),
      value: normalizedText(item.value).slice(0, 2_000),
    }))
    .filter((item) => item.label || item.value);
  const warnings = (input.card.warnings ?? [])
    .map(normalizedText)
    .filter(Boolean)
    .slice(0, 8)
    .map((warning) => warning.slice(0, 1_000));

  const record: MatterhornMemoryRecord = {
    id: `mem_chat_result_${recordIdPart(title) || "result"}_${recordIdPart(nonce) || "saved"}`,
    kind,
    scope: "workspace",
    title: title.slice(0, 200),
    summary: summary.slice(0, 1_000),
    body: {
      venue: deskId ?? (normalizedText(input.card.venue) || "workspace"),
      resultKind: cardKind.slice(0, 120),
      summary: summary.slice(0, 4_000),
      items,
      warnings,
    },
    tags: [deskId, "chat-result", "user-saved"].filter((tag): tag is string => Boolean(tag)),
    links: [
      { rel: "workspace", href: `/workspace/${input.workspaceId}`, title: "Workspace" },
      {
        rel: "session",
        href: `/workspace/${input.workspaceId}/session/${input.sessionId}`,
        title: "Source chat",
      },
    ],
    provenance: {
      source: "workflow_output",
      sourceId: `${input.sessionId}:${cardKind}`.slice(0, 240),
      capturedAt: now,
      capturedBy: "user",
      confidence: 1,
      reasonRemembered: "User explicitly saved this visible desk result to Matterhorn Memory.",
    },
    sensitivity: "public",
    createdAt: now,
    updatedAt: now,
    canUseInChat: true,
    canExport: true,
    canDelete: true,
  };

  return applyMatterhornMemoryDeskPolicyDefaults(record);
}
