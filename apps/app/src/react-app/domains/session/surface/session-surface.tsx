/** @jsxImportSource react */
import type { CSSProperties } from "react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { useQuery } from "@tanstack/react-query";
import type { SessionStatus } from "@opencode-ai/sdk/v2/client";
import {
  BarChart3,
  BrainCircuit,
  Check,
  Database,
  Dumbbell,
  FileText,
  Minimize2,
  ShieldCheck,
} from "lucide-react";

import { createClient, unwrap } from "../../../../app/lib/opencode";
import { abortSessionSafe } from "../../../../app/lib/opencode-session";
import { t } from "../../../../i18n";
import { readWorkspaceCloudImports, type CloudImportedPlugin } from "../../../../app/cloud/import-state";
import type {
  MatterhornServerClient,
  MatterhornSessionSnapshot,
} from "../../../../app/lib/matterhorn-server";
import type {
  ComposerAttachment,
  ComposerDraft,
  ComposerPart,
  McpServerEntry,
  McpStatusMap,
  ModelRef,
  PendingPermission,
  PendingQuestion,
  SkillCard,
  TodoItem,
} from "../../../../app/types";
import {
  publishInspectorSlice,
  recordInspectorEvent,
} from "../../../shell/app-inspector";
import { useControlAction, type MatterhornControlAction } from "../../../shell/control/control-provider";
import { ReactSessionComposer } from "./composer/composer";
import { decodeComposerMentionValue, encodeComposerMentionValue } from "./composer/mention-encoding";
import { DevProfiler } from "../../../shell/dev-profiler";
import { PaperGrainGradient } from "@matterhorn-work/ui/react";
import { OwDotTicker } from "../../../shell/dot-ticker";
import { useShellConfig } from "../../../shell/shell-config";
import { useReactRenderWatchdog } from "../../../shell/react-render-watchdog";
import type { ReactComposerNotice } from "./composer/notice";
import { SessionDebugPanel } from "./debug-panel";
import { deriveRenderedSessionMessages, resolveRenderedSessionSnapshot } from "./session-render-state";
import { useLocal } from "../../../kernel/local-provider";
import { deriveSessionRenderModel } from "../sync/transition-controller";
import { useSessionScrollController } from "./scroll-controller";
import { getSessionActivityStatusLabel, useSessionActivityStore, type SessionActivityStatus } from "../status/session-activity-store";
import { PermissionApprovalPanel } from "../chat/permission-approval-modal";
import { QuestionPanel } from "../modals/question-modal";
import { deriveOpenTargets, selectAutoOpenTarget, type OpenTarget } from "../artifacts/open-target";
import {
  seedSessionState,
  statusKey as reactStatusKey,
  transcriptKey as reactTranscriptKey,
} from "../sync/session-sync";
import { useSessionDraftSnapshot } from "../sync/draft-store";
import {
  getComposerAttachments,
  getComposerDraft,
  getComposerMentions,
  getComposerPasteParts,
  useComposerStateStore,
} from "./composer-state-store";
import {
  addBittensorContextToResolvedText,
  describeBittensorSessionContext,
  getBittensorSessionContext,
  mergeBittensorSessionContexts,
  readBittensorContextFromEventDetail,
  useBittensorSessionContextStore,
  type BittensorSessionContext,
} from "./bittensor-context-store";
import {
  addMatterhornMemoryContextToResolvedText,
  describeMatterhornMemoryContext,
  getMatterhornSessionMemoryContext,
  readMatterhornMemoryContextFromEventDetail,
  useMatterhornSessionMemoryContextStore,
  type MatterhornSessionMemoryContext,
} from "./memory-context-store";
import { dispatchMatterhornMemorySuggestions } from "../../memory/memory-suggestion-producers";

const SessionTranscript = lazy(() => import("./message-list").then((module) => ({
  default: module.SessionTranscript,
})));
import {
  buildCustomerWorkflowStarterCards,
  fetchCustomerWorkflowTemplates,
  type CustomerWorkflowIconHint,
  type CustomerWorkflowStarterCard,
} from "../workflows/customer-workflow-templates";
import { getCustomerProtocolDeskVisual } from "../workflows/protocol-desk-ui";
import { ProtocolBrandLogo } from "../workflows/protocol-brand-logo";

const EMPTY_TRANSCRIPT: UIMessage[] = [];
const IDLE_STATUS: SessionStatus = { type: "idle" };
const DEFAULT_COMPOSER_CONTROL_TEXT = "Help me outline the next Matterhorn task.";

const CUSTOMER_WORKFLOW_ICON_COMPONENTS: Record<CustomerWorkflowIconHint, typeof BrainCircuit> = {
  bittensor: BrainCircuit,
  hyperliquid: BarChart3,
  polymarket: ShieldCheck,
  wellness: Dumbbell,
  services: FileText,
  blank: FileText,
};

function ProtocolLogo({ iconHint, size = 18 }: { iconHint: CustomerWorkflowIconHint; size?: number }) {
  const visual = getCustomerProtocolDeskVisual(iconHint);
  if (!visual) return null;
  return <ProtocolBrandLogo id={iconHint} visual={visual} size={size} />;
}

type MatterhornDeskMode = "bittensor" | "hyperliquid" | "polymarket" | "wellness";

type MatterhornDeskPrompt = {
  title: string;
  detail: string;
  prompt: string;
};

const MATTERHORN_DESK_EMPTY_PROMPTS: Record<MatterhornDeskMode, MatterhornDeskPrompt[]> = {
  bittensor: [
    {
      title: "Show TAO balance",
      detail: "Read a public SS58 coldkey balance and explain what the user can safely share.",
      prompt: "Use Bittensor chat mode. Show my TAO balance for this SS58 public address: <paste public SS58 address>. Use public wallet context only and never ask for seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports.",
    },
    {
      title: "Browse useful subnets",
      detail: "Explain useful subnets in plain language, including image-generation options.",
      prompt: "Use Bittensor chat mode. Find useful Bittensor subnets for image generation. Explain what each subnet does, why it is useful, source/freshness, and what public context would help narrow the choice.",
    },
    {
      title: "Compare validators",
      detail: "Compare validators on a subnet before staking, with risk notes and missing public context.",
      prompt: "Use Bittensor chat mode. Compare validators on subnet 14. Show source, freshness, risks, and what public validator/coldkey context is needed before staking.",
    },
    {
      title: "Prepare unsigned staking preview",
      detail: "Build a non-custodial preview that must be reviewed and signed elsewhere.",
      prompt: "Use Bittensor chat mode. Prepare a staking preview for 1 TAO on subnet 14. Ask for public coldkey and validator hotkey if missing. This must stay unsigned and require an external Bittensor-compatible signer.",
    },
  ],
  hyperliquid: [
    {
      title: "Read orderbook context",
      detail: "Summarize spread, depth, and stale-data warnings without submission.",
      prompt: "Use Hyperliquid chat mode. Show BTC orderbook context, spread, depth summary, stale-data warnings, and explain this is read/preview-only with Can submit: No and Live submission: Off.",
    },
    {
      title: "Summarize exposure",
      detail: "Use public/read-only account context only; never ask for exchange secrets.",
      prompt: "Use Hyperliquid chat mode. Summarize my read-only account exposure if public account context is available. Do not ask for API secrets, private keys, raw signatures, signed payloads, or exchange custody.",
    },
    {
      title: "Prepare preview handoff",
      detail: "Create an external-client preview with submission disabled.",
      prompt: "Use Hyperliquid chat mode. Prepare a preview-only order handoff for BTC. Keep Can submit: No, Live submission: Off, and external client required. Ask for missing public order context instead of guessing.",
    },
  ],
  polymarket: [
    {
      title: "Research a market",
      detail: "Explain outcomes, liquidity, orderbook context, and compliance state.",
      prompt: "Use Polymarket chat mode. Summarize this Polymarket market: <paste market URL or slug>. Include outcomes, liquidity/orderbook context, compliance state, source, freshness, and no bet placement.",
    },
    {
      title: "Check compliance",
      detail: "If blocked, do not expose executable price, size, share, or order fields.",
      prompt: "Use Polymarket chat mode. Check whether this market can be previewed safely. If compliance blocks the preview, do not show executable price, size, share, or order fields.",
    },
    {
      title: "Prepare preview handoff",
      detail: "Build a non-custodial wallet handoff while live submission stays off.",
      prompt: "Use Polymarket chat mode. Prepare a preview-only external-wallet handoff. Keep Can submit: No and Live submission: Off. Never ask for private keys, raw signatures, signed payloads, API secrets, or wallet exports.",
    },
  ],
  wellness: [
    {
      title: "Create service offer",
      detail: "Package a trainer, yoga, or dietician offer without medical or live-service claims.",
      prompt: "Use the Wellness workflow desk. Create a client-safe service offer packet for a personal trainer, yoga instructor, or dietician. Keep it educational, non-medical, and do not claim live payments, email, hosting, or token-gated access.",
    },
    {
      title: "Build weekly plan",
      detail: "Draft a safe weekly program artifact with boundaries and client check-in prompts.",
      prompt: "Use the Wellness workflow desk. Draft a weekly client program plan and progress check-in packet. Include a non-medical disclaimer and avoid diagnosis, prescription, treatment claims, or guaranteed outcomes.",
    },
    {
      title: "Prepare handoff packet",
      detail: "Create a client handoff packet ready for review and export.",
      prompt: "Use the Wellness workflow desk. Prepare a client handoff packet with onboarding notes, weekly plan, progress check-in, and follow-up message. Keep payments, email, storage, hosting, and access control planned-not-live.",
    },
  ],
};

function deriveMatterhornDeskMode(chunks: string[]): MatterhornDeskMode | null {
  const text = chunks.join("\n").toLowerCase();
  const candidates: Array<[MatterhornDeskMode, RegExp[]]> = [
    ["wellness", [/use the wellness workflow desk/, /start wellness workflow/, /\bwellness workflow\b/]],
    ["bittensor", [/use the bittensor desk/, /bittensor chat mode/, /\bshow my tao\b/, /\bsubnet\b/, /\bss58\b/]],
    ["hyperliquid", [/use the hyperliquid desk/, /hyperliquid chat mode/, /\bbtc-perp\b/, /\borderbook\b/]],
    ["polymarket", [/use the polymarket desk/, /polymarket chat mode/, /\bpolymarket market\b/, /\bcompliance\b/]],
  ];
  return candidates.find(([, patterns]) => patterns.some((pattern) => pattern.test(text)))?.[0] ?? null;
}

function deskToneStyle(iconHint: CustomerWorkflowIconHint): CSSProperties {
  const tone = (() => {
    switch (iconHint) {
      case "bittensor":
        return ["--desk-bittensor", "--desk-bittensor-rgb", "--desk-bittensor-secondary"];
      case "hyperliquid":
        return ["--desk-hyperliquid", "--desk-hyperliquid-rgb", "--desk-hyperliquid-secondary"];
      case "polymarket":
        return ["--desk-polymarket", "--desk-polymarket-rgb", "--desk-polymarket-secondary"];
      case "wellness":
        return ["--desk-wellness", "--desk-wellness-rgb", "--desk-wellness-secondary"];
      default:
        return ["--matterhorn-blue", "--matterhorn-blue-rgb", "--matterhorn-sky"];
    }
  })();
  return {
    "--matterhorn-desk-color": `var(${tone[0]})`,
    "--matterhorn-desk-rgb": `var(${tone[1]})`,
    "--matterhorn-desk-secondary": `var(${tone[2]})`,
  } as CSSProperties;
}

function MatterhornDeskSessionStrip({ mode }: { mode: MatterhornDeskMode }) {
  const copy = getCustomerProtocolDeskVisual(mode);
  if (!copy) return null;
  const iconHint = copy.id as CustomerWorkflowIconHint;
  const Icon = CUSTOMER_WORKFLOW_ICON_COMPONENTS[iconHint];
  return (
    <div style={deskToneStyle(iconHint)} className="mb-2 border-y border-[rgba(var(--matterhorn-desk-rgb),0.24)] bg-[rgba(var(--matterhorn-desk-rgb),0.045)] px-3 py-2.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--matterhorn-desk-rgb),0.14)] text-[var(--matterhorn-desk-color)] ring-1 ring-[rgba(var(--matterhorn-desk-rgb),0.22)]">
          {copy.id === "bittensor" || copy.id === "hyperliquid" || copy.id === "polymarket" ? (
            <ProtocolLogo iconHint={copy.id} size={22} />
          ) : (
            <Icon className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[12px] font-semibold text-dls-text">{copy.sessionTitle}</span>
            <span className="rounded-md border border-[rgba(var(--matterhorn-desk-rgb),0.32)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--matterhorn-desk-color)]">
              {copy.statusLabel}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-dls-secondary">{copy.shortDescription}</p>
          <p className="mt-0.5 text-[10px] leading-4 text-dls-secondary/85">{copy.sessionBoundary}</p>
        </div>
      </div>
    </div>
  );
}

function MatterhornDeskFocusedEmptyState({
  mode,
  onUsePrompt,
}: {
  mode: MatterhornDeskMode;
  onUsePrompt: (prompt: string) => void | Promise<void>;
}) {
  const visual = getCustomerProtocolDeskVisual(mode);
  const iconHint = (visual?.id ?? mode) as CustomerWorkflowIconHint;
  const Icon = CUSTOMER_WORKFLOW_ICON_COMPONENTS[iconHint] ?? FileText;
  const prompts = MATTERHORN_DESK_EMPTY_PROMPTS[mode];
  const boundary = mode === "bittensor"
    ? "Public SS58/coldkey/hotkey context only. External signing is required for every action."
    : mode === "wellness"
      ? "Standalone wellness workflow. Educational only, non-medical, and no live payments/email/hosting."
      : "Read and preview only. Can submit: No. Live submission: Off. External client required.";

  return (
    <div
      className="min-w-0 w-full px-2 py-3 sm:px-3 sm:py-4"
      style={deskToneStyle(iconHint)}
    >
      <section className="w-full space-y-3">
        <div className="matterhorn-desk-session-hero overflow-hidden rounded-xl bg-[rgba(var(--matterhorn-desk-rgb),0.08)] px-3.5 py-3.5 sm:px-4 sm:py-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--matterhorn-desk-rgb),0.14)] text-[var(--matterhorn-desk-color)]">
                {visual ? <ProtocolLogo iconHint={iconHint} size={34} /> : <Icon className="size-5" />}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-dls-text sm:text-lg">
                    {visual?.displayName ?? mode} session
                  </h2>
                  <span className="text-[11px] font-semibold text-[var(--matterhorn-desk-color)]">
                    {visual?.statusLabel ?? "Focused"}
                  </span>
                </div>
                <p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-dls-secondary">
                  {visual?.shortDescription ?? "Focused Matterhorn desk."} Choose a starter below to open the chat composer
                  with an editable draft. Nothing sends until you press Ask.
                </p>
                <p className="mt-1 text-[11px] leading-4 text-dls-secondary">{boundary}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5 text-[10px] font-semibold text-[var(--matterhorn-desk-color)] sm:max-w-48 sm:justify-end">
              {["Opens in chat", "Editable", "No auto-send"].map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-[rgba(var(--matterhorn-desk-rgb),0.12)] px-2 py-1"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="matterhorn-desk-session-prompts overflow-hidden rounded-xl bg-dls-surface/44" aria-label="Chat starters">
          {prompts.map((item) => (
            <button
              key={item.title}
              type="button"
              className="group grid w-full grid-cols-[minmax(0,1fr)] gap-2 px-3.5 py-3 text-left transition duration-150 hover:bg-[rgba(var(--matterhorn-desk-rgb),0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              onClick={() => void onUsePrompt(item.prompt)}
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-dls-text">{item.title}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-dls-secondary">{item.detail}</span>
              </span>
              <span className="text-[12px] font-semibold text-[var(--matterhorn-desk-color)]">
                Open chat draft
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function MatterhornDeskDraftReadyState({ mode }: { mode: MatterhornDeskMode }) {
  const visual = getCustomerProtocolDeskVisual(mode);
  const iconHint = (visual?.id ?? mode) as CustomerWorkflowIconHint;
  const Icon = CUSTOMER_WORKFLOW_ICON_COMPONENTS[iconHint] ?? FileText;

  return (
    <div
      className="w-full px-2 py-3 sm:px-3 sm:py-4"
      style={deskToneStyle(iconHint)}
    >
      <div className="flex min-w-0 items-start gap-3 rounded-xl bg-[rgba(var(--matterhorn-desk-rgb),0.08)] px-3.5 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--matterhorn-desk-rgb),0.14)] text-[var(--matterhorn-desk-color)]">
          {visual ? <ProtocolLogo iconHint={iconHint} size={30} /> : <Icon className="size-5" />}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-dls-text">
              {visual?.displayName ?? "Matterhorn"} draft ready
            </span>
            <span className="rounded-full bg-[rgba(var(--matterhorn-desk-rgb),0.12)] px-2 py-0.5 text-[10px] font-semibold text-[var(--matterhorn-desk-color)]">
              Review before sending
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-5 text-dls-secondary">
            The chat draft is in the composer below. Edit it, add any public context, then press Ask when you are ready.
          </p>
        </div>
      </div>
    </div>
  );
}

function starterWorkflowCapabilityItems(item: CustomerWorkflowStarterCard): string[] {
  if (item.protocolDesk?.capabilityBullets.length) {
    return item.protocolDesk.capabilityBullets;
  }
  if (item.panel === "bittensor") {
    return ["TAO wallet reads", "Subnet discovery", "External-signer previews"];
  }
  if (item.panel === "hyperliquid") {
    return ["Orderbook reads", "Account exposure", "No live market submit"];
  }
  if (item.panel === "polymarket") {
    return ["Market research", "Compliance checks", "No live bet placement"];
  }
  if (item.iconHint === "wellness") {
    return ["Service packets", "Client check-ins", "Non-medical workflow"];
  }
  return ["Free-form chat", "Editable prompt", "No hidden auto-send"];
}

type SessionError = {
  message: string;
  kind?: "model-not-found" | "generic";
  /** For model-not-found: the model that failed. */
  failedModel?: { providerID: string; modelID: string };
  /** For model-not-found: suggested replacements from the backend. */
  suggestions?: Array<{ providerID: string; modelID: string }>;
};

export type SessionSurfaceProps = {
  client: MatterhornServerClient;
  workspaceId: string;
  workspaceRoot: string;
  sessionId: string;
  opencodeBaseUrl: string;
  matterhornToken: string;
  developerMode: boolean;
  modelLabel: string;
  onModelClick: () => void;
  modelPickerOpen: boolean;
  modelUnavailable?: boolean;
  selectedModel: ModelRef;
  onModelPickerOpenChange: (open: boolean) => void;
  onModelChange: (model: ModelRef) => void;
  onSendDraft: (draft: ComposerDraft) => void;
  onDraftChange: (draft: ComposerDraft) => void;
  attachmentsEnabled: boolean;
  attachmentsDisabledReason: string | null;
  modelVariantLabel: string;
  modelVariant: string | null;
  modelBehaviorOptions?: { value: string | null; label: string }[];
  onModelVariantChange: (value: string | null) => void;
  agentLabel: string;
  selectedAgent: string | null;
  listAgents: () => Promise<import("@opencode-ai/sdk/v2/client").Agent[]>;
  onSelectAgent: (agent: string | null) => void;
  listCommands: () => Promise<import("../../../../app/types").SlashCommandOption[]>;
  recentFiles: string[];
  searchFiles: (query: string) => Promise<string[]>;
  isRemoteWorkspace: boolean;
  isSandboxWorkspace: boolean;
  todos?: TodoItem[];
  activePermission?: PendingPermission | null;
  permissionReplyBusy?: boolean;
  respondPermission?: (requestID: string, reply: "once" | "always" | "reject") => void;
  activeQuestion?: PendingQuestion | null;
  questionReplyBusy?: boolean;
  respondQuestion?: (requestID: string, answers: string[][]) => void;
  safeStringify?: (value: unknown) => string;
  onChangeModel?: (model: { providerID: string; modelID: string }) => void;
  onUploadInboxFiles?: ((files: File[], options?: { notify?: boolean }) => void | Promise<unknown>) | null;
  onOpenSettingsSection?: ((section: "commands" | "skills" | "mcps" | "plugins") => void) | undefined;
  onRevertToMessage?: (messageId: string) => void;
  onForkAtMessage?: (messageId: string) => void;
  onOpenTarget?: (target: OpenTarget, options?: { auto?: boolean }) => void;
  onOpenTargetsChange?: (targets: OpenTarget[]) => void;
};

function messageToReadableText(message: UIMessage) {
  const header = message.role === "user" ? "You" : message.role === "assistant" ? "Matterhorn Work" : message.role;
  const body = message.parts
    .flatMap((part) => {
      if (part.type === "text") return [part.text];
      if (part.type === "reasoning") return [part.text];
      if (part.type === "dynamic-tool") {
        if (part.state === "output-error") return [`[tool:${part.toolName}] ${part.errorText}`];
        if (part.state === "output-available") return [`[tool:${part.toolName}] ${JSON.stringify(part.output)}`];
        return [`[tool:${part.toolName}] ${JSON.stringify(part.input)}`];
      }
      return [];
    })
    .join("\n\n");
  return `${header}\n${body}`.trim();
}

function transcriptToText(messages: UIMessage[]) {
  return messages
    .flatMap((message) => {
      const text = messageToReadableText(message);
      return text ? [text] : [];
    })
    .join("\n\n---\n\n");
}

function statusLabel(snapshot: MatterhornSessionSnapshot | undefined, busy: boolean) {
  if (busy) return "Running...";
  if (snapshot?.status.type === "busy") return "Running...";
  if (snapshot?.status.type === "retry") return `Retrying: ${snapshot.status.message}`;
  return "Ready";
}

function controlTextArgument(args: unknown) {
  if (typeof args === "string") return args;
  if (args && typeof args === "object" && "text" in args) {
    const text = (args as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return DEFAULT_COMPOSER_CONTROL_TEXT;
}

const waitForControl = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function useSharedQueryState<T>(queryKey: readonly unknown[], fallback: T) {
  const query = useQuery<T, Error, T, readonly unknown[]>({
    queryKey,
    queryFn: async () => fallback,
    enabled: false,
  });
  return query.data ?? fallback;
}

function messageHasVisibleAssistantOutput(message: UIMessage) {
  if (message.role !== "assistant") return false;
  return message.parts.some((part) => {
    if ("text" in part && typeof part.text === "string") return part.text.trim().length > 0;
    return part.type === "dynamic-tool" || part.type === "file";
  });
}

function formatAssistantFallbackValue(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function assistantFallbackPartToText(part: UIMessage["parts"][number]) {
  if (part.type === "text" || part.type === "reasoning") return part.text.trim();
  if (part.type === "file") return (part.filename ?? part.url).trim();

  const record = part as Record<string, unknown>;
  const toolName = typeof record.toolName === "string" ? record.toolName : null;
  if (toolName) {
    if (typeof record.errorText === "string" && record.errorText.trim()) {
      return `[tool:${toolName}] ${record.errorText.trim()}`;
    }
    const output = formatAssistantFallbackValue(record.output);
    if (output) return `[tool:${toolName}] ${output}`;
    const input = formatAssistantFallbackValue(record.input);
    if (input) return `[tool:${toolName}] ${input}`;
    return `[tool:${toolName}]`;
  }

  const unknown = formatAssistantFallbackValue(record);
  return unknown === "{}" ? "" : unknown;
}

function assistantFallbackText(messages: UIMessage[], baseline: number) {
  return messages
    .slice(baseline)
    .filter((message) => message.role === "assistant")
    .flatMap((message) => message.parts.map(assistantFallbackPartToText))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function AssistantWaitingCard({ label = t("session.assistant_thinking"), collapseLayout = false }: { label?: string; collapseLayout?: boolean }) {
  const content = (
    <div
      className="flex justify-start"
      role="status"
      aria-live="polite"
      aria-label={`${t("composer.assistant_identity")} ${label}`}
    >
      <div className="inline-flex items-center gap-1.5 px-1 py-1 text-[12px] text-dls-secondary">
        <div style={{ width: 20, height: 20, borderRadius: "50%", overflow: "hidden" }}>
          <PaperGrainGradient
            speed={12}
            softness={0.1}
            intensity={1}
            noise={0.05}
            shape="sphere"
            colors={["#818cf8", "#fb7185", "#fbbf24", "#34d399"]}
            colorBack="#ffffff00"
            style={{ backgroundColor: "#818cf8", width: "100%", height: "100%", borderRadius: "50%" }}
          />
        </div>
        <span className="font-medium text-dls-text">{t("composer.assistant_identity")}</span>
        <span>{label}</span>
      </div>
    </div>
  );

  if (collapseLayout) {
    return <div>{content}</div>;
  }

  return (
    content
  );
}

function AssistantNoVisibleOutputCard(props: { text: string }) {
  return (
    <div className="font-mono text-[13px] leading-[1.7] text-gray-8 whitespace-pre-wrap" role="status" aria-live="polite">
      <div className="max-w-[720px]">
        {props.text || t("session.assistant_empty_response")}
      </div>
    </div>
  );
}

function AssistantStatusSpacer() {
  return (
    <div className="invisible" aria-hidden="true">
      <AssistantWaitingCard label={t("session.assistant_responding")} collapseLayout />
    </div>
  );
}

function TodoPanel(props: { todos: TodoItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const todos = props.todos.filter((todo) => todo.content.trim());
  const completedTodos = todos.filter((todo) => todo.status === "completed").length;
  const progressLabel = t("session.todo_progress_label");
  const label = expanded ? progressLabel : `${progressLabel} · ${completedTodos}/${todos.length}`;

  if (todos.length === 0) return null;

  return (
    <div className="overflow-hidden border-b border-dls-border bg-transparent">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-xs text-gray-9 transition-colors hover:bg-gray-2/50"
          onClick={() => setExpanded((current) => !current)}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-11">{label}</span>
          </div>
          <Minimize2 size={12} className={`text-gray-8 transition-transform ${expanded ? "" : "rotate-180"}`} />
        </button>
        {expanded ? (
          <div className="max-h-60 space-y-2.5 overflow-auto border-t border-dls-border px-4 pb-3">
            {todos.map((todo, index) => {
              const done = todo.status === "completed";
              const cancelled = todo.status === "cancelled";
              const active = todo.status === "in_progress";
              return (
                <div key={todo.id} className="flex items-start gap-2.5 pt-2.5 first:pt-2.5">
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <div
                      className={`flex size-4.5 items-center justify-center rounded-full border ${
                        done
                          ? "border-green-6 bg-green-2 text-green-11"
                          : active
                            ? "border-amber-6 bg-amber-2 text-amber-11"
                            : cancelled
                              ? "border-gray-6 bg-gray-2 text-gray-8"
                              : "border-gray-6 bg-gray-1 text-gray-8"
                      }`}
                    >
                      {done ? <Check size={10} /> : active ? <span className="size-1.5 rounded-full bg-amber-9" /> : null}
                    </div>
                  </div>
                  <div className={`flex-1 text-sm leading-relaxed ${cancelled ? "text-gray-9 line-through" : "text-gray-12"}`}>
                    <span className="mr-1.5 text-gray-9">{index + 1}.</span>
                    {todo.content}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
    </div>
  );
}

function parseSessionError(thrown: unknown): SessionError {
  const raw = thrown instanceof Error ? thrown.message : String(thrown);
  // Try to detect ProviderModelNotFoundError from the SDK error shape.
  // The error message may be a JSON string from our serializer in session-route.
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.name === "ProviderModelNotFoundError" && parsed?.data) {
      const { providerID, modelID, suggestions } = parsed.data;
      return {
        message: `Model ${providerID}/${modelID} is not available.`,
        kind: "model-not-found",
        failedModel: { providerID, modelID },
        suggestions: Array.isArray(suggestions) ? suggestions : [],
      };
    }
  } catch {
    // Not JSON — fall through to plain message
  }
  // Check if the raw string mentions model-not-found patterns
  if (/ProviderModelNotFoundError/i.test(raw) || /model.*not found/i.test(raw)) {
    return { message: raw, kind: "model-not-found" };
  }
  return { message: raw || "Failed to send prompt." };
}

function SessionErrorCard({ error, onDismiss, onChangeModel, onOpenModelPicker }: {
  error: SessionError;
  onDismiss: () => void;
  onChangeModel?: (model: { providerID: string; modelID: string }) => void;
  onOpenModelPicker?: () => void;
}) {
  return (
    <div className="mx-auto max-w-[720px] px-3 py-3 sm:px-5">
      <div className="rounded-2xl border border-red-6/30 bg-red-3/15 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-red-11">{error.message}</div>
            {error.kind === "model-not-found" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {error.suggestions && error.suggestions.length > 0 ? (
                  error.suggestions.map((s) => (
                    <button
                      key={`${s.providerID}/${s.modelID}`}
                      type="button"
                      className="rounded-full border border-dls-border bg-dls-surface px-3 py-1.5 text-xs font-medium text-dls-text transition-colors hover:bg-dls-hover"
                      onClick={() => {
                        onChangeModel?.(s);
                        onDismiss();
                      }}
                    >
                      Use {s.providerID}/{s.modelID}
                    </button>
                  ))
                ) : null}
                <button
                  type="button"
                  className="rounded-full border border-dls-border bg-dls-surface px-3 py-1.5 text-xs font-medium text-dls-text transition-colors hover:bg-dls-hover"
                  onClick={() => {
                    onOpenModelPicker?.();
                    onDismiss();
                  }}
                >
                  Change model
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full p-1 text-red-10 transition-colors hover:bg-red-3 hover:text-red-11"
            onClick={onDismiss}
            aria-label="Dismiss error"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function BittensorContextStrip(props: { context: BittensorSessionContext; onClear: () => void }) {
  return (
    <div className="border-b border-dls-border bg-dls-surface/70 px-4 py-2">
      <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
        <div className="min-w-0">
          <div className="font-medium text-dls-text">Bittensor context active</div>
          <div className="truncate text-dls-secondary">{describeBittensorSessionContext(props.context)}</div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-dls-border px-2 py-1 font-medium text-dls-secondary transition-colors hover:border-primary/35 hover:text-primary"
          onClick={props.onClear}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function MemoryContextStrip(props: { context: MatterhornSessionMemoryContext; onClear: () => void; onRemove: (recordId: string) => void }) {
  return (
    <div className="border-b border-dls-border bg-[rgba(var(--matterhorn-blue-rgb),0.08)] px-4 py-2">
      <div className="flex min-w-0 items-start justify-between gap-3 text-xs">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium text-dls-text">
            <Database size={13} />
            <span>Using memories</span>
            <span className="rounded-full border border-dls-border bg-dls-surface px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-dls-secondary">Visible to user</span>
          </div>
          <div className="truncate text-dls-secondary">{describeMatterhornMemoryContext(props.context)}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {props.context.records.slice(0, 6).map((record) => (
              <button
                key={record.id}
                type="button"
                className="rounded-full border border-dls-border bg-dls-surface px-2 py-1 text-[11px] text-dls-text transition-colors hover:border-red-500/40 hover:text-red-200"
                onClick={() => props.onRemove(record.id)}
                title={`${record.title} · ${record.provenance.source} · click to remove`}
              >
                {record.title}
                <span className="ml-1 text-dls-secondary">x</span>
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-dls-border px-2 py-1 font-medium text-dls-secondary transition-colors hover:border-primary/35 hover:text-primary"
          onClick={props.onClear}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function revokeAttachmentPreview(attachment: { previewUrl?: string | undefined }) {
  if (!attachment.previewUrl) return;
  URL.revokeObjectURL(attachment.previewUrl);
}

export function SessionSurface(props: SessionSurfaceProps) {
  const local = useLocal();
  const { config: shellConfig } = useShellConfig();
  const showThinking = local.prefs.showThinking;
  const sessionActivityStatus = useSessionActivityStore(
    (state) => state.statusesByWorkspaceId[props.workspaceId]?.[props.sessionId] ?? "idle",
  );
  const draft = useComposerStateStore((state) => getComposerDraft(state, props.sessionId));
  const savedSessionDraft = useSessionDraftSnapshot(props.workspaceId, props.sessionId);
  const attachments = useComposerStateStore((state) => getComposerAttachments(state, props.sessionId));
  const mentions = useComposerStateStore((state) => getComposerMentions(state, props.sessionId));
  const pasteParts = useComposerStateStore((state) => getComposerPasteParts(state, props.sessionId));
  const setComposerDraft = useComposerStateStore((state) => state.setDraft);
  const setComposerAttachments = useComposerStateStore((state) => state.setAttachments);
  const setComposerMentions = useComposerStateStore((state) => state.setMentions);
  const setComposerPasteParts = useComposerStateStore((state) => state.setPasteParts);
  const clearComposerSession = useComposerStateStore((state) => state.clearSession);
  const bittensorContext = useBittensorSessionContextStore((state) => getBittensorSessionContext(state, props.sessionId));
  const setBittensorContext = useBittensorSessionContextStore((state) => state.setContext);
  const clearBittensorContext = useBittensorSessionContextStore((state) => state.clearContext);
  const memoryContext = useMatterhornSessionMemoryContextStore((state) => getMatterhornSessionMemoryContext(state, props.sessionId));
  const setMemoryContext = useMatterhornSessionMemoryContextStore((state) => state.setContext);
  const clearMemoryContext = useMatterhornSessionMemoryContextStore((state) => state.clearContext);
  const [notice, setNotice] = useState<ReactComposerNotice | null>(null);
  const [error, setError] = useState<SessionError | null>(null);
  const [sending, setSending] = useState(false);
  const [showDelayedLoading, setShowDelayedLoading] = useState(false);
  const [awaitingAssistantBaseline, setAwaitingAssistantBaseline] = useState<number | null>(null);
  const [noVisibleAssistantOutputBaseline, setNoVisibleAssistantOutputBaseline] = useState<number | null>(null);
  const [rendered, setRendered] = useState<{ sessionId: string; snapshot: MatterhornSessionSnapshot } | null>(null);
  const [toolSkills, setToolSkills] = useState<SkillCard[]>([]);
  const [toolMcpServers, setToolMcpServers] = useState<McpServerEntry[]>([]);
  const [toolMcpStatus, setToolMcpStatus] = useState<string | null>(null);
  const [toolMcpStatuses, setToolMcpStatuses] = useState<McpStatusMap>({});
  const [toolImportedPlugins, setToolImportedPlugins] = useState<CloudImportedPlugin[]>([]);
  const [verifiedOpenTargets, setVerifiedOpenTargets] = useState<OpenTarget[]>([]);
  const composerShellRef = useRef<HTMLDivElement>(null);
  const hydratedKeyRef = useRef<string | null>(null);
  const hydratedSavedDraftKeyRef = useRef<string | null>(null);
  const autoOpenedTargetRef = useRef<string | null>(null);
  const initializedAutoOpenSessionRef = useRef<string | null>(null);
  const opencodeClient = useMemo(
    () => createClient(props.opencodeBaseUrl, undefined, { token: props.matterhornToken, mode: "matterhorn" }),
    [props.opencodeBaseUrl, props.matterhornToken],
  );

  const snapshotQueryKey = useMemo(
    () => ["react-session-snapshot", props.workspaceId, props.sessionId],
    [props.workspaceId, props.sessionId],
  );
  const transcriptQueryKey = useMemo(
    () => reactTranscriptKey(props.workspaceId, props.sessionId),
    [props.workspaceId, props.sessionId],
  );
  const statusQueryKey = useMemo(
    () => reactStatusKey(props.workspaceId, props.sessionId),
    [props.workspaceId, props.sessionId],
  );
  const snapshotQuery = useQuery<MatterhornSessionSnapshot>({
    queryKey: snapshotQueryKey,
    queryFn: async () => (await props.client.getSessionSnapshot(props.workspaceId, props.sessionId, { limit: 140 })).item,
    staleTime: 500,
  });
  const customerWorkflowTemplatesQuery = useQuery({
    queryKey: ["matterhorn-customer-workflow-templates"],
    queryFn: fetchCustomerWorkflowTemplates,
    staleTime: 60_000,
  });
  const customerWorkflowStarterCards = useMemo(
    () => buildCustomerWorkflowStarterCards(customerWorkflowTemplatesQuery.data),
    [customerWorkflowTemplatesQuery.data],
  );

  const currentSnapshot = snapshotQuery.data?.session.id === props.sessionId ? snapshotQuery.data : null;
  const transcriptState = useSharedQueryState<UIMessage[]>(transcriptQueryKey, EMPTY_TRANSCRIPT);
  const statusState = useSharedQueryState(statusQueryKey, currentSnapshot?.status ?? IDLE_STATUS);

  useEffect(() => {
    if (!currentSnapshot) return;
    setRendered({ sessionId: props.sessionId, snapshot: currentSnapshot });
  }, [props.sessionId, currentSnapshot]);

  useEffect(() => {
    hydratedKeyRef.current = null;
    hydratedSavedDraftKeyRef.current = null;
    setError(null);
    setSending(false);
    setShowDelayedLoading(false);
    setAwaitingAssistantBaseline(null);
    setNoVisibleAssistantOutputBaseline(null);
    // Composer draft state lives in the shared store keyed by session id, so
    // switching sessions preserves each session's own in-progress composer.
    setNotice(null);
    autoOpenedTargetRef.current = null;
    initializedAutoOpenSessionRef.current = null;
    setVerifiedOpenTargets([]);
  }, [props.sessionId]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(id);
  }, [notice]);

  // Publish a composer inspector slice so external drivers can read draft
  // state, attachments, mentions, and sending status from the running app.
  useEffect(() => {
    const dispose = publishInspectorSlice("composer", () => ({
      workspaceId: props.workspaceId,
      sessionId: props.sessionId,
      draft,
      draftLength: draft.length,
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        kind: attachment.kind,
      })),
      mentions,
      pasteParts: pasteParts.map((part) => ({
        id: part.id,
        label: part.label,
        lines: part.lines,
      })),
      sending,
      error,
      hasNotice: Boolean(notice),
    }));
    return dispose;
  }, [
    attachments,
    draft,
    error,
    mentions,
    notice,
    pasteParts,
    props.sessionId,
    props.workspaceId,
    sending,
  ]);

  useEffect(() => {
    recordInspectorEvent("session.mounted", {
      workspaceId: props.workspaceId,
      sessionId: props.sessionId,
    });
  }, [props.sessionId, props.workspaceId]);

  useEffect(() => {
    if (!currentSnapshot) return;
    seedSessionState(props.workspaceId, currentSnapshot);
  }, [currentSnapshot, props.sessionId, props.workspaceId]);

  useEffect(() => {
    if (!currentSnapshot) return;
    const key = `${props.sessionId}:${currentSnapshot.session.time?.updated ?? currentSnapshot.session.time?.created ?? 0}:${currentSnapshot.messages.length}`;
    if (hydratedKeyRef.current === key) return;
    hydratedKeyRef.current = key;
    seedSessionState(props.workspaceId, currentSnapshot);
  }, [props.sessionId, currentSnapshot, props.workspaceId]);

  const snapshot = resolveRenderedSessionSnapshot({
    sessionId: props.sessionId,
    currentSnapshot,
    cachedRendered: rendered,
  });
  const liveStatus = statusState ?? snapshot?.status ?? IDLE_STATUS;
  const chatStreaming = sending || liveStatus.type === "busy" || liveStatus.type === "retry";
  const renderedMessages = useMemo(
    () => deriveRenderedSessionMessages({ transcriptState, snapshot }),
    [snapshot, transcriptState],
  );
  const activeDeskMode = useMemo(
    () => deriveMatterhornDeskMode([draft, ...renderedMessages.map(messageToReadableText)]),
    [draft, renderedMessages],
  );
  const openTargets = useMemo(() => deriveOpenTargets(renderedMessages), [renderedMessages]);
  const openTargetsFingerprint = useMemo(
    () => openTargets.map((target) => `${target.kind}:${target.value}:${target.confidence}`).join("|"),
    [openTargets],
  );
  const autoOpenTarget = selectAutoOpenTarget(verifiedOpenTargets);
  const pendingSessionLoad = !snapshot && snapshotQuery.isLoading && renderedMessages.length === 0;
  const assistantOutputAfterAwaitStart = useMemo(() => {
    if (awaitingAssistantBaseline === null) return false;
    return renderedMessages
      .slice(awaitingAssistantBaseline)
      .some(messageHasVisibleAssistantOutput);
  }, [awaitingAssistantBaseline, renderedMessages]);
  const noVisibleAssistantOutputText = useMemo(() => {
    if (noVisibleAssistantOutputBaseline === null) return "";
    return assistantFallbackText(renderedMessages, noVisibleAssistantOutputBaseline);
  }, [noVisibleAssistantOutputBaseline, renderedMessages]);
  const assistantOutputAfterNoVisibleFallback = useMemo(() => {
    if (noVisibleAssistantOutputBaseline === null) return false;
    return renderedMessages
      .slice(noVisibleAssistantOutputBaseline)
      .some(messageHasVisibleAssistantOutput);
  }, [noVisibleAssistantOutputBaseline, renderedMessages]);
  const showAssistantWaitState = awaitingAssistantBaseline !== null && !assistantOutputAfterAwaitStart;
  const showAssistantRespondingState = awaitingAssistantBaseline !== null && assistantOutputAfterAwaitStart && chatStreaming;
  const effectiveActivityStatus: SessionActivityStatus = sessionActivityStatus !== "idle"
    ? sessionActivityStatus
    : showAssistantWaitState
      ? "thinking"
      : showAssistantRespondingState
        ? "responding"
        : "idle";
  const showNoVisibleAssistantOutput = noVisibleAssistantOutputBaseline !== null && !assistantOutputAfterNoVisibleFallback;
  const reserveAssistantStatusSpace = effectiveActivityStatus === "idle" && awaitingAssistantBaseline !== null && assistantOutputAfterAwaitStart && !chatStreaming;
  const assistantStatusFooter = effectiveActivityStatus !== "idle" ? (
    <AssistantWaitingCard label={getSessionActivityStatusLabel(effectiveActivityStatus)} collapseLayout />
  ) : showNoVisibleAssistantOutput ? (
    <AssistantNoVisibleOutputCard text={noVisibleAssistantOutputText} />
  ) : reserveAssistantStatusSpace ? (
    <AssistantStatusSpacer />
  ) : null;
  useReactRenderWatchdog("SessionSurface", {
    sessionId: props.sessionId,
    workspaceId: props.workspaceId,
    messageCount: renderedMessages.length,
    liveStatus: liveStatus.type,
    sending,
    pendingSessionLoad,
    showAssistantWaitState,
    showAssistantRespondingState,
    noVisibleAssistantOutputBaseline,
    hasSnapshot: Boolean(snapshot),
  });

  useEffect(() => {
    if (!autoOpenTarget || chatStreaming) return;
    if (autoOpenedTargetRef.current === autoOpenTarget.id) return;
    autoOpenedTargetRef.current = autoOpenTarget.id;
    props.onOpenTarget?.(autoOpenTarget, { auto: true });
  }, [autoOpenTarget, chatStreaming, props.onOpenTarget]);

  useEffect(() => {
    let cancelled = false;
    function initializeAutoOpenState(targets: OpenTarget[]) {
      if (initializedAutoOpenSessionRef.current === props.sessionId) return;
      initializedAutoOpenSessionRef.current = props.sessionId;
      autoOpenedTargetRef.current = selectAutoOpenTarget(targets)?.id ?? null;
    }

    async function verifyTargets() {
      if (!openTargets.length) {
        initializeAutoOpenState([]);
        setVerifiedOpenTargets([]);
        return;
      }
      try {
        const response = await props.client.resolveArtifacts(props.workspaceId, openTargets);
        if (!cancelled) {
          const nextTargets = response.items as OpenTarget[];
          initializeAutoOpenState(nextTargets);
          setVerifiedOpenTargets(nextTargets);
        }
      } catch {
        if (!cancelled) {
          const nextTargets = openTargets.map((target) => ({ ...target, exists: target.kind === "url" }));
          initializeAutoOpenState(nextTargets);
          setVerifiedOpenTargets(nextTargets);
        }
      }
    }
    void verifyTargets();
    return () => { cancelled = true; };
  }, [openTargetsFingerprint, props.client, props.sessionId, props.workspaceId]);

  useEffect(() => {
    props.onOpenTargetsChange?.(verifiedOpenTargets);
  }, [props.onOpenTargetsChange, verifiedOpenTargets]);

  useEffect(() => {
    if (!pendingSessionLoad) {
      setShowDelayedLoading(false);
      return;
    }
    const id = window.setTimeout(() => setShowDelayedLoading(true), 2000);
    return () => window.clearTimeout(id);
  }, [pendingSessionLoad]);

  useEffect(() => {
    if (awaitingAssistantBaseline === null) return;
    if (assistantOutputAfterAwaitStart) {
      return;
    }
    if (sending || liveStatus.type !== "idle" || renderedMessages.length <= awaitingAssistantBaseline) return;
    const id = window.setTimeout(() => {
      setNoVisibleAssistantOutputBaseline(awaitingAssistantBaseline);
      setAwaitingAssistantBaseline(null);
    }, 1200);
    return () => window.clearTimeout(id);
  }, [assistantOutputAfterAwaitStart, awaitingAssistantBaseline, liveStatus.type, renderedMessages.length, sending]);

  const model = deriveSessionRenderModel({
    intendedSessionId: props.sessionId,
    renderedSessionId: renderedMessages.length > 0 || snapshot ? props.sessionId : null,
    hasSnapshot: Boolean(snapshot) || renderedMessages.length > 0,
    isFetching: snapshotQuery.isFetching,
    isError: snapshotQuery.isError || Boolean(error),
  });

  const buildDraft = useCallback((
    text: string,
    nextAttachments: ComposerAttachment[],
    options?: { resolvedText?: string },
  ): ComposerDraft => {
    const parts: ComposerPart[] = text.split(/(\[pasted text [^\]]+\]|@[^\s@]+)/).flatMap((segment) => {
      if (!segment) return [] as ComposerDraft["parts"];
      const pasteMatch = segment.match(/^\[pasted text (.+)\]$/);
      if (pasteMatch) {
        const target = pasteParts.find((item) => item.label === pasteMatch[1]);
        if (target) {
          return [{ type: "paste", id: target.id, label: target.label, text: target.text, lines: target.lines }];
        }
      }
      if (segment.startsWith("@")) {
        const value = decodeComposerMentionValue(segment.slice(1));
        const kind = mentions[value];
        if (kind === "agent") return [{ type: "agent", name: value } satisfies ComposerDraft["parts"][number]];
        if (kind === "file") return [{ type: "file", path: value, label: value } satisfies ComposerDraft["parts"][number]];
      }
      return [{ type: "text", text: segment } satisfies ComposerDraft["parts"][number]];
    });
    // Expand paste placeholders in resolvedText so the model receives
    // the actual pasted content instead of "[pasted text <label>]".
    let resolved = options?.resolvedText ?? text;
    for (const part of pasteParts) {
      resolved = resolved.replace(`[pasted text ${part.label}]`, part.text);
    }
    for (const value of Object.keys(mentions)) {
      resolved = resolved.replaceAll(`@${encodeComposerMentionValue(value)}`, `@${value}`);
    }
    const resolvedSlashMatch = resolved.trim().match(/^\/([^\s]+)\s*(.*)$/);
    return {
      mode: "prompt",
      parts,
      attachments: nextAttachments,
      text,
      resolvedText: resolved,
      command: resolvedSlashMatch ? { name: resolvedSlashMatch[1] ?? "", arguments: resolvedSlashMatch[2] ?? "" } : undefined,
    };
  }, [mentions, pasteParts]);

  const handleComposerDraftChange = useCallback((value: string) => {
    setComposerDraft(props.sessionId, value);
  }, [props.sessionId, setComposerDraft]);

  useEffect(() => {
    const text = savedSessionDraft?.text?.trim();
    if (!text) return;
    if (draft.trim()) return;
    const key = `${props.workspaceId}:${props.sessionId}:${text}`;
    if (hydratedSavedDraftKeyRef.current === key) return;
    hydratedSavedDraftKeyRef.current = key;
    setComposerDraft(props.sessionId, text);
    props.onDraftChange(buildDraft(text, attachments));
    window.setTimeout(() => window.dispatchEvent(new Event("openwork:focusPrompt")), 0);
  }, [
    attachments,
    buildDraft,
    draft,
    props.onDraftChange,
    props.sessionId,
    props.workspaceId,
    savedSessionDraft,
    setComposerDraft,
  ]);

  const handleCopyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(transcriptToText(renderedMessages));
    } catch (nextError) {
      setError({ message: nextError instanceof Error ? nextError.message : "Failed to copy transcript." });
    }
  };

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text && attachments.length === 0) return;
    // Intentionally allow sending while the assistant is still streaming.
    // OpenCode accepts follow-up user turns mid-run and queues them; if the
    // backend can't accept the follow-up it'll surface an error via the
    // catch below. This restores the "append a prompt while it's still
    // talking" behavior that the Solid composer had.
    setError(null);
    useSessionActivityStore.getState().setRunStatus(props.workspaceId, props.sessionId, { type: "busy" });
    setSending(true);
    setAwaitingAssistantBaseline(renderedMessages.length);
    setNoVisibleAssistantOutputBaseline(null);
    try {
      let resolvedText = addBittensorContextToResolvedText(text, bittensorContext);
      resolvedText = addMatterhornMemoryContextToResolvedText(resolvedText, memoryContext);
      const nextDraft = buildDraft(text, attachments, { resolvedText });
      if (resolvedText !== text) {
        recordInspectorEvent("session.context.resolved_text_attached", {
          workspaceId: props.workspaceId,
          sessionId: props.sessionId,
          bittensorContextId: bittensorContext?.id,
          memoryContextId: memoryContext?.id,
          memoryRecordCount: memoryContext?.records.length ?? 0,
        });
      }
      await props.onSendDraft(nextDraft);
      attachments.forEach(revokeAttachmentPreview);
      clearComposerSession(props.sessionId);
      props.onDraftChange(buildDraft("", []));
      setSending(false);
    } catch (nextError) {
      const parsed = parseSessionError(nextError);
      setError(parsed);
      useSessionActivityStore.getState().setError(props.workspaceId, props.sessionId);
      setComposerDraft(props.sessionId, "");
      setAwaitingAssistantBaseline(null);
      setNoVisibleAssistantOutputBaseline(null);
      setSending(false);
    }
  }, [attachments, bittensorContext, buildDraft, clearComposerSession, draft, memoryContext, props.onDraftChange, props.onSendDraft, props.sessionId, props.workspaceId, renderedMessages.length, setComposerDraft]);

  const handleAbort = useCallback(async () => {
    if (!chatStreaming) return;
    setError(null);
    try {
      await abortSessionSafe(opencodeClient, props.sessionId);
      await snapshotQuery.refetch();
    } catch (nextError) {
      setError({ message: nextError instanceof Error ? nextError.message : "Failed to stop run." });
    }
  }, [chatStreaming, opencodeClient, props.sessionId, snapshotQuery.refetch]);

  const handleDismissError = useCallback(() => {
    setError(null);
    useSessionActivityStore.getState().clearError(props.workspaceId, props.sessionId);
  }, [props.sessionId, props.workspaceId]);

  useEffect(() => {
    if (liveStatus.type === "idle") {
      setSending(false);
    }
  }, [liveStatus.type]);

  useEffect(() => {
    props.onDraftChange(buildDraft(draft, attachments));
  }, [attachments, buildDraft, draft, props.onDraftChange]);

  const handleAttachFiles = (files: File[]) => {
    if (!props.attachmentsEnabled) {
      setNotice({ title: props.attachmentsDisabledReason ?? "Attachments are unavailable.", tone: "warning" });
      return;
    }
    const oversized = files.filter((file) => file.size > 25 * 1024 * 1024);
    const accepted = files.filter((file) => file.size <= 25 * 1024 * 1024);
    if (oversized.length) {
      setNotice({
        title: oversized.length === 1 ? `${oversized[0]?.name ?? "File"} is too large` : `${oversized.length} files are too large`,
        description: "Files over 25 MB were skipped.",
        tone: "warning",
      });
    }
    if (!accepted.length) return;
    const next = accepted.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      kind: file.type.startsWith("image/") ? "image" as const : "file" as const,
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setComposerAttachments(props.sessionId, [...attachments, ...next]);
    setNotice({
      title: next.length === 1 ? `Attached ${next[0]?.name ?? "file"}` : `Attached ${next.length} files`,
      tone: "success",
    });
  };

  const handleRemoveAttachment = (id: string) => {
    const target = attachments.find((item) => item.id === id);
    if (target?.previewUrl) {
      URL.revokeObjectURL(target.previewUrl);
    }
    setComposerAttachments(props.sessionId, attachments.filter((item) => item.id !== id));
  };

  const handleInsertMention = (kind: "agent" | "file", value: string) => {
    setComposerDraft(props.sessionId, draft.replace(/@([^\s@]*)$/, `@${encodeComposerMentionValue(value)} `));
    setComposerMentions(props.sessionId, { ...mentions, [value]: kind });
  };

  const handlePasteText = (text: string) => {
    const id = `paste-${Math.random().toString(36).slice(2)}`;
    const label = `${id.slice(-4)} · ${text.split(/\r?\n/).length} lines`;
    setComposerPasteParts(props.sessionId, [...pasteParts, { id, label, text, lines: text.split(/\r?\n/).length }]);
    setComposerDraft(props.sessionId, `${draft}[pasted text ${label}]`);
  };

  const handleRevealPastedText = (id: string) => {
    const part = pasteParts.find((item) => item.id === id);
    if (!part) return;
    setNotice({
      title: `Pasted text · ${part.label}`,
      description: part.text.slice(0, 800),
      tone: "info",
    });
  };

  const handleExpandPastedText = (id: string) => {
    const part = pasteParts.find((item) => item.id === id);
    if (!part) return;
    setComposerDraft(props.sessionId, draft.replace(`[pasted text ${part.label}]`, part.text));
    setComposerPasteParts(props.sessionId, pasteParts.filter((item) => item.id !== id));
  };

  const handleRemovePastedText = (id: string) => {
    const target = pasteParts.find((item) => item.id === id);
    if (!target) return;
    setComposerDraft(props.sessionId, draft.replace(`[pasted text ${target.label}]`, ""));
    setComposerPasteParts(props.sessionId, pasteParts.filter((item) => item.id !== id));
  };

  const handleUnsupportedFileLinks = (links: string[]) => {
    if (!links.length) return;
    setComposerDraft(props.sessionId, `${draft}${draft && !draft.endsWith("\n") ? "\n" : ""}${links.join("\n")}`);
  };

  const typeComposerText = useCallback(async (text: string) => {
    window.dispatchEvent(new Event("openwork:focusPrompt"));
    setComposerDraft(props.sessionId, text);
    await waitForControl(40);
  }, [props.sessionId, setComposerDraft]);

  useEffect(() => {
    const handleBittensorContextUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const context = readBittensorContextFromEventDetail(event.detail);
      if (!context) return;
      setBittensorContext(props.sessionId, context);
      recordInspectorEvent("bittensor.context.updated", {
        workspaceId: props.workspaceId,
        sessionId: props.sessionId,
        contextId: context.id,
      });
    };
    window.addEventListener("matterhorn:bittensor-context-updated", handleBittensorContextUpdated);
    return () => window.removeEventListener("matterhorn:bittensor-context-updated", handleBittensorContextUpdated);
  }, [props.sessionId, props.workspaceId, setBittensorContext]);

  useEffect(() => {
    const handleMemoryContextUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const context = readMatterhornMemoryContextFromEventDetail(event.detail);
      if (!context) return;
      setMemoryContext(props.sessionId, context);
      setNotice({
        title: "Memory context ready",
        description: `${context.records.length} visible memor${context.records.length === 1 ? "y" : "ies"} attached to this session.`,
        tone: "info",
      });
      recordInspectorEvent("memory.context.updated", {
        workspaceId: props.workspaceId,
        sessionId: props.sessionId,
        contextId: context.id,
        recordCount: context.records.length,
      });
    };
    window.addEventListener("matterhorn:memory-context-updated", handleMemoryContextUpdated);
    return () => window.removeEventListener("matterhorn:memory-context-updated", handleMemoryContextUpdated);
  }, [props.sessionId, props.workspaceId, setMemoryContext]);

  useEffect(() => {
    const handleMemoryChatHandoff = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      if (!detail || typeof detail !== "object" || Array.isArray(detail)) return;
      const incomingContext = readMatterhornMemoryContextFromEventDetail(detail);
      if (incomingContext) {
        setMemoryContext(props.sessionId, incomingContext);
      }
      const record = detail as { prompt?: unknown; text?: unknown; message?: unknown };
      const text =
        typeof record.prompt === "string" ? record.prompt :
        typeof record.text === "string" ? record.text :
        typeof record.message === "string" ? record.message :
        "";
      if (!text.trim()) return;
      const resolvedText = addMatterhornMemoryContextToResolvedText(text, incomingContext ?? memoryContext);
      void typeComposerText(text);
      props.onDraftChange(buildDraft(text, attachments, { resolvedText }));
      setNotice({
        title: "Memory prompt ready",
        description: "Review or send it from the chat composer.",
        tone: "info",
      });
      recordInspectorEvent("memory.chat_handoff.applied", {
        workspaceId: props.workspaceId,
        sessionId: props.sessionId,
        length: text.length,
        contextId: incomingContext?.id ?? memoryContext?.id,
      });
    };
    window.addEventListener("matterhorn:memory-chat-handoff", handleMemoryChatHandoff);
    return () => window.removeEventListener("matterhorn:memory-chat-handoff", handleMemoryChatHandoff);
  }, [attachments, buildDraft, memoryContext, props.onDraftChange, props.sessionId, props.workspaceId, setMemoryContext, typeComposerText]);

  useEffect(() => {
    const handleCryptoChatHandoff = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      if (!detail || typeof detail !== "object" || Array.isArray(detail)) return;
      const record = detail as { prompt?: unknown; text?: unknown; message?: unknown };
      const isGenericCryptoHandoff = event.type === "matterhorn:crypto-chat-handoff";
      const incomingContext = readBittensorContextFromEventDetail(detail);
      const mergedContext = mergeBittensorSessionContexts(bittensorContext, incomingContext);
      const text =
        typeof record.prompt === "string" ? record.prompt :
        typeof record.text === "string" ? record.text :
        typeof record.message === "string" ? record.message :
        "";
      if (!text.trim()) return;
      if (incomingContext) {
        setBittensorContext(props.sessionId, incomingContext);
      }
      dispatchMatterhornMemorySuggestions({
        desk: isGenericCryptoHandoff
          ? (typeof (detail as { venue?: unknown; panel?: unknown }).venue === "string"
              ? (detail as { venue: string }).venue
              : typeof (detail as { panel?: unknown }).panel === "string"
                ? (detail as { panel: string }).panel
                : "generic_workspace")
          : "bittensor",
        prompt: text,
        source: "chat_capture",
        sourceId: isGenericCryptoHandoff ? "crypto-chat-handoff" : "bittensor-chat-handoff",
        workspaceId: props.workspaceId,
        sessionId: props.sessionId,
        ss58Address: incomingContext?.ss58Address,
        netuid: incomingContext?.netuid,
        validatorHotkey: incomingContext?.validatorHotkey,
      });
      const resolvedText = isGenericCryptoHandoff ? text : addBittensorContextToResolvedText(text, mergedContext);
      void typeComposerText(text);
      props.onDraftChange(buildDraft(text, attachments, { resolvedText }));
      setNotice({
        title: isGenericCryptoHandoff ? "Protocol prompt ready" : "Bittensor prompt ready",
        description: "Review or send it from the chat composer.",
        tone: "info",
      });
      recordInspectorEvent(isGenericCryptoHandoff ? "crypto.chat_handoff.applied" : "bittensor.chat_handoff.applied", {
        workspaceId: props.workspaceId,
        sessionId: props.sessionId,
        length: text.length,
        contextId: mergedContext?.id,
      });
    };
    window.addEventListener("matterhorn:crypto-chat-handoff", handleCryptoChatHandoff);
    window.addEventListener("matterhorn:bittensor-chat-handoff", handleCryptoChatHandoff);
    window.addEventListener("matterhorn:bittensor-agent-prompt", handleCryptoChatHandoff);
    return () => {
      window.removeEventListener("matterhorn:crypto-chat-handoff", handleCryptoChatHandoff);
      window.removeEventListener("matterhorn:bittensor-chat-handoff", handleCryptoChatHandoff);
      window.removeEventListener("matterhorn:bittensor-agent-prompt", handleCryptoChatHandoff);
    };
  }, [attachments, bittensorContext, buildDraft, props.onDraftChange, props.sessionId, props.workspaceId, setBittensorContext, typeComposerText]);

  useEffect(() => {
    const handleVoiceTranscript = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      if (!detail || typeof detail !== "object" || Array.isArray(detail) || !("text" in detail) || typeof detail.text !== "string") return;
      const text = detail.text;
      void typeComposerText(text);
      props.onDraftChange(buildDraft(text, attachments));
      recordInspectorEvent("voice.transcript.applied", {
        workspaceId: props.workspaceId,
        sessionId: props.sessionId,
        length: text.length,
      });
    };
    window.addEventListener("openwork:voice-transcript", handleVoiceTranscript);
    return () => window.removeEventListener("openwork:voice-transcript", handleVoiceTranscript);
  }, [attachments, buildDraft, props.onDraftChange, props.sessionId, props.workspaceId, typeComposerText]);

  const composerSetTextControlAction = useMemo<MatterhornControlAction>(() => ({
    id: "composer.set_text",
    label: "Type into the composer",
    description: "Replace the current session draft and type the supplied text visibly.",
    sideEffect: "none",
    requiresArgs: true,
    args: [{ name: "text", type: "string", required: true, description: "Prompt text to place in the composer." }],
    previewArgs: { text: DEFAULT_COMPOSER_CONTROL_TEXT },
    targetRef: composerShellRef,
    execute: async (args, helpers) => {
      const text = controlTextArgument(args);
      helpers.setNarration(`Typing ${text.length.toLocaleString()} characters into the composer…`);
      await typeComposerText(text);
      props.onDraftChange(buildDraft(text, attachments));
      return { draftLength: text.length };
    },
  }), [attachments, buildDraft, props.onDraftChange, typeComposerText]);
  useControlAction(composerSetTextControlAction);

  const composerSendControlAction = useMemo<MatterhornControlAction>(() => ({
    id: "composer.send",
    label: "Send the composer prompt",
    description: "Send the currently visible composer draft to the active session.",
    sideEffect: "mutation",
    disabled: props.modelUnavailable || (!draft.trim() && attachments.length === 0) || model.transitionState !== "idle",
    targetRef: composerShellRef,
    execute: async () => {
      await handleSend();
      return true;
    },
  }), [attachments.length, draft, handleSend, model.transitionState, props.modelUnavailable]);
  useControlAction(composerSendControlAction);

  const composerStopControlAction = useMemo<MatterhornControlAction>(() => ({
    id: "composer.stop",
    label: "Stop the current run",
    description: "Stop the current streaming session run.",
    sideEffect: "mutation",
    disabled: !chatStreaming,
    targetRef: composerShellRef,
    execute: async () => {
      await handleAbort();
      return true;
    },
  }), [chatStreaming, handleAbort]);
  useControlAction(composerStopControlAction);

  const listSkills = async (): Promise<SkillCard[]> => {
    const response = await props.client.listSkills(props.workspaceId, { includeGlobal: true });
    const next = (response.items ?? []).map((skill) => ({
      name: skill.name,
      path: skill.path,
      description: skill.description,
      trigger: skill.trigger,
    } satisfies SkillCard));
    setToolSkills(next);
    return next;
  };

  const listMcp = async (): Promise<{ servers: McpServerEntry[]; statuses: McpStatusMap; status: string | null }> => {
    const response = await props.client.listMcp(props.workspaceId);
    const servers = (response.items ?? []).map((entry) => ({
      name: entry.name,
      config: entry.config as McpServerEntry["config"],
    } satisfies McpServerEntry));

    let statuses: McpStatusMap = {};
    try {
      if (props.workspaceRoot.trim()) {
        statuses = unwrap(await opencodeClient.mcp.status({ directory: props.workspaceRoot.trim() })) as McpStatusMap;
      }
    } catch {
      statuses = {};
    }

    const status = servers.length ? null : "No MCP servers loaded.";
    setToolMcpServers(servers);
    setToolMcpStatuses(statuses);
    setToolMcpStatus(status);
    return { servers, statuses, status };
  };

  const listImportedPlugins = async (): Promise<CloudImportedPlugin[]> => {
    const response = await props.client.getConfig(props.workspaceId);
    const plugins = Object.values(readWorkspaceCloudImports(response.matterhorn).plugins)
      .sort((left, right) => left.name.localeCompare(right.name));
    setToolImportedPlugins(plugins);
    return plugins;
  };

  const handleUploadInboxFiles = async (files: File[], options?: { notify?: boolean }) => {
    const input = files.filter(Boolean);
    if (!input.length) return;
    try {
      const results = await Promise.all(input.map((file) => props.client.uploadInbox(props.workspaceId, file)));
      if (options?.notify !== false) {
        const summary = results.map((item) => item.path.split("/").filter(Boolean).slice(-1)[0] ?? item.path).join(", ");
        setNotice({
          title: input.length === 1 ? "Uploaded to the shared folder." : `Uploaded ${input.length} files to the shared folder.`,
          description: summary || undefined,
          tone: "success",
        });
      }
      return results;
    } catch (nextError) {
      setNotice({
        title: nextError instanceof Error ? nextError.message : "Shared folder upload failed",
        tone: "warning",
      });
      throw nextError;
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sessionScroll = useSessionScrollController({
    selectedSessionId: props.sessionId,
    renderedMessages,
    containerRef: scrollRef,
    contentRef,
  });
  const hasTranscriptJumpTarget = renderedMessages.length > 0;

  const sessionScrollTopControlAction = useMemo<MatterhornControlAction>(() => ({
    id: "session.scroll_top",
    label: "Go to the top of the session",
    description: "Scroll the visible session transcript to the first messages.",
    sideEffect: "none",
    execute: () => {
      const container = scrollRef.current;
      if (!container) return { ok: false, error: "Session transcript is not mounted" };
      container.scrollTo({ top: 0, behavior: "smooth" });
      return { ok: true, position: "top" };
    },
  }), []);
  useControlAction(sessionScrollTopControlAction);

  const sessionScrollBottomControlAction = useMemo<MatterhornControlAction>(() => ({
    id: "session.scroll_bottom",
    label: "Go to the bottom of the session",
    description: "Scroll the visible session transcript to the newest messages and composer area.",
    sideEffect: "none",
    execute: () => {
      sessionScroll.jumpToLatest("smooth");
      return { ok: true, position: "bottom" };
    },
  }), [sessionScroll.jumpToLatest]);
  useControlAction(sessionScrollBottomControlAction);

  const sessionLatestMessageControlAction = useMemo<MatterhornControlAction>(() => ({
    id: "session.latest_message",
    label: "Read the latest session message",
    description: "Return the latest visible message in the current session transcript.",
    sideEffect: "none",
    execute: () => {
      const message = renderedMessages[renderedMessages.length - 1];
      if (!message) return { ok: false, error: "No messages are visible in this session" };
      return {
        ok: true,
        sessionId: props.sessionId,
        index: renderedMessages.length - 1,
        role: message.role,
        text: messageToReadableText(message),
      };
    },
  }), [props.sessionId, renderedMessages]);
  useControlAction(sessionLatestMessageControlAction);

  const sessionReadTranscriptControlAction = useMemo<MatterhornControlAction>(() => ({
    id: "session.read_transcript",
    label: "Read the current session transcript",
    description: "Return the last messages from the current session transcript as readable text, including the session ID, title, and message count.",
    sideEffect: "none",
    args: [{ name: "count", type: "number", required: false, description: "Number of recent messages to return, from 1 to 30. Defaults to 10." }],
    execute: (args) => {
      const count = typeof args === "object" && args !== null && "count" in args && typeof (args as { count?: unknown }).count === "number"
        ? Math.min(Math.max(1, (args as { count: number }).count), 30)
        : 10;
      const total = renderedMessages.length;
      const slice = renderedMessages.slice(-count);
      if (!slice.length) return { ok: false, error: "No messages in this session" };
      return {
        ok: true,
        sessionId: props.sessionId,
        messageCount: total,
        returned: slice.length,
        messages: slice.map((message, index) => ({
          index: total - slice.length + index,
          role: message.role,
          text: messageToReadableText(message),
        })),
      };
    },
  }), [props.sessionId, renderedMessages]);
  useControlAction(sessionReadTranscriptControlAction);

  const hasTodoContent = (props.todos ?? []).some((todo) => todo.content.trim());
  const hasComposerTopAccessory = Boolean(props.activeQuestion || hasTodoContent || props.activePermission || activeDeskMode || bittensorContext || memoryContext);

  return (
    <DevProfiler id="SessionSurface">
    <div className="flex h-full min-h-0 flex-col">
      {model.transitionState === "switching" && showDelayedLoading ? (
        <div className="flex justify-center px-6 pt-4">
          <div className="rounded-full border border-dls-border bg-dls-hover/80 px-3 py-1 text-xs text-dls-secondary">
            {model.renderSource === "cache" ? "Switching session from cache..." : "Switching session..."}
          </div>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onWheel={(event) => {
            sessionScroll.markScrollGesture(event.target);
          }}
          onTouchStart={(event) => {
            sessionScroll.markScrollGesture(event.target);
          }}
          onTouchMove={(event) => {
            sessionScroll.markScrollGesture(event.target);
          }}
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return;
            sessionScroll.markScrollGesture(event.currentTarget);
          }}
          onScroll={sessionScroll.handleScroll}
          className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 py-4 sm:px-5"
        >
          {/* Chat column: tighter than the composer (800px) so messages
               keep a comfortable reading width and don't feel "too big". */}
          <div ref={contentRef} className="mx-auto w-full max-w-[720px]">
            {showDelayedLoading && pendingSessionLoad ? (
                <div className="px-6 py-16">
                <div className="mx-auto max-w-sm rounded-xl bg-dls-hover/60 px-8 py-10 text-center">
                  <div className="text-sm text-dls-secondary">Opening session…</div>
                </div>
              </div>
            ) : (snapshotQuery.isError || error) && !snapshot && renderedMessages.length === 0 ? (
              <div className="px-6 py-8">
                {error ? (
                  <SessionErrorCard
                    error={error}
                    onDismiss={handleDismissError}
                    onChangeModel={props.onChangeModel}
                    onOpenModelPicker={props.onModelClick}
                  />
                ) : (
                  <div className="mx-auto max-w-xl rounded-xl bg-red-3/20 px-6 py-5 text-sm text-red-11 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.22)]">
                    {snapshotQuery.error instanceof Error ? snapshotQuery.error.message : "Failed to load session."}
                  </div>
                )}
              </div>
            ) : renderedMessages.length === 0 && effectiveActivityStatus !== "idle" ? (
              <div className="px-6 py-12">
                <AssistantWaitingCard label={getSessionActivityStatusLabel(effectiveActivityStatus)} />
              </div>
            ) : renderedMessages.length === 0 && snapshot && snapshot.messages.length === 0 ? (
              error ? (
                <SessionErrorCard
                  error={error}
                  onDismiss={handleDismissError}
                  onChangeModel={props.onChangeModel}
                  onOpenModelPicker={props.onModelClick}
                />
              ) : activeDeskMode ? (
                draft.trim() ? (
                  <MatterhornDeskDraftReadyState mode={activeDeskMode} />
                ) : (
                  <MatterhornDeskFocusedEmptyState
                    mode={activeDeskMode}
                    onUsePrompt={typeComposerText}
                  />
                )
              ) : shellConfig.starterCards ? (
                <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-5 sm:px-6">
                  <div className="w-full max-w-[880px]">
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-base font-semibold tracking-[-0.01em] text-dls-text">Start with a Matterhorn workflow</p>
                        <p className="text-xs leading-5 text-dls-secondary">Choose a desk or start a blank chat. Every prompt stays editable before sending.</p>
                      </div>
                    </div>
                    <div className="matterhorn-session-start-list grid grid-cols-1 gap-1.5 lg:grid-cols-2">
                      {customerWorkflowStarterCards.map((item) => {
                        const Icon = CUSTOMER_WORKFLOW_ICON_COMPONENTS[item.iconHint];
                        const protocolLogo = ProtocolLogo({ iconHint: item.iconHint, size: 30 });
                        const capabilityItems = starterWorkflowCapabilityItems(item);
                        const capabilitySummary = capabilityItems.slice(0, 3).join(" · ");
                        return (
                          <button
                            key={item.id}
                            type="button"
                            style={deskToneStyle(item.iconHint)}
                            className="group grid min-h-[64px] min-w-0 grid-cols-[32px_minmax(0,1fr)] gap-2.5 rounded-md bg-dls-surface-muted/42 px-2.5 py-2 text-left transition-colors duration-150 hover:bg-[rgba(var(--matterhorn-desk-rgb),0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)]"
                            onClick={() => void typeComposerText(item.prompt)}
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center text-[var(--matterhorn-desk-color)]">
                              {protocolLogo ?? <Icon className="size-4" />}
                            </span>
                            <span className="grid min-w-0 gap-0.5">
                              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="min-w-0 truncate text-[13px] font-semibold leading-tight text-dls-text">{item.title}</span>
                                <span className="text-[11px] font-semibold text-[var(--matterhorn-desk-color)]">
                                  {item.statusLabel}
                                </span>
                              </span>
                              <span className="line-clamp-1 text-[12px] leading-5 text-dls-secondary">{item.description}</span>
                              <span className="hidden truncate text-[11px] leading-4 text-dls-muted sm:block">{capabilitySummary}</span>
                              <span className="text-[11px] font-semibold leading-4 text-[var(--matterhorn-desk-color)]">
                                Insert editable prompt
                              </span>
                            </span>
                            <span className="sr-only">{item.safetySummary}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null
            ) : (
              <DevProfiler id="SessionTranscript">
                <Suspense fallback={<div className="px-6 py-8 text-sm text-muted-foreground">Loading transcript...</div>}>
                  <SessionTranscript
                    messages={renderedMessages}
                    isStreaming={chatStreaming}
                    developerMode={props.developerMode}
                    showThinking={showThinking}
                    scrollElement={() => scrollRef.current}
                    onRevertToMessage={props.onRevertToMessage}
                    onForkAtMessage={props.onForkAtMessage}
                    openTargets={verifiedOpenTargets}
                    onOpenTarget={props.onOpenTarget}
                    footer={assistantStatusFooter}
                  />
                  {error ? (
                    <SessionErrorCard
                      error={error}
                      onDismiss={handleDismissError}
                      onChangeModel={props.onChangeModel}
                      onOpenModelPicker={props.onModelClick}
                    />
                  ) : null}
                </Suspense>
              </DevProfiler>
            )}
          </div>
        </div>
        {renderedMessages.length > 0 && hasTranscriptJumpTarget && (!sessionScroll.isAtBottom || (!chatStreaming && sessionScroll.topClippedMessageId)) ? (
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 justify-center">
            <div className="pointer-events-auto flex items-center gap-2 rounded-md bg-dls-surface/95 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-md">
              {!chatStreaming && sessionScroll.topClippedMessageId ? (
                <button
                  type="button"
                  className="rounded-full px-3 py-1.5 text-xs text-dls-text transition-colors hover:bg-dls-hover"
                  onClick={() => {
                    sessionScroll.jumpToStartOfMessage("smooth");
                  }}
                >
                  Jump to start
                </button>
              ) : null}
              {!sessionScroll.isAtBottom ? (
                <button
                  type="button"
                  className="rounded-full px-3 py-1.5 text-xs text-dls-text transition-colors hover:bg-dls-hover"
                  onClick={() => {
                    sessionScroll.jumpToLatest("smooth");
                  }}
                >
                  Jump to latest
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div ref={composerShellRef} className="shrink-0 bg-[linear-gradient(180deg,transparent,var(--dls-surface)_32%)] px-0 pb-3 pt-3">
        <DevProfiler id="SessionComposer">
        <ReactSessionComposer
          draft={draft}
          mentions={mentions}
          onDraftChange={handleComposerDraftChange}
        onSend={handleSend}
        onStop={handleAbort}
        busy={chatStreaming}
        disabled={model.transitionState !== "idle" || Boolean(props.modelUnavailable)}
        modelUnavailable={Boolean(props.modelUnavailable)}
        statusLabel={statusLabel(snapshot ?? undefined, chatStreaming)}
        modelPickerOpen={props.modelPickerOpen}
        selectedModel={props.selectedModel}
        onModelPickerOpenChange={props.onModelPickerOpenChange}
        onModelChange={props.onModelChange}
        attachments={attachments}
        onAttachFiles={handleAttachFiles}
        onRemoveAttachment={handleRemoveAttachment}
        attachmentsEnabled={props.attachmentsEnabled}
        attachmentsDisabledReason={props.attachmentsDisabledReason}
        modelVariantLabel={props.modelVariantLabel}
        modelVariant={props.modelVariant}
        modelBehaviorOptions={props.modelBehaviorOptions}
        onModelVariantChange={props.onModelVariantChange}
        agentLabel={props.agentLabel}
        selectedAgent={props.selectedAgent}
        listAgents={props.listAgents}
        onSelectAgent={props.onSelectAgent}
        listCommands={props.listCommands}
        listSkills={listSkills}
        skills={toolSkills}
        listMcp={listMcp}
        mcpServers={toolMcpServers}
        mcpStatus={toolMcpStatus}
        mcpStatuses={toolMcpStatuses}
        listImportedPlugins={listImportedPlugins}
        importedPlugins={toolImportedPlugins}
        onOpenSettingsSection={props.onOpenSettingsSection}
        recentFiles={props.recentFiles}
        searchFiles={props.searchFiles}
        onInsertMention={handleInsertMention}
        notice={notice}
        onNotice={setNotice}
        onPasteText={handlePasteText}
        onUnsupportedFileLinks={handleUnsupportedFileLinks}
        pastedText={pasteParts}
        onExpandPastedText={handleExpandPastedText}
        onRevealPastedText={handleRevealPastedText}
        onRemovePastedText={handleRemovePastedText}
        isRemoteWorkspace={props.isRemoteWorkspace}
          isSandboxWorkspace={props.isSandboxWorkspace}
          onUploadInboxFiles={props.onUploadInboxFiles ?? handleUploadInboxFiles}
          compactTopSpacing={hasComposerTopAccessory}
          topAccessory={
            hasComposerTopAccessory ? (
              <div>
                {props.activeQuestion ? (
                  <QuestionPanel
                    questions={props.activeQuestion.questions}
                    busy={props.questionReplyBusy ?? false}
                    onReply={(answers) => {
                      if (props.activeQuestion) {
                        props.respondQuestion?.(props.activeQuestion.id, answers);
                      }
                    }}
                  />
                ) : (
                  <TodoPanel todos={props.todos ?? []} />
                )}
                {props.activePermission ? (
                  <PermissionApprovalPanel
                    permission={props.activePermission}
                    busy={props.permissionReplyBusy}
                    respondPermission={props.respondPermission}
                    safeStringify={props.safeStringify}
                  />
                ) : null}
                {activeDeskMode ? (
                  <MatterhornDeskSessionStrip mode={activeDeskMode} />
                ) : null}
                {bittensorContext ? (
                  <BittensorContextStrip
                    context={bittensorContext}
                    onClear={() => {
                      clearBittensorContext(props.sessionId);
                      setNotice({ title: "Bittensor context cleared", tone: "info" });
                    }}
                  />
                ) : null}
                {memoryContext ? (
                  <MemoryContextStrip
                    context={memoryContext}
                    onClear={() => {
                      clearMemoryContext(props.sessionId);
                      setNotice({ title: "Memory context cleared", tone: "info" });
                    }}
                    onRemove={(recordId) => {
                      const nextRecords = memoryContext.records.filter((record) => record.id !== recordId);
                      if (!nextRecords.length) {
                        clearMemoryContext(props.sessionId);
                      } else {
                        setMemoryContext(props.sessionId, {
                          ...memoryContext,
                          records: nextRecords,
                          updatedAt: new Date().toISOString(),
                        });
                      }
                    }}
                  />
                ) : null}
              </div>
            ) : null
          }
        />
        </DevProfiler>
      </div>
      {/* Error display moved inline into the session conversation area */}
      {props.developerMode ? <SessionDebugPanel model={model} snapshot={snapshot} /> : null}
    </div>
    </DevProfiler>
  );
}
