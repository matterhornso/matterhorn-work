/** @jsxImportSource react */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { isToolUIPart, type DynamicToolUIPart, type UIMessage } from "ai";
import type { Part } from "@opencode-ai/sdk/v2/client";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Activity,
  BadgeCheck,
  Box,
  BrainCircuit,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  ExternalLink,
  File as FileIcon,
  FileText,
  Folder,
  GitFork,
  Globe,
  Save,
  Search,
  ShieldAlert,
  Terminal,
  ThumbsDown,
  ThumbsUp,
  Undo2,
  Wallet,
  Zap,
  RotateCcw,
} from "lucide-react";

import { openDesktopPath, revealDesktopItemInDir } from "../../../../app/lib/desktop";
import { cn } from "@/lib/utils";
import {
  SYNTHETIC_SESSION_ERROR_MESSAGE_PREFIX,
  type MessageGroup,
  type StepGroupMode,
} from "../../../../app/types";
import { groupMessageParts, isDesktopRuntime, summarizeStep } from "../../../../app/utils";
import { DEFAULT_SHOW_THINKING } from "../../../kernel/local-provider";
import { MarkdownBlock } from "./markdown";
import { applyTextHighlights } from "./text-highlights";
import {
  deriveOpenTargets,
  isCollectibleArtifactTarget,
  isLocalhostBrowserTarget,
  type OpenTarget,
} from "../artifacts/open-target";
import {
  buildBittensorCardActionContext,
  readBittensorContextFromToolOutput,
} from "./bittensor-context-store";
import {
  reviewedActionHandoffFromCard,
  stageReviewedActionHandoff,
} from "../../wallet/reviewed-action-handoff";
import { ProtocolDeskMark } from "../workflows/protocol-brand-logo";
import { resultCardDeskId } from "./result-card-memory";
import { responseCompletionSummary } from "../message-completion-metadata";

type TranscriptPart = Part;

type TranscriptMessage = {
  id: string;
  role: UIMessage["role"];
  source: UIMessage;
  parts: TranscriptPart[];
};

type StepTimelineGroup = {
  id: string;
  parts: TranscriptPart[];
  mode: StepGroupMode;
};

type StepClusterBlock = {
  kind: "steps-cluster";
  id: string;
  stepGroups: StepTimelineGroup[];
  messageIds: string[];
  isUser: boolean;
};

type MessageBlock = {
  kind: "message";
  message: UIMessage;
  renderableParts: TranscriptPart[];
  attachments: Array<{
    url: string;
    filename: string;
    mime: string;
  }>;
  groups: MessageGroup[];
  isUser: boolean;
  messageId: string;
};

type MessageBlockItem = MessageBlock | StepClusterBlock;

/**
 * Stable-key used to match a block across renders. For message blocks the
 * messageId is stable. For step clusters we reuse the cluster id (which is
 * derived from its first step group) as the identity anchor.
 */
function blockIdentityKey(block: MessageBlockItem): string {
  if (block.kind === "steps-cluster") return `cluster:${block.id}`;
  return `msg:${block.messageId}`;
}

/**
 * Returns true when a newly-computed block is content-equivalent to the
 * previous block we rendered under the same identity key. We compare the
 * underlying UIMessage reference (`message.source`) for message blocks and
 * the messageIds array + stepGroups identity for step clusters. If equal,
 * the caller reuses the previous block reference so React.memo'd children
 * downstream can skip work.
 *
 * This is the structural-sharing trick from T3Tools' MessagesTimeline: on
 * every streaming token, `props.messages` is a fresh array, but only the
 * *currently-streaming* message has a new `source` reference — everything
 * else is still pointer-equal to last tick. Rebuilding blocks from the new
 * array gives fresh block objects for every message, so downstream memo
 * checks all fail by default. Reusing the previous block reference when
 * its content hasn't actually changed gives every non-streaming row a free
 * bailout during a streaming burst.
 */
function blocksAreEquivalent(
  previous: MessageBlockItem | undefined,
  next: MessageBlockItem,
): boolean {
  if (!previous) return false;
  if (previous.kind !== next.kind) return false;
  if (previous.isUser !== next.isUser) return false;

  if (previous.kind === "steps-cluster" && next.kind === "steps-cluster") {
    if (previous.id !== next.id) return false;
    if (previous.messageIds.length !== next.messageIds.length) return false;
    for (let i = 0; i < previous.messageIds.length; i += 1) {
      if (previous.messageIds[i] !== next.messageIds[i]) return false;
    }
    if (previous.stepGroups.length !== next.stepGroups.length) return false;
    for (let i = 0; i < previous.stepGroups.length; i += 1) {
      const prevGroup = previous.stepGroups[i];
      const nextGroup = next.stepGroups[i];
      if (!prevGroup || !nextGroup) return false;
      if (prevGroup.id !== nextGroup.id) return false;
      if (prevGroup.mode !== nextGroup.mode) return false;
      if (prevGroup.parts.length !== nextGroup.parts.length) return false;
      for (let p = 0; p < prevGroup.parts.length; p += 1) {
        if (prevGroup.parts[p] !== nextGroup.parts[p]) return false;
      }
    }
    return true;
  }

  if (previous.kind === "message" && next.kind === "message") {
    if (previous.messageId !== next.messageId) return false;
    // The single most important check. The session sync layer keeps
    // UIMessage references stable for every non-streaming message across
    // rerenders; only the actively-streaming message gets a fresh
    // `source` reference per token. If the source is pointer-equal, the
    // block hasn't changed and we can reuse the previous object.
    if (previous.message !== next.message) return false;
    if (previous.attachments.length !== next.attachments.length) return false;
    if (previous.renderableParts.length !== next.renderableParts.length) return false;
    if (previous.groups.length !== next.groups.length) return false;
    return true;
  }

  return false;
}

type SessionTranscriptProps = {
  messages: UIMessage[];
  isStreaming: boolean;
  developerMode: boolean;
  showThinking?: boolean;
  expandedStepIds?: Set<string>;
  onExpandedStepIdsChange?: (updater: (current: Set<string>) => Set<string>) => void;
  searchMatchMessageIds?: ReadonlySet<string>;
  activeSearchMessageId?: string | null;
  searchHighlightQuery?: string;
  scrollElement?: () => HTMLElement | null | undefined;
  setScrollToMessageById?: (
    handler: ((messageId: string, behavior?: ScrollBehavior) => boolean) | null,
  ) => void;
  footer?: ReactNode;
  variant?: "default" | "nested";
  /** Revert to this message (undo everything after it). */
  onRevertToMessage?: (messageId: string) => void;
  /** Fork the conversation at this message into a new session. */
  onForkAtMessage?: (messageId: string) => void;
  openTargets?: OpenTarget[];
  onOpenTarget?: (target: OpenTarget) => void;
  onSaveBittensorEvidence?: (card: BittensorPublicEvidenceCard) => Promise<OpenTarget | void> | OpenTarget | void;
  onSaveResultToMemory?: (card: BittensorPublicEvidenceCard) => Promise<void> | void;
  onRetryAssistantResponse?: (messageId: string) => Promise<void> | void;
  onSaveAssistantResponse?: (messageId: string, text: string) => Promise<OpenTarget | void> | OpenTarget | void;
  onRateAssistantResponse?: (messageId: string, rating: "helpful" | "not_helpful") => Promise<void> | void;
};

// 500 was too high for real-world Matterhorn Desks sessions: a handful of giant
// messages (emails, legal docs, pasted transcripts) can still produce a
// massive DOM even when the block count is low. Lowering the threshold means
// we switch to react-virtual much earlier and keep the main thread lighter
// during workspace/session switches.
// Virtualize aggressively. A session with 20+ message blocks already pays
// more to render eagerly than to run the virtualizer, so there's no reason
// to defer. The only reason the threshold exists at all is to avoid the
// virtualizer's baseline overhead for tiny sessions.
const VIRTUALIZATION_THRESHOLD = 20;
const VIRTUAL_OVERSCAN = 4;

function clampVirtualEstimate(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function estimateTextBlockSize(text: string, isUser: boolean) {
  const explicitLines = text.split("\n").length;
  const wrappedLines = Math.ceil(text.length / (isUser ? 68 : 86));
  const markdownStructureLines = text
    .split("\n")
    .filter((line) => /^\s*([-*+]\s+|\d+\.\s+|>\s+|#{1,6}\s+|\|)/.test(line)).length;
  const fencedCodeBlocks = Math.floor((text.match(/```/g) ?? []).length / 2);
  const estimatedLines = Math.max(explicitLines, wrappedLines) + markdownStructureLines * 0.5;
  const base = isUser ? 76 : 160;
  return base + estimatedLines * 22 + fencedCodeBlocks * 72;
}

function estimateBlockSize(block: MessageBlockItem | undefined) {
  if (!block) return 360;

  if (block.kind === "steps-cluster") {
    const partCount = block.stepGroups.reduce((total, group) => total + group.parts.length, 0);
    return clampVirtualEstimate(64 + partCount * 58, 96, 900);
  }

  const textSize = block.groups.reduce((total, group) => {
    if (group.kind === "steps") {
      return total + 72 + group.parts.length * 58;
    }
    return total + estimateTextBlockSize(partToText(group.part), block.isUser);
  }, 0);
  const attachmentSize = block.attachments.length > 0 ? 76 : 0;
  const openTargetsSize = !block.isUser ? 44 : 0;
  const actionsSize = block.isUser ? 24 : 36;

  return clampVirtualEstimate(
    textSize + attachmentSize + openTargetsSize + actionsSize,
    block.isUser ? 112 : 260,
    block.isUser ? 720 : 1800,
  );
}

function partIdFromUiPart(part: UIMessage["parts"][number], fallbackId: string) {
  const metadata = (part as { providerMetadata?: { opencode?: { partId?: unknown } } })
    .providerMetadata?.opencode;
  if (typeof metadata?.partId === "string" && metadata.partId.trim()) {
    return metadata.partId;
  }
  return fallbackId;
}

function toDynamicToolPart(part: UIMessage["parts"][number]) {
  if (part.type === "dynamic-tool") {
    return part;
  }
  if (!isToolUIPart(part)) return null;
  return {
    ...part,
    toolName: part.type.replace(/^tool-/, ""),
    type: "dynamic-tool",
  } as DynamicToolUIPart;
}

function toLegacyPart(
  part: UIMessage["parts"][number],
  fallbackId: string,
): TranscriptPart | null {
  const id = partIdFromUiPart(part, fallbackId);

  if (part.type === "text") {
    return { id, type: "text", text: part.text } as TranscriptPart;
  }

  if (part.type === "reasoning") {
    return { id, type: "reasoning", text: part.text } as TranscriptPart;
  }

  if (part.type === "file") {
    return {
      id,
      type: "file",
      url: part.url,
      filename: part.filename,
      mime: part.mediaType,
    } as TranscriptPart;
  }

  if (part.type === "step-start") {
    return { id, type: "step-start" } as TranscriptPart;
  }

  const toolPart = toDynamicToolPart(part);
  if (toolPart) {
    const state: Record<string, unknown> = {
      input: toolPart.input,
    };

    if (toolPart.state === "output-available") {
      state.output = toolPart.output;
    }

    if (toolPart.state === "output-error") {
      state.error = toolPart.errorText;
    }

    return {
      id: toolPart.toolCallId || id,
      type: "tool",
      tool: toolPart.toolName,
      state,
    } as TranscriptPart;
  }

  return null;
}

function isAttachmentPart(part: TranscriptPart) {
  if (part.type !== "file") return false;
  const url = (part as { url?: string }).url;
  return typeof url === "string" && !url.startsWith("file://");
}

function attachmentsForParts(parts: TranscriptPart[]) {
  return parts.flatMap((part) => {
      if (!isAttachmentPart(part)) return [];
      const record = part as {
        url?: string;
        filename?: string;
        mime?: string;
      };
      const attachment = {
        url: record.url ?? "",
        filename: record.filename ?? "attachment",
        mime: record.mime ?? "application/octet-stream",
      };
      return attachment.url ? [attachment] : [];
    });
}

function partToText(part: TranscriptPart) {
  if (part.type === "text") {
    return String((part as { text?: string }).text ?? "");
  }
  if (part.type === "reasoning") {
    return String((part as { text?: string }).text ?? "");
  }
  if (part.type === "agent") {
    const name = (part as { name?: string }).name ?? "";
    return name ? `@${name}` : "@agent";
  }
  if (part.type === "file") {
    const record = part as {
      label?: string;
      path?: string;
      filename?: string;
      url?: string;
    };
    const label = record.label ?? record.path ?? record.filename ?? record.url ?? "";
    return label ? `@${label}` : "@file";
  }
  if (part.type === "tool") {
    return summarizeStep(part).title;
  }
  return "";
}

function messageToText(message: UIMessage) {
  return message.parts
    .flatMap((part) => {
      if (part.type === "text") return [part.text];
      if (part.type === "reasoning") return [part.text];
      if (part.type === "file") return [part.filename ?? part.url];
      const toolPart = toDynamicToolPart(part);
      if (toolPart) {
        if (toolPart.state === "output-error") {
          return [`[tool:${toolPart.toolName}] ${toolPart.errorText}`];
        }
        if (toolPart.state === "output-available") {
          return [`[tool:${toolPart.toolName}] ${JSON.stringify(toolPart.output)}`];
        }
        return [`[tool:${toolPart.toolName}] ${JSON.stringify(toolPart.input)}`];
      }
      return [];
    })
    .join("\n\n")
    .trim();
}

function isImageAttachment(mime: string) {
  return mime.startsWith("image/");
}

function humanMediaType(raw: string) {
  if (!raw || raw === "application/octet-stream") return null;
  const short = raw.replace(/^application\//, "").replace(/^text\//, "");
  return short.toUpperCase();
}

function cleanReasoningPreview(value: string) {
  const cleaned = value
    .replace(/\[REDACTED\]/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+\n/g, "\n")
    .trim();

  return cleaned
    .replace(/^(?:thinking|reasoning)\s*(?::|-|–|—)\s*/i, "")
    .replace(/^(?:thinking|reasoning)\s*\r?\n+/i, "")
    .trim();
}

function splitReasoningPreview(value: string) {
  const clean = cleanReasoningPreview(value);
  if (!clean) return { headline: "", body: "" };
  const lines = clean.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    return trimmed ? [trimmed] : [];
  });
  if (lines.length <= 1) return { headline: "", body: clean };
  return { headline: lines[0] ?? "", body: lines.slice(1).join("\n") };
}

function formatStructuredValue(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function hasStructuredValue(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return true;
}

function ToolActivityIcon(props: { category?: string }) {
  const className = "size-4 shrink-0 text-muted-foreground";
  switch (props.category) {
    case "terminal":
      return <Terminal className={className} strokeWidth={1.9} />;
    case "read":
    case "edit":
    case "write":
      return <FileIcon className={className} strokeWidth={1.9} />;
    case "glob":
      return <Folder className={className} strokeWidth={1.9} />;
    case "search":
      return <Search className={className} strokeWidth={1.9} />;
    default:
      return <Box className={className} strokeWidth={1.9} />;
  }
}

function toolStatusText(status?: string) {
  if (!status) return null;
  const normalized = status.toLowerCase();
  if (normalized.includes("approval") || normalized.includes("pending")) return "Awaiting approval";
  if (normalized.includes("running") || normalized.includes("progress")) return "In progress";
  if (normalized.includes("error") || normalized.includes("failed")) return "Failed";
  return null;
}

async function openFileWithOS(path: string) {
  try {
    await openDesktopPath(path);
  } catch {
    // silently fail on web
  }
}

async function revealFileInFinder(path: string) {
  try {
    await revealDesktopItemInDir(path);
  } catch {
    // silently fail on web
  }
}

function MessageActionIconButton(props: {
  title: string;
  "aria-label": string;
  onClick: () => void | Promise<void>;
  children: ReactNode;
  disabled?: boolean;
  "aria-pressed"?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props["aria-label"]}
      aria-pressed={props["aria-pressed"]}
      disabled={props.disabled}
      onClick={() => void props.onClick()}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-dls-secondary transition-colors duration-150 hover:bg-dls-hover/55 hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.28)] disabled:cursor-wait disabled:opacity-45 sm:size-7",
        props["aria-pressed"] && "bg-dls-hover/70 text-dls-text",
        props.className,
      )}
    >
      {props.children}
    </button>
  );
}

function AssistantResponseActions(props: {
  message: UIMessage;
  messageId: string;
  getText: () => string;
  onRetry?: (messageId: string) => Promise<void> | void;
  onSave?: (messageId: string, text: string) => Promise<OpenTarget | void> | OpenTarget | void;
  onRate?: (messageId: string, rating: "helpful" | "not_helpful") => Promise<void> | void;
  onOpenTarget?: (target: OpenTarget) => void;
  onRevert?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
}) {
  const [retryState, setRetryState] = useState<"idle" | "retrying" | "failed">("idle");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [savedTarget, setSavedTarget] = useState<OpenTarget | null>(null);
  const [ratingState, setRatingState] = useState<"idle" | "submitting" | "helpful" | "not_helpful" | "failed">("idle");
  const busy = retryState === "retrying" || saveState === "saving" || ratingState === "submitting";
  const completion = useMemo(() => responseCompletionSummary(props.message), [props.message]);
  const statusLabel = saveState === "saved"
    ? "Saved to Outputs"
    : saveState === "failed"
      ? "Save failed"
      : retryState === "failed"
        ? "Retry failed"
        : ratingState === "failed"
          ? "Feedback failed"
          : "Completed";

  const rate = async (rating: "helpful" | "not_helpful") => {
    if (!props.onRate || busy) return;
    setRatingState("submitting");
    try {
      await props.onRate(props.messageId, rating);
      setRatingState(rating);
    } catch {
      setRatingState("failed");
    }
  };

  return (
    <div className="mt-2 flex min-h-7 min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2" data-response-state={saveState === "saved" ? "saved" : "completed"}>
      <div
        className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-medium text-dls-muted"
        aria-label={`${statusLabel}. ${completion.tokenLabel}. ${completion.durationLabel}. ${completion.transaction.detail}`}
        aria-live="polite"
        role="status"
      >
        <span className="inline-flex items-center gap-1.5">
          <BadgeCheck size={13} aria-hidden="true" />
          {statusLabel}
        </span>
        <span aria-hidden="true">·</span>
        <span data-response-token-usage title={completion.tokenDetail}>{completion.tokenLabel}</span>
        <span aria-hidden="true">·</span>
        <span data-response-duration title={completion.durationDetail}>{completion.durationLabel}</span>
        <span aria-hidden="true">·</span>
        <span data-response-transaction={completion.transaction.state} title={completion.transaction.detail}>
          {completion.transaction.label}
        </span>
      </div>
      <div
        className="relative z-10 flex max-w-full touch-pan-x items-center gap-0.5 overflow-x-auto select-none opacity-100 transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
        role="group"
        aria-label="Response actions"
      >
        {props.onRetry ? (
          <MessageActionIconButton
            onClick={async () => {
              if (busy) return;
              setRetryState("retrying");
              try {
                await props.onRetry?.(props.messageId);
                setRetryState("idle");
              } catch {
                setRetryState("failed");
              }
            }}
            disabled={busy}
            title={retryState === "failed" ? "Retry failed — try again" : retryState === "retrying" ? "Retrying response" : "Retry response"}
            aria-label={retryState === "retrying" ? "Retrying response" : "Retry response"}
          >
            <RotateCcw size={14} className={retryState === "retrying" ? "animate-spin" : undefined} />
          </MessageActionIconButton>
        ) : null}
        <CopyButton getText={props.getText} />
        {props.onSave ? (
          <MessageActionIconButton
            onClick={async () => {
              if (savedTarget) {
                props.onOpenTarget?.(savedTarget);
                return;
              }
              if (busy) return;
              setSaveState("saving");
              try {
                const target = await props.onSave?.(props.messageId, props.getText());
                setSavedTarget(target ?? null);
                setSaveState("saved");
              } catch {
                setSaveState("failed");
              }
            }}
            disabled={busy}
            className={saveState === "saved" ? "text-dls-text" : undefined}
            title={savedTarget ? "Open saved output" : saveState === "saving" ? "Saving response" : saveState === "failed" ? "Save failed — try again" : "Save to Outputs"}
            aria-label={savedTarget ? "Open saved output" : saveState === "saving" ? "Saving response" : "Save response to Outputs"}
          >
            {saveState === "saved" ? <Check size={14} /> : <Save size={14} />}
          </MessageActionIconButton>
        ) : null}
        {props.onRate ? (
          <>
            <MessageActionIconButton
              onClick={() => rate("helpful")}
              disabled={busy}
              aria-pressed={ratingState === "helpful"}
              title={ratingState === "helpful" ? "Marked helpful" : "Helpful"}
              aria-label={ratingState === "helpful" ? "Response marked helpful" : "Mark response helpful"}
            >
              <ThumbsUp size={14} />
            </MessageActionIconButton>
            <MessageActionIconButton
              onClick={() => rate("not_helpful")}
              disabled={busy}
              aria-pressed={ratingState === "not_helpful"}
              title={ratingState === "not_helpful" ? "Marked not helpful" : "Not helpful"}
              aria-label={ratingState === "not_helpful" ? "Response marked not helpful" : "Mark response not helpful"}
            >
              <ThumbsDown size={14} />
            </MessageActionIconButton>
          </>
        ) : null}
        {props.onRevert || props.onFork ? <span className="mx-0.5 h-3.5 w-px bg-dls-border" aria-hidden="true" /> : null}
        {props.onRevert ? (
          <MessageActionIconButton onClick={() => props.onRevert?.(props.messageId)} title="Revert to here" aria-label="Revert to this response">
            <Undo2 size={14} />
          </MessageActionIconButton>
        ) : null}
        {props.onFork ? (
          <MessageActionIconButton onClick={() => props.onFork?.(props.messageId)} title="Fork from here" aria-label="Fork conversation from this response">
            <GitFork size={14} />
          </MessageActionIconButton>
        ) : null}
      </div>
    </div>
  );
}

const CLIPBOARD_WRITE_TIMEOUT_MS = 600;

function copyMessageTextWithSelection(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

async function copyMessageText(text: string): Promise<boolean> {
  // Run before the first await so embedded browsers keep the click activation.
  if (copyMessageTextWithSelection(text)) return true;

  let clipboardWrite: Promise<void> | null = null;
  try {
    if (navigator.clipboard?.writeText) {
      clipboardWrite = navigator.clipboard.writeText(text);
    }
  } catch {
    clipboardWrite = null;
  }

  if (!clipboardWrite) return false;

  try {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("Clipboard write timed out.")),
        CLIPBOARD_WRITE_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([clipboardWrite, timeout]);
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
    return true;
  } catch {
    return false;
  }
}

function CopyButton(props: { getText: () => string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const actionLabel =
    copyState === "copied"
      ? "Message copied"
      : copyState === "failed"
        ? "Copy failed"
        : "Copy message";

  return (
    <MessageActionIconButton
      title={actionLabel}
      aria-label={actionLabel}
      onClick={async () => {
        const didCopy = await copyMessageText(props.getText());
        setCopyState(didCopy ? "copied" : "failed");
        window.setTimeout(() => setCopyState("idle"), 1800);
      }}
    >
      {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
    </MessageActionIconButton>
  );
}

/** Expandable chip for collapsed pasted text in sent messages. */
function PastedTextChip(props: { label: string; text: string }) {
  const [expanded, setExpanded] = useState(false);
  const lineCount = props.text.split(/\r?\n/).length;

  return (
    <span className="inline">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full border border-amber-6/35 bg-amber-3/15 px-2.5 py-0.5 text-xs font-medium text-amber-11 transition-colors hover:bg-amber-3/30"
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? "Collapse pasted text" : "Expand pasted text"}
      >
        <ChevronDown
          size={12}
          className={cn("shrink-0 transition-transform", expanded && "rotate-180")}
        />
        <span>Pasted · {lineCount} line{lineCount === 1 ? "" : "s"}</span>
      </button>
      {expanded ? (
        <div className="mt-1.5 mb-1.5 rounded-lg border border-amber-6/20 bg-amber-3/10 px-4 py-3 text-xs leading-5 text-foreground">
          <pre className="whitespace-pre-wrap break-words font-mono">{props.text}</pre>
        </div>
      ) : null}
    </span>
  );
}

const PASTE_TOKEN_RE = /(\[pasted text [^\]]+\])/;

function HighlightedPlainText(props: {
  text: string;
  className: string;
  highlightQuery?: string;
  /** Map of paste label -> full text for expandable chips */
  pastedTextMap?: Map<string, string>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    queueMicrotask(() => {
      if (!rootRef.current || rootRef.current !== root) return;
      applyTextHighlights(root, props.highlightQuery ?? "");
    });
  }, [props.highlightQuery, props.text]);

  // If no paste tokens present, render as plain text (fast path).
  if (!props.pastedTextMap?.size || !PASTE_TOKEN_RE.test(props.text)) {
    return (
      <div ref={rootRef} className={props.className}>
        {props.text}
      </div>
    );
  }

  // Split on paste tokens and render chips inline.
  const segments = props.text.split(PASTE_TOKEN_RE);
  let segmentOffset = 0;
  return (
    <div ref={rootRef} className={props.className}>
      {segments.map((segment) => {
        const key = `${segmentOffset}:${segment}`;
        segmentOffset += segment.length;
        const match = segment.match(/^\[pasted text (.+)\]$/);
        if (match?.[1]) {
          const pastedBody = props.pastedTextMap?.get(match[1]);
          if (pastedBody) {
            return <PastedTextChip key={key} label={match[1]} text={pastedBody} />;
          }
        }
        return <span key={key}>{segment}</span>;
      })}
    </div>
  );
}

function FileCard(props: {
  part: { filename?: string; url: string; mediaType: string };
  tone: "assistant" | "user";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isDataUrl = props.part.url?.startsWith("data:");
  const title = props.part.filename || (isDataUrl ? "Attached file" : props.part.url) || "File";
  const ext = props.part.filename?.split(".").pop()?.toLowerCase();
  const badge = humanMediaType(props.part.mediaType) ?? (ext ? ext.toUpperCase() : null);
  const isImage = isImageAttachment(props.part.mediaType ?? "");
  const isDesktop = isDesktopRuntime();
  const hasPath = !isDataUrl && props.part.url && !props.part.url.startsWith("http");

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
        props.tone === "user"
          ? "border-gray-6/60 bg-gray-2/40 hover:bg-gray-2/60"
          : "border-gray-6/40 bg-gray-1/40 hover:bg-gray-2/30",
      )}
    >
      {isImage && props.part.url ? (
        <div className="size-11 shrink-0 overflow-hidden rounded-lg border border-dls-border/60 bg-dls-surface">
          <img src={props.part.url} alt={title} loading="lazy" decoding="async" className="size-full object-cover" />
        </div>
      ) : (
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-lg",
            props.tone === "user" ? "bg-gray-3/60 text-foreground" : "bg-gray-2/60 text-muted-foreground",
          )}
        >
          <FileIcon size={20} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-snug text-foreground">{title}</div>
        {badge ? (
          <div className="mt-1 inline-flex rounded-md bg-gray-3/50 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {badge}
          </div>
        ) : null}
      </div>

      {isDesktop && hasPath ? (
        <div className="relative">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-all hover:bg-gray-3/60 hover:text-foreground group-hover:opacity-100"
            onClick={() => setMenuOpen((value) => !value)}
            title="File actions"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </button>
          {menuOpen ? (
            <>
              <button type="button" className="fixed inset-0 z-30 cursor-default border-0 bg-transparent p-0" aria-label="Close file actions" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-40 mt-1 w-48 rounded-lg border border-dls-border bg-dls-surface p-1.5 shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-gray-3/60"
                  onClick={() => {
                    void openFileWithOS(props.part.url);
                    setMenuOpen(false);
                  }}
                >
                  Open with default app
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-gray-3/60"
                  onClick={() => {
                    void revealFileInFinder(props.part.url);
                    setMenuOpen(false);
                  }}
                >
                  Reveal in Finder
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-gray-3/60"
                  onClick={() => {
                    void navigator.clipboard.writeText(props.part.url);
                    setMenuOpen(false);
                  }}
                >
                  Copy path
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type BittensorPublicEvidenceCard = {
  version?: string;
  kind?: string;
  originalKind?: string | null;
  venue?: "auto" | "bittensor" | "hyperliquid" | "polymarket" | string;
  status?: "info" | "success" | "warning" | "danger" | string;
  title?: string;
  subtitle?: string | null;
  summary?: string | null;
  tone?: "default" | "good" | "warning" | "danger";
  items?: Array<{
    label?: string;
    value?: string;
    tone?: "default" | "good" | "warning" | "danger" | "muted";
  }>;
  actions?: Array<{
    label?: string;
    kind?: "copy_payload" | "open_url" | "sign_externally" | "send_to_chat";
    href?: string | null;
    payload?: Record<string, unknown> | null;
  }>;
  warnings?: string[];
  data?: Record<string, unknown>;
  safety?: {
    nonCustodial?: boolean;
    liveSubmissionEnabled?: boolean;
    canSubmit?: boolean;
  };
  source?: unknown;
};

type BittensorChatCard = BittensorPublicEvidenceCard;
type BittensorChatCardItem = NonNullable<BittensorChatCard["items"]>[number];

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseToolOutputRecord(output: unknown): Record<string, unknown> | null {
  if (isRecordValue(output)) return output;
  if (typeof output !== "string") return null;

  const trimmed = output.trim();
  if (!trimmed || trimmed.length > 1_000_000) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecordValue(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readBittensorCards(output: unknown): BittensorChatCard[] {
  const outputRecord = parseToolOutputRecord(output);
  if (!outputRecord) return [];
  const sharedCards = outputRecord.sharedCards;
  if (Array.isArray(sharedCards)) {
    const cards = sharedCards
      .filter(isRecordValue)
      .map(normalizeUnifiedCryptoSharedCard)
      .filter((card): card is BittensorChatCard => Boolean(card));
    if (cards.length) return cards.slice(0, 6);
  }
  const cards = outputRecord.cards;
  if (!Array.isArray(cards)) return [];
  return cards
    .filter(isRecordValue)
    .map((card) => card as BittensorChatCard)
    .filter((card) => typeof card.title === "string" && card.title.trim().length > 0)
    .slice(0, 6);
}

function titleCaseCryptoLabel(value: string): string {
  return value
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function sharedCardDisplayTitle(venueLabel: string, title: string, venue: string): string {
  if (!venue || venue === "auto") return title;
  return title.toLowerCase().includes(venueLabel.toLowerCase()) ? title : `${venueLabel}: ${title}`;
}

function sourceField(source: Record<string, unknown> | null, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function sharedCardNumber(value: unknown, options?: { prefix?: string; suffix?: string; digits?: number }): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const digits = options?.digits ?? (Math.abs(value) >= 100 ? 0 : 2);
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
  return `${options?.prefix ?? ""}${formatted}${options?.suffix ?? ""}`;
}

function sharedCardText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sharedCardDetailItems(
  data: Record<string, unknown> | null,
  venue: string,
  kind: string,
  originalKind: string | null,
): NonNullable<BittensorChatCard["items"]> {
  if (!data) return [];
  const items: NonNullable<BittensorChatCard["items"]> = [];
  const preview = isRecordValue(data.preview) ? data.preview : null;
  const account = isRecordValue(data.account) ? data.account : null;
  const context = isRecordValue(data.context) ? data.context : null;
  const receipt = isRecordValue(data.receipt) ? data.receipt : null;
  const watch = isRecordValue(data.watch) ? data.watch : null;

  if (venue === "hyperliquid" && kind === "account_snapshot" && account) {
    const accountValue = sharedCardNumber(account.accountValue, { prefix: "$" });
    const withdrawable = sharedCardNumber(account.withdrawableUsd, { prefix: "$" });
    const marginUsed = sharedCardNumber(account.marginUsed, { prefix: "$" });
    if (accountValue) items.push({ label: "Account value", value: accountValue, tone: "default" });
    if (withdrawable) items.push({ label: "Withdrawable", value: withdrawable, tone: "default" });
    if (marginUsed) items.push({ label: "Margin used", value: marginUsed, tone: "warning" });
    const positionCount = sharedCardNumber(account.positionCount, { digits: 0 });
    const openOrderCount = sharedCardNumber(account.openOrderCount, { digits: 0 });
    if (positionCount) items.push({ label: "Positions", value: positionCount, tone: "muted" });
    if (openOrderCount) items.push({ label: "Open orders", value: openOrderCount, tone: "muted" });
    const fundingExposure = sharedCardText(account.fundingExposure);
    if (fundingExposure) items.push({ label: "Funding exposure", value: fundingExposure, tone: "muted" });
    const liquidationNote = Array.isArray(account.liquidationRiskNotes)
      ? account.liquidationRiskNotes.find((item): item is string => typeof item === "string" && item.trim().length > 0)?.trim() ?? null
      : null;
    if (liquidationNote) items.push({ label: "Liquidation note", value: liquidationNote, tone: "warning" });
  }

  if (venue === "polymarket" && kind === "market_context" && context) {
    const previewAvailability = sharedCardText(context.previewAvailability);
    if (previewAvailability) items.push({ label: "Preview availability", value: previewAvailability, tone: "default" });
    const compliance = isRecordValue(context.compliance) ? sharedCardText(context.compliance.status) : null;
    if (compliance) items.push({ label: "Compliance", value: compliance, tone: compliance === "allowed" ? "good" : "warning" });
    const liquidity = sharedCardNumber(context.liquidityUsd, { prefix: "$" });
    const volume = sharedCardNumber(context.volumeUsd, { prefix: "$" });
    if (liquidity) items.push({ label: "Liquidity", value: liquidity, tone: "default" });
    if (volume) items.push({ label: "Volume", value: volume, tone: "muted" });
    const firstOutcome = Array.isArray(context.outcomes) && isRecordValue(context.outcomes[0]) ? context.outcomes[0] : null;
    const outcome = firstOutcome ? sharedCardText(firstOutcome.outcome) : null;
    const probability = firstOutcome ? sharedCardNumber(firstOutcome.probability, { suffix: "", digits: 2 }) : null;
    if (outcome) items.push({ label: "Top outcome", value: probability ? `${outcome} (${probability})` : outcome, tone: "muted" });
  }

  if (kind === "action_preview" && preview) {
    const asset = sharedCardText(preview.asset);
    const side = sharedCardText(preview.side);
    const size = sharedCardNumber(preview.size, { digits: 6 });
    const price = sharedCardNumber(preview.price, { prefix: venue === "polymarket" ? "" : "$", digits: 6 });
    const orderType = sharedCardText(preview.orderType);
    if (asset) items.push({ label: "Asset", value: asset, tone: "default" });
    if (side) items.push({ label: "Side", value: side, tone: "default" });
    if (size) items.push({ label: "Preview size", value: size, tone: "muted" });
    if (price) {
      const priceLabel = venue === "hyperliquid" && orderType === "market"
        ? "Indicative mark"
        : venue === "hyperliquid" && orderType === "limit"
          ? "Limit price"
          : "Preview price";
      items.push({ label: priceLabel, value: price, tone: "muted" });
    }
    if (preview.canSubmit === false) items.push({ label: "Agent draft", value: "Review only", tone: "good" });
  }

  if (kind === "receipt_status" && receipt) {
    const status = sharedCardText(receipt.status);
    const orderId = sharedCardText(receipt.orderId);
    if (status) items.push({ label: "Receipt status", value: status, tone: status === "filled" ? "good" : "muted" });
    if (orderId) items.push({ label: "Public order id", value: orderId, tone: "muted" });
  }

  if (kind === "watch_alert" && watch) {
    const watchId = sharedCardText(watch.id);
    const status = sharedCardText(watch.status);
    if (watchId) items.push({ label: "Watch id", value: watchId, tone: "muted" });
    if (status) items.push({ label: "Watch status", value: status, tone: status === "triggered" ? "good" : "muted" });
  }

  if (originalKind === "market_execution_chain" && !items.some((item) => item.label === "Agent draft")) {
    items.push({ label: "Agent draft", value: "Review only", tone: "good" });
  }

  return items;
}

function sharedCardMissingContext(data: Record<string, unknown> | null, venue: string, kind: string): string | null {
  if (!data || kind !== "action_preview") return null;
  const preview = isRecordValue(data.preview) ? data.preview : null;
  if (!preview) return null;
  const leverageContext = isRecordValue(preview.leverageContext) ? preview.leverageContext : null;
  if (venue === "hyperliquid" && leverageContext?.requiresAccountContext === true) {
    return typeof leverageContext.note === "string" && leverageContext.note.trim()
      ? leverageContext.note.trim()
      : "Public Hyperliquid address is needed for leverage and liquidation context.";
  }
  if (venue === "polymarket" && preview.marketId === null) return "Polymarket market id is needed before executable preview terms can be prepared.";
  if (venue === "polymarket" && preview.outcome === null) return "Polymarket outcome is needed before executable preview terms can be prepared.";
  return null;
}

function sharedCardHighlightedStep(data: Record<string, unknown> | null): { label: string; command: string | null } | null {
  const nested = isRecordValue(data?.data) ? data.data : null;
  const step = isRecordValue(nested?.highlightedStep) ? nested.highlightedStep : null;
  if (!step) return null;
  const label = typeof step.label === "string" && step.label.trim() ? step.label.trim() : null;
  if (!label) return null;
  const command = Array.isArray(step.commands)
    ? step.commands.find((item): item is string => typeof item === "string" && item.trim().length > 0)?.trim() ?? null
    : null;
  return { label, command };
}

function sharedCardWalletTicket(
  venue: string,
  kind: string,
  originalKind: string | null,
  data: Record<string, unknown> | null,
  status: string,
): string | null {
  if (kind !== "action_preview") return null;
  if (venue === "hyperliquid") return "Exact order review";
  if (venue === "polymarket") {
    const preview = isRecordValue(data?.preview) ? data.preview : null;
    const compliance = isRecordValue(preview?.compliance) ? preview.compliance : null;
    const action = typeof preview?.operation === "string" ? preview.operation.toLowerCase() : "order";
    const label = action === "sell" ? "Sell review" : action.startsWith("cancel") ? "Cancel review" : "Buy review";
    return status !== "danger" && compliance?.status === "allowed" ? label : null;
  }
  if (venue === "bittensor" && originalKind && /transfer/i.test(originalKind)) return "TAO transfer";
  return null;
}

function sharedCardNeedsExternalSigner(kind: string, originalKind: string | null, venue: string): boolean {
  if (kind === "external_signer_handoff") return true;
  if (kind === "action_preview") {
    if (venue === "hyperliquid" || venue === "polymarket") return false;
    if (venue === "bittensor" && originalKind && /transfer/i.test(originalKind)) return false;
    return true;
  }
  return Boolean(originalKind && /(handoff|signing|signed_action|staking_quote|order_preview)/i.test(originalKind));
}

function sharedCardSdkValidationItems(
  data: Record<string, unknown> | null,
  originalKind: string | null,
): NonNullable<BittensorChatCard["items"]> {
  if (originalKind !== "market_sdk_validation" || !data) return [];
  const nestedData = isRecordValue(data.data) ? data.data : null;
  const guide = isRecordValue(data.guide) ? data.guide : isRecordValue(nestedData?.guide) ? nestedData.guide : null;
  if (!guide) return [];
  const modes = Array.isArray(guide.modes)
    ? guide.modes.filter((mode): mode is string => typeof mode === "string" && mode.trim().length > 0)
    : [];
  const networks = isRecordValue(guide.networks) ? guide.networks : null;
  const hyperliquidNetworks = Array.isArray(networks?.hyperliquid)
    ? networks.hyperliquid.filter((network): network is string => typeof network === "string" && network.trim().length > 0)
    : [];
  const polymarketNetworks = Array.isArray(networks?.polymarket)
    ? networks.polymarket.filter((network): network is string => typeof network === "string" && network.trim().length > 0)
    : [];
  const commands = isRecordValue(guide.commands) ? guide.commands : {};
  const doctor = typeof commands.doctor === "string" ? commands.doctor : null;
  const fixtureValidation = typeof commands.fixtureValidation === "string" ? commands.fixtureValidation : null;
  const items: NonNullable<BittensorChatCard["items"]> = [];
  if (modes.length) items.push({ label: "Validation modes", value: modes.join(", "), tone: "muted" });
  if (hyperliquidNetworks.length || polymarketNetworks.length) {
    items.push({
      label: "Testnet networks",
      value: [
        hyperliquidNetworks.length ? `Hyperliquid: ${hyperliquidNetworks.join(", ")}` : null,
        polymarketNetworks.length ? `Polymarket: ${polymarketNetworks.join(", ")}` : null,
      ].filter(Boolean).join("; "),
      tone: "muted",
    });
  }
  if (doctor) items.push({ label: "SDK doctor", value: doctor, tone: "muted" });
  if (fixtureValidation) items.push({ label: "Fixture validation", value: fixtureValidation, tone: "muted" });
  return items;
}

function normalizeUnifiedCryptoSharedCard(card: Record<string, unknown>): BittensorChatCard | null {
  if (card.version !== "matterhorn.crypto.shared-card.v1") return null;
  const title = typeof card.title === "string" && card.title.trim() ? card.title.trim() : "Crypto chat";
  const status = typeof card.status === "string" ? card.status : "info";
  const venue = typeof card.venue === "string" ? card.venue : "auto";
  const venueLabel = titleCaseCryptoLabel(venue);
  const statusLabel = titleCaseCryptoLabel(status);
  const kind = typeof card.kind === "string" ? card.kind : "generic";
  const safety = isRecordValue(card.safety) ? card.safety : {};
  const originalKind = typeof card.originalKind === "string" ? card.originalKind : null;
  const source = isRecordValue(card.source)
    ? card.source
    : typeof card.source === "string"
      ? { source: card.source }
      : null;
  const sourceLabel = source && typeof source.source === "string" ? source.source : null;
  const freshness = sourceField(source, ["freshness", "freshnessLabel", "dataFreshness"]);
  const block = sourceField(source, ["block", "blockNumber", "blockHash"]);
  const data = isRecordValue(card.data) ? card.data : {};
  const missingContext = sharedCardMissingContext(data, venue, kind);
  const highlightedStep = originalKind === "market_execution_chain" ? sharedCardHighlightedStep(data) : null;
  const walletTicket = sharedCardWalletTicket(venue, kind, originalKind, data, status);
  const items: NonNullable<BittensorChatCard["items"]> = [
    { label: "Venue", value: venueLabel, tone: venue === "auto" ? "muted" : "default" },
    { label: "Status", value: statusLabel, tone: status === "success" ? "good" : status === "danger" ? "danger" : status === "warning" ? "warning" : "muted" },
    { label: "Can submit", value: safety.canSubmit === false ? "No" : "Unavailable", tone: safety.canSubmit === false ? "good" : "warning" },
    { label: "Live submission", value: safety.liveSubmissionEnabled === false ? "Off" : "Unavailable", tone: safety.liveSubmissionEnabled === false ? "good" : "warning" },
  ];
  if (walletTicket) {
    items.push({ label: "Wallet ticket", value: walletTicket, tone: "warning" });
  }
  if (sharedCardNeedsExternalSigner(kind, originalKind, venue)) {
    items.push({ label: "External signer", value: "Required", tone: "warning" });
  }
  if (highlightedStep) {
    items.push({ label: "Focused step", value: highlightedStep.label, tone: "default" });
    if (highlightedStep.command) items.push({ label: "Step command", value: highlightedStep.command, tone: "muted" });
  }
  if (missingContext) items.push({ label: "Missing context", value: missingContext, tone: "warning" });
  items.push(...sharedCardDetailItems(data, venue, kind, originalKind));
  items.push(...sharedCardSdkValidationItems(data, originalKind));
  if (sourceLabel) items.push({ label: "Source", value: sourceLabel, tone: "muted" });
  if (freshness) items.push({ label: "Freshness", value: freshness, tone: "muted" });
  if (block) items.push({ label: "Block", value: block, tone: "muted" });
  if (originalKind) items.push({ label: "Original card", value: originalKind, tone: "muted" });

  return {
    version: "matterhorn.crypto.shared-card.v1",
    kind,
    originalKind,
    venue,
    status,
    title: sharedCardDisplayTitle(venueLabel, title, venue),
    subtitle: venue === "auto" ? "Crypto" : venueLabel,
    summary: typeof card.summary === "string" ? card.summary : null,
    tone: status === "success" ? "good" : status === "danger" ? "danger" : status === "warning" ? "warning" : "default",
    items,
    warnings: Array.isArray(card.warnings) ? card.warnings.filter((item): item is string => typeof item === "string") : [],
    data,
    safety: {
      nonCustodial: safety.nonCustodial === true,
      liveSubmissionEnabled: safety.liveSubmissionEnabled === true,
      canSubmit: safety.canSubmit === true,
    },
    source,
  };
}

function bittensorCardToneClass(tone?: BittensorChatCard["tone"]) {
  switch (tone) {
    case "good":
      return "border-emerald-500/25 bg-emerald-500/[0.06]";
    case "warning":
      return "border-amber-500/28 bg-amber-500/[0.07]";
    case "danger":
      return "border-red-500/28 bg-red-500/[0.07]";
    default:
      return "border-dls-border/75 bg-dls-surface/80";
  }
}

function bittensorItemToneClass(tone?: BittensorChatCardItem["tone"]) {
  switch (tone) {
    case "good":
      return "text-emerald-700";
    case "warning":
      return "text-amber-700";
    case "danger":
      return "text-red-700";
    case "muted":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
}

function BittensorCardIcon(props: { card: BittensorChatCard }) {
  const className = cn(
    "size-4 shrink-0",
    props.card.tone === "good" && "text-emerald-700",
    props.card.tone === "warning" && "text-amber-700",
    props.card.tone === "danger" && "text-red-700",
    !props.card.tone || props.card.tone === "default" ? "text-primary" : "",
  );
  const deskId = resultCardDeskId(props.card);
  if (deskId) {
    return (
      <span aria-hidden="true" className="inline-flex size-5 shrink-0 items-center justify-center">
        <ProtocolDeskMark id={deskId} size={18} />
      </span>
    );
  }

  switch (props.card.kind) {
    case "wallet_snapshot":
    case "account_snapshot":
      return <Wallet className={className} strokeWidth={1.9} />;
    case "staking_quote":
    case "signed_action_review":
    case "signing_handoff":
    case "action_preview":
    case "external_signer_handoff":
      return <ShieldAlert className={className} strokeWidth={1.9} />;
    case "signer_status":
    case "readiness_report":
    case "adapter_manifest_validation":
    case "adapter_result_validation":
    case "adapter_marketplace":
    case "adapter_roadmap":
    case "adapter_onboarding":
    case "adapter_evidence_bundle":
    case "adapter_approval_audit":
    case "receipt_status":
      return <BadgeCheck className={className} strokeWidth={1.9} />;
    case "watchlist":
    case "watch_alert":
      return <Activity className={className} strokeWidth={1.9} />;
    case "unsupported_adapter":
    case "compliance_block":
    case "clarification":
      return <CircleAlert className={className} strokeWidth={1.9} />;
    case "adapter_launch_gate":
    case "adapter_evidence_review":
    case "adapter_operator_handoff":
    case "adapter_approval_template":
    case "adapter_canary_packet":
      return <ShieldAlert className={className} strokeWidth={1.9} />;
    case "subnet_result":
    case "market_context":
    case "orderbook_context":
      return <Zap className={className} strokeWidth={1.9} />;
    case "discovery":
      return <Search className={className} strokeWidth={1.9} />;
    default:
      return <FileText className={className} strokeWidth={1.9} />;
  }
}

function BittensorCardActionButton(props: { card: BittensorChatCard; action: NonNullable<BittensorChatCard["actions"]>[number] }) {
  const label = props.action.label?.trim() || "Action";
  const payload = props.action.payload ?? null;
  const copyPayload = async () => {
    if (!payload) return;
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  };
  const sendToChat = () => {
    const prompt = typeof payload?.prompt === "string" && payload.prompt.trim()
      ? payload.prompt.trim()
      : label;
    const context = buildBittensorCardActionContext(props.card, props.action);
    window.dispatchEvent(new CustomEvent("matterhorn:bittensor-chat-handoff", {
      detail: { prompt, context, source: "bittensor-card-action" },
    }));
  };

  if (props.action.kind === "open_url" && props.action.href) {
    return (
      <a
        className="inline-flex items-center gap-1.5 rounded-md border border-dls-border bg-dls-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/35 hover:text-primary"
        href={props.action.href}
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink size={12} />
        <span>{label}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-md border border-dls-border bg-dls-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/35 hover:text-primary disabled:opacity-50"
      disabled={!payload && (props.action.kind === "copy_payload" || props.action.kind === "sign_externally")}
      onClick={() => {
        if (props.action.kind === "copy_payload" || props.action.kind === "sign_externally") {
          void copyPayload();
          return;
        }
        if (props.action.kind === "send_to_chat") {
          sendToChat();
        }
      }}
      title={props.action.kind === "sign_externally" ? "Copy the unsigned payload for external signing" : label}
    >
      {props.action.kind === "sign_externally" ? <ShieldAlert size={12} /> : props.action.kind === "send_to_chat" ? <BrainCircuit size={12} /> : <Copy size={12} />}
      <span>{label}</span>
    </button>
  );
}

function isBittensorEvidenceCard(card: BittensorChatCard) {
  const venue = typeof card.venue === "string" ? card.venue.trim().toLowerCase() : "";
  return !venue || venue === "auto" || venue === "bittensor";
}

function BittensorEvidenceSaveButton(props: {
  card: BittensorChatCard;
  onSaveEvidence: (card: BittensorPublicEvidenceCard) => Promise<OpenTarget | void> | OpenTarget | void;
  onOpenTarget?: (target: OpenTarget) => void;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [savedTarget, setSavedTarget] = useState<OpenTarget | null>(null);
  const disabled = status === "saving";
  const label = status === "saving"
    ? "Saving..."
    : status === "saved"
      ? savedTarget
        ? "Open saved output"
        : "Saved to Outputs"
      : status === "failed"
        ? "Retry save"
        : "Save to Outputs";

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-md bg-dls-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-dls-hover/45 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
      disabled={disabled}
      onClick={async () => {
        if (savedTarget) {
          props.onOpenTarget?.(savedTarget);
          return;
        }
        setStatus("saving");
        try {
          const target = await props.onSaveEvidence(props.card);
          setSavedTarget(target ?? null);
          setStatus("saved");
        } catch {
          setStatus("failed");
        }
      }}
      title={savedTarget ? "Open this result from workspace Outputs" : "Save this result to Outputs and Project Activity"}
      aria-label={label}
    >
      {savedTarget ? <ExternalLink size={12} /> : status === "saved" ? <Check size={12} /> : <Save size={12} />}
      <span>{label}</span>
    </button>
  );
}

function ResultCardMemorySaveButton(props: {
  card: BittensorChatCard;
  onSaveMemory: (card: BittensorPublicEvidenceCard) => Promise<void> | void;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const disabled = status === "saving" || status === "saved";
  const label = status === "saving"
    ? "Saving..."
    : status === "saved"
      ? "In Memory"
      : status === "failed"
        ? "Retry Memory save"
        : "Save to Memory";

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-md bg-dls-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-dls-hover/45 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
      disabled={disabled}
      onClick={async () => {
        setStatus("saving");
        try {
          await props.onSaveMemory(props.card);
          setStatus("saved");
        } catch {
          setStatus("failed");
        }
      }}
      title="Save this visible result to workspace Memory for reuse in the app"
      aria-label={label}
    >
      {status === "saved" ? (
        <Check size={12} />
      ) : (
        <span aria-hidden="true" className="inline-flex size-3 items-center justify-center">
          <ProtocolDeskMark id="memory" size={12} />
        </span>
      )}
      <span>{label}</span>
    </button>
  );
}

function BittensorToolCards(props: {
  cards: BittensorChatCard[];
  onSaveEvidence?: (card: BittensorPublicEvidenceCard) => Promise<OpenTarget | void> | OpenTarget | void;
  onSaveMemory?: (card: BittensorPublicEvidenceCard) => Promise<void> | void;
  onOpenTarget?: (target: OpenTarget) => void;
}) {
  if (!props.cards.length) return null;

  return (
    <div className="grid gap-2.5">
      {props.cards.map((card, index) => {
        const title = card.title?.trim() || "Bittensor";
        const items = (card.items ?? []).slice(0, 12);
        const warnings = (card.warnings ?? []).filter(Boolean).slice(0, 3);
        const actions = (card.actions ?? []).slice(0, 2);
        const canSaveEvidence = Boolean(props.onSaveEvidence && isBittensorEvidenceCard(card));
        const reviewedActionHandoff = reviewedActionHandoffFromCard(card);
        return (
          <div
            key={`${card.kind ?? "card"}:${title}:${index}`}
            className={cn("rounded-[8px] border px-3.5 py-3 shadow-sm", bittensorCardToneClass(card.tone))}
          >
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5">
                <BittensorCardIcon card={card} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <div className="min-w-0 text-sm font-semibold leading-5 text-foreground">{title}</div>
                  {card.subtitle ? (
                    <div className="rounded-md bg-gray-3/55 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {card.subtitle}
                    </div>
                  ) : null}
                </div>
                {card.summary ? (
                  <div className="mt-1 text-xs leading-5 text-muted-foreground wrap-break-word">{card.summary}</div>
                ) : null}

                {items.length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {items.map((item, itemIndex) => (
                      <div key={`${item.label ?? "item"}:${itemIndex}`} className="min-w-0 rounded-md border border-dls-border/60 bg-white/45 px-2.5 py-2">
                        <div className="text-[11px] font-medium uppercase text-muted-foreground">{item.label}</div>
                        <div className={cn("mt-0.5 text-xs font-semibold leading-4 wrap-break-word", bittensorItemToneClass(item.tone))}>
                          {item.value || "Unavailable"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {warnings.length ? (
                  <div className="mt-3 space-y-1">
                    {warnings.map((warning, warningIndex) => (
                      <div key={`${warning}:${warningIndex}`} className="flex items-start gap-1.5 text-xs leading-5 text-amber-800">
                        <CircleAlert size={12} className="mt-1 shrink-0" />
                        <span className="wrap-break-word">{warning}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {actions.length || canSaveEvidence || props.onSaveMemory || reviewedActionHandoff ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {reviewedActionHandoff ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                        onClick={() => stageReviewedActionHandoff(reviewedActionHandoff)}
                        title="Open the wallet review ticket with these public draft terms"
                      >
                        <Wallet size={12} />
                        <span>Review in wallet</span>
                      </button>
                    ) : null}
                    {canSaveEvidence && props.onSaveEvidence ? (
                      <BittensorEvidenceSaveButton
                        card={card}
                        onSaveEvidence={props.onSaveEvidence}
                        onOpenTarget={props.onOpenTarget}
                      />
                    ) : null}
                    {props.onSaveMemory ? (
                      <ResultCardMemorySaveButton card={card} onSaveMemory={props.onSaveMemory} />
                    ) : null}
                    {actions.map((action, actionIndex) => (
                      <BittensorCardActionButton key={`${action.kind ?? "action"}:${action.label ?? actionIndex}`} card={card} action={action} />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepRow(props: {
  id: string;
  part: TranscriptPart;
  expanded: boolean;
  onToggle: () => void;
  onSaveBittensorEvidence?: (card: BittensorPublicEvidenceCard) => Promise<OpenTarget | void> | OpenTarget | void;
  onSaveResultToMemory?: (card: BittensorPublicEvidenceCard) => Promise<void> | void;
  onOpenTarget?: (target: OpenTarget) => void;
}) {
  const summary = useMemo(() => summarizeStep(props.part), [props.part]);
  const toolState = useMemo(() => {
    if (props.part.type !== "tool") return {} as Record<string, unknown>;
    return (((props.part as { state?: unknown }).state ?? {}) as Record<string, unknown>);
  }, [props.part]);
  const toolInput = toolState.input && typeof toolState.input === "object"
    ? (toolState.input as Record<string, unknown>)
    : undefined;
  const toolOutput = toolState.output;
  const bittensorCards = useMemo(() => readBittensorCards(toolOutput), [toolOutput]);
  const bittensorContext = useMemo(() => readBittensorContextFromToolOutput(toolOutput), [toolOutput]);
  const toolError = typeof toolState.error === "string" ? toolState.error : null;
  const expandable =
    props.part.type === "tool" &&
    (hasStructuredValue(toolInput) || hasStructuredValue(toolOutput) || Boolean(toolError));
  const headline = summary.title?.trim() || "Step updates progress";
  const statusText = toolStatusText(summary.status);

  useEffect(() => {
    if (!bittensorContext) return;
    window.dispatchEvent(new CustomEvent("matterhorn:bittensor-context-updated", {
      detail: { context: bittensorContext },
    }));
  }, [bittensorContext]);

  if (props.part.type === "reasoning") {
    const raw = typeof (props.part as { text?: unknown }).text === "string"
      ? (props.part as { text: string }).text
      : "";
    const preview = splitReasoningPreview(raw);
    if (!preview.headline && !preview.body) return null;

    return (
      <div
        data-reasoning="true"
        className="font-sans text-sm leading-[1.65] text-muted-foreground antialiased"
      >
        <button
          type="button"
          className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={props.expanded}
          onClick={props.onToggle}
        >
          <BrainCircuit size={15} aria-hidden="true" />
          <span>Reasoning</span>
          <ChevronDown
            size={14}
            className={cn("transition-transform", !props.expanded && "-rotate-90")}
            aria-hidden="true"
          />
        </button>
        {props.expanded ? (
          <div className="mt-3 max-w-[760px] whitespace-pre-wrap pl-6">
            {preview.headline ? <div className="mb-2 text-muted-foreground">{preview.headline}</div> : null}
            <div>{preview.body || headline}</div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="font-sans text-sm leading-[1.65] antialiased">
      <button
        type="button"
        className="w-full text-left transition-colors hover:text-foreground disabled:cursor-default text-muted-foreground"
        aria-expanded={expandable ? props.expanded : undefined}
        disabled={!expandable}
        onClick={() => {
          if (!expandable) return;
          props.onToggle();
        }}
      >
        <span className="inline-flex max-w-[760px] items-center gap-3">
          <ToolActivityIcon category={summary.toolCategory} />
          <span className="min-w-0 wrap-break-word">{headline}</span>
          {expandable ? (
            <ChevronDown
              size={15}
              className={cn(
                "shrink-0 text-muted-foreground transition-transform",
                !props.expanded && "-rotate-90",
              )}
            />
          ) : null}
        </span>
      </button>
      {statusText ? <div className="ml-7 mt-2 text-sm leading-[1.65] text-muted-foreground">{statusText}</div> : null}
      {bittensorCards.length ? (
        <div className="mt-3 ml-7 max-w-[720px]">
          <BittensorToolCards
            cards={bittensorCards}
            onSaveEvidence={props.onSaveBittensorEvidence}
            onSaveMemory={props.onSaveResultToMemory}
            onOpenTarget={props.onOpenTarget}
          />
        </div>
      ) : null}
      {props.expanded ? (
        <div className="mt-3 ml-7 space-y-3">
          {hasStructuredValue(toolInput) ? (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Request</div>
              <pre className="overflow-x-auto rounded-lg border border-transparent bg-dls-surface-muted/[0.08] px-4 py-3 text-xs leading-6 text-muted-foreground">
                {formatStructuredValue(toolInput)}
              </pre>
            </div>
          ) : null}
          {hasStructuredValue(toolOutput) ? (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Result</div>
              <pre className="overflow-x-auto rounded-lg border border-transparent bg-dls-surface-muted/[0.08] px-4 py-3 text-xs leading-6 text-muted-foreground">
                {formatStructuredValue(toolOutput)}
              </pre>
            </div>
          ) : null}
          {toolError ? (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Error</div>
              <pre className="overflow-x-auto rounded-lg border border-transparent bg-red-3/20 px-4 py-3 text-xs leading-6 text-red-11">
                {toolError}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StepsContainer(props: {
  stepGroups: StepTimelineGroup[];
  isUser: boolean;
  isInline?: boolean;
  isNestedVariant: boolean;
  isActive: boolean;
  expandedStepIds: Set<string>;
  onExpandedStepIdsChange: (updater: (current: Set<string>) => Set<string>) => void;
  onSaveBittensorEvidence?: (card: BittensorPublicEvidenceCard) => Promise<OpenTarget | void> | OpenTarget | void;
  onSaveResultToMemory?: (card: BittensorPublicEvidenceCard) => Promise<void> | void;
  onOpenTarget?: (target: OpenTarget) => void;
}) {
  const toggleSteps = (id: string) => {
    props.onExpandedStepIdsChange((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div>
      <div
        data-scrollable={!props.isNestedVariant ? "true" : undefined}
        className={cn(!props.isNestedVariant && "max-h-[520px] overflow-y-auto pr-3")}
      >
        <div className="flex flex-col gap-7">
          {props.stepGroups.map((group) => (
            <div key={group.id} className="flex flex-col gap-7">
              {group.parts.map((part, index) => {
                const rowId = `${group.id}:${index}`;
                return (
                  <StepRow
                    key={rowId}
                    id={rowId}
                    part={part}
                    expanded={props.expandedStepIds.has(rowId)}
                    onToggle={() => toggleSteps(rowId)}
                    onSaveBittensorEvidence={props.onSaveBittensorEvidence}
                    onSaveResultToMemory={props.onSaveResultToMemory}
                    onOpenTarget={props.onOpenTarget}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function messageGroupKey(messageId: string, group: MessageGroup) {
  if (group.kind === "steps") return `${messageId}:steps:${group.id}`;
  const partId = "id" in group.part && typeof group.part.id === "string" ? group.part.id : partToText(group.part);
  return `${messageId}:text:${group.segment}:${partId}`;
}

function inlineOpenTargetsForMessage(message: UIMessage, verifiedTargets: OpenTarget[] | undefined) {
  const verifiedById = new Map((verifiedTargets ?? []).map((target) => [target.id, target] as const));
  const inlineTargets = new Map<string, OpenTarget>();
  for (const candidate of deriveOpenTargets([message], { includeFileMentions: true })) {
    const verified = verifiedById.get(candidate.id);
    if (candidate.kind === "url" && isLocalhostBrowserTarget(candidate)) {
      inlineTargets.set(candidate.id, verified ?? candidate);
      continue;
    }
    if (verified && isCollectibleArtifactTarget(verified)) {
      inlineTargets.set(verified.id, verified);
    }
  }
  return Array.from(inlineTargets.values()).slice(0, 4);
}

function OpenTargetIcon(props: { target: OpenTarget }) {
  if (props.target.kind === "url") {
    return <Globe size={12} className="shrink-0 text-muted-foreground" />;
  }

  if (props.target.preview === "sheet") {
    return (
      <span className="inline-flex h-4 min-w-6 shrink-0 items-center justify-center rounded-[3px] border border-emerald-500/30 bg-emerald-500/10 px-1 text-[10px] font-bold leading-none text-emerald-700">
        XLS
      </span>
    );
  }
  if (props.target.preview === "markdown") {
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border border-primary/25 bg-primary/10 text-[10px] font-bold leading-none text-primary">
        MD
      </span>
    );
  }

  return <FileIcon size={12} className="shrink-0 text-primary" />;
}

function OpenableTargetsStrip(props: { targets: OpenTarget[]; onOpenTarget: (target: OpenTarget) => void }) {
  if (!props.targets.length) return null;
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-1.5 text-xs leading-none"
      role="group"
      aria-label="Files and links from this response"
    >
      <span className="mr-0.5 text-muted-foreground">Open from this response</span>
      {props.targets.map((target) => target.kind === "url" && !isDesktopRuntime() ? (
          <a
            key={target.id}
            href={target.value}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 max-w-[220px] touch-manipulation items-center gap-1.5 rounded-md border border-dls-border bg-dls-surface px-2.5 py-2 text-foreground transition-colors duration-150 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.28)] sm:min-h-8 sm:px-2 sm:py-1.5"
            title={target.value}
          >
            <OpenTargetIcon target={target} />
            <span className="truncate">{target.name || target.value}</span>
            <span className="text-muted-foreground">Open browser</span>
          </a>
        ) : (
          <button
            key={target.id}
            type="button"
            className="inline-flex min-h-11 max-w-[220px] touch-manipulation items-center gap-1.5 rounded-md border border-dls-border bg-dls-surface px-2.5 py-2 text-foreground transition-colors duration-150 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.28)] sm:min-h-8 sm:px-2 sm:py-1.5"
            title={target.value}
            onClick={() => props.onOpenTarget(target)}
          >
            <OpenTargetIcon target={target} />
            <span className="truncate">{target.name || target.value}</span>
            <span className="text-muted-foreground">{target.kind === "url" ? "Open browser" : "Open artifact"}</span>
          </button>
        ))}
    </div>
  );
}

function MessageBlockRow(props: {
  block: MessageBlockItem;
  blockIndex: number;
  totalBlocks: number;
  isNestedVariant: boolean;
  shouldUseContentVisibility: boolean;
  expandedStepIds: Set<string>;
  onExpandedStepIdsChange: (updater: (current: Set<string>) => Set<string>) => void;
  searchMatchMessageIds?: ReadonlySet<string>;
  activeSearchMessageId?: string | null;
  searchHighlightQuery?: string;
  isStreaming: boolean;
  latestAssistantMessageId: string;
  onRevertToMessage?: (messageId: string) => void;
  onForkAtMessage?: (messageId: string) => void;
  openTargets?: OpenTarget[];
  onOpenTarget?: (target: OpenTarget) => void;
  onSaveBittensorEvidence?: (card: BittensorPublicEvidenceCard) => Promise<OpenTarget | void> | OpenTarget | void;
  onSaveResultToMemory?: (card: BittensorPublicEvidenceCard) => Promise<void> | void;
  onRetryAssistantResponse?: (messageId: string) => Promise<void> | void;
  onSaveAssistantResponse?: (messageId: string, text: string) => Promise<OpenTarget | void> | OpenTarget | void;
  onRateAssistantResponse?: (messageId: string, rating: "helpful" | "not_helpful") => Promise<void> | void;
}) {
  const block = props.block;
  const blockMessageIds = block.kind === "steps-cluster" ? block.messageIds : [block.messageId];
  const hasSearchMatch = blockMessageIds.some((id) => props.searchMatchMessageIds?.has(id));
  const hasActiveSearchMatch = blockMessageIds.some((id) => id === props.activeSearchMessageId);
  const searchOutlineClass = hasActiveSearchMatch
    ? "outline outline-2 outline-amber-8/70 outline-offset-2 rounded-lg"
    : hasSearchMatch
      ? "outline outline-1 outline-amber-7/50 outline-offset-1 rounded-lg"
      : "";
  const perfStyle = props.shouldUseContentVisibility && props.blockIndex < props.totalBlocks - 12
    ? { contentVisibility: "auto", containIntrinsicSize: "180px" } satisfies CSSProperties
    : undefined;

  if (block.kind === "steps-cluster") {
    return (
      <div
        className={cn("flex group justify-start pb-4", block.isUser && "justify-end")}
        data-message-role={block.isUser ? "user" : "assistant"}
        data-message-id={block.messageIds[0] ?? ""}
        style={{ contain: "layout style paint", ...perfStyle }}
      >
        <div
          className={cn(
            block.isUser
              ? props.isNestedVariant
                ? "relative max-w-[92%] rounded-lg bg-dls-surface-muted/[0.14] px-4 py-3 text-sm leading-relaxed text-foreground ring-1 ring-white/[0.08]"
                : "relative max-w-[85%] rounded-lg bg-dls-surface-muted/[0.14] px-5 py-3.5 text-sm leading-relaxed text-foreground ring-1 ring-white/[0.08]"
              : props.isNestedVariant
                ? "w-full relative text-sm leading-[1.65] text-foreground group"
                : "w-full relative max-w-[760px] text-sm leading-[1.7] text-foreground group",
            searchOutlineClass,
          )}
        >
          <StepsContainer
            stepGroups={block.stepGroups}
            isUser={block.isUser}
            isNestedVariant={props.isNestedVariant}
            isActive={props.isStreaming && block.messageIds.includes(props.latestAssistantMessageId)}
            expandedStepIds={props.expandedStepIds}
            onExpandedStepIdsChange={props.onExpandedStepIdsChange}
            onSaveBittensorEvidence={props.onSaveBittensorEvidence}
            onSaveResultToMemory={props.onSaveResultToMemory}
            onOpenTarget={props.onOpenTarget}
          />
        </div>
      </div>
    );
  }

  const groupSpacing = block.isUser ? "mb-3" : "mb-4";
  const isSyntheticSessionError =
    !block.isUser && block.messageId.startsWith(SYNTHETIC_SESSION_ERROR_MESSAGE_PREFIX);
  const inlineOpenTargets = block.kind === "message" && !block.isUser && props.onOpenTarget
    ? inlineOpenTargetsForMessage(block.message, props.openTargets)
    : [];
  const isActiveAssistantResponse = !block.isUser && props.isStreaming && block.messageId === props.latestAssistantMessageId;

  if (isSyntheticSessionError) {
    const messageText = block.renderableParts
      .map((part) => partToText(part))
      .join(" ")
      .replace(/\s*\n+\s*/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    return (
      <div
        className="flex group justify-start pb-4"
        data-message-role="assistant"
        data-message-id={block.messageId}
        style={{ contain: "layout style paint", ...perfStyle }}
      >
        <div className={cn("w-full relative", !props.isNestedVariant && "max-w-[650px]", searchOutlineClass)}>
          <div
            className="inline-flex max-w-full items-start gap-2 rounded-lg bg-red-1/35 px-3 py-2 text-sm leading-5 text-red-12 shadow-sm"
            role="alert"
          >
            <CircleAlert size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0 wrap-break-word">{messageText}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("flex group justify-start pb-4", block.isUser && "justify-end")}
      data-message-role={block.isUser ? "user" : "assistant"}
      data-message-id={block.messageId}
      style={{ contain: "layout style paint", ...perfStyle }}
    >
      <div
        className={cn(
          "relative text-sm text-foreground leading-relaxed",
          block.isUser && "bg-dls-surface-muted/[0.14] ring-1 ring-white/[0.08]",
          block.isUser && props.isNestedVariant && "max-w-[92%] rounded-lg px-4 py-3",
          block.isUser && !props.isNestedVariant && "max-w-[85%] rounded-lg px-5 py-3.5 pr-28 sm:pr-24",
          !block.isUser && "w-full antialiased",
          !block.isUser && !props.isNestedVariant && "max-w-[760px]",
          searchOutlineClass,
        )}
      >
        {block.attachments.length > 0 ? (
          <div className={cn("flex flex-wrap gap-2", block.isUser ? "mb-3" : "mb-4")}>
            {block.attachments.map((attachment) => (
              <FileCard
                key={`${block.messageId}:${attachment.url}`}
                part={{
                  filename: attachment.filename,
                  url: attachment.url,
                  mediaType: attachment.mime,
                }}
                tone={block.isUser ? "user" : "assistant"}
              />
            ))}
          </div>
        ) : null}

        {block.groups.map((group) => {
          const highlightQuery = hasSearchMatch ? props.searchHighlightQuery : undefined;
          const isStreamingLatestAssistant =
            !block.isUser && props.isStreaming && block.messageId === props.latestAssistantMessageId;

          return (
            <div key={messageGroupKey(block.messageId, group)} className={cn(group !== block.groups.at(-1) && groupSpacing)}>
              {group.kind === "text" ? (() => {
                if (group.part.type === "file") {
                  const filePart = group.part as {
                    filename?: string;
                    url?: string;
                    mime?: string;
                  };
                  return (
                    <FileCard
                      part={{
                        filename: filePart.filename,
                        url: filePart.url ?? "",
                        mediaType: filePart.mime ?? "application/octet-stream",
                      }}
                      tone={block.isUser ? "user" : "assistant"}
                    />
                  );
                }

                const text = partToText(group.part);
                if (block.isUser) {
                  return (
                    <HighlightedPlainText
                      text={text}
                      className="whitespace-pre-wrap wrap-break-word text-foreground"
                      highlightQuery={highlightQuery}
                    />
                  );
                }

                return (
                  <MarkdownBlock
                    text={text}
                    streaming={isStreamingLatestAssistant}
                    highlightQuery={highlightQuery}
                  />
                );
              })() : null}

              {group.kind === "steps" ? (
                <StepsContainer
                  stepGroups={[{
                    id: group.id,
                    parts: group.parts,
                    mode: group.mode,
                  }]}
                  isUser={block.isUser}
                  isInline={true}
                  isNestedVariant={props.isNestedVariant}
                  isActive={isStreamingLatestAssistant}
                  expandedStepIds={props.expandedStepIds}
                  onExpandedStepIdsChange={props.onExpandedStepIdsChange}
                  onSaveBittensorEvidence={props.onSaveBittensorEvidence}
                  onSaveResultToMemory={props.onSaveResultToMemory}
                  onOpenTarget={props.onOpenTarget}
                />
              ) : null}
            </div>
          );
        })}

        {props.onOpenTarget ? <OpenableTargetsStrip targets={inlineOpenTargets} onOpenTarget={props.onOpenTarget} /> : null}

        {!props.isNestedVariant && !block.isUser && !isActiveAssistantResponse ? (
          <AssistantResponseActions
            message={block.message}
            messageId={block.messageId}
            getText={() => messageToText(block.message)}
            onRetry={block.messageId === props.latestAssistantMessageId ? props.onRetryAssistantResponse : undefined}
            onSave={props.onSaveAssistantResponse}
            onRate={props.onRateAssistantResponse}
            onOpenTarget={props.onOpenTarget}
            onRevert={props.onRevertToMessage}
            onFork={props.onForkAtMessage}
          />
        ) : null}

        {!props.isNestedVariant && block.isUser ? (
          <div
            className={cn(
              "relative z-10 flex items-center gap-0.5 select-none transition-opacity duration-150",
              "pointer-events-auto opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
              block.isUser ? "absolute right-2 top-2" : "mt-2",
            )}
          >
            {props.onRevertToMessage ? (
              <MessageActionIconButton
                onClick={() => props.onRevertToMessage?.(block.messageId)}
                title="Revert to here"
                aria-label="Revert to this message"
              >
                <Undo2 size={14} />
              </MessageActionIconButton>
            ) : null}
            {props.onForkAtMessage ? (
              <MessageActionIconButton
                onClick={() => props.onForkAtMessage?.(block.messageId)}
                title="Fork from here"
                aria-label="Fork conversation from this message"
              >
                <GitFork size={14} />
              </MessageActionIconButton>
            ) : null}
            <CopyButton getText={() => messageToText(block.message)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SessionTranscriptInner(props: SessionTranscriptProps) {
  const showThinking = props.showThinking ?? DEFAULT_SHOW_THINKING;
  const isNestedVariant = props.variant === "nested";
  const [internalExpandedStepIds, setInternalExpandedStepIds] = useState<Set<string>>(
    () => new Set(),
  );
  const expandedStepIds = props.expandedStepIds ?? internalExpandedStepIds;
  const onExpandedStepIdsChange =
    props.onExpandedStepIdsChange ??
    ((updater: (current: Set<string>) => Set<string>) => {
      setInternalExpandedStepIds((current) => updater(current));
    });

  const transcriptMessages = useMemo<TranscriptMessage[]>(() => {
    return props.messages.map((message) => ({
      id: message.id,
      role: message.role,
      source: message,
      parts: message.parts.flatMap((part, index) => {
        const legacyPart = toLegacyPart(part, `${message.id}:${index}`);
        return legacyPart ? [legacyPart] : [];
      }),
    }));
  }, [props.messages]);

  // Cache of the previous messageBlocks array, indexed by identity key.
  // Used by useStableBlocks below so structurally-equivalent blocks keep
  // their previous object reference across renders.
  const previousBlocksRef = useRef<Map<string, MessageBlockItem>>(new Map());

  const rawMessageBlocks = useMemo<MessageBlockItem[]>(() => {
    const blocks: MessageBlockItem[] = [];

    transcriptMessages.forEach((message) => {
      const renderableParts = message.parts.filter((part) => {
        if (part.type === "reasoning") {
          return showThinking;
        }

        if (part.type === "step-start" || part.type === "step-finish") {
          return false;
        }

        return (
          part.type === "text" ||
          part.type === "tool" ||
          part.type === "agent" ||
          part.type === "file" ||
          props.developerMode
        );
      });

      if (!renderableParts.length) return;

      const isUser = message.role === "user";
      const attachments = attachmentsForParts(renderableParts);
      const nonAttachmentParts = renderableParts.filter((part) => !isAttachmentPart(part));
      const groups = groupMessageParts(nonAttachmentParts, message.id);
      const isStepsOnly = groups.length > 0 && groups.every((group) => group.kind === "steps");
      const stepGroups = isStepsOnly
        ? (groups as Array<{
            kind: "steps";
            id: string;
            parts: TranscriptPart[];
            segment: "execution";
            mode: StepGroupMode;
          }>).map((group) => ({
            id: group.id,
            parts: group.parts,
            mode: group.mode,
          }))
        : [];

      if (isStepsOnly && stepGroups.length > 0) {
        blocks.push({
          kind: "steps-cluster",
          id: stepGroups[0].id,
          stepGroups,
          messageIds: [message.id],
          isUser,
        });
        return;
      }

      blocks.push({
        kind: "message",
        message: message.source,
        renderableParts,
        attachments,
        groups,
        isUser,
        messageId: message.id,
      });
    });

    return blocks;
  }, [props.developerMode, showThinking, transcriptMessages]);

  // Structural sharing: reuse the previous block object reference for any
  // block whose content is equivalent. During streaming, only the active
  // assistant message's block is actually new — every other block in the
  // transcript keeps its previous reference, which means every
  // React.memo'd descendant (MarkdownBlock, SessionTranscript itself, and
  // any future per-row components) gets a pointer-equal prop and can bail
  // out of rendering entirely.
  const messageBlocks = useMemo<MessageBlockItem[]>(() => {
    const prev = previousBlocksRef.current;
    const next = new Map<string, MessageBlockItem>();
    const stable: MessageBlockItem[] = rawMessageBlocks.map((block) => {
      const key = blockIdentityKey(block);
      const prevBlock = prev.get(key);
      const reused = blocksAreEquivalent(prevBlock, block) ? (prevBlock as MessageBlockItem) : block;
      next.set(key, reused);
      return reused;
    });
    previousBlocksRef.current = next;
    return stable;
  }, [rawMessageBlocks]);

  const latestAssistantMessageId = useMemo(() => {
    for (let index = props.messages.length - 1; index >= 0; index -= 1) {
      const message = props.messages[index];
      if (message?.role === "assistant") {
        return message.id;
      }
    }
    return "";
  }, [props.messages]);

  const blockIndexByMessageId = useMemo(() => {
    const next = new Map<string, number>();
    messageBlocks.forEach((block, index) => {
      if (block.kind === "steps-cluster") {
        block.messageIds.forEach((id) => {
          if (id) next.set(id, index);
        });
        return;
      }

      if (block.messageId) {
        next.set(block.messageId, index);
      }
    });
    return next;
  }, [messageBlocks]);

  // Decide to virtualize based only on block count. Do NOT gate on whether
  // the scrollElement ref has already attached — that's false on the first
  // render of a session, which used to make us render every message
  // eagerly (freezing the UI on large sessions) for one tick before
  // switching to virtualization.
  const shouldVirtualize = messageBlocks.length >= VIRTUALIZATION_THRESHOLD;

  const estimateVirtualItemSize = useCallback(
    (index: number) => estimateBlockSize(messageBlocks[index]),
    [messageBlocks],
  );

  const getVirtualItemKey = useCallback((index: number) => {
    const block = messageBlocks[index];
    if (!block) return `block-${index}`;
    if (block.kind === "steps-cluster") {
      return `steps-${block.messageIds.join(",")}`;
    }
    return `message-${block.messageId}`;
  }, [messageBlocks]);

  const virtualizer = useVirtualizer({
    count: messageBlocks.length,
    getScrollElement: () => props.scrollElement?.() ?? null,
    // TanStack recommends estimating the largest comfortable dynamic size.
    // Content-aware estimates reduce the measurement corrections that cause
    // long transcripts to jitter as previously-unmeasured rows enter view.
    estimateSize: estimateVirtualItemSize,
    overscan: VIRTUAL_OVERSCAN,
    getItemKey: getVirtualItemKey,
  });

  const virtualRows = shouldVirtualize ? virtualizer.getVirtualItems() : [];
  const firstVirtualRow = virtualRows[0];

  useEffect(() => {
    const register = props.setScrollToMessageById;
    if (!register) return;

    register((messageId, behavior = "smooth") => {
      const index = blockIndexByMessageId.get(messageId);
      if (index === undefined) return false;

      if (shouldVirtualize) {
        virtualizer.scrollToIndex(index, { align: "center" });
        return true;
      }

      const container = props.scrollElement?.();
      if (!container) return false;
      const escapedId = messageId.replace(/"/g, '\\"');
      const target = container.querySelector(`[data-message-id="${escapedId}"]`) as HTMLElement | null;
      if (!target) return false;
      target.scrollIntoView({ behavior, block: "center" });
      return true;
    });

    return () => {
      register(null);
    };
  }, [blockIndexByMessageId, props.scrollElement, props.setScrollToMessageById, shouldVirtualize, virtualizer]);

  // NOTE: we intentionally do NOT call virtualizer.measure() on every
  // messageBlocks change. react-virtual already invalidates and
  // re-measures rows whose refs remount or whose content changes. Calling
  // measure() explicitly on each streaming token forces a synchronous
  // getBoundingClientRect() pass over every measured row, which made
  // streaming into large sessions feel like the UI was frozen.

  // Apply content-visibility earlier too. Even when the transcript is below
  // the virtualization threshold, hiding distant blocks from layout/paint
  // work reduces the chance that one large session makes the UI feel frozen.
  const shouldUseContentVisibility = !shouldVirtualize && messageBlocks.length > 24;

  return (
    <div className="pb-0" style={{ contain: "layout paint style" }}>
      {shouldVirtualize ? (
        // Always render the virtualized container once we've decided to
        // virtualize — even if virtualRows is empty on the very first tick
        // (e.g. scrollElement ref hasn't attached yet). A fallback to
        // rendering every message would re-introduce the eager-render
        // freeze on huge sessions.
        <div
          className="relative"
          style={{
            height: `${Math.max(virtualizer.getTotalSize(), 1)}px`,
            width: "100%",
          }}
        >
          {firstVirtualRow ? (
            <div
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${firstVirtualRow.start}px)`,
              }}
            >
              {virtualRows.map((virtualRow) => {
                const block = messageBlocks[virtualRow.index];
                if (!block) return null;
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className="w-full"
                  >
                    <MessageBlockRow
                      block={block}
                      blockIndex={virtualRow.index}
                      totalBlocks={messageBlocks.length}
                      isNestedVariant={isNestedVariant}
                      shouldUseContentVisibility={shouldUseContentVisibility}
                      expandedStepIds={expandedStepIds}
                      onExpandedStepIdsChange={onExpandedStepIdsChange}
                      searchMatchMessageIds={props.searchMatchMessageIds}
                      activeSearchMessageId={props.activeSearchMessageId}
                      searchHighlightQuery={props.searchHighlightQuery}
                      isStreaming={props.isStreaming}
                      latestAssistantMessageId={latestAssistantMessageId}
                      onRevertToMessage={props.onRevertToMessage}
                      onForkAtMessage={props.onForkAtMessage}
                      openTargets={props.openTargets}
                      onOpenTarget={props.onOpenTarget}
                      onSaveBittensorEvidence={props.onSaveBittensorEvidence}
                      onSaveResultToMemory={props.onSaveResultToMemory}
                      onRetryAssistantResponse={props.onRetryAssistantResponse}
                      onSaveAssistantResponse={props.onSaveAssistantResponse}
                      onRateAssistantResponse={props.onRateAssistantResponse}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          {messageBlocks.map((block, index) => (
            <MessageBlockRow
              key={blockIdentityKey(block)}
              block={block}
              blockIndex={index}
              totalBlocks={messageBlocks.length}
              isNestedVariant={isNestedVariant}
              shouldUseContentVisibility={shouldUseContentVisibility}
              expandedStepIds={expandedStepIds}
              onExpandedStepIdsChange={onExpandedStepIdsChange}
              searchMatchMessageIds={props.searchMatchMessageIds}
              activeSearchMessageId={props.activeSearchMessageId}
              searchHighlightQuery={props.searchHighlightQuery}
              isStreaming={props.isStreaming}
              latestAssistantMessageId={latestAssistantMessageId}
              onRevertToMessage={props.onRevertToMessage}
              onForkAtMessage={props.onForkAtMessage}
              openTargets={props.openTargets}
              onOpenTarget={props.onOpenTarget}
              onSaveBittensorEvidence={props.onSaveBittensorEvidence}
              onSaveResultToMemory={props.onSaveResultToMemory}
              onRetryAssistantResponse={props.onRetryAssistantResponse}
              onSaveAssistantResponse={props.onSaveAssistantResponse}
              onRateAssistantResponse={props.onRateAssistantResponse}
            />
          ))}
        </div>
      )}

      {!isNestedVariant && props.footer ? props.footer : null}
    </div>
  );
}

/**
 * Memoize at the transcript boundary so SessionSurface state churn (e.g.
 * sending=true flipping while the assistant streams) doesn't force a full
 * transcript re-render on every parent commit. Re-renders now happen only
 * when the transcript's own props actually change (messages array
 * identity, isStreaming, developerMode, etc.).
 */
export const SessionTranscript = memo(SessionTranscriptInner);
SessionTranscript.displayName = "SessionTranscript";
