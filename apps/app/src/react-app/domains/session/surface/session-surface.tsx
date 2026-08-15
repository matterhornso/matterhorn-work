/** @jsxImportSource react */
import type { CSSProperties } from "react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { useQuery } from "@tanstack/react-query";
import type { SessionStatus } from "@opencode-ai/sdk/v2/client";
import type { MatterhornExecutionMode } from "@matterhorn-work/types/execution-mode";
import type { MatterhornProviderPrivacyPolicy } from "@matterhorn-work/types/backend-models";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  BrainCircuit,
  Check,
  Database,
  Dumbbell,
  FileText,
  Info,
  Minimize2,
  ShieldCheck,
  Wallet as WalletIcon,
} from "lucide-react";

import { createClient, unwrap } from "../../../../app/lib/opencode";
import { abortSessionSafe, revertSession, unrevertSession } from "../../../../app/lib/opencode-session";
import { MATTERHORN_LAUNCH_FEATURES } from "../../../../app/lib/launch-features";
import {
  beginModelOperation,
  pendingModelOperation,
  recordModelOperationAccepted,
  recordModelOperationCancelled,
  recordModelOperationCompleted,
  recordModelOperationProviderError,
} from "../../../../app/lib/model-operation-metrics";
import { t } from "../../../../i18n";
import { readWorkspaceCloudImports, type CloudImportedPlugin } from "../../../../app/cloud/import-state";
import {
  MatterhornServerError,
  type MatterhornBittensorPublicReadEvidenceInput,
  type MatterhornServerClient,
  type MatterhornSessionSnapshot,
  type MatterhornSkillItem,
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
import type { ResponsePerspective } from "../perspectives/response-perspective";
import { decodeComposerMentionValue, encodeComposerMentionValue } from "./composer/mention-encoding";
import { DevProfiler } from "../../../shell/dev-profiler";
import { OwDotTicker } from "../../../shell/dot-ticker";
import { useShellConfig } from "../../../shell/shell-config";
import { useReactRenderWatchdog } from "../../../shell/react-render-watchdog";
import {
  AgentActivityOrb,
  type AgentActivityKind,
} from "../../../design-system/agent-activity-orb";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ReactComposerNotice } from "./composer/notice";
import { SessionDebugPanel } from "./debug-panel";
import { deriveRenderedSessionMessages, resolveRenderedSessionSnapshot } from "./session-render-state";
import { useLocal } from "../../../kernel/local-provider";
import { deriveSessionRenderModel } from "../sync/transition-controller";
import { useSessionScrollController } from "./scroll-controller";
import { resolveAssistantResponseRetryTurn, responseOutputTitle, runAssistantResponseRetry } from "./response-actions";
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

// These project-local tools are maintained for the Matterhorn Desks team, not
// workspace users. The server marks them as non-invocable; this list protects
// the customer-facing composer while an older local engine is still reloading.
const INTERNAL_ENGINEERING_SKILL_NAMES = new Set([
  "browser-automation",
  "daytona-dev",
  "daytona-electron-test",
  "release",
  "run-evals",
  "shadcn",
]);

function isCustomerFacingWorkspaceSkill(skill: MatterhornSkillItem): boolean {
  return skill.userInvocable !== false && !INTERNAL_ENGINEERING_SKILL_NAMES.has(skill.name.trim().toLowerCase());
}
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
import { getMatterhornMemoryPolicyDecision } from "../../memory/memory-policy";
import { useQuickJot } from "../../notes";
import type { BittensorPublicEvidenceCard } from "./message-list";
import { buildResultCardMemoryRecord } from "./result-card-memory";

const SessionTranscript = lazy(() => import("./message-list").then((module) => ({
  default: module.SessionTranscript,
})));
const SessionImageGenerationPanel = lazy(() =>
  import("../media/session-image-generation-panel").then((module) => ({
    default: module.SessionImageGenerationPanel,
  })),
);
import {
  buildCustomerWorkflowStarterCards,
  fetchCustomerWorkflowTemplates,
  type CustomerWorkflowIconHint,
  type CustomerWorkflowStarterCard,
} from "../workflows/customer-workflow-templates";
import {
  stageWorkflowRun,
  startWorkflowRun,
} from "../workflows/workflow-run-client";
import {
  deskToneStyle,
  getCustomerProtocolDeskVisual,
  getCustomerProtocolDeskVisualForLaunch,
} from "../workflows/protocol-desk-ui";
import { ProtocolDeskMark } from "../workflows/protocol-brand-logo";
import { DeskWorkflowStagePanel } from "../workflows/desk-workflow-stage-panel";
import { WorkflowStageCard } from "../workflows/workflow-stage-card";
import {
  groupMatterhornDeskTaskStarters,
  MATTERHORN_DESK_TASK_STARTERS,
  type MatterhornDeskTaskStarterDesk,
} from "../workflows/desk-task-starters";
import {
  reviewedActionHandoffFromComposer,
  reviewedActionPreparedChatText,
} from "../workflows/reviewed-action-command";
import { stageReviewedActionHandoff } from "../../wallet/reviewed-action-handoff";
import {
  getMatterhornDeskAgent,
  getMatterhornDeskAgentById,
  matterhornDeskAgentIdForDesk,
} from "@matterhorn-work/types/desk-agents";
import { WELLNESS_CREATOR_SERVICES_WORKFLOW } from "@matterhorn-work/types/matterhorn-workflows";

const EMPTY_TRANSCRIPT: UIMessage[] = [];

function bittensorEvidenceKindForCard(
  card: BittensorPublicEvidenceCard,
): NonNullable<MatterhornBittensorPublicReadEvidenceInput["kind"]> {
  const kind = `${card.kind ?? ""}`.toLowerCase();
  if (kind.includes("wallet") || kind.includes("balance")) return "wallet_snapshot";
  if (kind.includes("validator") || kind.includes("comparison")) return "validator_comparison";
  if (kind.includes("watch")) return "watch_digest";
  if (kind.includes("readiness") || kind.includes("adapter") || kind.includes("gate")) return "readiness_report";
  if (kind.includes("subnet") || kind.includes("discovery") || kind.includes("capability")) return "subnet_context";
  return "chat_result";
}

function publicBittensorEvidenceCard(card: BittensorPublicEvidenceCard): Record<string, unknown> {
  return Object.fromEntries(Object.entries({
    version: card.version,
    kind: card.kind,
    venue: card.venue,
    status: card.status,
    title: card.title,
    subtitle: card.subtitle,
    summary: card.summary,
    tone: card.tone,
    items: card.items,
    warnings: card.warnings,
    safety: card.safety,
  }).filter(([, value]) => value !== undefined && value !== null));
}
const IDLE_STATUS: SessionStatus = { type: "idle" };
const DEFAULT_COMPOSER_CONTROL_TEXT = "Help me outline the next Matterhorn task.";

const CUSTOMER_WORKFLOW_ICON_COMPONENTS: Record<CustomerWorkflowIconHint, typeof BrainCircuit> = {
  bittensor: BrainCircuit,
  hyperliquid: BarChart3,
  polymarket: ShieldCheck,
  sui: WalletIcon,
  wellness: Dumbbell,
  services: FileText,
  blank: FileText,
};

function ProtocolLogo({ iconHint, size = 18 }: { iconHint: CustomerWorkflowIconHint; size?: number }) {
  const visual = getCustomerProtocolDeskVisual(iconHint);
  if (!visual) return null;
  return <ProtocolDeskMark id={iconHint} visual={visual} size={size} />;
}

type MatterhornDeskMode = MatterhornDeskTaskStarterDesk;

function deriveMatterhornDeskMode(chunks: string[]): MatterhornDeskMode | null {
  const text = chunks.join("\n").toLowerCase();
  const candidates: Array<[MatterhornDeskMode, RegExp[]]> = [
    ["wellness", [/use the longevity desk/i, /start longevity workflow/i, /\blongevity workflow\b/i, /\blongevity desk\b/i, /offline optimization/i, /use the wellness workflow desk/, /start wellness workflow/, /\bwellness workflow\b/]],
    ["bittensor", [/bittensor task/i, /bittensor agent/i, /use the bittensor desk/i, /\bbittensor\b/i, /\bshow my tao\b/i, /\bsubnet\b/i, /\bss58\b/i]],
    ["hyperliquid", [/hyperliquid task/i, /hyperliquid agent/i, /use the hyperliquid desk/i, /\bhyperliquid\b/i, /\bbtc-perp\b/i, /\borderbook\b/i]],
    ["polymarket", [/polymarket task/i, /polymarket agent/i, /use the polymarket desk/i, /\bpolymarket\b/i, /\bpolymarket market\b/i, /\bcompliance\b/i]],
    ["sui", [/sui task/i, /sui agent/i, /use the sui desk/i, /\bsui wallet\b/i, /\bsui transfer\b/i, /\btransaction digest\b/i]],
  ];
  return candidates.find(([, patterns]) => patterns.some((pattern) => pattern.test(text)))?.[0] ?? null;
}

function MatterhornDeskSessionStrip({ mode }: { mode: MatterhornDeskMode }) {
  const copy = getCustomerProtocolDeskVisualForLaunch(
    mode,
    MATTERHORN_LAUNCH_FEATURES.reviewedDeskActions,
  );
  if (!copy) return null;
  const iconHint = copy.id as CustomerWorkflowIconHint;
  const Icon = CUSTOMER_WORKFLOW_ICON_COMPONENTS[iconHint];
  const agent = getMatterhornDeskAgent(mode);
  return (
    <div style={deskToneStyle(iconHint)} className="mb-1 rounded-lg bg-[rgb(var(--matterhorn-desk-rgb)/0.05)] px-3 py-2.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--matterhorn-desk-rgb)/0.12)] text-[var(--matterhorn-desk-color)]">
          {copy.id === "bittensor" || copy.id === "hyperliquid" || copy.id === "polymarket" ? (
            <ProtocolLogo iconHint={copy.id} size={22} />
          ) : (
            <Icon className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[12px] font-semibold text-dls-text">{copy.sessionTitle}</span>
            <span className="text-[10px] font-semibold text-[var(--matterhorn-desk-color)]">{agent?.displayName ?? copy.agentName}</span>
            <DeskSafetyInfoButton label={`${copy.displayName} desk safety info`} detail={copy.sessionBoundary} />
          </div>
          <p className="mt-1 text-[11px] leading-5 text-dls-secondary">{copy.shortDescription}</p>
        </div>
      </div>
    </div>
  );
}

function DeskSafetyInfoButton({ label, detail }: { label: string; detail: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-dls-muted transition-colors hover:bg-dls-surface-muted/40 hover:text-dls-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-dls-text/35"
          >
            <Info className="size-3.5" strokeWidth={1.55} aria-hidden="true" />
          </button>
        }
      />
      <PopoverContent
        side="right"
        align="start"
        className="w-72 rounded-lg border border-dls-border bg-dls-surface px-3 py-2 text-left text-xs leading-5 text-dls-secondary shadow-none"
      >
        <p>{detail}</p>
      </PopoverContent>
    </Popover>
  );
}

function MatterhornDeskFocusedEmptyState({
  mode,
  onUsePrompt,
}: {
  mode: MatterhornDeskMode;
  onUsePrompt: (prompt: string) => void | Promise<void>;
}) {
  const visual = getCustomerProtocolDeskVisualForLaunch(
    mode,
    MATTERHORN_LAUNCH_FEATURES.reviewedDeskActions,
  );
  const agent = getMatterhornDeskAgent(mode);
  const iconHint = (visual?.id ?? mode) as CustomerWorkflowIconHint;
  const Icon = CUSTOMER_WORKFLOW_ICON_COMPONENTS[iconHint] ?? FileText;
  const prompts = groupMatterhornDeskTaskStarters(MATTERHORN_DESK_TASK_STARTERS[mode], {
    reviewedActions: MATTERHORN_LAUNCH_FEATURES.reviewedDeskActions,
  }).flatMap((group) => group.starters);
  const boundary = !MATTERHORN_LAUNCH_FEATURES.reviewedDeskActions
    ? "Public Beta keeps this desk read-only. Research, monitoring, and public evidence remain available; transaction preparation and wallet actions stay hidden."
    : mode === "bittensor"
      ? "Uses public wallet details and prepares transaction drafts. You approve TAO transfers, staking, and unstaking in your wallet; unsupported advanced calls stay unavailable."
      : mode === "wellness"
        ? "Standalone longevity workflow. Educational only, non-medical, and no live payments/email/hosting."
        : mode === "polymarket"
          ? "Runs market research and compliance checks, then prepares supported buy, sell, or cancel actions for exact connected-wallet approval."
          : mode === "sui"
            ? "Runs public Sui account reads and transfer previews. Signing stays in your Sui wallet or external client."
            : "Agent tasks run market and account checks and prepare order context, but cannot submit. Manual execution is available only in the Hyperliquid panel after exact review and connected-wallet approval.";

  return (
    <div
      className="min-w-0 w-full px-2 py-3 sm:px-3 sm:py-4"
      style={deskToneStyle(iconHint)}
    >
      <section className="w-full space-y-3">
        <div className="matterhorn-desk-session-hero overflow-hidden rounded-xl bg-[rgb(var(--matterhorn-desk-rgb)/0.08)] px-3.5 py-3.5 sm:px-4 sm:py-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--matterhorn-desk-rgb)/0.14)] text-[var(--matterhorn-desk-color)]">
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
                  {visual?.shortDescription ?? "Focused Matterhorn desk."} Choose a starter below to run
                  {` ${agent?.displayName ?? visual?.agentName ?? "this desk agent"}`} in a new chat.
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <DeskSafetyInfoButton label={`${visual?.displayName ?? mode} desk safety info`} detail={boundary} />
            </div>
          </div>
        </div>

        <div className="matterhorn-desk-session-prompts overflow-hidden rounded-xl bg-dls-surface/44" aria-label="Chat starters">
          {prompts.map((item) => (
            <button
              key={item.id}
              type="button"
              className="group grid w-full grid-cols-[minmax(0,1fr)] gap-2 px-3.5 py-3 text-left transition duration-150 hover:bg-[rgb(var(--matterhorn-desk-rgb)/0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              onClick={() => void onUsePrompt(item.prompt)}
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-dls-text">{item.title}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-dls-secondary">{item.detail}</span>
              </span>
              <span className="text-[12px] font-semibold text-[var(--matterhorn-desk-color)]">
                Start task
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function LongevityDeskEmptyState({
  onUsePrompt,
}: {
  onUsePrompt: (prompt: string) => void | Promise<void>;
}) {
  const visual = getCustomerProtocolDeskVisual("wellness");
  const Icon = CUSTOMER_WORKFLOW_ICON_COMPONENTS.wellness;
  const stagePrompts = MATTERHORN_DESK_TASK_STARTERS.wellness;

  const pathChoices = [
    {
      label: "For myself",
      prompt:
        "Start a new longevity program for myself — here is my audience, goal, constraints, session type, duration, equipment, and level",
    },
    {
      label: "For clients",
      prompt:
        "Start a new longevity program for my clients — here is the audience, goal, constraints, session type, duration, equipment, and level",
    },
    {
      label: "For a coaching offer",
      prompt:
        "Package this as a service: offer page copy, pricing-package draft, onboarding questionnaire, and terms/disclaimer text",
    },
    { label: "For a reusable workflow", prompt: "Export this as a Matterhorn workflow / MCP artifact" },
  ];

  const gallery = [
    { title: "Service offer page", detail: "Offer page + pricing draft", prompt: "create an offer page for my coaching" },
    {
      title: "Onboarding questionnaire",
      detail: "New-client intake",
      prompt: "create an onboarding questionnaire for a new client",
    },
    { title: "4-week program", detail: "Beginner training plan", prompt: "create a 4-week training plan for a beginner" },
    { title: "Weekly check-in form", detail: "Client progress check-in", prompt: "create a weekly client check-in form" },
    { title: "Progress summary", detail: "Review client progress", prompt: "summarize my client's progress so far" },
    { title: "Renewal / follow-up", detail: "Renewal note draft", prompt: "write a renewal follow-up message for my client" },
    { title: "Client handoff packet", detail: "Exportable packet", prompt: "create a client handoff packet" },
  ];

  return (
    <div className="min-w-0 w-full px-2 py-3 sm:px-3 sm:py-4" style={deskToneStyle("wellness")}>
      <section className="w-full space-y-3">
        <div className="matterhorn-desk-session-hero overflow-hidden rounded-xl bg-[rgb(var(--matterhorn-desk-rgb)/0.08)] px-3.5 py-3.5 sm:px-4 sm:py-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--matterhorn-desk-rgb)/0.14)] text-[var(--matterhorn-desk-color)]">
                {visual ? <ProtocolLogo iconHint="wellness" size={34} /> : <Icon className="size-5" />}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-dls-text sm:text-lg">
                    Longevity Creator
                  </h2>
                  <span className="text-[11px] font-semibold text-[var(--matterhorn-desk-color)]">
                    {visual?.statusLabel ?? "Workflow-ready"}
                  </span>
                </div>
                <p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-dls-secondary">
                  Build a personal longevity routine, training plan, yoga/mobility plan, nutrition-education template,
                  weekly check-in, habit/recovery tracker, client packet, or offer page. The Longevity Agent keeps the
                  workflow separate from markets and wallets.
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <DeskSafetyInfoButton
                label="Longevity workflow info"
                detail="Standalone workflow. Educational only, non-medical, and no live payments, email, or hosting."
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[12px] font-semibold text-dls-text">I want to build…</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {pathChoices.map((choice) => (
              <button
                key={choice.label}
                type="button"
                onClick={() => void onUsePrompt(choice.prompt)}
                className="rounded-md bg-dls-surface-muted/42 px-2.5 py-2 text-left text-[12px] font-medium text-dls-text transition-colors hover:bg-[rgb(var(--matterhorn-desk-rgb)/0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)]"
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="matterhorn-desk-session-prompts overflow-hidden rounded-xl bg-dls-surface/44"
          aria-label="Longevity workflow stages"
        >
          {stagePrompts.map((item) => (
            <div
              key={item.id}
              className="group grid w-full grid-cols-1 items-center gap-2 px-3.5 py-2.5 text-left sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]"
            >
              <span className="text-[13px] font-semibold text-dls-text">{item.title}</span>
              <span className="text-[11px] leading-4 text-dls-secondary">{item.detail}</span>
              <button
                type="button"
                onClick={() => void onUsePrompt(item.prompt)}
                className="rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--matterhorn-desk-color)] transition-colors hover:bg-[rgb(var(--matterhorn-desk-rgb)/0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)]"
              >
                Stage task
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <p className="text-[12px] font-semibold text-dls-text">Quick artifact gallery</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {gallery.map((card) => (
              <button
                key={card.title}
                type="button"
                onClick={() => void onUsePrompt(card.prompt)}
                className="group flex items-center justify-between rounded-md bg-dls-surface-muted/42 px-3 py-2 text-left transition-colors hover:bg-[rgb(var(--matterhorn-desk-rgb)/0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)]"
              >
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-dls-text">{card.title}</span>
                  <span className="text-[11px] leading-4 text-dls-secondary">{card.detail}</span>
                </span>
                <span className="text-[11px] font-semibold text-[var(--matterhorn-desk-color)]">Insert</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-[rgb(var(--matterhorn-desk-rgb)/0.24)] bg-[rgb(var(--matterhorn-desk-rgb)/0.06)] px-3 py-2.5">
          <p className="text-[11px] leading-4 text-dls-secondary">
            <span className="font-semibold text-dls-text">Safety boundary:</span> Educational only, not medical advice.
            No diagnosis, prescription, treatment, or guaranteed outcomes. Storage/hosting, payments, email, and
            identity/access hooks are planned, not live.
          </p>
        </div>
      </section>
    </div>
  );
}

function LongevityWorkflowStagePreview() {
  const manifest = WELLNESS_CREATOR_SERVICES_WORKFLOW;
  return (
    <section aria-label="Standardized Longevity workflow">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-dls-text">Longevity workflow</p>
        <p className="text-[11px] text-dls-muted">{manifest.steps.length} stages</p>
      </div>
      <div className="space-y-2">
        {manifest.steps.map((stage) => (
          <WorkflowStageCard
            key={stage.id}
            title={stage.name}
            objective={stage.description}
            status="idle"
            outputs={stage.outputArtifactIds
              .map((id) => manifest.generatedArtifacts.find((a) => a.id === id))
              .filter(Boolean)
              .map((a) => ({ name: a!.name, description: a!.description }))}
          />
        ))}
      </div>
    </section>
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
    return ["Orderbook reads", "Exposure context", "External trade handoff"];
  }
  if (item.panel === "polymarket") {
    return ["Market research", "Compliance checks", "Trade handoff"];
  }
  if (item.iconHint === "wellness") {
    return ["Service packets", "Client check-ins", "Non-medical workflow"];
  }
  return ["Free-form chat", "Editable prompt", "No auto-send"];
}

type SessionError = {
  message: string;
  detail?: string;
  kind?: "model-not-found" | "provider-unavailable" | "privacy-blocked" | "cancelled" | "generic";
  retryable?: boolean;
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
  onOpenAiProviders?: () => void;
  onOpenPrivacyDetails?: () => void;
  modelPickerOpen: boolean;
  modelUnavailable?: boolean;
  selectedModel: ModelRef;
  providerPrivacyPolicy?: MatterhornProviderPrivacyPolicy | null;
  onModelPickerOpenChange: (open: boolean) => void;
  onModelChange: (model: ModelRef) => void;
  onSendDraft: (draft: ComposerDraft) => Promise<void> | void;
  onDraftChange: (draft: ComposerDraft) => void;
  attachmentsEnabled: boolean;
  attachmentsDisabledReason: string | null;
  modelBehaviorTitle: string;
  modelVariantLabel: string;
  modelVariant: string | null;
  modelBehaviorOptions?: { value: string | null; label: string; description?: string }[];
  modelBehaviorIsProviderDefault: boolean;
  modelBehaviorDefaultLabel: string;
  onModelVariantChange: (value: string | null) => void;
  responsePerspective: ResponsePerspective;
  onResponsePerspectiveChange: (perspective: ResponsePerspective) => void;
  executionMode: MatterhornExecutionMode;
  executionModesEnabled: boolean;
  onExecutionModeChange: (mode: MatterhornExecutionMode) => void;
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
  connectedProviderIds?: string[];
  onOpenSettingsSection?: ((section: "commands" | "skills" | "mcps" | "extensions" | "plugins") => void) | undefined;
  onRevertToMessage?: (messageId: string) => void;
  onForkAtMessage?: (messageId: string) => void;
  onOpenTarget?: (target: OpenTarget, options?: { auto?: boolean }) => void;
  onOpenTargetsChange?: (targets: OpenTarget[]) => void;
  onCreateDeskTask?: (
    prompt: string,
    options?: {
      title?: string;
      agent?: string;
      sendImmediately?: boolean;
      onSessionCreated?: (sessionId: string) => void | Promise<void>;
    },
  ) => boolean | void | Promise<boolean | void>;
  onSessionMissing?: () => void;
};

function messageToReadableText(message: UIMessage) {
  const header = message.role === "user" ? "You" : message.role === "assistant" ? "Matterhorn Desks" : message.role;
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

function outputTargetName(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? "Saved response.md";
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

function formatAssistantRunElapsed(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function AssistantWaitingCard({
  label = t("session.assistant_thinking"),
  activity = "planning",
  size = 20,
  collapseLayout = false,
  startedAt,
  trackElapsed = true,
}: {
  label?: string;
  activity?: AgentActivityKind;
  size?: 20 | 64;
  collapseLayout?: boolean;
  startedAt?: number;
  trackElapsed?: boolean;
}) {
  const mountedAtRef = useRef(Date.now());
  const resolvedStartedAt = startedAt ?? mountedAtRef.current;
  const [now, setNow] = useState(() => Date.now());
  const elapsedSeconds = trackElapsed
    ? Math.max(0, Math.floor((now - resolvedStartedAt) / 1000))
    : 0;

  useEffect(() => {
    if (!trackElapsed) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [resolvedStartedAt, trackElapsed]);

  const prominent = size === 64;
  const content = (
    <div
      className={prominent ? "flex flex-col items-center gap-3 text-center" : "space-y-0.5"}
      role="status"
      aria-live="polite"
      aria-label={`${t("composer.assistant_identity")} ${label}`}
    >
      {prominent ? <AgentActivityOrb activity={activity} size={64} /> : null}
      <div className={prominent ? "flex justify-center" : "flex justify-start"}>
        <div className="inline-flex items-center gap-1.5 px-1 py-1 text-[12px] text-dls-secondary">
          {!prominent ? <AgentActivityOrb activity={activity} size={20} /> : null}
          <span className="font-medium text-dls-text">{t("composer.assistant_identity")}</span>
          <span>{label}</span>
          {elapsedSeconds >= 10 ? (
            <span className="tabular-nums text-dls-secondary/75" aria-hidden="true">
              · {formatAssistantRunElapsed(elapsedSeconds)}
            </span>
          ) : null}
        </div>
      </div>
      {elapsedSeconds >= 30 ? (
        <div className={prominent ? "text-[11px] leading-4 text-dls-secondary/80" : "ml-[26px] text-[11px] leading-4 text-dls-secondary/80"}>
          Taking longer than usual. You can stop this run at any time.
        </div>
      ) : null}
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
      <AssistantWaitingCard
        label={t("session.assistant_responding")}
        activity="composing"
        collapseLayout
        trackElapsed={false}
      />
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

export function parseSessionError(thrown: unknown): SessionError {
  const raw = thrown instanceof Error ? thrown.message : String(thrown);
  let parsed: unknown;
  // Try to detect ProviderModelNotFoundError from the SDK error shape.
  // The error message may be a JSON string from our serializer in session-route.
  try {
    parsed = JSON.parse(raw);
    const parsedRecord = parsed as {
      name?: unknown;
      data?: {
        providerID?: unknown;
        modelID?: unknown;
        suggestions?: unknown;
      };
    };
    if (parsedRecord?.name === "ProviderModelNotFoundError" && parsedRecord?.data) {
      const { providerID, modelID, suggestions } = parsedRecord.data;
      if (typeof providerID !== "string" || typeof modelID !== "string") {
        throw new Error("ProviderModelNotFoundError omitted its model reference.");
      }
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
  const diagnostic = `${raw}\n${parsed ? JSON.stringify(parsed) : ""}`;
  if (/provider_privacy_unverified/i.test(diagnostic)) {
    return {
      message: "ASI:Cloud is not ready to receive prompts.",
      detail:
        "Matterhorn has the API key, but this deployment has not finished verifying the provider's training and retention policy. No prompt was sent.",
      kind: "privacy-blocked",
      retryable: false,
    };
  }
  if (/no provider available|provider.{0,72}(?:not available|unavailable|not configured|not authenticated)/i.test(diagnostic)) {
    return {
      message: "This model is not ready in this workspace.",
      detail: "Your message is still in the composer. Connect a provider or choose another model, then send it again.",
      kind: "provider-unavailable",
    };
  }
  if (/TimeoutError|timed out|timeout|response deadline|stalled stream|AbortSignal\.timeout/i.test(diagnostic)) {
    return {
      message: "The model took too long to respond.",
      detail: "Matterhorn stopped the stalled request. Your prompt is preserved—retry once, or choose another model if it happens again.",
      kind: "generic",
      retryable: true,
    };
  }
  if (/OpenCode|opencode_(?:request_failed|empty_response|invalid_response)/i.test(diagnostic)) {
    return {
      message: "Matterhorn's workspace engine could not complete this request.",
      detail: "Your prompt is still available. Retry when the workspace engine reconnects.",
      kind: "generic",
      retryable: true,
    };
  }
  // Check if the raw string mentions model-not-found patterns
  if (/ProviderModelNotFoundError/i.test(raw) || /model.*not found/i.test(raw)) {
    return {
      message: "The selected model is not available.",
      detail: "Choose another model or reconnect its provider. Your prompt is still available.",
      kind: "model-not-found",
    };
  }
  return {
    message: raw || "Failed to send prompt.",
    kind: "generic",
    retryable: true,
  };
}

export function latestSessionSnapshotFailure(snapshot: MatterhornSessionSnapshot | null) {
  if (!snapshot) return null;
  const assistantMessage = [...snapshot.messages]
    .reverse()
    .find((message) => message.info.role === "assistant");
  if (!assistantMessage || assistantMessage.info.role !== "assistant" || !assistantMessage.info.error) return null;

  const rawError = assistantMessage.info.error as unknown as {
    name?: unknown;
    data?: { message?: unknown; responseBody?: unknown; statusCode?: unknown };
  };
  const name = typeof rawError.name === "string" ? rawError.name : "AssistantResponseError";
  const detail = typeof rawError.data?.message === "string" ? rawError.data.message.trim() : "";
  const normalizedError = parseSessionError(JSON.stringify(rawError));
  const retryMessage = [...snapshot.messages]
    .reverse()
    .find((message) => message.info.role === "user")
    ?.parts.flatMap((part) => part.type === "text" ? [part.text] : [])
    .join("\n")
    .trim() ?? "";

  return {
    id: assistantMessage.info.id,
    name,
    completedAt: assistantMessage.info.time.completed ?? assistantMessage.info.time.created,
    retryMessage,
    error: name === "MessageAbortedError"
      ? {
          message: "Generation stopped. Your prompt is still available to edit or send again.",
          kind: "cancelled",
        } satisfies SessionError
      : normalizedError.kind === "provider-unavailable" || normalizedError.kind === "model-not-found" || normalizedError.kind === "privacy-blocked"
        ? normalizedError
        : {
            message: detail || "Matterhorn could not complete this response. Your prompt is ready to retry.",
            kind: "generic",
            retryable: true,
          } satisfies SessionError,
  };
}

function SessionErrorCard({ error, onDismiss, onRetry, retrying, onChangeModel, onOpenModelPicker, onOpenAiProviders, onOpenPrivacyDetails }: {
  error: SessionError;
  onDismiss: () => void;
  onRetry?: () => void | Promise<void>;
  retrying?: boolean;
  onChangeModel?: (model: { providerID: string; modelID: string }) => void;
  onOpenModelPicker?: () => void;
  onOpenAiProviders?: () => void;
  onOpenPrivacyDetails?: () => void;
}) {
  const cancelled = error.kind === "cancelled";
  return (
    <div className="mx-auto max-w-[720px] px-3 py-3 sm:px-5">
      <div
        role={cancelled ? "status" : "alert"}
        aria-atomic="true"
        className={cn(
          "rounded-lg px-5 py-4 ring-1",
          cancelled
            ? "bg-dls-surface-muted/[0.16] ring-dls-border/35"
            : "bg-red-3/15 ring-red-6/25",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className={cn("text-sm font-medium", cancelled ? "text-dls-text" : "text-red-11")}>{error.message}</div>
            {error.detail ? (
              <p className={cn("mt-1 text-xs leading-5", cancelled ? "text-dls-secondary" : "text-red-11/80")}>
                {error.detail}
              </p>
            ) : null}
            {error.kind === "provider-unavailable" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {onOpenAiProviders ? (
                  <button
                    type="button"
                    className="rounded-md bg-dls-accent px-3 py-1.5 text-xs font-semibold text-[var(--dls-accent-fg)] transition-colors hover:bg-[var(--dls-accent-hover)]"
                  onClick={() => {
                    onOpenAiProviders();
                    onDismiss();
                  }}
                >
                    Set up provider
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-md bg-dls-surface-muted/35 px-3 py-1.5 text-xs font-medium text-dls-text transition-colors hover:bg-dls-hover"
                  onClick={() => {
                    onOpenModelPicker?.();
                    onDismiss();
                  }}
                >
                  Choose another model
                </button>
              </div>
            ) : null}
            {error.kind === "privacy-blocked" && onOpenPrivacyDetails ? (
              <div className="mt-3">
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center rounded-md bg-dls-accent px-3 text-xs font-semibold text-[var(--dls-accent-fg)] transition-colors hover:bg-[var(--dls-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.32)]"
                  onClick={() => {
                    onOpenPrivacyDetails();
                    onDismiss();
                  }}
                >
                  Review privacy
                </button>
              </div>
            ) : null}
            {error.kind === "model-not-found" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {error.suggestions && error.suggestions.length > 0 ? (
                  error.suggestions.map((s) => (
                    <button
                      key={`${s.providerID}/${s.modelID}`}
                      type="button"
                      className="rounded-md bg-dls-surface-muted/35 px-3 py-1.5 text-xs font-medium text-dls-text transition-colors hover:bg-dls-hover"
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
                  className="rounded-md bg-dls-surface-muted/35 px-3 py-1.5 text-xs font-medium text-dls-text transition-colors hover:bg-dls-hover"
                  onClick={() => {
                    onOpenModelPicker?.();
                    onDismiss();
                  }}
                >
                  Change model
                </button>
              </div>
            ) : null}
            {error.retryable && onRetry ? (
              <div className="mt-3">
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center rounded-md bg-dls-accent px-3 text-xs font-semibold text-[var(--dls-accent-fg)] transition-colors hover:bg-[var(--dls-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.32)] disabled:cursor-wait disabled:opacity-60"
                  onClick={() => void onRetry()}
                  disabled={retrying}
                >
                  {retrying ? "Retrying…" : "Retry response"}
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={cn(
              "shrink-0 rounded-full p-1 transition-colors",
              cancelled
                ? "text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
                : "text-red-10 hover:bg-red-3 hover:text-red-11",
            )}
            onClick={onDismiss}
            aria-label={cancelled ? "Dismiss stopped status" : "Dismiss error"}
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
    <div className="border-b border-dls-border bg-[rgb(var(--matterhorn-blue-rgb)/0.08)] px-4 py-2">
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
  const { openQuickJot } = useQuickJot();
  const { config: shellConfig } = useShellConfig();
  const showThinking = local.prefs.showThinking;
  const sessionActivityStatus = useSessionActivityStore(
    (state) => state.statusesByWorkspaceId[props.workspaceId]?.[props.sessionId] ?? "idle",
  );
  const sessionActivityRecord = useSessionActivityStore(
    (state) => state.recordsByWorkspaceId[props.workspaceId]?.[props.sessionId] ?? null,
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
  const [localReviewedActionMessages, setLocalReviewedActionMessages] = useState<UIMessage[]>([]);
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
  const handledTerminalFailureRef = useRef<string | null>(null);
  const reconciledUsageMessageIdsRef = useRef(new Set<string>());
  const suppressNextAbortFailureRef = useRef(false);
  const opencodeClient = useMemo(
    () => createClient(props.opencodeBaseUrl, undefined, {
      token: props.matterhornToken,
      mode: "matterhorn",
      executionMode: props.executionMode,
    }),
    [props.executionMode, props.matterhornToken, props.opencodeBaseUrl],
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
    retry: (failureCount, error) => !(error instanceof MatterhornServerError && error.status === 404) && failureCount < 2,
  });
  const sessionMissing = snapshotQuery.error instanceof MatterhornServerError && snapshotQuery.error.status === 404;
  useEffect(() => {
    if (sessionMissing) props.onSessionMissing?.();
  }, [props.onSessionMissing, sessionMissing]);
  const customerWorkflowTemplatesQuery = useQuery({
    queryKey: ["matterhorn-customer-workflow-templates"],
    queryFn: fetchCustomerWorkflowTemplates,
    staleTime: 60_000,
  });
  const customerWorkflowStarterCards = useMemo(
    () => buildCustomerWorkflowStarterCards(customerWorkflowTemplatesQuery.data, {
      reviewedActions: MATTERHORN_LAUNCH_FEATURES.reviewedDeskActions,
    })
      .filter((card) => card.id !== "blank_chat_workflow"),
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
    setLocalReviewedActionMessages([]);
    // Composer draft state lives in the shared store keyed by session id, so
    // switching sessions preserves each session's own in-progress composer.
    setNotice(null);
    autoOpenedTargetRef.current = null;
    initializedAutoOpenSessionRef.current = null;
    handledTerminalFailureRef.current = null;
    suppressNextAbortFailureRef.current = false;
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
    const key = `${props.sessionId}:${currentSnapshot.session.time?.updated ?? currentSnapshot.session.time?.created ?? 0}:${currentSnapshot.messages.length}`;
    if (hydratedKeyRef.current === key) return;
    hydratedKeyRef.current = key;
    const id = window.setTimeout(() => {
      seedSessionState(props.workspaceId, currentSnapshot);
    }, 0);
    return () => window.clearTimeout(id);
  }, [props.sessionId, currentSnapshot, props.workspaceId]);

  useEffect(() => {
    if (!currentSnapshot) return;
    const operation = pendingModelOperation(props.sessionId);
    if (!operation) return;
    const completedAssistant = currentSnapshot.messages.find((message) => (
      message.info.role === "assistant" &&
      !message.info.error &&
      typeof message.info.time.completed === "number" &&
      message.info.time.created >= operation.startedAt - 1_000
    ));
    if (!completedAssistant || completedAssistant.info.role !== "assistant") return;
    recordModelOperationCompleted(operation, {
      completedAt: completedAssistant.info.time.completed,
      tokens: completedAssistant.info.tokens,
    });
    if (reconciledUsageMessageIdsRef.current.has(completedAssistant.info.id)) return;
    reconciledUsageMessageIdsRef.current.add(completedAssistant.info.id);
    void props.client.reconcileWorkspaceModelUsage(props.workspaceId, {
      sessionId: props.sessionId,
    }).catch(() => {
      reconciledUsageMessageIdsRef.current.delete(completedAssistant.info.id);
    });
  }, [currentSnapshot, props.client, props.sessionId, props.workspaceId]);

  const snapshot = resolveRenderedSessionSnapshot({
    sessionId: props.sessionId,
    currentSnapshot,
    cachedRendered: rendered,
  });
  const liveStatus = statusState ?? snapshot?.status ?? IDLE_STATUS;
  const waitingForUser = Boolean(props.activeQuestion || props.activePermission);
  const chatStreaming = !waitingForUser && (
    sending ||
    liveStatus.type === "busy" ||
    liveStatus.type === "retry" ||
    sessionActivityStatus === "thinking" ||
    sessionActivityStatus === "responding"
  );

  useEffect(() => {
    if (!chatStreaming) return;
    const id = window.setInterval(() => {
      void snapshotQuery.refetch();
    }, 2_000);
    return () => window.clearInterval(id);
  }, [chatStreaming, snapshotQuery.refetch]);
  const renderedMessages = useMemo(
    () => [
      ...deriveRenderedSessionMessages({ transcriptState, snapshot }),
      ...localReviewedActionMessages,
    ],
    [localReviewedActionMessages, snapshot, transcriptState],
  );
  const linkedWorkflowRunQuery = useQuery({
    queryKey: ["session-workflow-run", props.workspaceId, props.sessionId],
    enabled: Boolean(props.workspaceId && props.sessionId),
    staleTime: 500,
    queryFn: async () => (
      await props.client.listWorkflowRuns({
        workspaceId: props.workspaceId,
        sessionId: props.sessionId,
        limit: 1,
      })
    ).items[0] ?? null,
  });
  const linkedWorkflowRun = linkedWorkflowRunQuery.data ?? null;
  const workflowLifecycleMutationRef = useRef<string | null>(null);
  const hasVisibleAssistantMessage = useMemo(
    () => renderedMessages.some((message) => message.role === "assistant" && messageHasVisibleAssistantOutput(message)),
    [renderedMessages],
  );
  useEffect(() => {
    if (!linkedWorkflowRun) return;
    let target: "waiting" | "running" | "completed" | null = null;
    let operation: (() => Promise<unknown>) | null = null;

    if (waitingForUser && linkedWorkflowRun.status === "running") {
      target = "waiting";
      operation = () => props.client.setWorkflowRunWaiting(
        linkedWorkflowRun.workflowRunId,
        props.activeQuestion ? "Waiting for answers" : "Waiting for approval",
      );
    } else if (!waitingForUser && chatStreaming && linkedWorkflowRun.status === "waiting") {
      target = "running";
      operation = () => props.client.startWorkflowRun(linkedWorkflowRun.workflowRunId);
    } else if (
      !waitingForUser &&
      !chatStreaming &&
      linkedWorkflowRun.status === "running" &&
      hasVisibleAssistantMessage
    ) {
      target = "completed";
      operation = () => props.client.completeWorkflowRun(linkedWorkflowRun.workflowRunId);
    }

    if (!target || !operation) return;
    const mutationKey = `${linkedWorkflowRun.workflowRunId}:${target}`;
    if (workflowLifecycleMutationRef.current === mutationKey) return;
    workflowLifecycleMutationRef.current = mutationKey;
    void operation()
      .then(() => linkedWorkflowRunQuery.refetch())
      .catch(() => undefined)
      .finally(() => {
        if (workflowLifecycleMutationRef.current === mutationKey) {
          workflowLifecycleMutationRef.current = null;
        }
      });
  }, [
    chatStreaming,
    hasVisibleAssistantMessage,
    linkedWorkflowRun,
    linkedWorkflowRunQuery,
    props.activePermission,
    props.activeQuestion,
    props.client,
  ]);
  const activeDeskMode = useMemo(
    () => deriveMatterhornDeskMode([
      draft,
      ...renderedMessages
        .filter((message) => message.role === "user")
        .map(messageToReadableText),
    ]),
    [draft, renderedMessages],
  );
  const activeWorkflowDeskAgent = useMemo(() => {
    if (linkedWorkflowRun?.agentId) return getMatterhornDeskAgentById(linkedWorkflowRun.agentId);
    if (activeDeskMode) return getMatterhornDeskAgent(activeDeskMode);
    return getMatterhornDeskAgentById(props.selectedAgent);
  }, [activeDeskMode, linkedWorkflowRun?.agentId, props.selectedAgent]);
  const activeDeskReadinessQuery = useQuery({
    queryKey: ["session-desk-readiness", props.workspaceId, activeDeskMode],
    enabled: Boolean(activeDeskMode && props.workspaceId),
    staleTime: 30_000,
    queryFn: async () => props.client.workspaceReadiness(props.workspaceId),
  });
  const activeDeskStartFeature = activeDeskReadinessQuery.data?.features.start_desk_task;
  const activeDeskStartBlocked = Boolean(activeDeskMode && activeDeskStartFeature && !activeDeskStartFeature.ready);
  const activeDeskStartBlocker = activeDeskStartBlocked
    ? `Start task needs ${activeDeskStartFeature?.blockingCheckIds
      .map((checkId) => activeDeskReadinessQuery.data?.checks[checkId]?.label ?? checkId)
      .join(", ")}.`
    : null;
  useEffect(() => {
    const deskAgentId = linkedWorkflowRun?.agentId ?? matterhornDeskAgentIdForDesk(activeDeskMode);
    if (!deskAgentId || props.selectedAgent === deskAgentId) return undefined;
    const id = window.setTimeout(() => {
      props.onSelectAgent(deskAgentId);
    }, 0);
    return () => window.clearTimeout(id);
  }, [activeDeskMode, linkedWorkflowRun?.agentId, props.onSelectAgent, props.selectedAgent]);
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
  const optimisticRunTitle = sessionActivityRecord?.optimisticRunTitle?.trim();
  const assistantActivityLabel = optimisticRunTitle && effectiveActivityStatus === "thinking"
    ? `Working on ${optimisticRunTitle}`
    : getSessionActivityStatusLabel(effectiveActivityStatus);
  const assistantOrbActivity: AgentActivityKind | null = effectiveActivityStatus === "thinking"
    ? "planning"
    : effectiveActivityStatus === "responding"
      ? "composing"
      : effectiveActivityStatus === "compacting"
        ? "synthesizing"
        : null;
  const showNoVisibleAssistantOutput = noVisibleAssistantOutputBaseline !== null && !assistantOutputAfterNoVisibleFallback;
  const reserveAssistantStatusSpace = effectiveActivityStatus === "idle" && awaitingAssistantBaseline !== null && assistantOutputAfterAwaitStart && !chatStreaming;
  const assistantStatusFooter = assistantOrbActivity ? (
    <AssistantWaitingCard
      label={assistantActivityLabel}
      activity={assistantOrbActivity}
      collapseLayout
      startedAt={sessionActivityRecord?.runStartedAt}
    />
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
    let cancelled = false;
    const id = window.setTimeout(() => {
      const showEmptyResponseFallback = () => {
        if (cancelled) return;
        setNoVisibleAssistantOutputBaseline(awaitingAssistantBaseline);
        setAwaitingAssistantBaseline(null);
      };
      void snapshotQuery.refetch()
        .then(({ data }) => {
          if (latestSessionSnapshotFailure(data ?? null)) return;
          showEmptyResponseFallback();
        })
        .catch(showEmptyResponseFallback);
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [assistantOutputAfterAwaitStart, awaitingAssistantBaseline, liveStatus.type, renderedMessages.length, sending, snapshotQuery]);

  const model = deriveSessionRenderModel({
    intendedSessionId: props.sessionId,
    renderedSessionId: renderedMessages.length > 0 || snapshot ? props.sessionId : null,
    hasSnapshot: Boolean(snapshot) || renderedMessages.length > 0,
    isFetching: snapshotQuery.isFetching,
    isError: snapshotQuery.isError,
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
    if (!currentSnapshot) return;
    const failure = latestSessionSnapshotFailure(currentSnapshot);
    if (!failure || handledTerminalFailureRef.current === failure.id) return;
    const runStartedAt = sessionActivityRecord?.runStartedAt;
    if (runStartedAt && failure.completedAt < runStartedAt - 500) return;

    handledTerminalFailureRef.current = failure.id;
    setSending(false);
    setAwaitingAssistantBaseline(null);
    setNoVisibleAssistantOutputBaseline(null);
    const activity = useSessionActivityStore.getState();
    activity.setRunStatus(props.workspaceId, props.sessionId, { type: "idle" });

    if (failure.name === "MessageAbortedError" && suppressNextAbortFailureRef.current) {
      suppressNextAbortFailureRef.current = false;
      activity.clearError(props.workspaceId, props.sessionId);
      return;
    }

    const operation = pendingModelOperation(props.sessionId);
    if (operation) {
      recordModelOperationProviderError(operation, { name: failure.name });
    }
    setError(failure.error);
    activity.setError(props.workspaceId, props.sessionId);
    if (failure.retryMessage && !draft.trim()) {
      setComposerDraft(props.sessionId, failure.retryMessage);
      props.onDraftChange(buildDraft(failure.retryMessage, []));
    }
  }, [
    awaitingAssistantBaseline,
    buildDraft,
    chatStreaming,
    currentSnapshot,
    draft,
    props.onDraftChange,
    props.sessionId,
    props.workspaceId,
    sessionActivityRecord?.runStartedAt,
    setComposerDraft,
  ]);

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
    const reviewedActionHandoff = attachments.length === 0
      ? reviewedActionHandoffFromComposer(text, activeWorkflowDeskAgent?.deskId)
      : null;
    if (reviewedActionHandoff && stageReviewedActionHandoff(reviewedActionHandoff)) {
      setError(null);
      const localTurnId = `${props.sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setLocalReviewedActionMessages((current) => [
        ...current,
        {
          id: `${localTurnId}-user`,
          role: "user",
          parts: [{ type: "text", text }],
        },
        {
          id: `${localTurnId}-assistant`,
          role: "assistant",
          parts: [{ type: "text", text: reviewedActionPreparedChatText(reviewedActionHandoff) }],
        },
      ]);
      recordInspectorEvent("session.reviewed_action.staged_from_composer", {
        workspaceId: props.workspaceId,
        sessionId: props.sessionId,
        protocol: reviewedActionHandoff.protocol,
      });
      if (activeWorkflowDeskAgent) {
        void stageWorkflowRun(props.client, {
          workspaceId: props.workspaceId,
          sessionId: props.sessionId,
          deskId: activeWorkflowDeskAgent.deskId,
          actionId: activeWorkflowDeskAgent.defaultActionId,
          stageId: activeWorkflowDeskAgent.defaultStageId,
          visibleUserIntent: text,
        })
          .then((run) => startWorkflowRun(props.client, run.workflowRunId))
          .catch((error) => {
            recordInspectorEvent("session.workflow_run.failed", {
              workspaceId: props.workspaceId,
              sessionId: props.sessionId,
              deskId: activeWorkflowDeskAgent.deskId,
              agentId: activeWorkflowDeskAgent.agentId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }
      clearComposerSession(props.sessionId);
      props.onDraftChange(buildDraft("", []));
      return;
    }
    // Intentionally allow sending while the assistant is still streaming.
    // OpenCode accepts follow-up user turns mid-run and queues them; if the
    // backend can't accept the follow-up it'll surface an error via the
    // catch below. This restores the "append a prompt while it's still
    // talking" behavior that the Solid composer had.
    suppressNextAbortFailureRef.current = false;
    setError(null);
    useSessionActivityStore.getState().setRunStatus(props.workspaceId, props.sessionId, { type: "busy" });
    setSending(true);
    setAwaitingAssistantBaseline(renderedMessages.length);
    setNoVisibleAssistantOutputBaseline(null);
    const operation = beginModelOperation({
      workspaceId: props.workspaceId,
      sessionId: props.sessionId,
      providerId: props.selectedModel.providerID,
      modelId: props.selectedModel.modelID,
      reasoningLevel: props.modelVariant,
      source: "chat",
    });
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

      if (activeWorkflowDeskAgent) {
        void stageWorkflowRun(props.client, {
          workspaceId: props.workspaceId,
          sessionId: props.sessionId,
          deskId: activeWorkflowDeskAgent.deskId,
          actionId: activeWorkflowDeskAgent.defaultActionId,
          stageId: activeWorkflowDeskAgent.defaultStageId,
          visibleUserIntent: text,
        })
          .then((run) => startWorkflowRun(props.client, run.workflowRunId))
          .catch((error) => {
            recordInspectorEvent("session.workflow_run.failed", {
              workspaceId: props.workspaceId,
              sessionId: props.sessionId,
              deskId: activeWorkflowDeskAgent.deskId,
              agentId: activeWorkflowDeskAgent.agentId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }

      await props.onSendDraft(nextDraft);
      recordModelOperationAccepted(operation);
      attachments.forEach(revokeAttachmentPreview);
      clearComposerSession(props.sessionId);
      props.onDraftChange(buildDraft("", []));
      setSending(false);
    } catch (nextError) {
      recordModelOperationProviderError(operation, nextError);
      const parsed = parseSessionError(nextError);
      setError(parsed);
      useSessionActivityStore.getState().setError(props.workspaceId, props.sessionId);
      // A rejected send must leave the person's work intact. This includes
      // provider setup failures, where the next useful action is to connect a
      // model and then resend the exact draft.
      setComposerDraft(props.sessionId, text);
      props.onDraftChange(buildDraft(text, attachments));
      setAwaitingAssistantBaseline(null);
      setNoVisibleAssistantOutputBaseline(null);
      setSending(false);
    }
  }, [activeWorkflowDeskAgent, attachments, bittensorContext, buildDraft, clearComposerSession, draft, memoryContext, props.modelVariant, props.onDraftChange, props.onSendDraft, props.selectedModel.modelID, props.selectedModel.providerID, props.sessionId, props.workspaceId, renderedMessages.length, setComposerDraft]);

  const handleAbort = useCallback(async () => {
    if (!chatStreaming) return;
    suppressNextAbortFailureRef.current = true;
    setError(null);
    try {
      await abortSessionSafe(opencodeClient, props.sessionId);
      const operation = pendingModelOperation(props.sessionId);
      if (operation) recordModelOperationCancelled(operation);
      await snapshotQuery.refetch();
      setSending(false);
      setAwaitingAssistantBaseline(null);
      setNoVisibleAssistantOutputBaseline(null);
      const activity = useSessionActivityStore.getState();
      activity.setRunStatus(props.workspaceId, props.sessionId, { type: "idle" });
      activity.clearError(props.workspaceId, props.sessionId);
    } catch (nextError) {
      suppressNextAbortFailureRef.current = false;
      setError({ message: nextError instanceof Error ? nextError.message : "Failed to stop run." });
    }
  }, [chatStreaming, opencodeClient, props.sessionId, props.workspaceId, snapshotQuery.refetch]);

  const handleRetryResponse = useCallback(async () => {
    if (sending || !draft.trim()) return;
    await handleSend();
  }, [draft, handleSend, sending]);

  const handleRetryAssistantResponse = useCallback(async (messageId: string) => {
    if (sending || chatStreaming) {
      throw new Error("Wait for the active response to finish before retrying another response.");
    }
    const latestAssistantMessageId = [...renderedMessages].reverse().find((message) => message.role === "assistant")?.id;
    if (latestAssistantMessageId !== messageId) {
      throw new Error("Fork from an earlier response to preserve the turns that followed it.");
    }
    const retryTurn = resolveAssistantResponseRetryTurn(renderedMessages, messageId);
    if (!retryTurn) throw new Error("Matterhorn could not find the prompt for this response.");
    const prompt = retryTurn.prompt;
    if (!prompt) throw new Error("This response came from an attachment-only prompt. Re-send it from the composer to include the attachment.");

    suppressNextAbortFailureRef.current = false;
    setError(null);
    setSending(true);
    setAwaitingAssistantBaseline(Math.max(0, retryTurn.responseIndex - 1));
    setNoVisibleAssistantOutputBaseline(null);
    useSessionActivityStore.getState().setRunStatus(props.workspaceId, props.sessionId, { type: "busy" });
    const operation = beginModelOperation({
      workspaceId: props.workspaceId,
      sessionId: props.sessionId,
      providerId: props.selectedModel.providerID,
      modelId: props.selectedModel.modelID,
      reasoningLevel: props.modelVariant,
      source: "chat",
    });
    recordInspectorEvent("session.response.retry_requested", {
      workspaceId: props.workspaceId,
      sessionId: props.sessionId,
      responseMessageId: messageId,
      promptMessageId: retryTurn.promptMessageId,
    });

    try {
      let resolvedText = addBittensorContextToResolvedText(prompt, bittensorContext);
      resolvedText = addMatterhornMemoryContextToResolvedText(resolvedText, memoryContext);
      await runAssistantResponseRetry({
        abort: () => abortSessionSafe(opencodeClient, props.sessionId),
        revert: () => revertSession(opencodeClient, props.sessionId, retryTurn.promptMessageId),
        dispatch: () => props.onSendDraft(buildDraft(prompt, [], { resolvedText })),
        restore: () => unrevertSession(opencodeClient, props.sessionId),
      });
      recordModelOperationAccepted(operation);
      void snapshotQuery.refetch();
      setSending(false);
      setNotice({
        title: "Response retry started",
        description: "The selected turn was replaced and Matterhorn is generating a new response.",
        tone: "info",
      });
    } catch (nextError) {
      recordModelOperationProviderError(operation, nextError);
      const parsed = parseSessionError(nextError);
      setError(parsed);
      useSessionActivityStore.getState().setError(props.workspaceId, props.sessionId);
      setAwaitingAssistantBaseline(null);
      setNoVisibleAssistantOutputBaseline(null);
      setSending(false);
      void snapshotQuery.refetch();
      throw nextError;
    }
  }, [bittensorContext, buildDraft, chatStreaming, memoryContext, opencodeClient, props.modelVariant, props.onSendDraft, props.selectedModel.modelID, props.selectedModel.providerID, props.sessionId, props.workspaceId, renderedMessages, sending, snapshotQuery]);

  const handleSaveAssistantResponse = useCallback(async (messageId: string, content: string): Promise<OpenTarget> => {
    if (!content.trim()) throw new Error("This response has no content to save.");
    recordInspectorEvent("session.response.save_requested", {
      workspaceId: props.workspaceId,
      sessionId: props.sessionId,
      responseMessageId: messageId,
      contentLength: content.length,
    });
    try {
      const response = await props.client.saveWorkspaceChatResponse(props.workspaceId, {
        sessionId: props.sessionId,
        messageId,
        title: responseOutputTitle(content),
        content,
      });
      const target: OpenTarget = {
        id: `file:${response.output.path.toLowerCase()}`,
        kind: "file",
        value: response.output.path,
        name: outputTargetName(response.output.path),
        preview: "markdown",
        confidence: 100,
        reason: "saved chat response",
        exists: true,
        size: response.output.bytes,
        updatedAt: response.output.updatedAt,
      };
      setVerifiedOpenTargets((current) => current.some((item) => item.id === target.id) ? current : [...current, target]);
      window.dispatchEvent(new Event("matterhorn:project-evidence-updated"));
      window.dispatchEvent(new Event("matterhorn:task-log-updated"));
      setNotice({
        title: "Response saved to Outputs",
        description: "It is also recorded in Project Activity. Select the checkmark to open it.",
        tone: "success",
      });
      recordInspectorEvent("session.response.saved", {
        workspaceId: props.workspaceId,
        sessionId: props.sessionId,
        responseMessageId: messageId,
        outputPath: response.output.path,
      });
      return target;
    } catch (nextError) {
      setNotice({
        title: "Could not save response",
        description: nextError instanceof Error ? nextError.message : "Try again when the workspace service is available.",
        tone: "warning",
      });
      recordInspectorEvent("session.response.save_failed", {
        workspaceId: props.workspaceId,
        sessionId: props.sessionId,
        responseMessageId: messageId,
        reason: nextError instanceof Error ? nextError.message.slice(0, 160) : "unknown",
      });
      throw nextError;
    }
  }, [props.client, props.sessionId, props.workspaceId]);

  const handleRateAssistantResponse = useCallback(async (messageId: string, rating: "helpful" | "not_helpful") => {
    try {
      await props.client.submitProjectFeedback(props.workspaceId, {
        kind: rating === "helpful" ? "thumbs_up" : "thumbs_down",
        target: {
          sourceType: "chat",
          sourceId: messageId,
          href: typeof window === "undefined" ? undefined : `${window.location.pathname}${window.location.search}`,
        },
      });
      setNotice({
        title: rating === "helpful" ? "Marked helpful" : "Marked not helpful",
        description: "Saved for product-quality review in this workspace. It is not used for model training.",
        tone: "success",
      });
      recordInspectorEvent("session.response.feedback_saved", {
        workspaceId: props.workspaceId,
        sessionId: props.sessionId,
        responseMessageId: messageId,
        rating,
      });
    } catch (nextError) {
      setNotice({
        title: "Could not save feedback",
        description: nextError instanceof Error ? nextError.message : "Try again when the workspace service is available.",
        tone: "warning",
      });
      throw nextError;
    }
  }, [props.client, props.sessionId, props.workspaceId]);

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
    if (sending || liveStatus.type !== "idle") return;
    if (sessionActivityStatus !== "thinking" && sessionActivityStatus !== "responding") return;
    useSessionActivityStore.getState().setRunStatus(props.workspaceId, props.sessionId, { type: "idle" });
  }, [liveStatus.type, props.sessionId, props.workspaceId, sending, sessionActivityStatus]);

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

  const startDeskTask = useCallback((deskId: MatterhornDeskMode, prompt: string) => {
    if (props.onCreateDeskTask) {
      const visual = getCustomerProtocolDeskVisual(deskId);
      props.onCreateDeskTask(prompt, {
        title: visual?.agentName ?? "Desk task",
        agent: matterhornDeskAgentIdForDesk(deskId),
        sendImmediately: true,
      });
      return;
    }
    void typeComposerText(prompt);
  }, [props.onCreateDeskTask, typeComposerText]);

  const startStarterTask = useCallback((item: CustomerWorkflowStarterCard) => {
    if (props.onCreateDeskTask) {
      props.onCreateDeskTask(item.prompt, {
        title: item.title,
        agent: item.agentId,
        sendImmediately: true,
      });
      return;
    }
    void typeComposerText(item.prompt);
  }, [props.onCreateDeskTask, typeComposerText]);

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
        title: "Memory task ready",
        description: "Review it, then send it to the Memory Agent.",
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
      const record = detail as { prompt?: unknown; text?: unknown; message?: unknown; source?: unknown };
      const isGenericCryptoHandoff = event.type === "matterhorn:crypto-chat-handoff";
      const incomingContext = readBittensorContextFromEventDetail(detail);
      const mergedContext = mergeBittensorSessionContexts(bittensorContext, incomingContext);
      const text =
        typeof record.prompt === "string" ? record.prompt :
        typeof record.text === "string" ? record.text :
        typeof record.message === "string" ? record.message :
        "";
      if (!text.trim()) return;
      const venue = isGenericCryptoHandoff
        ? (typeof (detail as { venue?: unknown; panel?: unknown }).venue === "string"
            ? (detail as { venue: string }).venue
            : typeof (detail as { panel?: unknown }).panel === "string"
              ? (detail as { panel: string }).panel
              : null)
        : "bittensor";
      const agent = getMatterhornDeskAgent(venue);
      const source = typeof record.source === "string" ? record.source : "";

      // A task launched from any desk belongs to a dedicated chat. The project
      // remains shared, while protocol context and agent state stay isolated.
      if (agent && props.onCreateDeskTask) {
        const visual = getCustomerProtocolDeskVisual(agent.deskId);
        void props.onCreateDeskTask(text, {
          title: visual?.agentName ?? `${agent.displayName} task`,
          agent: agent.agentId,
          sendImmediately: false,
          onSessionCreated: (sessionId) => {
            if (incomingContext) {
              setBittensorContext(sessionId, incomingContext);
            }
            dispatchMatterhornMemorySuggestions({
              desk: venue ?? "generic_workspace",
              prompt: text,
              source: "chat_capture",
              sourceId: source || "desk-panel",
              workspaceId: props.workspaceId,
              sessionId,
              ss58Address: incomingContext?.ss58Address,
              netuid: incomingContext?.netuid,
              validatorHotkey: incomingContext?.validatorHotkey,
            });
            recordInspectorEvent("desk.chat_handoff.session_created", {
              workspaceId: props.workspaceId,
              sessionId,
              deskId: agent.deskId,
              source: source || null,
              promptLength: text.length,
            });
          },
        });
        recordInspectorEvent("desk.chat_handoff.session_requested", {
          workspaceId: props.workspaceId,
          sourceSessionId: props.sessionId,
          deskId: agent.deskId,
          source: source || null,
          promptLength: text.length,
        });
        return;
      }
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
      if (agent && props.selectedAgent !== agent.agentId) {
        props.onSelectAgent(agent.agentId);
      }
      setNotice({
        title: agent ? `${agent.displayName} task ready` : "Desk task ready",
        description: "Review it, then send it to the desk agent.",
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
  }, [
    attachments,
    bittensorContext,
    buildDraft,
    props.onDraftChange,
    props.onCreateDeskTask,
    props.onSelectAgent,
    props.selectedAgent,
    props.sessionId,
    props.workspaceId,
    setBittensorContext,
    typeComposerText,
  ]);

  const localReviewedActionReady = useMemo(
    () => attachments.length === 0 && reviewedActionHandoffFromComposer(draft.trim(), activeWorkflowDeskAgent?.deskId) !== null,
    [activeWorkflowDeskAgent?.deskId, attachments.length, draft],
  );

  const handleSaveBittensorEvidence = useCallback(async (card: BittensorPublicEvidenceCard): Promise<OpenTarget> => {
    const publicCard = publicBittensorEvidenceCard(card);
    const title = typeof publicCard.title === "string" && publicCard.title.trim()
      ? publicCard.title.trim()
      : "Bittensor output";
    const summary = typeof publicCard.summary === "string" && publicCard.summary.trim()
      ? publicCard.summary.trim()
      : typeof publicCard.subtitle === "string" && publicCard.subtitle.trim()
        ? publicCard.subtitle.trim()
        : "Public Bittensor result saved from chat.";
    const publicContext = bittensorContext
      ? Object.fromEntries(Object.entries({
          contextId: bittensorContext.id,
          ss58Address: bittensorContext.ss58Address,
          netuid: bittensorContext.netuid,
          amountTao: bittensorContext.amountTao,
          validatorHotkey: bittensorContext.validatorHotkey,
          coldkey: bittensorContext.coldkey,
          recipient: bittensorContext.recipient,
          destination: bittensorContext.destination,
          lastIntent: bittensorContext.lastIntent,
          lastExecution: bittensorContext.lastExecution,
        }).filter(([, value]) => value !== undefined && value !== null && value !== ""))
      : null;

    recordInspectorEvent("bittensor.evidence.save_requested", {
      workspaceId: props.workspaceId,
      sessionId: props.sessionId,
      kind: publicCard.kind ?? "chat_result",
      title,
    });

    try {
      const response = await props.client.workspaceBittensorPublicReadEvidence(props.workspaceId, {
        kind: bittensorEvidenceKindForCard(card),
        title,
        summary,
        payload: {
          source: "visible_bittensor_card",
          card: publicCard,
          context: publicContext,
        },
        cards: [publicCard],
      }, { sessionId: props.sessionId });

      window.dispatchEvent(new Event("matterhorn:project-evidence-updated"));
      window.dispatchEvent(new Event("matterhorn:task-log-updated"));
      const target: OpenTarget = {
        id: `file:${response.evidence.outputPath.toLowerCase()}`,
        kind: "file",
        value: response.evidence.outputPath,
        name: outputTargetName(response.evidence.outputPath),
        preview: "text",
        confidence: 100,
        reason: "saved result card",
        exists: true,
      };
      setVerifiedOpenTargets((current) => current.some((item) => item.id === target.id)
        ? current
        : [...current, target]);
      setNotice({
        title: "Result saved to Outputs",
        description: "It is also recorded in Project Activity. Select Open saved output to view it.",
        tone: "success",
      });
      recordInspectorEvent("bittensor.evidence.saved", {
        workspaceId: props.workspaceId,
        sessionId: props.sessionId,
        outputPath: response.evidence.outputPath,
      });
      return target;
    } catch (error) {
      setNotice({
        title: "Could not save Bittensor output",
        description: error instanceof Error ? error.message : "Try again after the Matterhorn Desks engine is available.",
        tone: "warning",
      });
      recordInspectorEvent("bittensor.evidence.save_failed", {
        workspaceId: props.workspaceId,
        sessionId: props.sessionId,
        reason: error instanceof Error ? error.message.slice(0, 160) : "unknown",
      });
      throw error;
    }
  }, [bittensorContext, props.client, props.sessionId, props.workspaceId]);

  const handleSaveResultToMemory = useCallback(async (card: BittensorPublicEvidenceCard) => {
    const record = buildResultCardMemoryRecord({
      card,
      workspaceId: props.workspaceId,
      sessionId: props.sessionId,
    });
    const policy = getMatterhornMemoryPolicyDecision(record);
    if (policy.blockedReasons.length) {
      const reason = policy.blockedReasons[0] ?? "Memory policy blocked this result.";
      setNotice({
        title: "Could not save to Memory",
        description: reason,
        tone: "warning",
      });
      throw new Error(reason);
    }

    recordInspectorEvent("session.result_memory.save_requested", {
      workspaceId: props.workspaceId,
      sessionId: props.sessionId,
      recordId: record.id,
      desk: policy.desk,
      kind: record.kind,
    });

    try {
      const response = await props.client.captureWorkspaceMemory(props.workspaceId, record);
      window.dispatchEvent(new CustomEvent("matterhorn:memory-records-changed", {
        detail: { workspaceId: props.workspaceId, record: response.record },
      }));
      setNotice({
        title: "Saved to Memory",
        description: "This result is now available from the Memory panel and can be reused in chat.",
        tone: "success",
      });
      recordInspectorEvent("session.result_memory.saved", {
        workspaceId: props.workspaceId,
        sessionId: props.sessionId,
        recordId: response.record.id,
        desk: policy.desk,
      });
    } catch (error) {
      setNotice({
        title: "Could not save to Memory",
        description: error instanceof Error ? error.message : "Try again when the workspace service is available.",
        tone: "warning",
      });
      recordInspectorEvent("session.result_memory.save_failed", {
        workspaceId: props.workspaceId,
        sessionId: props.sessionId,
        recordId: record.id,
        reason: error instanceof Error ? error.message.slice(0, 160) : "unknown",
      });
      throw error;
    }
  }, [props.client, props.sessionId, props.workspaceId]);

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
    disabled:
      (Boolean(props.modelUnavailable) && !localReviewedActionReady) ||
      (!draft.trim() && attachments.length === 0) ||
      model.transitionState !== "idle",
    targetRef: composerShellRef,
    execute: async () => {
      await handleSend();
      return true;
    },
  }), [attachments.length, draft, handleSend, localReviewedActionReady, model.transitionState, props.modelUnavailable]);
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
    if (props.executionMode !== "work") {
      setToolSkills([]);
      return [];
    }
    // The composer is part of the workspace, so it must not expose every
    // developer skill installed on the host machine. Workspace skills remain
    // visible here; global skills continue to be managed in Settings.
    const response = await props.client.listSkills(props.workspaceId, { includeGlobal: false });
    const next = (response.items ?? [])
      .filter(isCustomerFacingWorkspaceSkill)
      .map((skill) => ({
        name: skill.name,
        path: skill.path,
        description: skill.description,
        trigger: skill.trigger,
        userInvocable: skill.userInvocable,
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
    startAtTop: renderedMessages.length === 0,
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
  const showImageGenerationPanel = Boolean(
    MATTERHORN_LAUNCH_FEATURES.generatedMedia && props.client && props.workspaceId && props.sessionId,
  );
  const hasComposerTopAccessory = Boolean(
    showImageGenerationPanel ||
      props.activeQuestion ||
      hasTodoContent ||
      props.activePermission ||
      activeDeskMode ||
      bittensorContext ||
      memoryContext,
  );

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
                <div className="mx-auto max-w-sm rounded-lg bg-dls-hover/60 px-8 py-10 text-center">
                  <div className="text-sm text-dls-secondary">Opening session…</div>
                </div>
              </div>
            ) : (snapshotQuery.isError || error) && !snapshot && renderedMessages.length === 0 ? (
              <div className="px-6 py-8">
                {error ? (
                  <SessionErrorCard
                    error={error}
                    onDismiss={handleDismissError}
                    onRetry={handleRetryResponse}
                    retrying={sending}
                    onChangeModel={props.onChangeModel}
                    onOpenModelPicker={props.onModelClick}
                    onOpenAiProviders={props.onOpenAiProviders}
                    onOpenPrivacyDetails={props.onOpenPrivacyDetails}
                  />
                ) : sessionMissing ? (
                  <div className="mx-auto flex max-w-sm items-center justify-center gap-2 rounded-lg bg-dls-canvas/45 px-6 py-5 text-sm text-dls-secondary">
                    <OwDotTicker size="sm" />
                    Returning to project Home…
                  </div>
                ) : (
                  <div className="mx-auto max-w-xl rounded-lg bg-red-3/20 px-6 py-5 text-sm text-red-11 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.22)]">
                    {snapshotQuery.error instanceof Error ? snapshotQuery.error.message : "Failed to load session."}
                  </div>
                )}
              </div>
            ) : renderedMessages.length === 0 && assistantOrbActivity ? (
              <div className="px-6 py-12">
                <AssistantWaitingCard
                  label={assistantActivityLabel}
                  activity={assistantOrbActivity}
                  size={64}
                  startedAt={sessionActivityRecord?.runStartedAt}
                />
              </div>
            ) : renderedMessages.length === 0 && snapshot && snapshot.messages.length === 0 ? (
              error ? (
                <SessionErrorCard
                  error={error}
                  onDismiss={handleDismissError}
                  onRetry={handleRetryResponse}
                  retrying={sending}
                  onChangeModel={props.onChangeModel}
                  onOpenModelPicker={props.onModelClick}
                  onOpenAiProviders={props.onOpenAiProviders}
                  onOpenPrivacyDetails={props.onOpenPrivacyDetails}
                />
              ) : activeDeskMode ? (
                <div className="space-y-2">
                  {activeDeskStartBlocker ? (
                    <div className="mx-2 flex items-start gap-2 rounded-lg bg-dls-surface/50 px-3 py-2 text-xs leading-5 text-dls-secondary">
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[var(--matterhorn-desk-color)]" />
                      <span>{activeDeskStartBlocker}</span>
                    </div>
                  ) : null}
                  <DeskWorkflowStagePanel
                    deskId={activeDeskMode}
                    taskStatus={effectiveActivityStatus === "idle" ? "idle" : effectiveActivityStatus === "waiting" ? "waiting" : "running"}
                    stageActionDisabled={activeDeskStartBlocked}
                    stageActionLabel="Platform setup"
                    stageActionTitle={activeDeskStartBlocker ?? undefined}
                    onStartStage={(_, prompt) => startDeskTask(activeDeskMode, prompt)}
                    onJotNote={() => {
                      const visual = getCustomerProtocolDeskVisual(activeDeskMode);
                      openQuickJot({
                        type: "desk",
                        id: activeDeskMode,
                        label: visual?.displayName ?? activeDeskMode,
                      });
                    }}
                  />
                </div>
              ) : shellConfig.starterCards ? (
                <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-5 sm:px-6">
                  <div className="w-full max-w-[880px]">
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-base font-semibold tracking-[-0.01em] text-dls-text">Start with a Matterhorn workflow</p>
                        <p className="text-xs leading-5 text-dls-secondary">Choose a desk task. Matterhorn starts it in a new chat.</p>
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
                            className="group grid min-h-[84px] min-w-0 grid-cols-[32px_minmax(0,1fr)] gap-2.5 rounded-md bg-dls-surface-muted/42 px-2.5 py-2 text-left transition-colors duration-150 hover:bg-[rgb(var(--matterhorn-desk-rgb)/0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)] sm:min-h-[64px]"
                            onClick={() => startStarterTask(item)}
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center text-[var(--matterhorn-desk-color)]">
                              {protocolLogo ?? <Icon className="size-4" />}
                            </span>
                            <span className="grid min-w-0 gap-0.5">
                              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="min-w-0 truncate text-[13px] font-semibold leading-tight text-dls-text">{item.title}</span>
                                {item.statusLabel ? (
                                  <span className="text-[11px] font-semibold text-[var(--matterhorn-desk-color)]">
                                    {item.statusLabel}
                                  </span>
                                ) : null}
                              </span>
                              <span className="line-clamp-2 text-[12px] leading-5 text-dls-secondary sm:line-clamp-1">{item.description}</span>
                              <span className="hidden truncate text-[11px] leading-4 text-dls-muted sm:block">{capabilitySummary}</span>
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
                    onSaveBittensorEvidence={handleSaveBittensorEvidence}
                    onSaveResultToMemory={handleSaveResultToMemory}
                    onRetryAssistantResponse={handleRetryAssistantResponse}
                    onSaveAssistantResponse={handleSaveAssistantResponse}
                    onRateAssistantResponse={handleRateAssistantResponse}
                    footer={assistantStatusFooter}
                  />
                  {error ? (
                    <SessionErrorCard
                      error={error}
                      onDismiss={handleDismissError}
                      onRetry={handleRetryResponse}
                      retrying={sending}
                      onChangeModel={props.onChangeModel}
                      onOpenModelPicker={props.onModelClick}
                      onOpenAiProviders={props.onOpenAiProviders}
                      onOpenPrivacyDetails={props.onOpenPrivacyDetails}
                    />
                  ) : null}
                </Suspense>
              </DevProfiler>
            )}
          </div>
        </div>
        {renderedMessages.length > 0 && hasTranscriptJumpTarget && (!sessionScroll.isAtBottom || (!chatStreaming && sessionScroll.topClippedMessageId)) ? (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 justify-center sm:bottom-5">
            <div className="pointer-events-auto flex items-center gap-0.5 rounded-md bg-dls-surface-muted/70 p-0.5 shadow-[0_1px_4px_rgba(0,0,0,0.2)]">
              {!chatStreaming && sessionScroll.topClippedMessageId ? (
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-medium text-dls-secondary transition-colors hover:bg-dls-hover/70 hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.28)]"
                  onClick={() => {
                    sessionScroll.jumpToStartOfMessage("smooth");
                  }}
                  title="Jump to the start of the latest message"
                  aria-label="Jump to the start of the latest message"
                >
                  <ArrowUp size={12} />
                  Start
                </button>
              ) : null}
              {!sessionScroll.isAtBottom ? (
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-1 rounded bg-dls-hover/65 px-2 text-[11px] font-medium text-dls-text transition-colors hover:bg-dls-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.32)]"
                  onClick={() => {
                    sessionScroll.jumpToLatest("smooth");
                  }}
                  title="Jump to the latest message"
                  aria-label="Jump to the latest message"
                >
                  Latest
                  <ArrowDown size={12} />
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div ref={composerShellRef} className="shrink-0 bg-dls-surface px-0 pb-3 pt-3">
        <div
          className="mx-auto mb-2 flex max-w-[920px] items-start gap-2 px-4 text-[11px] leading-4 text-dls-secondary"
          aria-live="polite"
        >
          <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <p className="min-w-0">
              {props.providerPrivacyPolicy ? (
                props.providerPrivacyPolicy.allowed ? (
                  <>
                    Matterhorn does not use prompts to train models.{" "}
                    {props.providerPrivacyPolicy.providerName} processes this
                    prompt. {props.providerPrivacyPolicy.label}.
                  </>
                ) : (
                  <>
                    Sending is blocked because{" "}
                    {props.providerPrivacyPolicy.providerName}&apos;s training and
                    retention terms are not verified.
                  </>
                )
              ) : (
                <>Checking how the selected provider handles prompts.</>
              )}{" "}
              <button
                type="button"
                className="whitespace-nowrap text-dls-text underline decoration-dls-border underline-offset-2 hover:decoration-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dls-text/30"
                onClick={props.onOpenPrivacyDetails}
                disabled={!props.onOpenPrivacyDetails}
              >
                Privacy details
              </button>
          </p>
        </div>
        <DevProfiler id="SessionComposer">
        <ReactSessionComposer
          draft={draft}
          mentions={mentions}
          onDraftChange={handleComposerDraftChange}
        onSend={handleSend}
        onStop={handleAbort}
        busy={chatStreaming}
        disabled={model.transitionState !== "idle"}
        sendDisabled={
          model.transitionState !== "idle" ||
          props.providerPrivacyPolicy?.allowed === false ||
          (Boolean(props.modelUnavailable) && !localReviewedActionReady)
        }
        modelUnavailable={Boolean(props.modelUnavailable)}
        onOpenAiProviders={props.onOpenAiProviders}
        statusLabel={statusLabel(snapshot ?? undefined, chatStreaming)}
        showModelPicker={shellConfig.modelPicker && !props.modelUnavailable}
        modelPickerOpen={props.modelPickerOpen}
        selectedModel={props.selectedModel}
        onModelPickerOpenChange={props.onModelPickerOpenChange}
        onModelChange={props.onModelChange}
        attachments={attachments}
        onAttachFiles={handleAttachFiles}
        onRemoveAttachment={handleRemoveAttachment}
        attachmentsEnabled={props.attachmentsEnabled}
        attachmentsDisabledReason={props.attachmentsDisabledReason}
        modelBehaviorTitle={props.modelBehaviorTitle}
        modelVariantLabel={props.modelVariantLabel}
        modelVariant={props.modelVariant}
        modelBehaviorOptions={props.modelBehaviorOptions}
        modelBehaviorIsProviderDefault={props.modelBehaviorIsProviderDefault}
        modelBehaviorDefaultLabel={props.modelBehaviorDefaultLabel}
        onModelVariantChange={props.onModelVariantChange}
        responsePerspective={props.responsePerspective}
        onResponsePerspectiveChange={props.onResponsePerspectiveChange}
        executionMode={props.executionMode}
        executionModesEnabled={props.executionModesEnabled}
        onExecutionModeChange={props.onExecutionModeChange}
        agentLabel={props.agentLabel}
        agentSelectionLocked={Boolean(linkedWorkflowRun?.agentId || activeDeskMode)}
        agentSelectionLockedReason={
          linkedWorkflowRun?.deskId === "blank"
            ? "This chat keeps the agent selected when it started."
            : "This desk uses its specialist agent."
        }
        selectedAgent={props.selectedAgent}
        listAgents={props.listAgents}
        onSelectAgent={props.onSelectAgent}
        listCommands={props.listCommands}
        listSkills={props.executionMode === "work" ? listSkills : undefined}
        skills={props.executionMode === "work" ? toolSkills : []}
        listMcp={listMcp}
        mcpServers={toolMcpServers}
        mcpStatus={toolMcpStatus}
        mcpStatuses={toolMcpStatuses}
        connectedProviderIds={props.connectedProviderIds}
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
              <div className="space-y-2">
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
                {showImageGenerationPanel ? (
                  <SessionImageGenerationPanel
                    client={props.client}
                    workspaceId={props.workspaceId}
                    sessionId={props.sessionId}
                    onNotice={setNotice}
                    suggestedPrompt={draft}
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
