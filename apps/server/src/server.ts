import { getPortfolio } from "./tools/portfolio-tracker.js";
import { isCowSupported, getCowQuote, buildCowOrder, submitCowOrder } from "./tools/cow-swap.js";
import {
  buildAaveSupplyTx,
  buildAaveWithdrawTx,
  buildAaveBorrowTx,
  buildAaveRepayTx,
  getAaveUserPositions,
  getAaveSupplyApy,
  getAaveTokenDeposits,
} from "./tools/aave-v3.js";
import { getBridgeQuote, buildBridgeDepositTx } from "./tools/bridge.js";
import { buildTransferTx } from "./tools/transfer.js";
import { parseIntent } from "./tools/scheduler.js";
import { getPrices } from "./tools/coingecko.js";
import {
  auditBittensorReadiness,
  buildBittensorExtrinsicPreviewCard,
  buildBittensorInvocationCard,
  buildBittensorInvocationPreviewCard,
  buildBittensorPlanCards,
  buildBittensorQuoteCard,
  buildBittensorAdapterApprovalAuditCard,
  buildBittensorAdapterApprovalTemplateCard,
  buildBittensorAdapterCanaryOperatorPacketCard,
  buildBittensorAdapterCanaryOutcomeReportCard,
  buildBittensorAdapterManifestValidationCard,
  buildBittensorAdapterResultValidationCard,
  buildBittensorAdapterOnboardingCard,
  buildBittensorAdapterLaunchGateCard,
  buildBittensorAdapterEvidenceBundleCard,
  buildBittensorAdapterEvidenceReviewCard,
  buildBittensorAdapterMarketplaceCard,
  buildBittensorAdapterOperatorHandoffCard,
  buildBittensorReadinessCard,
  buildBittensorSignerCard,
  buildBittensorSidecarHealthCard,
  buildBittensorSigningHandoffCard,
  buildBittensorSigningReceiptCard,
  buildBittensorSignedResultCard,
  buildBittensorStakingPlanCard,
  buildBittensorSubnetIntelligenceCard,
  buildBittensorSubnetCards,
  buildBittensorValidatorComparisonCards,
  buildBittensorValidatorIntelligenceCard,
  buildBittensorWalletIntelligenceCard,
  buildBittensorWalletCard,
  buildBittensorWatchDigest,
  buildBittensorWatchEvaluationCards,
  buildBittensorWatchCards,
  auditBittensorSubnetAdapterRuntimeApprovals,
  analyzeBittensorValidatorIntelligence,
  analyzeBittensorSubnetIntelligence,
  analyzeBittensorWalletIntelligence,
  bittensorProvider,
  buildBittensorSubnetAdapterRuntimeApprovalTemplate,
  buildBittensorSubnetAdapterCanaryOperatorPacket,
  buildBittensorSubnetAdapterCanaryPacketExport,
  buildBittensorSubnetAdapterCanaryOutcomeReport,
  buildBittensorSubnetAdapterConformanceExport,
  buildBittensorSubnetAdapterEvidenceBundle,
  buildBittensorSubnetAdapterEvidenceExport,
  buildBittensorSubnetAdapterOperatorHandoff,
  buildBittensorSubnetAdapterPreflightPacket,
  buildBittensorSubnetAdapterPreflightPacketExport,
  buildBittensorSubnetAdapterDryRunExport,
  buildBittensorStakingPlan,
  checkBittensorSubnetAdapterLaunchGate,
  checkSubtensorSidecarHealth,
  compareBittensorValidators,
  createBittensorSigningHandoff,
  createBittensorSigningReceipt,
  createBittensorWatch,
  doctorBittensorSubnetAdapters,
  evaluateBittensorWatches,
  executeBittensorChatWorkflow,
  exportBittensorSubnetAdapterMarketplace,
  exportBittensorSubnetAdapterRoadmap,
  findBittensorSubnetsForGoal,
  getBittensorCapability,
  getBittensorChatContext,
  clearBittensorWalletSnapshotBaseline,
  exportBittensorWalletTimeline,
  getBittensorSignerStatus,
  getBittensorWalletTimelineStoreStatus,
  getBittensorSubnetAdapterCanaryReviewChecklist,
  getBittensorSubnetAdapterCandidateProfiles,
  getBittensorSubnetAdapterManifestExamples,
  getBittensorSubnetAdapterSpec,
  getBittensorSubnetAdapterTemplates,
  getSubtensorSidecarStatus,
  invokeBittensorSubnet,
  isValidSs58Address,
  listBittensorCapabilities,
  listBittensorSubnetAdapterMarketplace,
  listBittensorWatches,
  planBittensorSubnetAdapterRoadmap,
  planBittensorSubnetAdapterOnboarding,
  planBittensorChat,
  probeBittensorSubnetAdapterConformance,
  previewBittensorSubnetInvocation,
  prepareBittensorExtrinsic,
  reviewBittensorSubnetAdapterEvidence,
  runBittensorSubnetAdapterDryRun,
  submitSignedBittensorExtrinsic,
  validateBittensorSubnetAdapterManifest,
  validateBittensorSubnetAdapterResult,
  type BittensorActionQuoteInput,
  type BittensorChatExecutionInput,
  type BittensorExtrinsicAction,
  type BittensorExtrinsicPreview,
  type BittensorSignedResult,
  type BittensorSigningHandoff,
  type BittensorSubnetInvocation,
  type BittensorWatch,
} from "./tools/bittensor.js";
import {
  buildHyperliquidAccountCard,
  buildHyperliquidFundingCard,
  buildHyperliquidMarketListCard,
  buildHyperliquidOrderPreviewCard,
  buildHyperliquidWatchCard,
  buildHyperliquidWatchDescriptor,
  buildHyperliquidWatchDigest,
  buildHyperliquidOrderbookCard,
  checkHyperliquidWatchDescriptor,
  coerceHyperliquidHandoffReference,
  coerceHyperliquidReceiptInput,
  executeHyperliquidChatWorkflow,
  findForbiddenHyperliquidCredentialInput,
  hyperliquidProvider,
  isValidHyperliquidAddress,
  prepareHyperliquidExternalSignRequestFromRequest,
  prepareHyperliquidHandoffFromRequest,
  prepareHyperliquidOrderPreview,
  validateHyperliquidRedactedArtifactEnvelope,
  type HyperliquidWatchCheckResult,
  type HyperliquidWatchDescriptor,
  verifyHyperliquidReceipt,
} from "./tools/hyperliquid.js";
import {
  buildPolymarketComplianceCard,
  buildPolymarketEventListCard,
  buildPolymarketMarketDetailCard,
  buildPolymarketMarketListCard,
  buildPolymarketOrderPreviewCard,
  buildPolymarketWatchCard,
  buildPolymarketWatchDigest,
  buildPolymarketOrderbookCard,
  checkPolymarketWatchDescriptor,
  coercePolymarketHandoffReference,
  coercePolymarketReceiptInput,
  executePolymarketChatWorkflow,
  findForbiddenPolymarketCredentialInput,
  buildPolymarketWatchDescriptor,
  polymarketProvider,
  preparePolymarketExternalSignRequestFromRequest,
  preparePolymarketHandoffFromRequest,
  preparePolymarketOrderFromRequest,
  validatePolymarketRedactedArtifactEnvelope,
  type PolymarketWatchCheckResult,
  type PolymarketWatchDescriptor,
  verifyPolymarketReceipt,
} from "./tools/polymarket.js";
import {
  buildSuiAccountCard,
  buildSuiTransactionReceipt,
  buildSuiTransactionReceiptCard,
  buildSuiTransferPreview,
  buildSuiTransactionPreviewCard,
  SuiInputError,
  type SuiTransactionReceiptInput,
  type SuiTransferPreviewInput,
  suiProvider,
} from "./tools/sui.js";
import {
  executeUnifiedCryptoChatWorkflow,
  findForbiddenUnifiedCryptoCredentialInput,
  type UnifiedCryptoChatInput,
} from "./tools/crypto-chat.js";
import {
  buildDecentralizedServicesCapabilityCatalog,
  findForbiddenDecentralizedServiceInput,
  findForbiddenDecentralizedServiceQueryKey,
  planDecentralizedServicesChat,
} from "./tools/decentralized-services.js";
import {
  buildMatterhornCustomerWorkflowTemplates,
  buildMatterhornWorkflowCatalog,
  buildMatterhornWorkflowPromptPack,
  findForbiddenMatterhornWorkflowQueryKey,
} from "./tools/matterhorn-workflows.js";
import {
  WorkflowRunEngine,
  type WorkflowRunFilters,
} from "./workflow-runs.js";
import {
  isValidWorkflowRunStatus,
  makeOutputBasePath,
  normalizeSessionSlug,
  type MatterhornWorkflowRun,
  type MatterhornWorkflowRunEvent,
  type MatterhornWorkflowRunEventType,
  type MatterhornWorkflowRunStatus,
} from "./workflow-run-types.js";
import {
  hasForbiddenMatterhornMemorySuggestionInput,
  planMatterhornMemorySuggestions,
  type MatterhornMemorySuggestionPlanInput,
} from "./tools/memory-suggestions.js";
import {
  buildMarketExecutionChainResponse,
  buildMarketExecutionReadinessResponse,
  buildMarketSdkValidationResponse,
} from "./tools/market-execution-readiness.js";
import { createMatterhornMemoryVault, type MatterhornMemoryVault } from "@matterhorn-work/memory-vault";
import {
  MATTERHORN_MEMORY_SUGGESTION_VERSION,
  MATTERHORN_MEMORY_DESK_POLICY_MATRIX,
  detectMemoryDeskFromRecord,
  validateMemoryRecordAgainstDeskPolicy,
  type MatterhornMemoryDesk,
  type MatterhornMemoryKind,
  type MatterhornMemoryRecord,
  type MatterhornMemorySuggestion,
  type MatterhornMemorySuggestionUserAction,
} from "@matterhorn-work/types/memory";
import type {
  MatterhornNote,
  MatterhornNoteCreateRequest,
  MatterhornNoteMemorySuggestionRequest,
  MatterhornNoteUpdateRequest,
} from "@matterhorn-work/types/notes";
import type { MatterhornProjectEvidenceSource } from "@matterhorn-work/types/project-evidence";
import type {
  MatterhornProjectDataLedgerKind,
  MatterhornProjectDataLedgerSource,
  MatterhornProjectFeedbackKind,
  MatterhornProjectFeedbackRequest,
} from "@matterhorn-work/types/project-data-ledger";
import type {
  MatterhornBackendCapabilitiesResponse,
  MatterhornCapability,
  MatterhornCapabilityStatus,
  MatterhornDataStoreDescriptor,
  MatterhornSettingsSectionCapability,
  MatterhornWorkspaceDataMapResponse,
  MatterhornWalletFamilyCapability,
} from "@matterhorn-work/types/backend-capabilities";
import { getMatterhornDeskAgent } from "@matterhorn-work/types/desk-agents";
import { existsSync } from "node:fs";
import { readFile, writeFile, rm, readdir, rename, stat, appendFile, mkdir } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import type { ApprovalRequest, Capabilities, ServerConfig, WorkspaceInfo, Actor, ReloadReason, ReloadTrigger, TokenScope, MatterhornTaskEventType } from "./types.js";
import { ApprovalService } from "./approvals.js";
import { addPlugin, listPlugins, normalizePluginSpec, removePlugin } from "./plugins.js";
import { sanitizePortableOpencodeConfig } from "./portable-opencode.js";
import { addMcp, listMcp, removeMcp, setMcpEnabled } from "./mcp.js";
import { deleteSkill, listSkills, upsertSkill } from "./skills.js";
import { installHubSkill, listHubSkills } from "./skill-hub.js";
import { deleteCommand, listCommands, repairCommands, upsertCommand } from "./commands.js";
import { ApiError, formatError } from "./errors.js";
import { readJsoncFile, updateJsoncPath, updateJsoncTopLevel, writeJsoncFile } from "./jsonc.js";
import { auditLogPath, recordAudit, readAuditEntries, readLastAudit } from "./audit.js";
import { deriveTaskRuns, readTaskEvents, recordTaskEvent, taskEventsPath } from "./task-events.js";
import { ReloadEventStore } from "./events.js";
import { computeReloadFingerprint } from "./reload-fingerprint.js";
import { startReloadWatchers } from "./reload-watcher.js";
import { opencodeConfigPath, openworkConfigPath, projectCommandsDir, projectSkillsDir } from "./workspace-files.js";
import { ensureDir, exists, hashToken, shortId } from "./utils.js";
import { workspaceIdForPath } from "./workspaces.js";
import { ensureWorkspaceFiles, readRawOpencodeConfig } from "./workspace-init.js";
import { sanitizeCommandName, validateMcpName } from "./validators.js";
import { TokenService } from "./tokens.js";
import { EnvService, EnvStoreReadError, InvalidEnvKeyError, isValidEnvKey } from "./env-file.js";
import { MatterhornNotesStore } from "./notes.js";
import { buildProjectEvidenceTimeline } from "./project-evidence.js";
import { buildProjectDataLedger, scrubProjectLedgerText } from "./project-data-ledger.js";
import { buildBackendModels } from "./backend-models.js";
import { buildBackendTeamAccess } from "./backend-team-access.js";
import { projectFeedbackLogPath, recordProjectFeedback } from "./project-feedback.js";
import { TOY_UI_CSS, TOY_UI_FAVICON_SVG, TOY_UI_HTML, TOY_UI_JS, cssResponse, htmlResponse, jsResponse, svgResponse } from "./toy-ui.js";
import { FileSessionStore } from "./file-sessions.js";
import {
  applyMaterializedBlueprintSessions,
  normalizeBlueprintSessionTemplates,
  readMaterializedBlueprintSessions,
  sanitizeOpenworkTemplateConfig,
} from "./blueprint-sessions.js";
import { inheritWorkspaceOpencodeConnection, resolveWorkspaceOpencodeConnection } from "./opencode-connection.js";
import { resolveOpencodeDbPath, seedOpencodeSessionMessages } from "./opencode-db.js";
import { listPortableFiles } from "./portable-files.js";
import {
  buildWorkspaceImportPreview,
  normalizeWorkspaceImportPayload,
  publicWorkspaceImportPreview,
  summarizeWorkspaceImportApplied,
  summarizeWorkspaceImportPreview,
  type WorkspaceImportPlan,
  workspaceImportPreviewApprovalPaths,
} from "./workspace-import-preview.js";
import {
  buildSession,
  buildSessionExecutionStatus,
  buildSessionList,
  buildSessionMessages,
  buildSessionSnapshot,
  buildSessionStatuses,
  buildSessionTodos,
} from "./session-read-model.js";
import {
  collectWorkspaceExportWarnings,
  stripSensitiveWorkspaceExportData,
  type WorkspaceExportSensitiveMode,
} from "./workspace-export-safety.js";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { serve, type ServeResult } from "./serve-node.js";
import {
  createGoogleWorkspaceConnectFlowManager,
  googleWorkspaceDisconnect,
  googleWorkspaceRunScopeSmokeTest,
  googleWorkspaceStatus,
  googleWorkspaceTestConnection,
} from "./extensions/google-workspace.js";
import { callExperimentalExtensionAction, listExperimentalExtensionActions } from "./extensions/index.js";
import pkg from "../package.json" with { type: "json" };
import constants from "../../../constants.json" with { type: "json" };

const SERVER_VERSION = pkg.version;
const OPENCODE_VERSION = constants.opencodeVersion.trim().replace(/^v/, "");

const FILE_SESSION_DEFAULT_TTL_MS = 15 * 60 * 1000;
const FILE_SESSION_MIN_TTL_MS = 30 * 1000;
const FILE_SESSION_MAX_TTL_MS = 24 * 60 * 60 * 1000;
const FILE_SESSION_MAX_BATCH_ITEMS = 64;
const FILE_SESSION_MAX_FILE_BYTES = 5_000_000;
const FILE_SESSION_CATALOG_DEFAULT_LIMIT = 2000;
const FILE_SESSION_CATALOG_MAX_LIMIT = 10000;
const OPENWORK_VOICE_REALTIME_MODEL = "gpt-realtime-2";
const OPENWORK_VOICE_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";

const OPENWORK_VOICE_REALTIME_TOOLS = [
  {
    type: "function",
    name: "openwork_snapshot",
    description: "Read the current OpenWork UI control snapshot: route, status, narration, and visible action metadata.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "openwork_list_actions",
    description: "List semantic OpenWork UI actions. Call this before openwork_execute_action when you do not know the exact action id.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "openwork_execute_action",
    description: "Execute a semantic OpenWork UI action by id. Prefer this over screen coordinates or DOM guessing.",
    parameters: {
      type: "object",
      properties: {
        actionId: { type: "string", description: "The action id from openwork_list_actions, such as composer.set_text or composer.send." },
        args: { type: "object", description: "Optional JSON arguments for the action.", additionalProperties: true },
      },
      required: ["actionId"],
      additionalProperties: false,
    },
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringField(value: unknown, key: string): string {
  if (!isRecord(value)) return "";
  const field = value[key];
  return typeof field === "string" ? field.trim() : "";
}

async function resolveOpenAiRealtimeApiKey(env: EnvService): Promise<string> {
  const records = await env.list();
  const storedKey =
    records.find((entry) => entry.key === "OPENAI_REALTIME_API_KEY")?.value.trim() ||
    records.find((entry) => entry.key === "OPENAI_API_KEY")?.value.trim() ||
    "";
  if (storedKey) return storedKey;

  return process.env.OPENWORK_OPENAI_REALTIME_API_KEY?.trim() ||
    process.env.OPENAI_REALTIME_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";
}

function openworkVoiceRealtimeInstructions() {
  return `# Role and Objective

You are OpenWork Voice Mode, a voice-first control layer inside OpenWork.
Help the user control OpenWork by using the semantic OpenWork UI tools.

# Tool Policy

- Prefer openwork_snapshot, openwork_list_actions, and openwork_execute_action over visual guessing.
- If the user asks to write or draft something, use composer.set_text.
- If the user asks to send or run the current prompt, use composer.send.
- For navigation, settings, session, transcript, and composer work, inspect the action list first if the action id is unknown.
- Do not claim an action completed until the tool succeeds.
- Ask for confirmation before destructive actions such as deleting a session.

# Voice Style

- Be concise, calm, and direct.
- If audio is unclear, ask the user to repeat it instead of guessing.
- Ignore background speech that is not addressed to OpenWork.
- Summarize tool results briefly and offer the next useful step.`;
}

function readOpenAiClientSecret(payload: unknown): { clientSecret: string; expiresAt: number | null } {
  if (!isRecord(payload)) return { clientSecret: "", expiresAt: null };
  const clientSecret = payload.client_secret;
  if (typeof clientSecret === "string") return { clientSecret, expiresAt: null };
  if (isRecord(clientSecret)) {
    const value = typeof clientSecret.value === "string" ? clientSecret.value : "";
    const expiresAt = typeof clientSecret.expires_at === "number" ? clientSecret.expires_at : null;
    return { clientSecret: value, expiresAt };
  }
  const value = typeof payload.value === "string" ? payload.value : "";
  return { clientSecret: value, expiresAt: null };
}

async function createOpenAiRealtimeVoiceSession(env: EnvService, input: unknown) {
  const apiKey = await resolveOpenAiRealtimeApiKey(env);
  if (!apiKey) {
    throw new ApiError(
      400,
      "openai_api_key_missing",
      "OpenAI API key missing. Save OPENAI_API_KEY in OpenWork Environment Variables or configure the Voice Mode extension.",
    );
  }

  const model = readStringField(input, "model") || OPENWORK_VOICE_REALTIME_MODEL;
  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model,
        output_modalities: ["audio"],
        audio: {
          input: {
            transcription: { model: OPENWORK_VOICE_TRANSCRIPTION_MODEL, language: "en" },
            turn_detection: {
              type: "server_vad",
              threshold: 0.58,
              silence_duration_ms: 320,
              prefix_padding_ms: 300,
              create_response: true,
              interrupt_response: true,
            },
          },
        },
        instructions: openworkVoiceRealtimeInstructions(),
        tool_choice: "auto",
        tools: OPENWORK_VOICE_REALTIME_TOOLS,
      },
    }),
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorPayload = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
    const message = typeof errorPayload?.message === "string" ? errorPayload.message : response.statusText;
    throw new ApiError(response.status, "openai_realtime_failed", message || "Failed to create OpenAI Realtime session");
  }

  const { clientSecret, expiresAt } = readOpenAiClientSecret(payload);
  if (!clientSecret) {
    throw new ApiError(502, "openai_realtime_invalid_response", "OpenAI did not return a usable Realtime client secret");
  }

  return {
    ok: true,
    clientSecret,
    expiresAt,
    model,
    transcriptionModel: OPENWORK_VOICE_TRANSCRIPTION_MODEL,
    tools: OPENWORK_VOICE_REALTIME_TOOLS.map((tool) => tool.name),
  };
}

const reloadBaselineRefreshers = new WeakMap<
  ServerConfig,
  (workspaceId: string, reasons?: ReloadReason[]) => Promise<void>
>();

type LogLevel = "info" | "warn" | "error";

type LogAttributes = Record<string, unknown>;

type ServerLogger = {
  log: (level: LogLevel, message: string, attributes?: LogAttributes) => void;
};

const LOG_LEVEL_NUMBERS: Record<LogLevel, number> = {
  info: 9,
  warn: 13,
  error: 17,
};

function toUnixNano(): string {
  return (BigInt(Date.now()) * 1_000_000n).toString();
}

export function createServerLogger(config: ServerConfig): ServerLogger {
  const runId = process.env.OPENWORK_RUN_ID ?? shortId();
  const host = hostname().trim();
  const resource: Record<string, string> = {
    "service.name": "openwork-server",
    "service.version": SERVER_VERSION,
    "service.instance.id": runId,
  };
  if (host) {
    resource["host.name"] = host;
  }
  const baseAttributes: LogAttributes = {
    "run.id": runId,
    "process.pid": process.pid,
  };

  const emit = (level: LogLevel, message: string, attributes?: LogAttributes) => {
    const merged = { ...baseAttributes, ...(attributes ?? {}) };
    if (config.logFormat === "json") {
      const record = {
        timeUnixNano: toUnixNano(),
        severityText: level.toUpperCase(),
        severityNumber: LOG_LEVEL_NUMBERS[level],
        body: message,
        attributes: merged,
        resource,
      };
      process.stdout.write(`${JSON.stringify(record)}\n`);
      return;
    }
    process.stdout.write(`${message}\n`);
  };

  return { log: emit };
}

function logRequest(input: {
  logger: ServerLogger;
  request: Request;
  response: Response;
  durationMs: number;
  authMode: AuthMode;
  proxyService?: "opencode";
  proxyBaseUrl?: string;
  error?: string;
}) {
  const { logger, request, response, durationMs, authMode, proxyService, proxyBaseUrl, error } = input;
  const status = response.status;
  const level: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const proxyLabel = proxyBaseUrl ? ` (${proxyService ?? "proxy"})` : "";
  const message = `${method} ${url.pathname} ${status} ${durationMs}ms${proxyLabel}`;
  const attributes: LogAttributes = {
    method,
    path: url.pathname,
    status,
    durationMs,
    auth: authMode,
  };
  if (proxyBaseUrl) {
    attributes["proxy.base_url"] = proxyBaseUrl;
    if (proxyService) attributes["proxy.service"] = proxyService;
  }
  if (error) {
    attributes.error = error;
  }
  logger.log(level, message, attributes);
}

type AuthMode = "none" | "client" | "host" | "host-token";

function parseWorkspaceMount(pathname: string): { workspaceId: string; restPath: string } | null {
  if (!pathname.startsWith("/w/")) return null;
  const remainder = pathname.slice(3);
  if (!remainder) return null;
  const slash = remainder.indexOf("/");
  if (slash === -1) {
    return { workspaceId: decodeURIComponent(remainder), restPath: "/" };
  }
  const workspaceId = remainder.slice(0, slash);
  const restPath = remainder.slice(slash) || "/";
  if (!workspaceId.trim()) return null;
  return { workspaceId: decodeURIComponent(workspaceId), restPath };
}

function parseWorkspaceOpencodeMount(pathname: string): { workspaceId: string; restPath: string } | null {
  if (!pathname.startsWith("/workspace/")) return null;
  const remainder = pathname.slice("/workspace/".length);
  if (!remainder) return null;
  const slash = remainder.indexOf("/");
  if (slash === -1) return null;
  const workspaceId = remainder.slice(0, slash);
  const restPath = remainder.slice(slash) || "/";
  if (!workspaceId.trim()) return null;
  if (restPath !== "/opencode" && !restPath.startsWith("/opencode/")) return null;
  return { workspaceId: decodeURIComponent(workspaceId), restPath };
}

function normalizeOpencodeProxyPath(proxyPath: string): string {
  const raw = (proxyPath ?? "").trim() || "/";
  const withoutPrefix = raw.startsWith("/opencode") ? raw.slice("/opencode".length) : raw;
  const normalized = (withoutPrefix || "/").replace(/\/+$/, "");
  return normalized || "/";
}

function assertOpencodeProxyAllowed(actor: Actor, method: string, proxyPath: string) {
  const m = method.toUpperCase();
  const scope = actor.scope ?? "viewer";

  if (scope === "viewer" && m !== "GET" && m !== "HEAD") {
    throw new ApiError(403, "forbidden", "Viewer tokens are read-only");
  }

  // Prevent collaborators/viewers from self-approving OpenCode permission requests via the proxy.
  // OpenCode uses /permission/:requestId/reply (and historically also a session-scoped variant).
  if (scope !== "owner" && m !== "GET" && m !== "HEAD") {
    const normalized = normalizeOpencodeProxyPath(proxyPath);
    if (/\/permission\/[^/]+\/reply$/.test(normalized)) {
      throw new ApiError(403, "forbidden", "Only owner tokens can reply to permission requests");
    }
  }
}

function isSessionCommandProxyRequest(method: string, proxyPath: string) {
  return method === "POST" && /^\/session\/[^/]+\/command$/.test(normalizeOpencodeProxyPath(proxyPath));
}

interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  auth: AuthMode;
  handler: (ctx: RequestContext) => Promise<Response>;
}

interface RequestContext {
  request: Request;
  url: URL;
  params: Record<string, string>;
  config: ServerConfig;
  approvals: ApprovalService;
  reloadEvents: ReloadEventStore;
  tokens: TokenService;
  actor?: Actor;
}

export async function startServer(config: ServerConfig): Promise<ServeResult> {
  const approvals = new ApprovalService(config.approval);
  const reloadEvents = new ReloadEventStore();
  const tokens = new TokenService(config);
  const env = new EnvService();
  const logger = createServerLogger(config);
  let watcherHandle = startReloadWatchers({ config, reloadEvents, logger });
  const refreshWorkspaceReloadBaseline = (workspaceId: string, reasons?: ReloadReason[]) =>
    watcherHandle.refreshWorkspace(workspaceId, reasons);
  reloadBaselineRefreshers.set(config, refreshWorkspaceReloadBaseline);
  const restartReloadWatchers = () => {
    watcherHandle.close();
    watcherHandle = startReloadWatchers({ config, reloadEvents, logger });
  };
  const routes = createRoutes(config, approvals, tokens, env, restartReloadWatchers);

  const serverOptions: {
    hostname: string;
    port: number;
    fetch: (request: Request) => Response | Promise<Response>;
  } = {
    hostname: config.host,
    port: config.port,
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      const startedAt = Date.now();
      let authMode: AuthMode = "none";
      let proxyService: "opencode" | undefined;
      let proxyBaseUrl: string | undefined;
      let errorMessage: string | undefined;

      const finalize = (response: Response) => {
        const wrapped = withCors(response, request, config);
        if (config.logRequests) {
            logRequest({
              logger,
              request,
              response: wrapped,
              durationMs: Date.now() - startedAt,
              authMode,
              proxyService,
              proxyBaseUrl,
              error: errorMessage,
            });
        }
        return wrapped;
      };

      const proxyWorkspaceOpencodeMount = async (mount: { workspaceId: string; restPath: string }) => {
        authMode = "client";
        try {
          const actor = await requireClient(request, config, tokens);
          assertOpencodeProxyAllowed(actor, request.method, mount.restPath);
          const workspace = await resolveWorkspace(config, mount.workspaceId);
          proxyService = "opencode";
          proxyBaseUrl = workspace.baseUrl?.trim() || undefined;
          const response = await proxyOpencodeRequest({ config, request, url, workspace, proxyPath: mount.restPath });
          return finalize(response);
        } catch (error) {
          const apiError = error instanceof ApiError
            ? error
            : new ApiError(500, "internal_error", "Unexpected server error");
          errorMessage = apiError.message;
          return finalize(jsonResponse(formatError(apiError), apiError.status));
        }
      };

      if (request.method === "OPTIONS") {
        return finalize(new Response(null, { status: 204 }));
      }

      const canonicalOpencodeMount = parseWorkspaceOpencodeMount(url.pathname);
      if (canonicalOpencodeMount) {
        return proxyWorkspaceOpencodeMount(canonicalOpencodeMount);
      }

      const mount = parseWorkspaceMount(url.pathname);
      if (mount && (mount.restPath === "/opencode" || mount.restPath.startsWith("/opencode/"))) {
        return proxyWorkspaceOpencodeMount(mount);
      }

      // Allow clients to use a mounted base URL (e.g. http://host:8787/w/<id>) while
      // still calling the existing /workspace/:id/* API surface.
      // Example: baseUrl + "/workspace/<id>/plugins" => "/w/<id>/workspace/<id>/plugins".
      // We strip the mount prefix and route-match on the rest path.
      //
      // Important: when using a mounted base URL, enforce that the nested /workspace/:id
      // matches the mount workspace id to preserve the "single-workspace" mental model.
      if (mount && mount.restPath.startsWith("/workspace/")) {
        const match = mount.restPath.match(/^\/workspace\/([^/]+)/);
        const nestedId = match?.[1] ? decodeURIComponent(match[1]) : null;
        if (nestedId && nestedId !== mount.workspaceId) {
          errorMessage = "not_found";
          return finalize(jsonResponse({ code: "not_found", message: "Not found" }, 404));
        }
        url.pathname = mount.restPath;
      }

      if (url.pathname === "/opencode" || url.pathname.startsWith("/opencode/")) {
        authMode = "client";
        proxyBaseUrl = config.workspaces[0]?.baseUrl?.trim() || undefined;
        try {
          const actor = await requireClient(request, config, tokens);
          assertOpencodeProxyAllowed(actor, request.method, url.pathname);
          proxyService = "opencode";
          const response = await proxyOpencodeRequest({ config, request, url, workspace: config.workspaces[0] });
          return finalize(response);
        } catch (error) {
          const apiError = error instanceof ApiError
            ? error
            : new ApiError(500, "internal_error", "Unexpected server error");
          errorMessage = apiError.message;
          return finalize(jsonResponse(formatError(apiError), apiError.status));
        }
      }

      const route = matchRoute(routes, request.method, url.pathname);
      if (!route) {
        errorMessage = "not_found";
        return finalize(jsonResponse({ code: "not_found", message: "Not found" }, 404));
      }

      authMode = route.auth;
      try {
        const actor =
          route.auth === "host-token"
            ? requireHostToken(request, config)
            : route.auth === "host"
              ? await requireHost(request, config, tokens)
              : route.auth === "client"
                ? await requireClient(request, config, tokens)
                : undefined;
        const response = await route.handler({
          request,
          url,
          params: route.params,
          config,
          approvals,
          reloadEvents,
          tokens,
          actor,
        });
        return finalize(response);
      } catch (error) {
        if (!(error instanceof ApiError)) {
          console.error("[openwork-server] Unhandled error:", error);
        }
        const apiError = error instanceof ApiError
          ? error
          : new ApiError(500, "internal_error", "Unexpected server error");
        errorMessage = apiError.message;
        return finalize(jsonResponse(formatError(apiError), apiError.status));
      }
    },
  };

  const server = await serve({
    ...serverOptions,
    idleTimeout: 120,
  });

  return {
    ...server,
    stop: async () => {
      watcherHandle.close();
      reloadBaselineRefreshers.delete(config);
      await server.stop();
    },
  };
}

function matchRoute(routes: Route[], method: string, path: string) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = path.match(route.regex);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1]);
    });
    return { ...route, params };
  }
  return null;
}

function addRoute(routes: Route[], method: string, path: string, auth: AuthMode, handler: Route["handler"]) {
  const keys: string[] = [];
  const regex = pathToRegex(path, keys);
  routes.push({ method, regex, keys, auth, handler });
}

function pathToRegex(path: string, keys: string[]): RegExp {
  const pattern = path.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    keys.push(key);
    return "([^/]+)";
  });
  return new RegExp(`^${pattern}$`);
}

function buildOpencodeProxyUrl(baseUrl: string, path: string, search: string) {
  const target = new URL(baseUrl);
  const trimmedPath = path.replace(/^\/opencode/, "");
  target.pathname = trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`;
  target.search = search;
  return target.toString();
}

function buildOpencodeDirectoryHeader(directory: string) {
  return /[^\x00-\x7F]/.test(directory) ? encodeURIComponent(directory) : directory;
}

function createOpencodeDirectoryFetch(directory: string): typeof fetch {
  return Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const headers = new Headers(init?.headers ?? request.headers);
      headers.set("x-opencode-directory", buildOpencodeDirectoryHeader(directory));
      return fetch(new Request(request, { headers }));
    },
    { preconnect: fetch.preconnect },
  );
}

type OpencodeClientResult<T, E> =
  | { data: T | undefined; error: undefined; response: Response }
  | { data: undefined; error: E; response: Response };

function createWorkspaceOpencodeClient(config: ServerConfig, workspace: WorkspaceInfo) {
  const connection = resolveWorkspaceOpencodeConnection(config, workspace);
  const baseUrl = connection.baseUrl?.trim();
  if (!baseUrl) {
    throw new ApiError(400, "opencode_unconfigured", "OpenCode base URL is missing for this workspace");
  }
  const directory = resolveOpencodeDirectory(workspace);
  const directoryFetch = directory ? createOpencodeDirectoryFetch(directory) : undefined;

  return createOpencodeClient({
    baseUrl,
    ...(directory ? { directory } : {}),
    ...(directoryFetch ? { fetch: directoryFetch } : {}),
    ...(connection.authHeader ? { headers: { Authorization: connection.authHeader } } : {}),
  });
}

function unwrapOpencodeResult<T, E>(result: OpencodeClientResult<T, E>, path: string): NonNullable<T> {
  if (result.data != null) {
    return result.data;
  }
  if (result.error === undefined) {
    throw new ApiError(502, "opencode_empty_response", "OpenCode returned an empty response", { path });
  }
  throw new ApiError(502, "opencode_request_failed", "OpenCode request failed", {
    status: result.response.status,
    body: result.error,
    path,
  });
}

async function proxyOpencodeRequest(input: {
  config: ServerConfig;
  request: Request;
  url: URL;
  workspace?: WorkspaceInfo;
  proxyPath?: string;
}) {
  const workspace = input.workspace;
  const baseUrl = workspace ? resolveWorkspaceOpencodeConnection(input.config, workspace).baseUrl?.trim() ?? "" : "";
  if (!baseUrl) {
    throw new ApiError(400, "opencode_unconfigured", "OpenCode base URL is missing for this workspace");
  }

  const proxyPath = input.proxyPath ?? input.url.pathname;
  const targetUrl = buildOpencodeProxyUrl(baseUrl, proxyPath, input.url.search);
  const headers = new Headers(input.request.headers);
  headers.delete("authorization");
  headers.delete("x-matterhorn-host-token");
  headers.delete("x-openwork-host-token");
  headers.delete("x-openwork-client-id");
  headers.delete("host");
  headers.delete("origin");

  const directory = workspace ? resolveOpencodeDirectory(workspace) : null;
  if (directory && !headers.has("x-opencode-directory")) {
    headers.set("x-opencode-directory", buildOpencodeDirectoryHeader(directory));
  }

  const auth = workspace ? resolveWorkspaceOpencodeConnection(input.config, workspace).authHeader ?? null : null;
  if (auth) {
    headers.set("Authorization", auth);
  }

  const method = input.request.method.toUpperCase();
  // Buffer the request body so it can be forwarded reliably across Node.js
  // stream boundaries (Readable.toWeb streams from the HTTP adapter aren't
  // always accepted directly by Node's global fetch as a body).
  const body = method === "GET" || method === "HEAD"
    ? undefined
    : await input.request.arrayBuffer().then((buf) => (buf.byteLength > 0 ? buf : undefined));
  if (isSessionCommandProxyRequest(method, proxyPath)) {
    void fetch(targetUrl, {
      method,
      headers,
      body,
    }).catch(() => {
      // Command failures are surfaced through the OpenCode event stream.
    });
    return jsonResponse({ ok: true, accepted: true });
  }
  const response = await fetch(targetUrl, {
    method,
    headers,
    body,
  });

  return sanitizeProxyResponse(response);
}

/**
 * Strip hop-by-hop and transport-level headers that Bun's native fetch keeps
 * in the upstream response even after it has already decoded the body for us.
 * Without this the browser sees `content-encoding: gzip` on a plain-text
 * payload and bails out with ERR_CONTENT_DECODING_FAILED, breaking any UI
 * code that reaches through /opencode/* (including session.create).
 */
function sanitizeProxyResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("transfer-encoding");
  headers.delete("content-length");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function sanitizeMarketArtifactValidationInputForSecretScan(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeMarketArtifactValidationInputForSecretScan);
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "signingPayload") continue;
    if (key === "unsignedPayloadSha256") {
      output.payloadHash = child;
      continue;
    }
    output[key] = sanitizeMarketArtifactValidationInputForSecretScan(child);
  }
  return output;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resolveMatterhornMemoryRoot(): string {
  return (
    process.env.MATTERHORN_WORK_MEMORY_ROOT?.trim() ||
    process.env.OPENWORK_MEMORY_ROOT?.trim() ||
    join(homedir(), ".matterhorn-work", "memory")
  );
}

function coerceMemoryRecord(value: unknown): MatterhornMemoryRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_memory_record", "memory record body must be an object");
  }
  return value as MatterhornMemoryRecord;
}

function coerceMemorySuggestion(value: unknown): MatterhornMemorySuggestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_memory_suggestion", "memory suggestion body must be an object");
  }
  return value as MatterhornMemorySuggestion;
}

function coerceMemorySuggestionAction(value: unknown): MatterhornMemorySuggestionUserAction | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "confirm" || value === "edit" || value === "dismiss") return value;
  throw new ApiError(400, "invalid_memory_suggestion_action", "memory suggestion action must be confirm, edit, or dismiss");
}

function coerceMemorySuggestionStatus(value: string | null): "pending" | "confirmed" | "edited" | "dismissed" | "expired" | "blocked" | undefined {
  if (!value) return undefined;
  if (value === "pending" || value === "confirmed" || value === "edited" || value === "dismissed" || value === "expired" || value === "blocked") {
    return value;
  }
  throw new ApiError(400, "invalid_memory_suggestion_status", "status must be pending, confirmed, edited, dismissed, expired, or blocked");
}

function normalizeMemoryTags(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const tags = value
    .split(/[,;]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length ? tags : undefined;
}

function normalizeMemoryLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new ApiError(400, "invalid_memory_limit", "limit must be a positive number");
  }
  return Math.min(Math.floor(limit), 200);
}

function normalizeNoteLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new ApiError(400, "invalid_note_limit", "limit must be a positive number");
  }
  return Math.min(Math.floor(limit), 500);
}

function normalizeNoteTags(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const tags = value
    .split(/[,;]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length ? tags : undefined;
}

function noteApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/not found/i.test(message)) {
    return new ApiError(404, "note_not_found", message);
  }
  if (/forbidden secret|safety validation|desk policy|forbidden_secret|private key|seed phrase|signed payload|raw signature|wallet export|api secret/i.test(message)) {
    return new ApiError(400, "note_memory_safety_rejected", message);
  }
  return new ApiError(400, "note_request_failed", message);
}

function notesListOptionsFromUrl(url: URL) {
  const outputPath = url.searchParams.get("outputPath") ?? url.searchParams.get("output_path");
  return {
    query: url.searchParams.get("q") ?? url.searchParams.get("query") ?? undefined,
    tags: normalizeNoteTags(url.searchParams.get("tags")),
    desk: url.searchParams.get("desk") ?? undefined,
    sessionId: url.searchParams.get("sessionId") ?? url.searchParams.get("session_id") ?? undefined,
    taskId: url.searchParams.get("taskId") ?? url.searchParams.get("task_id") ?? undefined,
    outputPath: outputPath ? normalizeWorkspaceRelativePath(outputPath, { allowSubdirs: true }) : undefined,
    includeDeleted: url.searchParams.get("includeDeleted") === "true" || url.searchParams.get("include_deleted") === "true",
    limit: normalizeNoteLimit(url.searchParams.get("limit")),
  };
}

function parseProjectEvidenceSource(value: string | null): MatterhornProjectEvidenceSource | undefined {
  if (!value) return undefined;
  if (value === "notes" || value === "memory" || value === "task_events" || value === "task_runs") {
    return value;
  }
  throw new ApiError(400, "invalid_project_evidence_source", "source must be notes, memory, task_events, or task_runs");
}

function parseProjectDataLedgerSource(value: string | null): MatterhornProjectDataLedgerSource | undefined {
  if (!value) return undefined;
  if (value === "project_evidence" || value === "audit" || value === "feedback") {
    return value;
  }
  throw new ApiError(400, "invalid_project_data_ledger_source", "source must be project_evidence, audit, or feedback");
}

function parseProjectDataLedgerKind(value: string | null): MatterhornProjectDataLedgerKind | undefined {
  if (!value) return undefined;
  if (value === "note" || value === "memory_suggestion" || value === "task" || value === "output" || value === "audit" || value === "feedback") {
    return value;
  }
  throw new ApiError(400, "invalid_project_data_ledger_kind", "kind must be note, memory_suggestion, task, output, audit, or feedback");
}

function parseProjectDataLedgerTimestamp(value: string | null, name: "from" | "to"): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) {
    throw new ApiError(400, "invalid_project_data_ledger_time", `${name} must be a valid ISO timestamp`);
  }
  return new Date(timestamp).toISOString();
}

function parseProjectFeedbackKind(value: unknown): MatterhornProjectFeedbackKind {
  if (
    value === "thumbs_up" ||
    value === "thumbs_down" ||
    value === "rating" ||
    value === "comment" ||
    value === "bug" ||
    value === "feature_request"
  ) {
    return value;
  }
  throw new ApiError(400, "invalid_project_feedback_kind", "feedback kind must be thumbs_up, thumbs_down, rating, comment, bug, or feature_request");
}

function optionalTrimmedString(value: unknown, field: string, limit: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_project_feedback", `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > limit) {
    throw new ApiError(400, "invalid_project_feedback", `${field} must be ${limit} characters or fewer`);
  }
  return scrubProjectLedgerText(trimmed).value;
}

function optionalFeedbackRating(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const rating = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new ApiError(400, "invalid_project_feedback_rating", "feedback rating must be between 1 and 5");
  }
  return rating;
}

function parseProjectFeedbackSourceType(
  value: string | undefined,
): NonNullable<MatterhornProjectFeedbackRequest["target"]>["sourceType"] | undefined {
  if (value === undefined) return undefined;
  if (value === "chat" || value === "task" || value === "output" || value === "memory" || value === "note" || value === "settings" || value === "wallet" || value === "other") {
    return value;
  }
  throw new ApiError(400, "invalid_project_feedback_target", "target.sourceType must be chat, task, output, memory, note, settings, wallet, or other");
}

function coerceProjectFeedbackTarget(value: unknown): MatterhornProjectFeedbackRequest["target"] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_project_feedback_target", "feedback target must be an object");
  }
  const target = value as Record<string, unknown>;
  const rawSourceType = optionalTrimmedString(target.sourceType, "target.sourceType", 80);
  const sourceType = parseProjectFeedbackSourceType(rawSourceType);
  const sourceId = optionalTrimmedString(target.sourceId, "target.sourceId", 160);
  const href = optionalTrimmedString(target.href, "target.href", 500);
  if (!sourceType && !sourceId && !href) return undefined;
  return { sourceType, sourceId, href };
}

function coerceProjectFeedbackRequest(value: unknown): MatterhornProjectFeedbackRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_project_feedback", "feedback body must be an object");
  }
  const input = value as Record<string, unknown>;
  const request: MatterhornProjectFeedbackRequest = {
    kind: parseProjectFeedbackKind(input.kind),
    target: coerceProjectFeedbackTarget(input.target),
    rating: optionalFeedbackRating(input.rating),
    comment: optionalTrimmedString(input.comment, "comment", 5000),
  };
  if (request.kind === "rating" && request.rating === undefined) {
    throw new ApiError(400, "invalid_project_feedback_rating", "rating feedback requires a rating");
  }
  if ((request.kind === "comment" || request.kind === "bug" || request.kind === "feature_request") && !request.comment) {
    throw new ApiError(400, "invalid_project_feedback_comment", `${request.kind} feedback requires a comment`);
  }
  return request;
}

function coerceNoteCreateRequest(value: unknown): MatterhornNoteCreateRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_note", "note body must be an object");
  }
  const input = value as MatterhornNoteCreateRequest;
  return {
    ...input,
    outputPath: input.outputPath ? normalizeWorkspaceRelativePath(String(input.outputPath), { allowSubdirs: true }) : input.outputPath,
  };
}

function coerceNoteUpdateRequest(value: unknown): MatterhornNoteUpdateRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_note", "note patch must be an object");
  }
  const input = value as MatterhornNoteUpdateRequest;
  return {
    ...input,
    outputPath: input.outputPath ? normalizeWorkspaceRelativePath(String(input.outputPath), { allowSubdirs: true }) : input.outputPath,
  };
}

function coerceNoteMemorySuggestionRequest(value: unknown): MatterhornNoteMemorySuggestionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as MatterhornNoteMemorySuggestionRequest;
}

function noteMemoryDesk(note: MatterhornNote): MatterhornMemoryDesk {
  const haystack = [note.desk ?? "", note.tags.join(" "), note.title, note.body].join(" ").toLowerCase();
  if (haystack.includes("bittensor") || haystack.includes("tao") || haystack.includes("ss58")) return "bittensor";
  if (haystack.includes("hyperliquid")) return "hyperliquid";
  if (haystack.includes("polymarket")) return "polymarket";
  if (haystack.includes("wellness") || haystack.includes("longevity") || haystack.includes("trainer") || haystack.includes("dietician") || haystack.includes("yoga")) return "wellness";
  if (haystack.includes("mcp") || haystack.includes("connector")) return "decentralized_services";
  return "generic_workspace";
}

function noteMemoryKind(
  desk: MatterhornMemoryDesk,
  requested: MatterhornNoteMemorySuggestionRequest["kind"],
  note: MatterhornNote,
): MatterhornMemoryKind {
  const policy = MATTERHORN_MEMORY_DESK_POLICY_MATRIX[desk];
  if (requested && policy.allowedKinds.includes(requested)) return requested;
  const text = `${note.title} ${note.body}`.toLowerCase();
  if (text.includes("decision") && policy.allowedKinds.includes("decision")) return "decision";
  if (note.outputPath && policy.allowedKinds.includes("workflow_artifact")) return "workflow_artifact";
  if (desk === "generic_workspace" && policy.allowedKinds.includes("project_fact")) return "project_fact";
  return policy.allowedKinds.includes("user_preference") ? "user_preference" : policy.allowedKinds[0];
}

function noteMemorySensitivity(desk: MatterhornMemoryDesk): MatterhornMemoryRecord["sensitivity"] {
  if (desk === "wellness") return "restricted";
  return "private";
}

function compactNoteText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 3).trimEnd()}...`;
}

function noteMemoryTags(note: MatterhornNote, desk: MatterhornMemoryDesk, extra: string[] | undefined): string[] {
  const deskTag = desk === "wellness" ? "longevity" : desk;
  const tags = new Set([
    "user-note",
    "memory-suggestion",
    deskTag,
    ...note.tags,
    ...(extra ?? []),
  ].map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean));
  if (desk === "wellness") tags.add("opt-in");
  return Array.from(tags).slice(0, 24);
}

function buildNoteMemorySuggestion(
  note: MatterhornNote,
  input: MatterhornNoteMemorySuggestionRequest = {},
): MatterhornMemorySuggestion {
  const desk = noteMemoryDesk(note);
  const policy = MATTERHORN_MEMORY_DESK_POLICY_MATRIX[desk];
  const kind = noteMemoryKind(desk, input.kind, note);
  const now = new Date().toISOString();
  const summary = compactNoteText(
    input.summary?.trim() ||
      note.body ||
      note.title,
    240,
  );
  const title = compactNoteText(input.title?.trim() || note.title || "Project note", 120);
  const tags = noteMemoryTags(note, desk, input.tags);
  const record: MatterhornMemoryRecord = {
    id: `mem_${note.id}`,
    kind,
    scope: "project",
    title,
    summary,
    body: {
      source: "user_note",
      noteId: note.id,
      noteTitle: note.title,
      noteExcerpt: compactNoteText(note.body, 1200),
      notePath: note.filePath,
      tags: note.tags,
      desk: note.desk ?? null,
      sessionId: note.sessionId ?? null,
      taskId: note.taskId ?? null,
      outputPath: note.outputPath ?? null,
      links: note.links,
    },
    tags,
    links: [
      {
        rel: "source_note",
        href: note.filePath,
        title: note.title,
      },
      ...(note.outputPath
        ? [{
            rel: "source_output",
            href: note.outputPath,
            title: "Linked output",
          }]
        : []),
    ],
    provenance: {
      source: "user_note",
      sourceId: note.id,
      capturedAt: now,
      capturedBy: "user",
      confidence: 0.72,
      reasonRemembered: "The user explicitly sent this project note to Memory review. Nothing is saved to Memory until the user confirms it.",
    },
    sensitivity: noteMemorySensitivity(desk),
    createdAt: now,
    updatedAt: now,
    canUseInChat: policy.canUseInChat,
    canExport: false,
    canDelete: true,
  };

  return {
    version: MATTERHORN_MEMORY_SUGGESTION_VERSION,
    id: `suggestion_${note.id}`,
    proposedRecord: record,
    reason: input.reason?.trim() || "The user asked Matterhorn to review this note as a possible Memory item.",
    source: "user_note",
    confidence: 0.72,
    desk,
    useCase: "project_note",
    userAction: "dismiss",
    captureMode: "user_confirmed_only",
    canAutoCapture: false,
    requiresExplicitConsent: true,
    forbiddenIfSecretDetected: true,
    policyDecision: "review",
    policyWarnings: [
      "This came from a project note. It remains a suggestion until the user confirms it in Memory.",
    ],
  };
}

function memoryApiError(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : String(error);
  if (/not found/i.test(message)) {
    return new ApiError(404, "memory_not_found", message);
  }
  if (/forbidden secret|safety validation|desk policy|policy forbids|less restrictive|not allowed for desk|forbidden_secret|live submission|private key|seed phrase|signed payload|raw signature|wallet export|api secret/i.test(message)) {
    return new ApiError(400, "memory_safety_rejected", message);
  }
  return new ApiError(400, "memory_request_failed", message);
}

function suiApiError(error: unknown): ApiError {
  if (error instanceof SuiInputError) {
    return new ApiError(400, error.code, error.message);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new ApiError(502, "sui_provider_unavailable", message || "Sui public read provider is unavailable");
}

function memorySurface(value: URL): "client" | "mcp" {
  return value.searchParams.get("surface") === "mcp" ? "mcp" : "client";
}

function canSendMemoryRecordToMcpApi(record: MatterhornMemoryRecord): boolean {
  const desk = detectMemoryDeskFromRecord(record);
  const policy = MATTERHORN_MEMORY_DESK_POLICY_MATRIX[desk];
  const validation = validateMemoryRecordAgainstDeskPolicy(record, desk);
  return policy.canSendToMcpApi && validation.ok && record.sensitivity !== "forbidden_secret";
}

function filterMemoryRecordsForSurface(
  records: MatterhornMemoryRecord[],
  surface: "client" | "mcp",
): MatterhornMemoryRecord[] {
  if (surface !== "mcp") return records;
  return records.filter(canSendMemoryRecordToMcpApi);
}

function assertMemoryRecordAllowedForSurface(
  record: MatterhornMemoryRecord,
  surface: "client" | "mcp",
): void {
  if (surface !== "mcp" || canSendMemoryRecordToMcpApi(record)) return;
  const desk = detectMemoryDeskFromRecord(record);
  throw new ApiError(
    403,
    "memory_policy_blocks_mcp_api",
    `Matterhorn Memory ${desk} policy blocks this record from MCP/API sharing.`,
  );
}

type SessionStreamEventInput = {
  request: Request;
  workspaceId: string;
  sessionId: string;
  snapshot: unknown | null;
  status: unknown;
  sinceCursor: string | null;
  includeDetails?: boolean;
  maxEvents?: number;
  heartbeatMs?: number;
};

function sessionEventStreamResponse(input: SessionStreamEventInput) {
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const heartbeatMs = Math.max(input.heartbeatMs ?? 15_000, 250);
  let index = Number.isFinite(Number(input.sinceCursor)) ? Number(input.sinceCursor) : 0;
  let sent = 0;
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const nextCursor = () => String(index > 0 ? ++index : startedAt + ++index);
  const close = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    try {
      controller.close();
    } catch {
      // The client may have closed the connection first.
    }
  };
  const emit = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    type: string,
    payload: Record<string, unknown>,
  ) => {
    if (closed) return;
    const cursor = nextCursor();
    const event = {
      type,
      cursor,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      observedAt: Date.now(),
      source: "matterhorn-work-server",
      payload,
    };
    controller.enqueue(encoder.encode(`id: ${cursor}\nevent: ${type}\ndata: ${JSON.stringify(event)}\n\n`));
    sent += 1;
    if (input.maxEvents && sent >= input.maxEvents) {
      close(controller);
    }
  };
  const emitSnapshotDetails = (controller: ReadableStreamDefaultController<Uint8Array>, snapshot: unknown) => {
    if (!isRecord(snapshot)) return;
    const messages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
    for (const message of messages) {
      if (!isRecord(message) || !isRecord(message.info)) continue;
      const messageId = typeof message.info.id === "string" ? message.info.id : "";
      if (!messageId) continue;
      const role = typeof message.info.role === "string" ? message.info.role : "unknown";
      emit(controller, "message.created", {
        messageId,
        role,
        parentId: typeof message.info.parentID === "string" ? message.info.parentID : null,
        createdAt: isRecord(message.info.time) && typeof message.info.time.created === "number" ? message.info.time.created : null,
      });
      const parts = Array.isArray(message.parts) ? message.parts : [];
      for (const part of parts) {
        if (!isRecord(part)) continue;
        emitSessionPartEvents(controller, messageId, role, part);
      }
      if (isRecord(message.info.time) && typeof message.info.time.completed === "number") {
        emit(controller, "message.completed", {
          messageId,
          role,
          completedAt: message.info.time.completed,
        });
      }
    }
    const todos = Array.isArray(snapshot.todos) ? snapshot.todos : [];
    if (todos.length) {
      emit(controller, "todo.updated", { todos });
    }
  };

  function emitSessionPartEvents(
    controller: ReadableStreamDefaultController<Uint8Array>,
    messageId: string,
    role: string,
    part: Record<string, unknown>,
  ) {
    const partId = typeof part.id === "string" ? part.id : null;
    const partType = typeof part.type === "string" ? part.type : "unknown";
    const text = typeof part.text === "string" ? part.text : typeof part.content === "string" ? part.content : "";
    if (text) {
      emit(controller, "message.delta", {
        messageId,
        role,
        partId,
        partType,
        delta: text,
      });
    }

    const toolName =
      typeof part.tool === "string"
        ? part.tool
        : typeof part.name === "string"
          ? part.name
          : typeof part.toolName === "string"
            ? part.toolName
            : typeof part.functionName === "string"
              ? part.functionName
              : "";
    const explicitToolCallId =
      typeof part.callID === "string"
        ? part.callID
        : typeof part.callId === "string"
          ? part.callId
          : typeof part.toolCallID === "string"
            ? part.toolCallID
            : typeof part.toolCallId === "string"
              ? part.toolCallId
              : "";
    const isToolPart = partType.includes("tool") || Boolean(toolName || explicitToolCallId);
    if (!isToolPart) return;

    const name = toolName || partType;
    const toolCallId = explicitToolCallId || partId;
    const status = typeof part.status === "string" ? part.status : typeof part.state === "string" ? part.state : null;
    emit(controller, "tool.started", {
      messageId,
      partId,
      toolCallId,
      name,
      status,
    });

    const error = typeof part.error === "string" ? part.error : null;
    const hasResult =
      Object.prototype.hasOwnProperty.call(part, "output") ||
      Object.prototype.hasOwnProperty.call(part, "result") ||
      Object.prototype.hasOwnProperty.call(part, "error");
    const completedStatuses = new Set(["completed", "complete", "done", "failed", "error"]);
    if (hasResult || (status && completedStatuses.has(status))) {
      emit(controller, "tool.completed", {
        messageId,
        partId,
        toolCallId,
        name,
        ok: !error && status !== "failed" && status !== "error",
        status,
        error,
      });
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (input.sinceCursor) {
        emit(controller, "error", {
          code: "cursor_expired",
          message: "Event cursor replay is not available yet; fetch a snapshot.",
          recoverable: true,
        });
      }
      if (input.snapshot) {
        emit(controller, "session.snapshot", input.snapshot as Record<string, unknown>);
        if (input.includeDetails) {
          emitSnapshotDetails(controller, input.snapshot);
        }
      }
      emit(controller, "session.status", input.status as Record<string, unknown>);
      if (!closed) {
        heartbeat = setInterval(() => {
          emit(controller, "heartbeat", { intervalMs: heartbeatMs });
        }, heartbeatMs);
      }
      input.request.signal.addEventListener("abort", () => close(controller), { once: true });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function withCors(response: Response, request: Request, config: ServerConfig) {
  const origin = request.headers.get("origin");
  const allowedOrigins = config.corsOrigins;
  let allowOrigin: string | null = null;
  if (allowedOrigins.includes("*")) {
    allowOrigin = "*";
  } else if (origin && allowedOrigins.includes(origin)) {
    allowOrigin = origin;
  }

  if (!allowOrigin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", allowOrigin);
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Matterhorn-Host-Token, X-OpenWork-Host-Token, X-OpenWork-Client-Id, X-OpenCode-Directory, X-Opencode-Directory, x-opencode-directory",
  );
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, headers });
}

async function requireClient(request: Request, config: ServerConfig, tokens: TokenService): Promise<Actor> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];
  if (!token) {
    throw new ApiError(401, "unauthorized", "Invalid bearer token");
  }
  const scope = await tokens.scopeForToken(token);
  if (!scope) {
    throw new ApiError(401, "unauthorized", "Invalid bearer token");
  }
  const clientId = request.headers.get("x-openwork-client-id") ?? undefined;
  return { type: "remote", clientId, tokenHash: hashToken(token), scope };
}

function requireHostToken(request: Request, config: ServerConfig): Actor {
  const hostToken = request.headers.get("x-matterhorn-host-token") ?? request.headers.get("x-openwork-host-token");
  if (hostToken && hostToken === config.hostToken) {
    return { type: "host", tokenHash: hashToken(hostToken), scope: "owner" };
  }
  throw new ApiError(401, "unauthorized", "Invalid host token");
}

async function requireHost(request: Request, config: ServerConfig, tokens: TokenService): Promise<Actor> {
  const hostToken = request.headers.get("x-matterhorn-host-token") ?? request.headers.get("x-openwork-host-token");
  if (hostToken && hostToken === config.hostToken) {
    return { type: "host", tokenHash: hashToken(hostToken), scope: "owner" };
  }

  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const bearer = match?.[1];
  if (!bearer) {
    throw new ApiError(401, "unauthorized", "Invalid host token");
  }
  const scope = await tokens.scopeForToken(bearer);
  if (scope !== "owner") {
    throw new ApiError(401, "unauthorized", "Invalid host token");
  }
  const clientId = request.headers.get("x-openwork-client-id") ?? undefined;
  return { type: "remote", clientId, tokenHash: hashToken(bearer), scope };
}

function buildCapabilities(config: ServerConfig): Capabilities {
  const writeEnabled = !config.readOnly;
  const schemaVersion = 1;
  const sandboxBackend = resolveSandboxBackend();
  const sandboxEnabled = resolveSandboxEnabled(sandboxBackend);
  const inboxEnabled = resolveInboxEnabled();
  const outboxEnabled = resolveOutboxEnabled();
  const maxBytes = resolveInboxMaxBytes();
  const toyUiEnabled = resolveToyUiEnabled();
  const browserProvider = resolveBrowserProvider();
  const opencodeConfigured = config.workspaces.some((workspace) => Boolean(workspace.baseUrl?.trim()));
  return {
    schemaVersion,
    serverVersion: SERVER_VERSION,
    opencodeVersion: OPENCODE_VERSION,
    skills: { read: true, write: writeEnabled, source: "openwork" },
    hub: {
      skills: {
        read: true,
        install: writeEnabled,
        repo: { owner: "different-ai", name: "openwork-hub", ref: "main" },
      },
    },
    plugins: { read: true, write: writeEnabled },
    mcp: { read: true, write: writeEnabled },
    commands: { read: true, write: writeEnabled },
    config: { read: true, write: writeEnabled },

    approvals: { mode: config.approval.mode, timeoutMs: config.approval.timeoutMs },
    sandbox: { enabled: sandboxEnabled, backend: sandboxBackend },
    ui: { toy: toyUiEnabled },
    tokens: { scoped: true, scopes: ["owner", "collaborator", "viewer"] },
    proxy: {
      opencode: opencodeConfigured,
    },
    toolProviders: {
      browser: browserProvider,
      files: {
        injection: writeEnabled && inboxEnabled,
        outbox: outboxEnabled,
        inboxPath: ".opencode/openwork/inbox/",
        outboxPath: ".opencode/openwork/outbox/",
        outputsPath: "outputs/",
        maxBytes,
      },
    },
  };
}

function capability(
  status: MatterhornCapabilityStatus,
  label: string,
  description?: string,
  details?: Record<string, unknown>,
  actions?: MatterhornCapability["actions"],
): MatterhornCapability {
  return {
    status,
    label,
    ...(description ? { description } : {}),
    ...(details ? { details } : {}),
    ...(actions?.length ? { actions } : {}),
  };
}

function dataStore(input: MatterhornDataStoreDescriptor): MatterhornDataStoreDescriptor {
  return input;
}

async function safeMemoryCounts(memoryVault: MatterhornMemoryVault): Promise<{ pending: number | undefined; confirmed: number | undefined; status: MatterhornCapabilityStatus }> {
  try {
    const [pending, records] = await Promise.all([
      memoryVault.listSuggestions({ status: "pending", limit: 500 }),
      memoryVault.listRecords({ includeDeleted: false, limit: 500 }),
    ]);
    return { pending: pending.length, confirmed: records.length, status: "working" };
  } catch {
    return { pending: undefined, confirmed: undefined, status: "error" };
  }
}

function backendSettingsSections(input: {
  readOnly: boolean;
  memoryStatus: MatterhornCapabilityStatus;
  notesStatus: MatterhornCapabilityStatus;
  evidenceStatus: MatterhornCapabilityStatus;
  walletStatus: MatterhornCapabilityStatus;
  securityStatus: MatterhornCapabilityStatus;
}): MatterhornSettingsSectionCapability[] {
  const base = (section: MatterhornSettingsSectionCapability["section"], item: MatterhornCapability): MatterhornSettingsSectionCapability => ({
    section,
    ...item,
  });
  return [
    base("overview", capability("working", "Overview", "Workspace overview is available from local server state.")),
    base("profile", capability("preview", "Profile", "Profile preferences are local/cloud mixed and should use backend capability statuses.")),
    base("models", capability("working", "Models", "Models are selected through OpenCode provider discovery.")),
    base("providers", capability("working", "Providers", "Provider setup is managed by OpenCode and optional Matterhorn Cloud imports.")),
    base("wallet", capability(input.walletStatus, "Wallet", "EVM and Sui can connect in web; Bittensor uses public reads and external signing.")),
    base("memory", capability(input.memoryStatus, "Memory", "User-controlled Memory review is available through the local memory vault.")),
    base("notes", capability(input.notesStatus, "Notes", "Workspace notes are stored as local markdown plus an index.")),
    base("outputs", capability("working", "Outputs", "Workspace outputs live under the workspace outputs folder.")),
    base("teams", capability("preview", "Teams", "Local token sharing exists; full cloud teammates require Matterhorn Cloud setup.")),
    base("security", capability(input.securityStatus, "Security", "Security posture is reported from server auth, CORS, roots, logging, and approval settings.")),
    base("feedback", capability("working", "Feedback", "Structured feedback is stored locally for evaluation, routing, and product quality only; it is not used for training by default.")),
    base("mcp", capability(input.readOnly ? "preview" : "working", "MCPs", input.readOnly ? "MCPs can be inspected in read-only mode." : "MCP configuration can be inspected and updated.")),
  ];
}

function walletFamily(input: MatterhornWalletFamilyCapability): MatterhornWalletFamilyCapability {
  return input;
}

async function buildBackendCapabilities(config: ServerConfig, memoryVault: MatterhornMemoryVault): Promise<MatterhornBackendCapabilitiesResponse> {
  const writeEnabled = !config.readOnly;
  const memoryCounts = await safeMemoryCounts(memoryVault);
  const corsWildcard = config.corsOrigins.includes("*");
  const loopback = config.host === "127.0.0.1" || config.host === "localhost" || config.host === "::1";
  const authorizedRootCount = config.authorizedRoots.length;
  const securityItems = {
    loopback: capability(
      loopback ? "working" : "needs_setup",
      loopback ? "Loopback server" : "Non-loopback server",
      loopback
        ? "The local engine is bound to a loopback host."
        : "The server is reachable beyond loopback; review token and network exposure.",
      { host: config.host },
    ),
    bearerTokens: capability("working", "Bearer tokens", "Client API requests require bearer tokens with viewer/collaborator/owner scopes.", {
      scopes: ["owner", "collaborator", "viewer"],
      tokenSource: config.tokenSource,
    }),
    hostToken: capability("working", "Host token", "Host-level actions require the host token or owner bearer token.", {
      hostTokenSource: config.hostTokenSource,
    }),
    approvals: capability(
      config.approval.mode === "manual" ? "working" : "preview",
      config.approval.mode === "manual" ? "Manual approvals" : "Auto approvals",
      config.approval.mode === "manual"
        ? "Risk-bearing actions require explicit approval."
        : "Approval mode is automatic; suitable for local development but less strict.",
      { mode: config.approval.mode, timeoutMs: config.approval.timeoutMs },
    ),
    cors: capability(
      corsWildcard ? "needs_setup" : "working",
      corsWildcard ? "Wildcard CORS" : "Restricted CORS",
      corsWildcard
        ? "CORS currently allows any origin. Restrict this before broader network exposure."
        : "CORS is restricted to configured origins.",
      { origins: config.corsOrigins },
    ),
    authorizedRoots: capability(
      authorizedRootCount > 0 ? "working" : "needs_setup",
      "Authorized roots",
      authorizedRootCount > 0
        ? "Workspace access is limited to configured authorized roots."
        : "No authorized roots are configured.",
      { count: authorizedRootCount },
    ),
    requestLogging: capability(
      config.logRequests ? "working" : "preview",
      config.logRequests ? "Request logging on" : "Request logging off",
      config.logRequests
        ? "Request logs include method, path, status, and timing, not request bodies."
        : "Request logging is disabled.",
      { logFormat: config.logFormat, logRequests: config.logRequests },
    ),
    memoryWriteGuards: capability("working", "Memory write guards", "Memory writes require a collaborator token and a writable server."),
  };
  const securityStatus: MatterhornCapabilityStatus = corsWildcard || !loopback || !authorizedRootCount
    ? "needs_setup"
    : config.approval.mode === "manual"
      ? "working"
      : "preview";

  const evm = walletFamily({
    family: "evm",
    ...capability("working", "EVM", "Direct wallet connect is available in the web app through wagmi/viem on Base and Base Sepolia."),
    custody: false,
    directConnect: true,
    publicRead: true,
    preview: true,
    signing: "client_wallet",
    supportedChains: ["base", "base-sepolia"],
  });
  const sui = walletFamily({
    family: "sui",
    ...capability(
      "preview",
      "Sui wallet preview",
      "Sui wallet-standard connect is wired through the current Mysten dApp Kit React packages for account reads; signing stays in the user's wallet.",
      {
        recommendedPackages: ["@mysten/dapp-kit-react", "@mysten/dapp-kit-core", "@mysten/sui"],
        configuredNetworks: ["sui-testnet", "sui-mainnet"],
        publicReadRoutes: ["/api/sui/account/:address", "/api/sui/balance/:address"],
        transactionPreviewRoutes: ["/api/sui/transactions/preview"],
        receiptRoutes: ["/api/sui/transactions/receipt"],
        signingBoundary: "client_wallet",
        docs: ["https://sdk.mystenlabs.com/dapp-kit/getting-started/react"],
      },
      [{ id: "sui.dapp-kit-docs", label: "Sui dApp Kit docs", kind: "external_link", href: "https://sdk.mystenlabs.com/dapp-kit/getting-started/react" }],
    ),
    custody: false,
    directConnect: true,
    publicRead: true,
    preview: true,
    signing: "client_wallet",
    supportedChains: ["sui-testnet", "sui-mainnet"],
  });
  const bittensor = walletFamily({
    family: "bittensor",
    ...capability("working", "Bittensor", "Bittensor uses public SS58 reads, unsigned previews, and external-signer handoffs."),
    custody: false,
    directConnect: false,
    publicRead: true,
    preview: true,
    signing: "external_signer",
  });

  const memoryStatus = memoryCounts.status;
  const notesStatus: MatterhornCapabilityStatus = "working";
  const evidenceStatus: MatterhornCapabilityStatus = "working";
  const walletStatus: MatterhornCapabilityStatus = "preview";

  return {
    success: true,
    version: "matterhorn.backend.capabilities.v1",
    generatedAt: new Date().toISOString(),
    server: {
      version: SERVER_VERSION,
      opencodeVersion: OPENCODE_VERSION,
      host: config.host,
      port: config.port,
      readOnly: config.readOnly,
      approvalMode: config.approval.mode,
    },
    models: {
      ...capability("working", "OpenCode model routing", "Agent responses are routed through OpenCode/OpenWork using the selected local model preference."),
      defaultModel: { providerId: "opencode", modelId: "big-pickle" },
      providerListSource: "opencode",
      selectedModelSource: "local_preferences",
      routing: {
        answerPath: "opencode_session_prompt_async",
        modelListTool: "opencode_provider_list",
        userSelectable: true,
        selectionSurface: "model_picker",
        preferenceStore: "local_preferences",
        cloudProviderImport: true,
      },
    },
    providers: {
      ...capability("working", "Provider discovery", "The app reads available models from OpenCode provider.list; Matterhorn Cloud providers can be imported separately."),
      sources: ["opencode", "matterhorn_cloud", "managed_openwork_models"],
    },
    storage: {
      ...capability("working", "Local storage map", "Matterhorn currently uses local workspace files, OpenCode runtime storage, a machine memory vault, and JSONL audit/task logs."),
      stores: {
        memory: dataStore({
          id: "memory",
          ...capability(memoryStatus, "Memory vault", "Default memory is machine-global unless MATTERHORN_WORK_MEMORY_ROOT points elsewhere."),
          scope: "machine_global",
          path: memoryVault.rootDir,
          format: "mixed",
          containsUserContent: true,
          containsSecrets: "redacted",
          retention: "user_controlled",
          exportable: true,
          deletable: true,
        }),
      },
    },
    memory: {
      ...capability(memoryStatus, "Memory review", "Suggestions never save automatically; users must Remember, Save edited, or Dismiss."),
      scope: "machine_global",
      rootPath: memoryVault.rootDir,
      pendingSuggestionCount: memoryCounts.pending,
      confirmedRecordCount: memoryCounts.confirmed,
    },
    notes: {
      ...capability(notesStatus, "Workspace notes", "Notes are workspace-local markdown plus a Matterhorn notes index."),
      scope: "workspace",
    },
    evidence: {
      ...capability(evidenceStatus, "Project evidence", "Project Activity is derived from notes, memory suggestions, task events, task runs, outputs, and workflow run receipts."),
      sources: ["notes", "memory", "task_events", "task_runs", "outputs", "workflow_runs"],
    },
    wallets: {
      ...capability(walletStatus, "Wallet families", "Wallet support is split by family so EVM, Sui, and Bittensor report separate custody and signing boundaries."),
      families: { evm, sui, bittensor },
    },
    teams: {
      ...capability("preview", "Team access", "Local token sharing exists; cloud teammate collaboration depends on Matterhorn Cloud setup."),
      localTokenSharing: capability("working", "Local token sharing", "Owner/collaborator/viewer tokens can be created for the local server."),
      cloudTeams: capability("needs_setup", "Cloud teams", "Organization members, invites, and shared workers require Matterhorn Cloud configuration."),
    },
    security: {
      ...capability(securityStatus, "Security posture", "Security is based on local binding, bearer tokens, host token, approvals, authorized roots, CORS, request logging, and memory write guards."),
      ...securityItems,
    },
    settings: backendSettingsSections({
      readOnly: !writeEnabled,
      memoryStatus,
      notesStatus,
      evidenceStatus,
      walletStatus,
      securityStatus,
    }),
  };
}

function buildWorkspaceDataMap(workspace: WorkspaceInfo, memoryVault: MatterhornMemoryVault): MatterhornWorkspaceDataMapResponse {
  const notes = new MatterhornNotesStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
  const opencodeDbPath = resolveOpencodeDbPath();
  const workflowRunsPath = join(workspace.path, ".matterhorn-work", "task-logs", workspace.id);
  const outputsPath = join(workspace.path, "outputs");
  const notesIndexPath = notes.indexPath;
  const notesDir = notes.notesDir;
  const memoryRoot = memoryVault.rootDir;
  const feedbackPath = projectFeedbackLogPath(workspace.id);
  const evidencePaths = [
    notesIndexPath,
    join(memoryRoot, "memory-suggestions.json"),
    taskEventsPath(workspace.id),
    workflowRunsPath,
    outputsPath,
    feedbackPath,
  ];

  return {
    success: true,
    version: "matterhorn.backend.data-map.v1",
    generatedAt: new Date().toISOString(),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      path: workspace.path,
      type: workspace.workspaceType,
      preset: workspace.preset,
    },
    stores: {
      chat: dataStore({
        id: "chat",
        ...capability("working", "Chat/session history", "Chat history is managed by the OpenCode runtime store."),
        scope: "opencode_runtime",
        path: opencodeDbPath,
        format: "sqlite",
        containsUserContent: true,
        containsSecrets: "possible",
        retention: "runtime_controlled",
        exportable: false,
        deletable: false,
      }),
      notes: dataStore({
        id: "notes",
        ...capability("working", "Notes", "Notes are stored inside the workspace as markdown plus an index."),
        scope: "workspace",
        paths: [notesDir, notesIndexPath],
        format: "mixed",
        containsUserContent: true,
        containsSecrets: "redacted",
        retention: "user_controlled",
        exportable: true,
        deletable: true,
      }),
      memory: dataStore({
        id: "memory",
        ...capability("working", "Memory vault", "Default memory is a machine-level vault, not a durable team workspace store yet."),
        scope: "machine_global",
        paths: [memoryRoot, join(memoryRoot, "memory-index.json"), join(memoryRoot, "memory-suggestions.json"), join(memoryRoot, "memory-log.jsonl")],
        format: "mixed",
        containsUserContent: true,
        containsSecrets: "redacted",
        retention: "user_controlled",
        exportable: true,
        deletable: true,
      }),
      outputs: dataStore({
        id: "outputs",
        ...capability(existsSync(outputsPath) ? "working" : "needs_setup", "Outputs", "User-visible deliverables should be saved under outputs/<desk>/<session-slug>/."),
        scope: "workspace",
        path: outputsPath,
        format: "directory",
        containsUserContent: true,
        containsSecrets: "redacted",
        retention: "user_controlled",
        exportable: true,
        deletable: true,
      }),
      audit: dataStore({
        id: "audit",
        ...capability("working", "Audit log", "Audit entries are append-only JSONL for workspace operations."),
        scope: "machine_global",
        path: auditLogPath(workspace.id),
        format: "jsonl",
        containsUserContent: false,
        containsSecrets: "never",
        retention: "append_only",
        exportable: true,
        deletable: false,
      }),
      taskEvents: dataStore({
        id: "taskEvents",
        ...capability("working", "Task events", "Task and workflow activity is stored as append-only JSONL."),
        scope: "machine_global",
        path: taskEventsPath(workspace.id),
        format: "jsonl",
        containsUserContent: true,
        containsSecrets: "redacted",
        retention: "append_only",
        exportable: true,
        deletable: false,
      }),
      workflowRuns: dataStore({
        id: "workflowRuns",
        ...capability("working", "Workflow run logs", "Workflow run event logs are persisted under the workspace Matterhorn task log folder when available."),
        scope: "workspace",
        path: workflowRunsPath,
        format: "jsonl",
        containsUserContent: true,
        containsSecrets: "redacted",
        retention: "append_only",
        exportable: true,
        deletable: false,
      }),
      evidence: dataStore({
        id: "evidence",
        ...capability("working", "Project evidence", "Project Activity is a normalized read layer across notes, memory suggestions, task events, task runs, outputs, and workflow runs."),
        scope: "workspace",
        paths: evidencePaths,
        format: "mixed",
        containsUserContent: true,
        containsSecrets: "redacted",
        retention: "runtime_controlled",
        exportable: true,
        deletable: false,
      }),
      feedback: dataStore({
        id: "feedback",
        ...capability("working", "Feedback", "Structured user feedback is stored locally for evaluation, routing, and product quality only."),
        scope: "machine_global",
        path: feedbackPath,
        format: "jsonl",
        containsUserContent: true,
        containsSecrets: "redacted",
        retention: "append_only",
        exportable: true,
        deletable: false,
      }),
    },
    policy: {
      trainingUse: "none_by_default",
      redaction: capability("working", "Redaction", "Memory, workflow, and market paths reject or redact known secret-shaped wallet/API/signature inputs."),
      export: capability("preview", "Export", "Memory can export bundles and workspace files are user-controlled; the project data ledger can be read as a unified JSON contract."),
      deletion: capability("preview", "Deletion", "Notes and memory records are user-deletable; append-only audit/task logs are retained for accountability."),
    },
  };
}

function objectField(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const child = (value as Record<string, unknown>)[key];
  if (!child || typeof child !== "object" || Array.isArray(child)) return null;
  return child as Record<string, unknown>;
}

function memoryMutationWorkspaceId(body: Record<string, unknown>): string | undefined {
  const direct = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
  if (direct) return direct;
  const record = objectField(body, "record");
  const recordWorkspace = typeof record?.workspaceId === "string" ? record.workspaceId.trim() : "";
  if (recordWorkspace) return recordWorkspace;
  const input = objectField(body, "input");
  const inputWorkspace = typeof input?.workspaceId === "string" ? input.workspaceId.trim() : "";
  if (inputWorkspace) return inputWorkspace;
  return undefined;
}

async function resolveMemoryMutationWorkspace(config: ServerConfig, body: Record<string, unknown>): Promise<WorkspaceInfo | null> {
  const workspaceId = memoryMutationWorkspaceId(body);
  if (workspaceId) return resolveWorkspace(config, workspaceId);
  const first = config.workspaces[0];
  if (!first) return null;
  try {
    return await resolveWorkspace(config, first.id);
  } catch {
    return null;
  }
}

async function recordMemoryMutationAudit(
  workspace: WorkspaceInfo | null,
  ctx: RequestContext,
  input: {
    action: string;
    target: string;
    summary: string;
  },
): Promise<void> {
  if (!workspace) return;
  await recordAudit(workspace.path, {
    id: shortId(),
    workspaceId: workspace.id,
    actor: ctx.actor ?? { type: "remote" },
    action: input.action,
    target: input.target,
    summary: input.summary,
    timestamp: Date.now(),
  });
}

function resolveSandboxBackend(): Capabilities["sandbox"]["backend"] {
  const raw = (process.env.OPENWORK_SANDBOX_BACKEND ?? "").trim().toLowerCase();
  if (raw === "docker") return "docker";
  if (raw === "container") return "container";
  return "none";
}

function resolveSandboxEnabled(backend: Capabilities["sandbox"]["backend"]): boolean {
  const raw = (process.env.OPENWORK_SANDBOX_ENABLED ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return backend !== "none";
}

function resolveInboxEnabled(): boolean {
  const raw = (process.env.OPENWORK_INBOX_ENABLED ?? "").trim().toLowerCase();
  if (!raw) return true;
  return ["1", "true", "yes", "on"].includes(raw);
}

function resolveOutboxEnabled(): boolean {
  const raw = (process.env.OPENWORK_OUTBOX_ENABLED ?? "").trim().toLowerCase();
  if (!raw) return true;
  return ["1", "true", "yes", "on"].includes(raw);
}

function resolveInboxMaxBytes(): number {
  const raw = (process.env.OPENWORK_INBOX_MAX_BYTES ?? "").trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(Math.trunc(parsed), 250_000_000);
  }
  return 50_000_000;
}

function resolveToyUiEnabled(): boolean {
  const raw = (process.env.OPENWORK_TOY_UI ?? "").trim().toLowerCase();
  if (!raw) return true;
  return ["1", "true", "yes", "on"].includes(raw);
}

// Dev-only log sink target. When OPENWORK_DEV_LOG_FILE is set to a path, the
// /dev/log endpoint accepts JSON payloads and appends them to that file so an
// operator can `tail -f` the file to see live browser activity. Returning null
// disables the endpoint entirely.
function resolveDevLogPath(): string | null {
  const raw = (process.env.OPENWORK_DEV_LOG_FILE ?? "").trim();
  return raw.length > 0 ? raw : null;
}

function resolveBrowserProvider(): Capabilities["toolProviders"]["browser"] {
  const raw = (process.env.OPENWORK_BROWSER_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "sandbox-headless") {
    return { enabled: true, placement: "in-sandbox", mode: "headless" };
  }
  if (raw === "host-interactive") {
    return { enabled: true, placement: "host-machine", mode: "interactive" };
  }
  if (raw === "client-interactive") {
    return { enabled: true, placement: "client-machine", mode: "interactive" };
  }
  return { enabled: false, placement: "external", mode: "none" };
}

function resolveInboxDir(workspaceRoot: string): string {
  return join(workspaceRoot, ".opencode", "openwork", "inbox");
}

function resolveOutboxDir(workspaceRoot: string): string {
  return join(workspaceRoot, ".opencode", "openwork", "outbox");
}

export function normalizeWorkspaceRelativePath(input: string, options: { allowSubdirs: boolean }): string {
  const raw = String(input ?? "").trim();
  if (!raw) {
    throw new ApiError(400, "invalid_path", "Path is required");
  }
  if (raw.includes("\u0000")) {
    throw new ApiError(400, "invalid_path", "Path contains null byte");
  }

  // A lot of user-facing surfaces (artifacts, tool logs) reference files as
  // `workspace/<path>` or `/workspace/<path>`. The server API expects
  // workspace-relative paths, so normalize those common prefixes here.
  let normalized = raw.replace(/\\/g, "/");
  normalized = normalized.replace(/^\/+/, "");
  normalized = normalized.replace(/^\.\//, "");
  normalized = normalized.replace(/^workspaces\/[^/]+\//i, "");
  normalized = normalized.replace(/^workspace\/(?:ws_[^/]+|\d+|[0-9a-f-]{6,})\//i, "");
  normalized = normalized.replace(/^workspace\//, "");
  normalized = normalized.replace(/^\/+/, "");

  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length) {
    throw new ApiError(400, "invalid_path", "Path is required");
  }
  if (!options.allowSubdirs && parts.length > 1) {
    throw new ApiError(400, "invalid_path", "Subdirectories are not allowed");
  }
  for (const part of parts) {
    if (part === "." || part === "..") {
      throw new ApiError(400, "invalid_path", "Path traversal is not allowed");
    }
  }
  return parts.join("/");
}

export function isSupportedWorkspaceTextFilePath(relativePath: string): boolean {
  const lowered = relativePath.toLowerCase();
  return [
    ".md",
    ".mdx",
    ".markdown",
    ".csv",
    ".tsv",
    ".json",
    ".jsonc",
    ".yaml",
    ".yml",
    ".toml",
    ".xml",
    ".html",
    ".htm",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".css",
    ".scss",
    ".txt",
    ".log",
  ].some((ext) =>
    lowered.endsWith(ext),
  );
}

function resolveSafeChildPath(root: string, child: string): string {
  const rootResolved = resolve(root);
  const candidate = resolve(rootResolved, child);
  if (candidate === rootResolved) {
    throw new ApiError(400, "invalid_path", "Path must point to a file");
  }
  if (!candidate.startsWith(rootResolved + sep)) {
    throw new ApiError(400, "invalid_path", "Path traversal is not allowed");
  }
  return candidate;
}

function encodeArtifactId(path: string): string {
  return Buffer.from(path, "utf8").toString("base64url");
}

function decodeArtifactId(id: string): string {
  const raw = (id ?? "").trim();
  if (!raw) {
    throw new ApiError(400, "invalid_artifact", "Artifact id is required");
  }
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    return normalizeWorkspaceRelativePath(decoded, { allowSubdirs: true });
  } catch {
    throw new ApiError(400, "invalid_artifact", "Artifact id is invalid");
  }
}

function contentTypeForPath(path: string): string {
  const lowered = path.toLowerCase();
  if (lowered.endsWith(".html") || lowered.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lowered.endsWith(".svg")) return "image/svg+xml";
  if (lowered.endsWith(".png")) return "image/png";
  if (lowered.endsWith(".jpg") || lowered.endsWith(".jpeg")) return "image/jpeg";
  if (lowered.endsWith(".gif")) return "image/gif";
  if (lowered.endsWith(".webp")) return "image/webp";
  if (lowered.endsWith(".pdf")) return "application/pdf";
  if (lowered.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (lowered.endsWith(".tsv")) return "text/tab-separated-values; charset=utf-8";
  if (lowered.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lowered.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lowered.endsWith(".ods")) return "application/vnd.oasis.opendocument.spreadsheet";
  if (isSupportedWorkspaceTextFilePath(path)) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

type ArtifactTargetInput = {
  kind?: unknown;
  value?: unknown;
  name?: unknown;
  preview?: unknown;
  confidence?: unknown;
  reason?: unknown;
};

function artifactPreviewForPath(path: string): string {
  const lowered = path.toLowerCase();
  if (/\.(md|markdown|mdx)$/.test(lowered)) return "markdown";
  if (/\.(csv|tsv|xlsx|xls|ods)$/.test(lowered)) return "sheet";
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(lowered)) return "image";
  if (lowered.endsWith(".pdf")) return "pdf";
  if (/\.(html|htm)$/.test(lowered)) return "html";
  if (isSupportedWorkspaceTextFilePath(path)) return "text";
  return "external";
}

function normalizeUrlTarget(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function resolveWorkspaceArtifactTargets(workspaceRoot: string, input: unknown): Promise<Array<Record<string, unknown>>> {
  const targets = Array.isArray(input) ? input.slice(0, 80) : [];
  const results = new Map<string, Record<string, unknown>>();
  const workspaceResolved = resolve(workspaceRoot);

  for (const item of targets) {
    if (!item || typeof item !== "object") continue;
    const target = item as ArtifactTargetInput;
    const kind = target.kind === "url" ? "url" : "file";
    const rawValue = typeof target.value === "string" ? target.value.trim() : "";
    if (!rawValue) continue;
    const confidence = typeof target.confidence === "number" && Number.isFinite(target.confidence) ? target.confidence : 0;
    const reason = typeof target.reason === "string" ? target.reason : "server";

    if (kind === "url") {
      const url = normalizeUrlTarget(rawValue);
      if (!url) continue;
      const key = `url:${url}`;
      const next = {
        id: key,
        kind: "url",
        value: url,
        name: typeof target.name === "string" && target.name.trim() ? target.name.trim() : url,
        preview: "browser",
        confidence,
        reason,
        exists: true,
      };
      const previous = results.get(key);
      if (!previous || confidence >= Number(previous.confidence ?? 0)) results.set(key, next);
      continue;
    }

    let relativePath: string;
    try {
      if (isAbsolute(rawValue)) {
        const absolutePath = resolve(rawValue);
        const pathFromWorkspace = relative(workspaceResolved, absolutePath);
        if (!pathFromWorkspace || pathFromWorkspace === ".." || pathFromWorkspace.startsWith(`..${sep}`) || isAbsolute(pathFromWorkspace)) {
          continue;
        }
        relativePath = normalizeWorkspaceRelativePath(pathFromWorkspace, { allowSubdirs: true });
      } else {
        relativePath = normalizeWorkspaceRelativePath(rawValue, { allowSubdirs: true });
      }
    } catch {
      continue;
    }
    const key = `file:${relativePath.toLowerCase()}`;
    const absPath = resolveSafeChildPath(workspaceRoot, relativePath);
    let existsFile = false;
    let size: number | undefined;
    let updatedAt: number | undefined;
    let kindValue: "file" | "dir" | "other" | undefined;
    if (await exists(absPath)) {
      const info = await stat(absPath);
      kindValue = info.isFile() ? "file" : info.isDirectory() ? "dir" : "other";
      existsFile = info.isFile();
      size = info.size;
      updatedAt = info.mtimeMs;
    }
    const next = {
      id: key,
      kind: "file",
      value: relativePath,
      name: basename(relativePath),
      preview: artifactPreviewForPath(relativePath),
      confidence,
      reason,
      exists: existsFile,
      fileKind: kindValue,
      size,
      updatedAt,
      contentType: contentTypeForPath(relativePath),
    };
    const previous = results.get(key);
    if (!previous || confidence >= Number(previous.confidence ?? 0)) results.set(key, next);
  }

  return Array.from(results.values());
}

function encodeInboxId(path: string): string {
  return encodeArtifactId(path);
}

function decodeInboxId(id: string): string {
  try {
    return decodeArtifactId(id);
  } catch {
    throw new ApiError(400, "invalid_inbox_item", "Inbox item id is invalid");
  }
}

async function listArtifacts(outboxRoot: string): Promise<Array<{ id: string; path: string; size: number; updatedAt: number }>> {
  const rootResolved = resolve(outboxRoot);
  if (!(await exists(rootResolved))) return [];

  const items: Array<{ id: string; path: string; size: number; updatedAt: number }> = [];
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = normalizeWorkspaceRelativePath(relative(rootResolved, abs), { allowSubdirs: true });
      const info = await stat(abs);
      items.push({
        id: encodeArtifactId(rel),
        path: rel,
        size: info.size,
        updatedAt: info.mtimeMs,
      });
    }
  };

  try {
    await walk(rootResolved);
  } catch {
    return [];
  }

  items.sort((a, b) => b.updatedAt - a.updatedAt);
  return items;
}

async function listInbox(inboxRoot: string): Promise<Array<{ id: string; path: string; size: number; updatedAt: number; name: string }>> {
  const items = await listArtifacts(inboxRoot);
  return items.map((item) => ({
    ...item,
    id: encodeInboxId(item.path),
    name: basename(item.path),
  }));
}

type FileSessionCatalogEntry = {
  path: string;
  kind: "file" | "dir";
  size: number;
  mtimeMs: number;
  revision: string;
};

function fileRevision(info: { mtimeMs: number; size: number }): string {
  return `${Math.floor(info.mtimeMs)}:${info.size}`;
}

function parseFileSessionTtlMs(input: unknown): number {
  const raw = typeof input === "number" && Number.isFinite(input) ? input : Number.NaN;
  if (Number.isNaN(raw)) return FILE_SESSION_DEFAULT_TTL_MS;
  const ttlMs = Math.floor(raw * 1000);
  if (ttlMs < FILE_SESSION_MIN_TTL_MS) return FILE_SESSION_MIN_TTL_MS;
  if (ttlMs > FILE_SESSION_MAX_TTL_MS) return FILE_SESSION_MAX_TTL_MS;
  return ttlMs;
}

function parseCatalogLimit(input: string | null): number {
  if (!input) return FILE_SESSION_CATALOG_DEFAULT_LIMIT;
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) return FILE_SESSION_CATALOG_DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), FILE_SESSION_CATALOG_MAX_LIMIT);
}

function parseSessionCursor(input: string | null): number {
  if (!input) return 0;
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function parseCatalogPathFilter(input: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return normalizeWorkspaceRelativePath(trimmed, { allowSubdirs: true });
}

function matchesCatalogFilter(path: string, filter: string | null): boolean {
  if (!filter) return true;
  return path === filter || path.startsWith(`${filter}/`);
}

function normalizeResolvedRelativePath(input: string): string {
  const normalized = input.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length) {
    throw new ApiError(400, "invalid_path", "Path is required");
  }
  for (const part of parts) {
    if (part === "." || part === "..") {
      throw new ApiError(400, "invalid_path", "Path traversal is not allowed");
    }
  }
  return parts.join("/");
}

async function listWorkspaceCatalogEntries(workspaceRoot: string): Promise<FileSessionCatalogEntry[]> {
  const rootResolved = resolve(workspaceRoot);
  const items: FileSessionCatalogEntry[] = [];

  const walk = async (dirPath: string) => {
    const entries = await readdir(dirPath, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absPath = join(dirPath, entry.name);
      const relRaw = relative(rootResolved, absPath).replace(/\\/g, "/");
      const rel = normalizeResolvedRelativePath(relRaw);

      if (entry.isDirectory()) {
        const info = await stat(absPath);
        items.push({
          path: rel,
          kind: "dir",
          size: 0,
          mtimeMs: info.mtimeMs,
          revision: fileRevision({ mtimeMs: info.mtimeMs, size: 0 }),
        });
        await walk(absPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const info = await stat(absPath);
      items.push({
        path: rel,
        kind: "file",
        size: info.size,
        mtimeMs: info.mtimeMs,
        revision: fileRevision(info),
      });
    }
  };

  if (await exists(rootResolved)) {
    await walk(rootResolved);
  }

  items.sort((a, b) => a.path.localeCompare(b.path));
  return items;
}

function parseBatchPathList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    throw new ApiError(400, "invalid_payload", "paths must be an array");
  }
  if (!input.length) {
    throw new ApiError(400, "invalid_payload", "paths must not be empty");
  }
  if (input.length > FILE_SESSION_MAX_BATCH_ITEMS) {
    throw new ApiError(400, "invalid_payload", `paths must include <= ${FILE_SESSION_MAX_BATCH_ITEMS} items`);
  }
  return input.map((raw) => normalizeWorkspaceRelativePath(String(raw ?? ""), { allowSubdirs: true }));
}

function parseBatchWriteList(input: unknown): Array<{ path: string; contentBase64: string; ifMatchRevision?: string; force?: boolean }> {
  if (!Array.isArray(input)) {
    throw new ApiError(400, "invalid_payload", "writes must be an array");
  }
  if (!input.length) {
    throw new ApiError(400, "invalid_payload", "writes must not be empty");
  }
  if (input.length > FILE_SESSION_MAX_BATCH_ITEMS) {
    throw new ApiError(400, "invalid_payload", `writes must include <= ${FILE_SESSION_MAX_BATCH_ITEMS} items`);
  }

  return input.map((raw) => {
    if (!raw || typeof raw !== "object") {
      throw new ApiError(400, "invalid_payload", "write entries must be objects");
    }
    const record = raw as Record<string, unknown>;
    const contentBase64 = typeof record.contentBase64 === "string" ? record.contentBase64.trim() : "";
    if (!contentBase64) {
      throw new ApiError(400, "invalid_payload", "contentBase64 is required");
    }
    const ifMatchRevision =
      typeof record.ifMatchRevision === "string" && record.ifMatchRevision.trim().length
        ? record.ifMatchRevision.trim()
        : undefined;
    return {
      path: normalizeWorkspaceRelativePath(String(record.path ?? ""), { allowSubdirs: true }),
      contentBase64,
      ...(ifMatchRevision ? { ifMatchRevision } : {}),
      ...(record.force === true ? { force: true } : {}),
    };
  });
}

function emitReloadEvent(
  reloadEvents: ReloadEventStore,
  workspace: WorkspaceInfo,
  reason: ReloadReason,
  trigger?: ReloadTrigger,
) {
  reloadEvents.recordDebounced(workspace.id, reason, trigger);
}

function buildConfigTrigger(path: string): ReloadTrigger {
  const name = path.split(/[\\/]/).filter(Boolean).pop();
  return {
    type: "config",
    name: name || "opencode.json",
    action: "updated",
    path,
  };
}

function serializeWorkspace(workspace: ServerConfig["workspaces"][number]) {
  const { opencodeUsername, opencodePassword, ...rest } = workspace;
  const opencodeDirectory = resolveOpencodeDirectory(workspace);
  const opencode =
    workspace.baseUrl || opencodeDirectory || opencodeUsername || opencodePassword
      ? {
          baseUrl: workspace.baseUrl,
          directory: opencodeDirectory ?? undefined,
          username: opencodeUsername,
          password: opencodePassword,
        }
      : undefined;
  return {
    ...rest,
    opencode,
  };
}

const WORKFLOW_TASK_EVENT_TYPES: Record<MatterhornWorkflowRunEventType, MatterhornTaskEventType> = {
  "workflow.staged": "workflow_staged",
  "workflow.started": "workflow_started",
  "workflow.stage_started": "stage_started",
  "workflow.tool_called": "tool_called",
  "workflow.artifact_saved": "artifact_saved",
  "workflow.waiting_for_user": "waiting_for_user",
  "workflow.completed": "completed",
  "workflow.failed": "failed",
  "workflow.cancelled": "cancelled",
};

function formatWorkflowDeskLabel(deskId: string): string {
  if (deskId === "wellness") return "Longevity";
  if (deskId === "mcps") return "MCPs";
  return deskId
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Matterhorn";
}

function workflowEventPayload(event: MatterhornWorkflowRunEvent): Record<string, unknown> | null {
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    return null;
  }
  return event.payload as Record<string, unknown>;
}

function workflowTaskEventSummary(run: MatterhornWorkflowRun, event: MatterhornWorkflowRunEvent): string {
  const desk = formatWorkflowDeskLabel(run.deskId);
  if (event.type === "workflow.staged") return `${desk} task staged`;
  if (event.type === "workflow.started") return `${desk} task started`;
  if (event.type === "workflow.stage_started") return `${desk} stage started`;
  if (event.type === "workflow.tool_called") return `${desk} tool called`;
  if (event.type === "workflow.artifact_saved") return `${desk} output saved`;
  if (event.type === "workflow.waiting_for_user") return `${desk} waiting for user`;
  if (event.type === "workflow.completed") return `${desk} task completed`;
  if (event.type === "workflow.failed") return `${desk} task failed`;
  if (event.type === "workflow.cancelled") return `${desk} task cancelled`;
  return `${desk} task updated`;
}

async function recordWorkflowTaskEvent(
  run: MatterhornWorkflowRun,
  event: MatterhornWorkflowRunEvent,
): Promise<void> {
  const payload = workflowEventPayload(event);
  const artifactPath = typeof payload?.path === "string" ? payload.path : undefined;
  const toolName = typeof payload?.tool === "string" ? payload.tool : undefined;
  const sessionSlug = normalizeSessionSlug(run.sessionId);

  await recordTaskEvent({
    id: `task_evt_${shortId()}`,
    workspaceId: run.workspaceId,
    taskId: run.workflowRunId,
    type: WORKFLOW_TASK_EVENT_TYPES[event.type],
    timestamp: event.timestamp,
    summary: workflowTaskEventSummary(run, event),
    detail: `${run.deskId};${sessionSlug};${run.workflowId};${run.outputBasePath}`,
    artifactPath,
    toolName,
    stageName: event.stageId,
  });
}

type SuiWorkspaceEvidenceInput = {
  workspace: WorkspaceInfo;
  ctx: RequestContext;
  taskId: string;
  sessionSlug: string;
  outputPath: string;
  outputPayload: Record<string, unknown>;
  summary: string;
  auditAction: string;
};

async function recordSuiWorkspaceEvidence(input: SuiWorkspaceEvidenceInput): Promise<void> {
  const timestamp = Date.now();
  const absPath = resolveSafeChildPath(input.workspace.path, input.outputPath);
  await ensureDir(dirname(absPath));
  await writeFile(absPath, JSON.stringify(input.outputPayload, null, 2) + "\n", "utf8");

  const detail = `sui;${input.sessionSlug};sui_wallet_workflow;outputs/sui`;
  await recordTaskEvent({
    id: `task_evt_${shortId()}`,
    workspaceId: input.workspace.id,
    taskId: input.taskId,
    type: "artifact_saved",
    timestamp,
    summary: input.summary,
    detail,
    artifactPath: input.outputPath,
    stageName: "sui_wallet_evidence",
  });
  await recordTaskEvent({
    id: `task_evt_${shortId()}`,
    workspaceId: input.workspace.id,
    taskId: input.taskId,
    type: "completed",
    timestamp: timestamp + 1,
    summary: input.summary,
    detail,
    stageName: "sui_wallet_evidence",
  });

  await recordAudit(input.workspace.path, {
    id: shortId(),
    workspaceId: input.workspace.id,
    actor: input.ctx.actor ?? { type: "remote" },
    action: input.auditAction,
    target: absPath,
    summary: input.summary,
    timestamp,
  });
}

function createRoutes(
  config: ServerConfig,
  approvals: ApprovalService,
  tokens: TokenService,
  env: EnvService,
  onWorkspacesChanged: () => void,
): Route[] {
  const routes: Route[] = [];
  const fileSessions = new FileSessionStore();
  const googleWorkspaceConnectFlows = createGoogleWorkspaceConnectFlowManager(config);
  const memoryVault = createMatterhornMemoryVault(resolveMatterhornMemoryRoot());
  const workflowRuns = new WorkflowRunEngine({
    persistenceRoot: config.workspaces[0]?.path ?? process.cwd(),
    onEvent: recordWorkflowTaskEvent,
  });

  const serializeFileSession = (session: {
    id: string;
    workspaceId: string;
    createdAt: number;
    expiresAt: number;
    canWrite: boolean;
  }) => ({
    id: session.id,
    workspaceId: session.workspaceId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    ttlMs: Math.max(0, session.expiresAt - Date.now()),
    canWrite: session.canWrite,
  });

  const resolveFileSession = (ctx: RequestContext, sessionId: string) => {
    const session = fileSessions.get(sessionId);
    if (!session) {
      throw new ApiError(404, "file_session_not_found", "File session not found");
    }

    if (!ctx.actor?.tokenHash || session.actorTokenHash !== ctx.actor.tokenHash) {
      throw new ApiError(403, "forbidden", "File session does not belong to this token");
    }

    const workspace = config.workspaces.find((item) => item.id === session.workspaceId);
    if (!workspace) {
      throw new ApiError(404, "workspace_not_found", "Workspace not found for this file session");
    }

    return { session, workspace };
  };

  const recordWorkspaceFileEvent = (workspaceId: string, input: { type: "write" | "delete" | "rename" | "mkdir"; path: string; toPath?: string; revision?: string }) => {
    return fileSessions.recordWorkspaceEvent({ workspaceId, ...input });
  };

  addRoute(routes, "GET", "/health", "none", async () => {
    return jsonResponse({ ok: true, version: SERVER_VERSION, opencodeVersion: OPENCODE_VERSION, uptimeMs: Date.now() - config.startedAt });
  });

  addRoute(routes, "GET", "/w/:id/health", "none", async () => {
    return jsonResponse({ ok: true, version: SERVER_VERSION, opencodeVersion: OPENCODE_VERSION, uptimeMs: Date.now() - config.startedAt });
  });

  // Dev log sink: append browser console + error events to a file that an
  // operator (or an AI driver) can tail. Unauth on purpose because this is
  // scoped to the dev host and needs to work before clients finish wiring
  // tokens; it is also a no-op when OPENWORK_DEV_LOG_FILE is unset.
  addRoute(routes, "POST", "/dev/log", "none", async (ctx) => {
    const target = resolveDevLogPath();
    if (!target) {
      return jsonResponse({ ok: false, reason: "dev_log_disabled" }, 404);
    }
    let payload: unknown = null;
    try {
      payload = await ctx.request.json();
    } catch {
      return jsonResponse({ ok: false, reason: "invalid_json" }, 400);
    }
    const entries = Array.isArray(payload) ? payload : [payload];
    try {
      await mkdir(dirname(target), { recursive: true });
      const lines = entries
        .map((entry) => {
          try {
            const stamped = { at: new Date().toISOString(), ...(entry as Record<string, unknown>) };
            return JSON.stringify(stamped);
          } catch {
            return JSON.stringify({ at: new Date().toISOString(), raw: String(entry) });
          }
        })
        .join("\n");
      await appendFile(target, `${lines}\n`, "utf8");
    } catch (error) {
      return jsonResponse({ ok: false, reason: error instanceof Error ? error.message : String(error) }, 500);
    }
    return jsonResponse({ ok: true, count: entries.length });
  });

  addRoute(routes, "GET", "/dev/log", "none", async () => {
    // Probe response: always 200 so the client's capability probe doesn't
    // log a noisy "Failed to load resource: 404" in the browser console
    // when the sink is simply disabled. Clients should key on `ok` + `reason`
    // in the body, not on HTTP status.
    const target = resolveDevLogPath();
    if (!target) {
      return jsonResponse({ ok: false, reason: "dev_log_disabled" });
    }
    return jsonResponse({ ok: true, path: target });
  });

  addRoute(routes, "GET", "/ui", "none", async () => {
    if (!resolveToyUiEnabled()) {
      throw new ApiError(404, "ui_disabled", "Toy UI is disabled");
    }
    return htmlResponse(TOY_UI_HTML);
  });

  addRoute(routes, "GET", "/w/:id/ui", "none", async () => {
    if (!resolveToyUiEnabled()) {
      throw new ApiError(404, "ui_disabled", "Toy UI is disabled");
    }
    return htmlResponse(TOY_UI_HTML);
  });

  addRoute(routes, "GET", "/ui/assets/toy.css", "none", async () => {
    if (!resolveToyUiEnabled()) {
      throw new ApiError(404, "ui_disabled", "Toy UI is disabled");
    }
    return cssResponse(TOY_UI_CSS);
  });

  addRoute(routes, "GET", "/ui/assets/toy.js", "none", async () => {
    if (!resolveToyUiEnabled()) {
      throw new ApiError(404, "ui_disabled", "Toy UI is disabled");
    }
    return jsResponse(TOY_UI_JS);
  });

  addRoute(routes, "GET", "/ui/assets/openwork-mark.svg", "none", async () => {
    if (!resolveToyUiEnabled()) {
      throw new ApiError(404, "ui_disabled", "Toy UI is disabled");
    }
    return svgResponse(TOY_UI_FAVICON_SVG);
  });

  addRoute(routes, "GET", "/w/:id/status", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    return jsonResponse({
      ok: true,
      version: SERVER_VERSION,
      opencodeVersion: OPENCODE_VERSION,
      uptimeMs: Date.now() - config.startedAt,
      readOnly: config.readOnly,
      approval: config.approval,
      corsOrigins: config.corsOrigins,
      workspaceCount: 1,
      activeWorkspaceId: workspace.id,
      workspace: serializeWorkspace(workspace),
      authorizedRoots: config.authorizedRoots,
      server: {
        host: config.host,
        port: config.port,
        configPath: config.configPath ?? null,
      },
      tokenSource: {
        client: config.tokenSource,
        host: config.hostTokenSource,
      },
    });
  });

  addRoute(routes, "GET", "/w/:id/capabilities", "client", async () => {
    return jsonResponse(buildCapabilities(config));
  });

  addRoute(routes, "GET", "/w/:id/workspaces", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    return jsonResponse({ items: [serializeWorkspace(workspace)], activeId: workspace.id });
  });

  addRoute(routes, "GET", "/status", "client", async () => {
    const active = config.workspaces[0];
    return jsonResponse({
      ok: true,
      version: SERVER_VERSION,
      opencodeVersion: OPENCODE_VERSION,
      uptimeMs: Date.now() - config.startedAt,
      readOnly: config.readOnly,
      approval: config.approval,
      corsOrigins: config.corsOrigins,
      workspaceCount: config.workspaces.length,
      activeWorkspaceId: active?.id ?? null,
      workspace: active ? serializeWorkspace(active) : null,
      authorizedRoots: config.authorizedRoots,
      server: {
        host: config.host,
        port: config.port,
        configPath: config.configPath ?? null,
      },
      tokenSource: {
        client: config.tokenSource,
        host: config.hostTokenSource,
      },
    });
  });

  addRoute(routes, "GET", "/runtime/versions", "client", async () => {
    const snapshot = await fetchRuntimeControl("/runtime/versions");
    return jsonResponse(snapshot);
  });

  addRoute(routes, "POST", "/runtime/upgrade", "host", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const result = await fetchRuntimeControl("/runtime/upgrade", { method: "POST", body });
    return jsonResponse(result, 202);
  });

  addRoute(routes, "GET", "/w/:id/runtime/versions", "client", async () => {
    const snapshot = await fetchRuntimeControl("/runtime/versions");
    return jsonResponse(snapshot);
  });

  addRoute(routes, "POST", "/w/:id/runtime/upgrade", "host", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const result = await fetchRuntimeControl("/runtime/upgrade", { method: "POST", body });
    return jsonResponse(result, 202);
  });

  addRoute(routes, "GET", "/whoami", "client", async (ctx) => {
    return jsonResponse({ ok: true, actor: ctx.actor ?? null });
  });

  addRoute(routes, "GET", "/capabilities", "client", async () => {
    return jsonResponse(buildCapabilities(config));
  });

  addRoute(routes, "GET", "/api/backend/capabilities", "client", async () => {
    return jsonResponse(await buildBackendCapabilities(config, memoryVault));
  });

  addRoute(routes, "GET", "/api/backend/models", "client", async () => {
    return jsonResponse(buildBackendModels());
  });

  addRoute(routes, "GET", "/workspace/:id/backend/team-access", "host", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    return jsonResponse(await buildBackendTeamAccess(config, workspace, tokens));
  });

  addRoute(routes, "GET", "/experimental/extensions/actions", "client", async (ctx) => {
    const extensionId = ctx.url.searchParams.get("extensionId") ?? "";
    return jsonResponse({
      ok: true,
      schemaVersion: 1,
      actions: listExperimentalExtensionActions(extensionId),
    });
  });

  addRoute(routes, "POST", "/experimental/extensions/call", "client", async (ctx) => {
    if (ctx.actor?.scope === "viewer") {
      throw new ApiError(403, "forbidden", "Viewer tokens cannot call extension actions");
    }
    const body = await readJsonBody(ctx.request);
    return jsonResponse(await callExperimentalExtensionAction(config, body));
  });

  addRoute(routes, "GET", "/experimental/google-workspace/status", "client", async () => {
    return jsonResponse(await googleWorkspaceStatus(config));
  });

  addRoute(routes, "POST", "/experimental/google-workspace/connect/start", "client", async (ctx) => {
    if (ctx.actor?.scope === "viewer") throw new ApiError(403, "forbidden", "Viewer tokens cannot connect Google Workspace");
    return jsonResponse(await googleWorkspaceConnectFlows.start(), 201);
  });

  addRoute(routes, "GET", "/experimental/google-workspace/connect/status/:flowId", "client", async (ctx) => {
    return jsonResponse(await googleWorkspaceConnectFlows.status(ctx.params.flowId));
  });

  addRoute(routes, "POST", "/experimental/google-workspace/disconnect", "client", async (ctx) => {
    if (ctx.actor?.scope === "viewer") throw new ApiError(403, "forbidden", "Viewer tokens cannot disconnect Google Workspace");
    return jsonResponse(await googleWorkspaceDisconnect(config));
  });

  addRoute(routes, "POST", "/experimental/google-workspace/test", "client", async () => {
    return jsonResponse(await googleWorkspaceTestConnection(config));
  });

  addRoute(routes, "POST", "/experimental/google-workspace/smoke-test", "client", async () => {
    return jsonResponse(await googleWorkspaceRunScopeSmokeTest(config));
  });

  addRoute(routes, "GET", "/workspaces", "client", async () => {
    const active = config.workspaces[0] ?? null;
    const items = config.workspaces.map(serializeWorkspace);
    return jsonResponse({ items, workspaces: items, activeId: active?.id ?? null });
  });

  addRoute(routes, "GET", "/tokens", "host", async () => {
    const items = await tokens.list();
    return jsonResponse({ items });
  });

  addRoute(routes, "POST", "/tokens", "host", async (ctx) => {
    ensureWritable(config);
    const body = await readJsonBody(ctx.request);
    const scopeRaw = typeof body.scope === "string" ? body.scope.trim() : "";
    const scope = scopeRaw === "owner" || scopeRaw === "collaborator" || scopeRaw === "viewer" ? scopeRaw : null;
    if (!scope) {
      throw new ApiError(400, "invalid_scope", "Token scope must be owner, collaborator, or viewer");
    }
    const label = typeof body.label === "string" ? body.label.trim() : undefined;
    const issued = await tokens.create(scope, { label });
    return jsonResponse(issued, 201);
  });

  addRoute(routes, "DELETE", "/tokens/:id", "host", async (ctx) => {
    ensureWritable(config);
    const ok = await tokens.revoke(ctx.params.id);
    if (!ok) {
      throw new ApiError(404, "token_not_found", "Token not found");
    }
    return jsonResponse({ ok: true });
  });

  function rethrowEnvStoreReadError(error: unknown): never {
    if (error instanceof EnvStoreReadError) {
      throw new ApiError(
        409,
        error.code,
        "Environment variable store is invalid. Fix or remove the local env file before editing.",
      );
    }
    throw error;
  }

  // User-level env vars (see apps/app/pr/environment-variables.md). All routes
  // require the desktop host token (not owner bearer tokens) because values are
  // returned raw; the React pane masks them only for display. Reload semantics
  // are driven from the UI after a write; this surface is user-scoped, not
  // workspace-scoped, so no audit.
  addRoute(routes, "GET", "/env", "host-token", async () => {
    const items = await env.list().catch(rethrowEnvStoreReadError);
    return jsonResponse({ items });
  });

  addRoute(routes, "GET", "/env/keys", "host-token", async () => {
    const items = await env.list().catch(rethrowEnvStoreReadError);
    return jsonResponse({ keys: items.map((item) => item.key) });
  });

  addRoute(routes, "PUT", "/env", "host-token", async (ctx) => {
    ensureWritable(config);
    const body = await readJsonBody(ctx.request);
    const rawEntries = Array.isArray(body.entries)
      ? body.entries
      : [{ key: body.key, value: body.value }];
    const entries: Array<{ key: string; value: string }> = [];
    for (const raw of rawEntries) {
      if (!raw || typeof raw !== "object") {
        throw new ApiError(400, "invalid_entry", "Each entry must be an object");
      }
      const candidate = raw as { key?: unknown; value?: unknown };
      const key = typeof candidate.key === "string" ? candidate.key.trim() : "";
      const value = typeof candidate.value === "string" ? candidate.value : "";
      if (!isValidEnvKey(key)) {
        throw new ApiError(400, "invalid_env_key", "Invalid environment variable name");
      }
      entries.push({ key, value });
    }
    if (entries.length === 0) {
      throw new ApiError(400, "no_entries", "No entries provided");
    }
    try {
      await env.upsertMany(entries);
    } catch (error) {
      if (error instanceof EnvStoreReadError) {
        rethrowEnvStoreReadError(error);
      }
      if (error instanceof InvalidEnvKeyError) {
        throw new ApiError(
          400,
          error.code,
          error.code === "reserved_env_key"
            ? "Environment variable name is reserved for OpenWork internals"
            : "Invalid environment variable name",
        );
      }
      throw error;
    }
    return jsonResponse({ ok: true, count: entries.length });
  });

  addRoute(routes, "DELETE", "/env/:key", "host-token", async (ctx) => {
    ensureWritable(config);
    const key = ctx.params.key;
    if (!isValidEnvKey(key)) {
      throw new ApiError(400, "invalid_env_key", "Invalid environment variable name");
    }
    const removed = await env.delete(key).catch(rethrowEnvStoreReadError);
    if (!removed) {
      throw new ApiError(404, "env_not_found", "Environment variable not found");
    }
    return jsonResponse({ ok: true });
  });

  addRoute(routes, "POST", "/voice/realtime/session", "host", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    return jsonResponse(await createOpenAiRealtimeVoiceSession(env, body));
  });

  addRoute(routes, "POST", "/workspaces/local", "host", async (ctx) => {
    ensureWritable(config);
    const body = await readJsonBody(ctx.request);
    const folderPath = typeof body.folderPath === "string" ? body.folderPath.trim() : "";
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : basename(folderPath || "Workspace");
    const preset = typeof body.preset === "string" && body.preset.trim() ? body.preset.trim() : "starter";

    if (!folderPath) {
      throw new ApiError(400, "invalid_payload", "folderPath is required");
    }

    const workspacePath = resolve(folderPath);
    await ensureDir(workspacePath);
    await ensureWorkspaceFiles(workspacePath, preset);

    const workspace: WorkspaceInfo = {
      id: workspaceIdForPath(workspacePath),
      name,
      path: workspacePath,
      preset,
      workspaceType: "local",
      ...inheritWorkspaceOpencodeConnection(config),
    };

    config.workspaces = [workspace, ...config.workspaces.filter((entry) => entry.id !== workspace.id)];
    if (!config.authorizedRoots.some((root) => resolve(root) === workspacePath)) {
      config.authorizedRoots = [...config.authorizedRoots, workspacePath];
    }
    const persisted = await persistServerWorkspaceState(config);
    onWorkspacesChanged();

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "host" },
      action: "workspace.create",
      target: workspace.path,
      summary: `Created workspace ${name}`,
      timestamp: Date.now(),
    });

    return jsonResponse({
      activeId: workspace.id,
      workspaces: config.workspaces.map(serializeWorkspace),
      persisted,
    }, 201);
  });

  addRoute(routes, "PATCH", "/workspaces/:id/display-name", "host", async (ctx) => {
    ensureWritable(config);
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const nextDisplayName = typeof body.displayName === "string" && body.displayName.trim()
      ? body.displayName.trim()
      : undefined;

    config.workspaces = config.workspaces.map((entry) =>
      entry.id === workspace.id
        ? {
            ...entry,
            displayName: nextDisplayName,
            name: nextDisplayName ?? entry.name,
          }
        : entry,
    );

    const persisted = await persistServerWorkspaceState(config);
    onWorkspacesChanged();

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "host" },
      action: "workspace.rename",
      target: workspace.path,
      summary: `Updated workspace display name${nextDisplayName ? ` to ${nextDisplayName}` : ""}`,
      timestamp: Date.now(),
    });

    return jsonResponse({
      activeId: config.workspaces[0]?.id ?? null,
      workspaces: config.workspaces.map(serializeWorkspace),
      persisted,
    });
  });

  addRoute(routes, "POST", "/workspaces/:id/activate", "host", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    config.workspaces = [
      workspace,
      ...config.workspaces.filter((entry) => entry.id !== workspace.id),
    ];
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "host" },
      action: "workspace.activate",
      target: "workspace",
      summary: "Switched active workspace",
      timestamp: Date.now(),
    });
    const connection = resolveWorkspaceOpencodeConnection(config, workspace);
    if (connection.baseUrl?.trim()) {
      await reloadOpencodeEngine(config, workspace);
    }
    return jsonResponse({ activeId: workspace.id, workspace: serializeWorkspace(workspace), persisted: false });
  });

  addRoute(routes, "DELETE", "/workspaces/:id", "host", async (ctx) => {
    ensureWritable(config);

    const workspace = await resolveWorkspace(config, ctx.params.id);

    const before = config.workspaces.length;
    config.workspaces = config.workspaces.filter((entry) => entry.id !== workspace.id);
    const deleted = before !== config.workspaces.length;

    if (deleted) {
      // Only remove exact matches; authorizedRoots can contain broader entries.
      config.authorizedRoots = config.authorizedRoots.filter((root) => resolve(root) !== resolve(workspace.path));
    }
    const persisted = await persistServerWorkspaceState(config);
    onWorkspacesChanged();

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "host" },
      action: "workspace.delete",
      target: "workspace",
      summary: "Deleted workspace from OpenWork server",
      timestamp: Date.now(),
    });

    const active = config.workspaces[0] ?? null;
    return jsonResponse({
      ok: true,
      deleted,
      persisted,
      activeId: active?.id ?? null,
      items: config.workspaces.map(serializeWorkspace),
      workspaces: config.workspaces.map(serializeWorkspace),
    });
  });

  addRoute(routes, "GET", "/workspace/:id/config", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const opencode = await readOpencodeConfig(workspace.path);
    const openwork = await readOpenworkConfig(workspace.path);
    const lastAudit = await readLastAudit(workspace.path, workspace.id);
    return jsonResponse({ opencode, openwork, updatedAt: lastAudit?.timestamp ?? null });
  });

  addRoute(routes, "GET", "/workspace/:id/opencode-config", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const scope = normalizeOpencodeScope(ctx.url.searchParams.get("scope"));
    const configPath = resolveOpencodeConfigFilePath(scope, workspace.path);
    const result = await readRawOpencodeConfig(configPath);
    return jsonResponse({ path: configPath, exists: result.exists, content: result.content });
  });

  addRoute(routes, "POST", "/workspace/:id/opencode-config", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const scope = normalizeOpencodeScope(typeof body.scope === "string" ? body.scope : null);
    const content = typeof body.content === "string" ? body.content : null;
    if (content === null) {
      throw new ApiError(400, "invalid_payload", "content must be a string");
    }

    const configPath = resolveOpencodeConfigFilePath(scope, workspace.path);
    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: scope === "global" ? "config.global.write" : "config.write",
      summary: `Write ${scope} OpenCode config`,
      paths: [configPath],
    });

    const nextContent = content.endsWith("\n") ? content : `${content}\n`;
    const current = await readRawOpencodeConfig(configPath);
    const changed = !current.exists || current.content !== nextContent;
    if (changed) {
      await ensureDir(dirname(configPath));
      await writeFile(configPath, nextContent, "utf8");
    }

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: scope === "global" ? "config.global.write" : "config.write",
      target: configPath,
      summary: `Updated ${scope} OpenCode config`,
      timestamp: Date.now(),
    });

    if (scope === "project" && changed) {
      emitReloadEvent(ctx.reloadEvents, workspace, "config", buildConfigTrigger(configPath));
    }

    return jsonResponse({
      ok: true,
      status: 0,
      stdout: `Wrote ${configPath}`,
      stderr: "",
    });
  });

  addRoute(routes, "GET", "/workspace/:id/audit", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const limitParam = ctx.url.searchParams.get("limit");
    const parsed = limitParam ? Number(limitParam) : NaN;
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 50;
    const items = await readAuditEntries(workspace.path, workspace.id, limit);
    return jsonResponse({ items });
  });

  // Task / workflow run events
  addRoute(routes, "GET", "/workspace/:id/task-events", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const limitParam = ctx.url.searchParams.get("limit");
    const parsed = limitParam ? Number(limitParam) : NaN;
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 50;
    const items = await readTaskEvents(workspace.id, limit);
    return jsonResponse({ items });
  });

  addRoute(routes, "GET", "/workspace/:id/task-runs", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const limitParam = ctx.url.searchParams.get("limit");
    const parsed = limitParam ? Number(limitParam) : NaN;
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 20;
    const runs = await deriveTaskRuns(workspace.id, limit);
    return jsonResponse({ runs });
  });

  addRoute(routes, "GET", "/workspace/:id/evidence", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const limitParam = ctx.url.searchParams.get("limit");
    const parsed = limitParam ? Number(limitParam) : NaN;
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 300) : 100;
    const { items, summary } = await buildProjectEvidenceTimeline({
      workspaceId: workspace.id,
      workspaceRoot: workspace.path,
      limit,
      desk: ctx.url.searchParams.get("desk")?.trim() || undefined,
      sessionId: ctx.url.searchParams.get("sessionId")?.trim() || undefined,
      taskId: ctx.url.searchParams.get("taskId")?.trim() || undefined,
      source: parseProjectEvidenceSource(ctx.url.searchParams.get("source")?.trim() || null),
    });
    return jsonResponse({ success: true, items, count: items.length, summary });
  });

  addRoute(routes, "GET", "/workspace/:id/data-ledger", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const limitParam = ctx.url.searchParams.get("limit");
    const parsed = limitParam ? Number(limitParam) : NaN;
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 300) : 100;
    return jsonResponse(await buildProjectDataLedger({
      workspace,
      limit,
      source: parseProjectDataLedgerSource(ctx.url.searchParams.get("source")?.trim() || null),
      kind: parseProjectDataLedgerKind(ctx.url.searchParams.get("kind")?.trim() || null),
      desk: ctx.url.searchParams.get("desk")?.trim() || undefined,
      sessionId: ctx.url.searchParams.get("sessionId")?.trim() || ctx.url.searchParams.get("session_id")?.trim() || undefined,
      taskId: ctx.url.searchParams.get("taskId")?.trim() || ctx.url.searchParams.get("task_id")?.trim() || undefined,
      from: parseProjectDataLedgerTimestamp(ctx.url.searchParams.get("from"), "from"),
      to: parseProjectDataLedgerTimestamp(ctx.url.searchParams.get("to"), "to"),
    }));
  });

  addRoute(routes, "POST", "/workspace/:id/feedback", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");

    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const requestBody = body.feedback && typeof body.feedback === "object" && !Array.isArray(body.feedback)
      ? body.feedback
      : body;
    const feedback = coerceProjectFeedbackRequest(requestBody);
    const serializedFeedback = JSON.stringify(feedback);
    const entry = {
      ...feedback,
      id: shortId(),
      workspaceId: workspace.id,
      createdAt: new Date().toISOString(),
      actor: ctx.actor ? { type: ctx.actor.type, scope: ctx.actor.scope } : { type: "remote" },
      trainingUse: "eval_routing_product_quality_only" as const,
      redactionApplied: serializedFeedback.includes("[redacted]"),
    };

    await recordProjectFeedback(entry);
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "workspace.feedback.create",
      target: projectFeedbackLogPath(workspace.id),
      summary: `Recorded ${entry.kind} feedback for project data ledger`,
      timestamp: Date.now(),
    });

    return jsonResponse({ success: true, feedback: entry }, 201);
  });

  addRoute(routes, "GET", "/workspace/:id/backend/data-map", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    return jsonResponse(buildWorkspaceDataMap(workspace, memoryVault));
  });

  addRoute(routes, "GET", "/workspace/:id/notes", "client", async (ctx) => {
    try {
      const workspace = await resolveWorkspace(config, ctx.params.id);
      const store = new MatterhornNotesStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
      const items = await store.listNotes(notesListOptionsFromUrl(ctx.url));
      return jsonResponse({ success: true, items, count: items.length });
    } catch (error) {
      throw noteApiError(error);
    }
  });

  addRoute(routes, "GET", "/workspace/:id/notes/:noteId", "client", async (ctx) => {
    try {
      const workspace = await resolveWorkspace(config, ctx.params.id);
      const store = new MatterhornNotesStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
      const note = await store.getNote(ctx.params.noteId);
      if (!note || note.deletedAt) {
        throw new ApiError(404, "note_not_found", "Note not found");
      }
      return jsonResponse({ success: true, note });
    } catch (error) {
      throw noteApiError(error);
    }
  });

  addRoute(routes, "POST", "/workspace/:id/notes", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    try {
      const workspace = await resolveWorkspace(config, ctx.params.id);
      const body = await readJsonBody(ctx.request);
      const input = coerceNoteCreateRequest(body.note ?? body);
      const store = new MatterhornNotesStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
      const note = await store.createNote(input);
      await recordAudit(workspace.path, {
        id: shortId(),
        workspaceId: workspace.id,
        actor: ctx.actor ?? { type: "remote" },
        action: "workspace.note.create",
        target: resolveSafeChildPath(workspace.path, note.filePath),
        summary: `Created note ${note.title}`,
        timestamp: Date.now(),
      });
      return jsonResponse({ success: true, note }, 201);
    } catch (error) {
      throw noteApiError(error);
    }
  });

  addRoute(routes, "PATCH", "/workspace/:id/notes/:noteId", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    try {
      const workspace = await resolveWorkspace(config, ctx.params.id);
      const body = await readJsonBody(ctx.request);
      const patch = coerceNoteUpdateRequest(body.patch ?? body.note ?? body);
      const store = new MatterhornNotesStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
      const note = await store.updateNote(ctx.params.noteId, patch);
      await recordAudit(workspace.path, {
        id: shortId(),
        workspaceId: workspace.id,
        actor: ctx.actor ?? { type: "remote" },
        action: "workspace.note.update",
        target: resolveSafeChildPath(workspace.path, note.filePath),
        summary: `Updated note ${note.title}`,
        timestamp: Date.now(),
      });
      return jsonResponse({ success: true, note });
    } catch (error) {
      throw noteApiError(error);
    }
  });

  addRoute(routes, "DELETE", "/workspace/:id/notes/:noteId", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    try {
      const workspace = await resolveWorkspace(config, ctx.params.id);
      const store = new MatterhornNotesStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
      const note = await store.deleteNote(ctx.params.noteId);
      await recordAudit(workspace.path, {
        id: shortId(),
        workspaceId: workspace.id,
        actor: ctx.actor ?? { type: "remote" },
        action: "workspace.note.delete",
        target: resolveSafeChildPath(workspace.path, note.filePath),
        summary: `Deleted note ${note.title}`,
        timestamp: Date.now(),
      });
      return jsonResponse({ success: true, deleted: true, note });
    } catch (error) {
      throw noteApiError(error);
    }
  });

  addRoute(routes, "POST", "/workspace/:id/notes/:noteId/memory-suggestion", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    try {
      const workspace = await resolveWorkspace(config, ctx.params.id);
      const body = await readJsonBody(ctx.request);
      const input = coerceNoteMemorySuggestionRequest(body.input ?? body);
      const store = new MatterhornNotesStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
      const note = await store.getNote(ctx.params.noteId);
      if (!note || note.deletedAt) {
        throw new ApiError(404, "note_not_found", "Note not found");
      }
      const suggestion = buildNoteMemorySuggestion(note, input);
      const inbox = await memoryVault.storeSuggestions([suggestion]);
      const entry = inbox.entries[0];
      if (!entry) {
        throw new ApiError(500, "memory_suggestion_not_created", "Memory suggestion was not created");
      }
      const updatedNote = await store.markMemorySuggestion(note.id, {
        id: entry.id,
        status: entry.status,
      });
      await recordAudit(workspace.path, {
        id: shortId(),
        workspaceId: workspace.id,
        actor: ctx.actor ?? { type: "remote" },
        action: "workspace.note.memory_suggestion",
        target: resolveSafeChildPath(workspace.path, updatedNote.filePath),
        summary: `Sent note ${updatedNote.title} to Memory review`,
        timestamp: Date.now(),
      });
      return jsonResponse({
        success: true,
        note: updatedNote,
        suggestionId: entry.id,
        suggestionStatus: entry.status,
        inbox,
      });
    } catch (error) {
      throw noteApiError(error);
    }
  });

  addRoute(routes, "POST", "/workspace/:id/sessions", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : undefined;
    const directory = resolveOpencodeDirectory(workspace) ?? undefined;
    const opencode = createWorkspaceOpencodeClient(config, workspace);
    const item = buildSession(unwrapOpencodeResult(
      await opencode.session.create({
        ...(title ? { title } : {}),
        ...(directory ? { directory } : {}),
      }),
      "/session",
    ));

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "session.create",
      target: item.id,
      summary: "Created chat session",
      timestamp: Date.now(),
    });

    return jsonResponse({ item }, 201);
  });

  addRoute(routes, "GET", "/workspace/:id/sessions", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const items = await listWorkspaceSessions(config, workspace, {
      roots: parseOptionalBoolean(ctx.url.searchParams.get("roots"), "roots"),
      start: parseOptionalNonNegativeInteger(ctx.url.searchParams.get("start"), "start"),
      search: ctx.url.searchParams.get("search")?.trim() || undefined,
      limit: parseOptionalPositiveInteger(ctx.url.searchParams.get("limit"), "limit"),
    });
    return jsonResponse({ items });
  });

  addRoute(routes, "GET", "/workspace/:id/sessions/:sessionId", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const sessionId = (ctx.params.sessionId ?? "").trim();
    if (!sessionId) {
      throw new ApiError(400, "invalid_payload", "sessionId is required");
    }
    const item = await readWorkspaceSession(config, workspace, sessionId);
    return jsonResponse({ item });
  });

  addRoute(routes, "POST", "/workspace/:id/sessions/:sessionId/messages", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const sessionId = (ctx.params.sessionId ?? "").trim();
    if (!sessionId) {
      throw new ApiError(400, "invalid_payload", "sessionId is required");
    }
    const body = await readJsonBody(ctx.request);
    const parts = parseSessionPromptParts(body);
    const model = parseSessionPromptModel(body);
    const directory = resolveOpencodeDirectory(workspace) ?? undefined;
    const opencode = createWorkspaceOpencodeClient(config, workspace);
    const sessionApi = opencode.session as typeof opencode.session & {
      promptAsync: (parameters: Record<string, unknown>) => Promise<OpencodeClientResult<unknown, unknown>>;
    };

    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "session.prompt",
      summary: `Submit prompt to session ${sessionId}`,
      paths: [workspace.path],
    });

    unwrapOpencodeResult(
      await sessionApi.promptAsync({
        sessionID: sessionId,
        ...(directory ? { directory } : {}),
        ...(typeof body.messageID === "string" && body.messageID.trim() ? { messageID: body.messageID.trim() } : {}),
        ...(model ? { model } : {}),
        ...(typeof body.agent === "string" && body.agent.trim() ? { agent: body.agent.trim() } : {}),
        ...(typeof body.variant === "string" && body.variant.trim() ? { variant: body.variant.trim() } : {}),
        ...(typeof body.noReply === "boolean" ? { noReply: body.noReply } : {}),
        ...(isBooleanRecord(body.tools) ? { tools: body.tools } : {}),
        ...(typeof body.system === "string" && body.system.trim() ? { system: body.system } : {}),
        ...(typeof body.reasoning_effort === "string" && body.reasoning_effort.trim() ? { reasoning_effort: body.reasoning_effort.trim() } : {}),
        ...(typeof body.reasoningEffort === "string" && body.reasoningEffort.trim() ? { reasoning_effort: body.reasoningEffort.trim() } : {}),
        parts,
      }),
      `/session/${encodeURIComponent(sessionId)}/prompt_async`,
    );

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "session.prompt",
      target: sessionId,
      summary: "Submitted prompt to chat session",
      timestamp: Date.now(),
    });

    return jsonResponse({ ok: true, accepted: true, sessionId }, 202);
  });

  addRoute(routes, "GET", "/workspace/:id/sessions/:sessionId/messages", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const sessionId = (ctx.params.sessionId ?? "").trim();
    if (!sessionId) {
      throw new ApiError(400, "invalid_payload", "sessionId is required");
    }
    const items = await readWorkspaceSessionMessages(config, workspace, sessionId, {
      limit: parseOptionalPositiveInteger(ctx.url.searchParams.get("limit"), "limit"),
    });
    return jsonResponse({ items });
  });

  addRoute(routes, "GET", "/workspace/:id/sessions/:sessionId/status", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const sessionId = (ctx.params.sessionId ?? "").trim();
    if (!sessionId) {
      throw new ApiError(400, "invalid_payload", "sessionId is required");
    }
    const item = await readWorkspaceSessionExecutionStatus(config, workspace, sessionId);
    return jsonResponse({ item });
  });

  addRoute(routes, "GET", "/workspace/:id/sessions/:sessionId/snapshot", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const sessionId = (ctx.params.sessionId ?? "").trim();
    if (!sessionId) {
      throw new ApiError(400, "invalid_payload", "sessionId is required");
    }
    const item = await readWorkspaceSessionSnapshot(config, workspace, sessionId, {
      limit: parseOptionalPositiveInteger(ctx.url.searchParams.get("limit"), "limit"),
    });
    return jsonResponse({ item });
  });

  addRoute(routes, "GET", "/workspace/:id/sessions/:sessionId/events", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const sessionId = (ctx.params.sessionId ?? "").trim();
    if (!sessionId) {
      throw new ApiError(400, "invalid_payload", "sessionId is required");
    }
    const includeSnapshot = parseOptionalBoolean(ctx.url.searchParams.get("snapshot"), "snapshot") ?? false;
    const maxEvents = parseOptionalPositiveInteger(ctx.url.searchParams.get("maxEvents"), "maxEvents");
    const heartbeatMs = parseOptionalPositiveInteger(ctx.url.searchParams.get("heartbeatMs"), "heartbeatMs");
    const includeDetails = parseOptionalBoolean(ctx.url.searchParams.get("details"), "details") ?? false;
    const sinceCursor = ctx.request.headers.get("last-event-id") ?? ctx.url.searchParams.get("since");
    const [snapshot, status] = await Promise.all([
      includeSnapshot
        ? readWorkspaceSessionSnapshot(config, workspace, sessionId, {
          limit: parseOptionalPositiveInteger(ctx.url.searchParams.get("limit"), "limit"),
        })
        : Promise.resolve(null),
      readWorkspaceSessionExecutionStatus(config, workspace, sessionId),
    ]);
    return sessionEventStreamResponse({
      request: ctx.request,
      workspaceId: workspace.id,
      sessionId,
      snapshot,
      status,
      sinceCursor,
      includeDetails,
      maxEvents,
      heartbeatMs,
    });
  });

  addRoute(routes, "DELETE", "/workspace/:id/sessions/:sessionId", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");

    const workspace = await resolveWorkspace(config, ctx.params.id);
    const sessionId = (ctx.params.sessionId ?? "").trim();
    if (!sessionId) {
      throw new ApiError(400, "invalid_payload", "sessionId is required");
    }

    // OpenCode session deletion via the upstream API.
    const opencode = createWorkspaceOpencodeClient(config, workspace);
    unwrapOpencodeResult(await opencode.session.delete({ sessionID: sessionId }), `/session/${encodeURIComponent(sessionId)}`);

    return jsonResponse({ ok: true });
  });

  addRoute(routes, "PATCH", "/workspace/:id/config", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const opencode = body.opencode as Record<string, unknown> | undefined;
    const openwork = body.openwork as Record<string, unknown> | undefined;

    if (!opencode && !openwork) {
      throw new ApiError(400, "invalid_payload", "opencode or openwork updates required");
    }

    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "config.patch",
      summary: "Patch workspace config",
      paths: [opencode ? opencodeConfigPath(workspace.path) : null, openwork ? openworkConfigPath(workspace.path) : null].filter(Boolean) as string[],
    });

    const configFingerprintBefore = opencode
      ? await computeReloadFingerprint(workspace.path, "config")
      : null;

    if (opencode) {
      const configPath = opencodeConfigPath(workspace.path);
      const nextOpencode = ensurePlainObject(opencode);
      const { permission, provider, ...topLevelUpdates } = nextOpencode;

      if (Object.keys(topLevelUpdates).length) {
        await updateJsoncTopLevel(configPath, topLevelUpdates);
      }

      const providerUpdate = ensurePlainObject(provider);
      for (const [providerId, providerConfig] of Object.entries(providerUpdate)) {
        await updateJsoncPath(configPath, ["provider", providerId], providerConfig);
      }

      const permissionUpdate = ensurePlainObject(permission);
      if (Object.prototype.hasOwnProperty.call(permissionUpdate, "external_directory")) {
        const existingOpencode = await readOpencodeConfig(workspace.path);
        const existingPermission = ensurePlainObject(existingOpencode.permission);
        const nextExternalDirectory = permissionUpdate.external_directory;
        const existingPermissionKeys = Object.keys(existingPermission);
        const removePermissionParent =
          typeof nextExternalDirectory === "undefined" &&
          (existingPermissionKeys.length === 0 ||
            (existingPermissionKeys.length === 1 && Object.prototype.hasOwnProperty.call(existingPermission, "external_directory")));

        if (removePermissionParent) {
          await updateJsoncPath(configPath, ["permission"], undefined);
        } else {
          await updateJsoncPath(configPath, ["permission", "external_directory"], nextExternalDirectory);
        }
      }
    }
    if (openwork) {
      await writeOpenworkConfig(workspace.path, openwork, true);
    }

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "config.patch",
      target: "opencode.json",
      summary: "Patched workspace config",
      timestamp: Date.now(),
    });

    if (opencode && configFingerprintBefore !== await computeReloadFingerprint(workspace.path, "config")) {
      emitReloadEvent(ctx.reloadEvents, workspace, "config", buildConfigTrigger(opencodeConfigPath(workspace.path)));
    }

    return jsonResponse({ updatedAt: Date.now() });
  });

  addRoute(routes, "GET", "/workspace/:id/events", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const sinceRaw = ctx.url.searchParams.get("since");
    const since = sinceRaw ? Number(sinceRaw) : undefined;
    const items = ctx.reloadEvents.list(workspace.id, since);
    return jsonResponse({ items, cursor: ctx.reloadEvents.cursor(), workspaceId: workspace.id, disabled: false });
  });

  addRoute(routes, "POST", "/workspace/:id/engine/reload", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    requireClientScope(ctx, "collaborator");

      await reloadOpencodeEngine(config, workspace);

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "engine.reload",
      target: workspace.baseUrl ?? "opencode",
      summary: "Reloaded workspace engine",
      timestamp: Date.now(),
    });

    return jsonResponse({ ok: true, reloadedAt: Date.now() });
  });

  addRoute(routes, "GET", "/workspace/:id/inbox", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    if (!resolveInboxEnabled()) {
      return jsonResponse({ items: [] });
    }
    const inboxRoot = resolveInboxDir(workspace.path);
    const items = await listInbox(inboxRoot);
    return jsonResponse({ items });
  });

  addRoute(routes, "GET", "/workspace/:id/inbox/:inboxId", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    if (!resolveInboxEnabled()) {
      throw new ApiError(404, "inbox_disabled", "Workspace inbox is disabled");
    }
    const inboxRoot = resolveInboxDir(workspace.path);
    const relativePath = decodeInboxId(ctx.params.inboxId);
    const absPath = resolveSafeChildPath(inboxRoot, relativePath);
    if (!(await exists(absPath))) {
      throw new ApiError(404, "inbox_item_not_found", "Inbox item not found");
    }
    const info = await stat(absPath);
    if (!info.isFile()) {
      throw new ApiError(404, "inbox_item_not_found", "Inbox item not found");
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Length", String(info.size));
    headers.set("Content-Disposition", `attachment; filename=\"${basename(relativePath)}\"`);
    const stream = Readable.toWeb(createReadStream(absPath)) as unknown as ReadableStream;
    return new Response(stream, { status: 200, headers });
  });

  addRoute(routes, "POST", "/workspace/:id/inbox", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    if (!resolveInboxEnabled()) {
      throw new ApiError(404, "inbox_disabled", "Workspace inbox is disabled");
    }
    const workspace = await resolveWorkspace(config, ctx.params.id);

    const contentType = ctx.request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      throw new ApiError(400, "invalid_payload", "Expected multipart/form-data");
    }
    const form = await ctx.request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "file_required", "Form field 'file' is required");
    }

    const queryPath = (ctx.url.searchParams.get("path") ?? "").trim();
    const formPath = typeof form.get("path") === "string" ? String(form.get("path") || "").trim() : "";
    const requestedPath = queryPath || formPath || file.name;

    const relativePath = normalizeWorkspaceRelativePath(requestedPath, { allowSubdirs: true });
    const inboxRoot = resolveInboxDir(workspace.path);
    const dest = resolveSafeChildPath(inboxRoot, relativePath);
    const maxBytes = resolveInboxMaxBytes();
    if (file.size > maxBytes) {
      throw new ApiError(413, "file_too_large", "File exceeds upload limit", { maxBytes, size: file.size });
    }

    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "workspace.inbox.upload",
      summary: `Upload ${relativePath} to inbox`,
      paths: [dest],
    });

    await ensureDir(dirname(dest));
    const bytes = Buffer.from(await file.arrayBuffer());
    const tmp = `${dest}.tmp-${shortId()}`;
    await writeFile(tmp, bytes);
    await rename(tmp, dest);

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "workspace.inbox.upload",
      target: dest,
      summary: `Uploaded ${relativePath} to inbox`,
      timestamp: Date.now(),
    });

    return jsonResponse({ ok: true, path: relativePath, bytes: file.size });
  });

  addRoute(routes, "GET", "/workspace/:id/artifacts", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    if (!resolveOutboxEnabled()) {
      return jsonResponse({ items: [] });
    }
    const outboxRoot = resolveOutboxDir(workspace.path);
    const items = await listArtifacts(outboxRoot);
    return jsonResponse({ items });
  });

  addRoute(routes, "GET", "/workspace/:id/artifacts/:artifactId", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    if (!resolveOutboxEnabled()) {
      throw new ApiError(404, "outbox_disabled", "Workspace outbox is disabled");
    }
    const outboxRoot = resolveOutboxDir(workspace.path);
    const relativePath = decodeArtifactId(ctx.params.artifactId);
    const absPath = resolveSafeChildPath(outboxRoot, relativePath);
    if (!(await exists(absPath))) {
      throw new ApiError(404, "artifact_not_found", "Artifact not found");
    }
    const info = await stat(absPath);
    if (!info.isFile()) {
      throw new ApiError(404, "artifact_not_found", "Artifact not found");
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Length", String(info.size));
    headers.set("Content-Disposition", `attachment; filename="${basename(relativePath)}"`);
    const stream = Readable.toWeb(createReadStream(absPath)) as unknown as ReadableStream;
    return new Response(stream, { status: 200, headers });
  });

  addRoute(routes, "POST", "/workspace/:id/artifacts/resolve", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const items = await resolveWorkspaceArtifactTargets(workspace.path, (body as Record<string, unknown>).targets);
    return jsonResponse({ items });
  });

  addRoute(routes, "POST", "/workspace/:id/files/sessions", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const ttlMs = parseFileSessionTtlMs((body as Record<string, unknown>).ttlSeconds);
    const requestWrite = (body as Record<string, unknown>).write !== false;
    const canWrite =
      requestWrite &&
      !config.readOnly &&
      scopeRank(ctx.actor?.scope ?? "viewer") >= scopeRank("collaborator");

    const session = fileSessions.create({
      workspaceId: workspace.id,
      workspaceRoot: workspace.path,
      actorTokenHash: ctx.actor?.tokenHash ?? "",
      actorScope: ctx.actor?.scope ?? "viewer",
      canWrite,
      ttlMs,
    });

    return jsonResponse({ session: serializeFileSession(session) });
  });

  addRoute(routes, "POST", "/files/sessions/:sessionId/renew", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const ttlMs = parseFileSessionTtlMs((body as Record<string, unknown>).ttlSeconds);
    const { session } = resolveFileSession(ctx, ctx.params.sessionId);
    const renewed = fileSessions.renew(session.id, ttlMs);
    if (!renewed) {
      throw new ApiError(404, "file_session_not_found", "File session not found");
    }
    return jsonResponse({ session: serializeFileSession(renewed) });
  });

  addRoute(routes, "DELETE", "/files/sessions/:sessionId", "client", async (ctx) => {
    const { session } = resolveFileSession(ctx, ctx.params.sessionId);
    fileSessions.close(session.id);
    return jsonResponse({ ok: true });
  });

  addRoute(routes, "GET", "/files/sessions/:sessionId/catalog/snapshot", "client", async (ctx) => {
    const { workspace } = resolveFileSession(ctx, ctx.params.sessionId);
    const prefix = parseCatalogPathFilter(ctx.url.searchParams.get("prefix"));
    const after = parseCatalogPathFilter(ctx.url.searchParams.get("after"));
    const includeDirs = ctx.url.searchParams.get("includeDirs") !== "false";
    const limit = parseCatalogLimit(ctx.url.searchParams.get("limit"));

    const entries = await listWorkspaceCatalogEntries(workspace.path);
    const filtered = entries.filter((entry) => {
      if (!includeDirs && entry.kind === "dir") return false;
      if (!matchesCatalogFilter(entry.path, prefix)) return false;
      if (after && entry.path <= after) return false;
      return true;
    });

    const items = filtered.slice(0, limit);
    const truncated = filtered.length > items.length;
    const nextAfter = truncated ? items[items.length - 1]?.path : undefined;
    const events = fileSessions.listWorkspaceEvents(workspace.id, Number.MAX_SAFE_INTEGER);

    return jsonResponse({
      sessionId: ctx.params.sessionId,
      workspaceId: workspace.id,
      generatedAt: Date.now(),
      cursor: events.cursor,
      total: filtered.length,
      truncated,
      nextAfter,
      items,
    });
  });

  addRoute(routes, "GET", "/files/sessions/:sessionId/catalog/events", "client", async (ctx) => {
    const { workspace } = resolveFileSession(ctx, ctx.params.sessionId);
    const since = parseSessionCursor(ctx.url.searchParams.get("since"));
    const events = fileSessions.listWorkspaceEvents(workspace.id, since);
    return jsonResponse(events);
  });

  addRoute(routes, "POST", "/files/sessions/:sessionId/read-batch", "client", async (ctx) => {
    const { workspace } = resolveFileSession(ctx, ctx.params.sessionId);
    const body = await readJsonBody(ctx.request);
    const paths = parseBatchPathList((body as Record<string, unknown>).paths);
    const items: Array<Record<string, unknown>> = [];

    for (const relativePath of paths) {
      try {
        const absPath = resolveSafeChildPath(workspace.path, relativePath);
        if (!(await exists(absPath))) {
          items.push({ ok: false, path: relativePath, code: "file_not_found", message: "File not found" });
          continue;
        }
        const info = await stat(absPath);
        if (!info.isFile()) {
          items.push({ ok: false, path: relativePath, code: "file_not_found", message: "File not found" });
          continue;
        }
        if (info.size > FILE_SESSION_MAX_FILE_BYTES) {
          items.push({
            ok: false,
            path: relativePath,
            code: "file_too_large",
            message: "File exceeds size limit",
            maxBytes: FILE_SESSION_MAX_FILE_BYTES,
            size: info.size,
          });
          continue;
        }

        const content = await readFile(absPath);
        items.push({
          ok: true,
          path: relativePath,
          kind: "file",
          bytes: info.size,
          updatedAt: info.mtimeMs,
          revision: fileRevision(info),
          contentBase64: content.toString("base64"),
        });
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Unable to read file";
        const code = error instanceof ApiError ? error.code : "read_failed";
        items.push({ ok: false, path: relativePath, code, message });
      }
    }

    return jsonResponse({ items });
  });

  addRoute(routes, "POST", "/files/sessions/:sessionId/write-batch", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const { session, workspace } = resolveFileSession(ctx, ctx.params.sessionId);
    if (!session.canWrite) {
      throw new ApiError(403, "forbidden", "File session is read-only");
    }

    const body = await readJsonBody(ctx.request);
    const writes = parseBatchWriteList((body as Record<string, unknown>).writes);
    const items: Array<Record<string, unknown>> = [];

    const plan: Array<{
      path: string;
      absPath: string;
      bytes: Buffer;
      ifMatchRevision?: string;
      force?: boolean;
      beforeRevision: string | null;
    }> = [];

    for (const write of writes) {
      try {
        const absPath = resolveSafeChildPath(workspace.path, write.path);
        const bytes = Buffer.from(write.contentBase64, "base64");
        if (bytes.byteLength > FILE_SESSION_MAX_FILE_BYTES) {
          items.push({
            ok: false,
            path: write.path,
            code: "file_too_large",
            message: "File exceeds size limit",
            maxBytes: FILE_SESSION_MAX_FILE_BYTES,
            size: bytes.byteLength,
          });
          continue;
        }

        const before = (await exists(absPath)) ? await stat(absPath) : null;
        if (before && !before.isFile()) {
          items.push({ ok: false, path: write.path, code: "invalid_path", message: "Path must point to a file" });
          continue;
        }
        const beforeRevision = before ? fileRevision(before) : null;
        if (!write.force && write.ifMatchRevision && write.ifMatchRevision !== beforeRevision) {
          items.push({
            ok: false,
            path: write.path,
            code: "conflict",
            message: "File changed since it was loaded",
            expectedRevision: write.ifMatchRevision,
            currentRevision: beforeRevision,
          });
          continue;
        }

        plan.push({
          path: write.path,
          absPath,
          bytes,
          beforeRevision,
          ...(write.ifMatchRevision ? { ifMatchRevision: write.ifMatchRevision } : {}),
          ...(write.force ? { force: true } : {}),
        });
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Invalid write request";
        const code = error instanceof ApiError ? error.code : "invalid_payload";
        items.push({ ok: false, path: write.path, code, message });
      }
    }

    if (plan.length) {
      await requireApproval(ctx, {
        workspaceId: workspace.id,
        action: "workspace.files.session.write",
        summary: `Write ${plan.length} file(s) via file session`,
        paths: plan.map((item) => item.absPath),
      });
    }

    for (const entry of plan) {
      try {
        const before = (await exists(entry.absPath)) ? await stat(entry.absPath) : null;
        const currentRevision = before ? fileRevision(before) : null;
        if (!entry.force && entry.ifMatchRevision && currentRevision !== entry.ifMatchRevision) {
          items.push({
            ok: false,
            path: entry.path,
            code: "conflict",
            message: "File changed before write could be applied",
            expectedRevision: entry.ifMatchRevision,
            currentRevision,
          });
          continue;
        }

        await ensureDir(dirname(entry.absPath));
        const tmp = `${entry.absPath}.tmp-${shortId()}`;
        await writeFile(tmp, entry.bytes);
        await rename(tmp, entry.absPath);
        const after = await stat(entry.absPath);
        const revision = fileRevision(after);

        recordWorkspaceFileEvent(workspace.id, { type: "write", path: entry.path, revision });

        await recordAudit(workspace.path, {
          id: shortId(),
          workspaceId: workspace.id,
          actor: ctx.actor ?? { type: "remote" },
          action: "workspace.files.session.write",
          target: entry.absPath,
          summary: `Wrote ${entry.path} via file session`,
          timestamp: Date.now(),
        });

        items.push({
          ok: true,
          path: entry.path,
          bytes: entry.bytes.byteLength,
          updatedAt: after.mtimeMs,
          revision,
          previousRevision: entry.beforeRevision,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to write file";
        items.push({ ok: false, path: entry.path, code: "write_failed", message });
      }
    }

    const events = fileSessions.listWorkspaceEvents(workspace.id, Number.MAX_SAFE_INTEGER);
    return jsonResponse({ items, cursor: events.cursor });
  });

  addRoute(routes, "POST", "/files/sessions/:sessionId/ops", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const { session, workspace } = resolveFileSession(ctx, ctx.params.sessionId);
    if (!session.canWrite) {
      throw new ApiError(403, "forbidden", "File session is read-only");
    }

    const body = await readJsonBody(ctx.request);
    const operations = Array.isArray((body as Record<string, unknown>).operations)
      ? ((body as Record<string, unknown>).operations as Array<Record<string, unknown>>)
      : null;
    if (!operations || !operations.length) {
      throw new ApiError(400, "invalid_payload", "operations must be a non-empty array");
    }
    if (operations.length > FILE_SESSION_MAX_BATCH_ITEMS) {
      throw new ApiError(400, "invalid_payload", `operations must include <= ${FILE_SESSION_MAX_BATCH_ITEMS} items`);
    }

    const items: Array<Record<string, unknown>> = [];
    const approvalPaths: string[] = [];
    for (const op of operations) {
      if (typeof op?.path === "string" && op.path.trim()) {
        approvalPaths.push(resolveSafeChildPath(workspace.path, normalizeWorkspaceRelativePath(op.path, { allowSubdirs: true })));
      }
      if (typeof op?.from === "string" && op.from.trim()) {
        approvalPaths.push(resolveSafeChildPath(workspace.path, normalizeWorkspaceRelativePath(op.from, { allowSubdirs: true })));
      }
      if (typeof op?.to === "string" && op.to.trim()) {
        approvalPaths.push(resolveSafeChildPath(workspace.path, normalizeWorkspaceRelativePath(op.to, { allowSubdirs: true })));
      }
    }

    if (approvalPaths.length) {
      await requireApproval(ctx, {
        workspaceId: workspace.id,
        action: "workspace.files.session.ops",
        summary: `Apply ${operations.length} file operation(s) via file session`,
        paths: approvalPaths,
      });
    }

    for (const op of operations) {
      const type = String(op.type ?? "").trim();
      try {
        if (type === "mkdir") {
          const path = normalizeWorkspaceRelativePath(String(op.path ?? ""), { allowSubdirs: true });
          const absPath = resolveSafeChildPath(workspace.path, path);
          await ensureDir(absPath);
          recordWorkspaceFileEvent(workspace.id, { type: "mkdir", path });
          items.push({ ok: true, type, path });
          continue;
        }

        if (type === "delete") {
          const path = normalizeWorkspaceRelativePath(String(op.path ?? ""), { allowSubdirs: true });
          const absPath = resolveSafeChildPath(workspace.path, path);
          if (!(await exists(absPath))) {
            items.push({ ok: false, type, path, code: "file_not_found", message: "Path not found" });
            continue;
          }
          await rm(absPath, { recursive: op.recursive === true, force: false });
          recordWorkspaceFileEvent(workspace.id, { type: "delete", path });
          items.push({ ok: true, type, path });
          continue;
        }

        if (type === "rename") {
          const from = normalizeWorkspaceRelativePath(String(op.from ?? ""), { allowSubdirs: true });
          const to = normalizeWorkspaceRelativePath(String(op.to ?? ""), { allowSubdirs: true });
          const fromAbs = resolveSafeChildPath(workspace.path, from);
          const toAbs = resolveSafeChildPath(workspace.path, to);
          if (!(await exists(fromAbs))) {
            items.push({ ok: false, type, from, to, code: "file_not_found", message: "Source path not found" });
            continue;
          }
          await ensureDir(dirname(toAbs));
          await rename(fromAbs, toAbs);
          recordWorkspaceFileEvent(workspace.id, { type: "rename", path: from, toPath: to });
          items.push({ ok: true, type, from, to });
          continue;
        }

        items.push({ ok: false, type, code: "invalid_operation", message: `Unsupported operation type: ${type}` });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Operation failed";
        items.push({ ok: false, type, code: "operation_failed", message });
      }
    }

    const events = fileSessions.listWorkspaceEvents(workspace.id, Number.MAX_SAFE_INTEGER);
    return jsonResponse({ items, cursor: events.cursor });
  });

  addRoute(routes, "GET", "/workspace/:id/files/content", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const requested = (ctx.url.searchParams.get("path") ?? "").trim();
    const relativePath = normalizeWorkspaceRelativePath(requested, { allowSubdirs: true });
    if (!isSupportedWorkspaceTextFilePath(relativePath)) {
      throw new ApiError(400, "invalid_path", "Only supported text artifact files can be read inline");
    }

    const absPath = resolveSafeChildPath(workspace.path, relativePath);
    if (!(await exists(absPath))) {
      throw new ApiError(404, "file_not_found", "File not found");
    }
    const info = await stat(absPath);
    if (!info.isFile()) {
      throw new ApiError(404, "file_not_found", "File not found");
    }

    const maxBytes = FILE_SESSION_MAX_FILE_BYTES;
    if (info.size > maxBytes) {
      throw new ApiError(413, "file_too_large", "File exceeds size limit", { maxBytes, size: info.size });
    }

    const content = await readFile(absPath, "utf8");
    return jsonResponse({ path: relativePath, content, bytes: info.size, updatedAt: info.mtimeMs });
  });

  addRoute(routes, "GET", "/workspace/:id/files/stat", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const requested = (ctx.url.searchParams.get("path") ?? "").trim();
    const relativePath = normalizeWorkspaceRelativePath(requested, { allowSubdirs: true });
    const absPath = resolveSafeChildPath(workspace.path, relativePath);
    if (!(await exists(absPath))) {
      return jsonResponse({ ok: true, path: relativePath, exists: false });
    }
    const info = await stat(absPath);
    return jsonResponse({
      ok: true,
      path: relativePath,
      exists: true,
      kind: info.isFile() ? "file" : info.isDirectory() ? "dir" : "other",
      size: info.size,
      updatedAt: info.mtimeMs,
    });
  });

  addRoute(routes, "GET", "/workspace/:id/files/raw", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const requested = (ctx.url.searchParams.get("path") ?? "").trim();
    const relativePath = normalizeWorkspaceRelativePath(requested, { allowSubdirs: true });
    const absPath = resolveSafeChildPath(workspace.path, relativePath);
    if (!(await exists(absPath))) {
      throw new ApiError(404, "file_not_found", "File not found");
    }
    const info = await stat(absPath);
    if (!info.isFile()) {
      throw new ApiError(404, "file_not_found", "File not found");
    }

    const headers = new Headers();
    headers.set("Content-Type", contentTypeForPath(relativePath));
    headers.set("Content-Length", String(info.size));
    headers.set("Content-Disposition", `inline; filename="${basename(relativePath)}"`);
    const stream = Readable.toWeb(createReadStream(absPath)) as unknown as ReadableStream;
    return new Response(stream, { status: 200, headers });
  });

  addRoute(routes, "POST", "/workspace/:id/files/raw", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const requestedPath = String(body.path ?? "");
    const relativePath = normalizeWorkspaceRelativePath(requestedPath, { allowSubdirs: true });
    if (typeof body.dataBase64 !== "string") {
      throw new ApiError(400, "invalid_payload", "dataBase64 must be a string");
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(body.dataBase64, "base64");
    } catch {
      throw new ApiError(400, "invalid_payload", "dataBase64 is invalid");
    }
    const maxBytes = FILE_SESSION_MAX_FILE_BYTES;
    if (bytes.byteLength > maxBytes) {
      throw new ApiError(413, "file_too_large", "File exceeds size limit", { maxBytes, size: bytes.byteLength });
    }

    const baseUpdatedAtRaw = body.baseUpdatedAt;
    const baseUpdatedAt =
      typeof baseUpdatedAtRaw === "number" && Number.isFinite(baseUpdatedAtRaw) ? baseUpdatedAtRaw : null;
    const force = body.force === true;
    const absPath = resolveSafeChildPath(workspace.path, relativePath);
    const before = (await exists(absPath)) ? await stat(absPath) : null;
    if (before && !before.isFile()) {
      throw new ApiError(400, "invalid_path", "Path must point to a file");
    }
    const beforeUpdatedAt = before ? before.mtimeMs : null;
    if (!force && beforeUpdatedAt !== null && baseUpdatedAt !== null && beforeUpdatedAt !== baseUpdatedAt) {
      throw new ApiError(409, "conflict", "File changed since it was loaded", { baseUpdatedAt, currentUpdatedAt: beforeUpdatedAt });
    }

    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "workspace.file.write",
      summary: `Write ${relativePath}`,
      paths: [absPath],
    });

    await ensureDir(dirname(absPath));
    const tmp = `${absPath}.tmp-${shortId()}`;
    await writeFile(tmp, bytes);
    await rename(tmp, absPath);
    const after = await stat(absPath);
    const revision = fileRevision(after);
    recordWorkspaceFileEvent(workspace.id, { type: "write", path: relativePath, revision });
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "workspace.file.write",
      target: absPath,
      summary: `Wrote ${relativePath}`,
      timestamp: Date.now(),
    });
    return jsonResponse({ ok: true, path: relativePath, bytes: bytes.byteLength, updatedAt: after.mtimeMs, revision });
  });

  addRoute(routes, "POST", "/workspace/:id/files/content", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);

    const requestedPath = String(body.path ?? "");
    const relativePath = normalizeWorkspaceRelativePath(requestedPath, { allowSubdirs: true });
    if (!isSupportedWorkspaceTextFilePath(relativePath)) {
      throw new ApiError(400, "invalid_path", "Only supported text artifact files can be edited inline");
    }

    if (typeof body.content !== "string") {
      throw new ApiError(400, "invalid_payload", "content must be a string");
    }
    const content = body.content;
    const bytes = Buffer.byteLength(content, "utf8");
    const maxBytes = FILE_SESSION_MAX_FILE_BYTES;
    if (bytes > maxBytes) {
      throw new ApiError(413, "file_too_large", "File exceeds size limit", { maxBytes, size: bytes });
    }

    const baseUpdatedAtRaw = body.baseUpdatedAt;
    const baseUpdatedAt =
      typeof baseUpdatedAtRaw === "number" && Number.isFinite(baseUpdatedAtRaw) ? baseUpdatedAtRaw : null;
    const force = body.force === true;

    const absPath = resolveSafeChildPath(workspace.path, relativePath);

    const before = (await exists(absPath)) ? await stat(absPath) : null;
    if (before && !before.isFile()) {
      throw new ApiError(400, "invalid_path", "Path must point to a file");
    }
    const beforeUpdatedAt = before ? before.mtimeMs : null;
    if (!force && beforeUpdatedAt !== null && baseUpdatedAt !== null && beforeUpdatedAt !== baseUpdatedAt) {
      throw new ApiError(409, "conflict", "File changed since it was loaded", {
        baseUpdatedAt,
        currentUpdatedAt: beforeUpdatedAt,
      });
    }

    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "workspace.file.write",
      summary: `Write ${relativePath}`,
      paths: [absPath],
    });

    await ensureDir(dirname(absPath));
    const tmp = `${absPath}.tmp-${shortId()}`;
    await writeFile(tmp, content, "utf8");
    await rename(tmp, absPath);
    const after = await stat(absPath);
    const revision = fileRevision(after);

    recordWorkspaceFileEvent(workspace.id, {
      type: "write",
      path: relativePath,
      revision,
    });

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "workspace.file.write",
      target: absPath,
      summary: `Wrote ${relativePath}`,
      timestamp: Date.now(),
    });

    return jsonResponse({ ok: true, path: relativePath, bytes, updatedAt: after.mtimeMs, revision });
  });

  addRoute(routes, "GET", "/workspace/:id/plugins", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const includeGlobal = ctx.url.searchParams.get("includeGlobal") === "true";
    const result = await listPlugins(workspace.path, includeGlobal);
    return jsonResponse(result);
  });

  addRoute(routes, "POST", "/workspace/:id/plugins", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const spec = String(body.spec ?? "");
    const normalized = normalizePluginSpec(spec);
    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "plugins.add",
      summary: `Add plugin ${spec}`,
      paths: [opencodeConfigPath(workspace.path)],
    });
    const changed = await addPlugin(workspace.path, spec);
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "plugins.add",
      target: "opencode.json",
      summary: `Added ${spec}`,
      timestamp: Date.now(),
    });
    if (changed) {
      emitReloadEvent(ctx.reloadEvents, workspace, "plugins", {
        type: "plugin",
        name: normalized,
        action: "added",
      });
    }
    const result = await listPlugins(workspace.path, false);
    return jsonResponse(result);
  });

  addRoute(routes, "DELETE", "/workspace/:id/plugins/:name", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const name = ctx.params.name ?? "";
    const normalized = normalizePluginSpec(name);
    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "plugins.remove",
      summary: `Remove plugin ${name}`,
      paths: [opencodeConfigPath(workspace.path)],
    });
    const removed = await removePlugin(workspace.path, name);
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "plugins.remove",
      target: "opencode.json",
      summary: `Removed ${name}`,
      timestamp: Date.now(),
    });
    if (removed) {
      emitReloadEvent(ctx.reloadEvents, workspace, "plugins", {
        type: "plugin",
        name: normalized,
        action: "removed",
      });
    }
    const result = await listPlugins(workspace.path, false);
    return jsonResponse(result);
  });

  addRoute(routes, "GET", "/hub/skills", "client", async (ctx) => {
    const owner = ctx.url.searchParams.get("owner")?.trim();
    const repo = ctx.url.searchParams.get("repo")?.trim();
    const ref = ctx.url.searchParams.get("ref")?.trim();
    const items = await listHubSkills({
      owner: owner || "different-ai",
      repo: repo || "openwork-hub",
      ref: ref || "main",
    });
    return jsonResponse({ items });
  });

  addRoute(routes, "GET", "/workspace/:id/skills", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const includeGlobal = ctx.url.searchParams.get("includeGlobal") === "true";
    const items = await listSkills(workspace.path, includeGlobal);
    return jsonResponse({ items });
  });

  addRoute(routes, "POST", "/workspace/:id/skills/hub/:name", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const name = String(ctx.params.name ?? "").trim();
    if (!name) {
      throw new ApiError(400, "invalid_skill_name", "Skill name is required");
    }
    const body = await readJsonBody(ctx.request);
    const overwrite = body?.overwrite === true;
    const repoPayload = body?.repo && typeof body.repo === "object" ? (body.repo as Record<string, unknown>) : undefined;
    const repo = repoPayload
      ? {
          owner: typeof repoPayload.owner === "string" ? repoPayload.owner : undefined,
          repo: typeof repoPayload.repo === "string" ? repoPayload.repo : undefined,
          ref: typeof repoPayload.ref === "string" ? repoPayload.ref : undefined,
        }
      : undefined;

    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "skills.install_hub",
      summary: `Install hub skill ${name}`,
      paths: [join(workspace.path, ".opencode", "skills", name)],
    });

    const result = await installHubSkill(workspace.path, { name, overwrite, repo });
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "skills.install_hub",
      target: result.path,
      summary: `Installed hub skill ${name}`,
      timestamp: Date.now(),
    });
    emitReloadEvent(ctx.reloadEvents, workspace, "skills", {
      type: "skill",
      name,
      action: result.action,
      path: result.path,
    });

    return jsonResponse({ ok: true, ...result });
  });

  addRoute(routes, "GET", "/workspace/:id/skills/:name", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const includeGlobal = ctx.url.searchParams.get("includeGlobal") === "true";
    const name = String(ctx.params.name ?? "").trim();
    if (!name) {
      throw new ApiError(400, "invalid_skill_name", "Skill name is required");
    }
    const items = await listSkills(workspace.path, includeGlobal);
    const item = items.find((skill) => skill.name === name);
    if (!item) {
      throw new ApiError(404, "skill_not_found", `Skill not found: ${name}`);
    }
    const content = await readFile(item.path, "utf8");
    return jsonResponse({ item, content });
  });

  addRoute(routes, "POST", "/workspace/:id/skills", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const name = String(body.name ?? "");
    const content = String(body.content ?? "");
    const description = body.description ? String(body.description) : undefined;
    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "skills.upsert",
      summary: `Upsert skill ${name}`,
      paths: [join(workspace.path, ".opencode", "skills", name, "SKILL.md")],
    });
    const result = await upsertSkill(workspace.path, { name, content, description });
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "skills.upsert",
      target: result.path,
      summary: `Upserted skill ${name}`,
      timestamp: Date.now(),
    });
    emitReloadEvent(ctx.reloadEvents, workspace, "skills", {
      type: "skill",
      name,
      action: result.action,
      path: result.path,
    });
    return jsonResponse({ name, path: result.path, description: description ?? "", scope: "project" });
  });

  addRoute(routes, "DELETE", "/workspace/:id/skills/:name", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const name = String(ctx.params.name ?? "").trim();
    if (!name) {
      throw new ApiError(400, "invalid_skill_name", "Skill name is required");
    }
    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "skills.delete",
      summary: `Delete skill ${name}`,
      paths: [join(workspace.path, ".opencode", "skills", name)],
    });
    const result = await deleteSkill(workspace.path, name);
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "skills.delete",
      target: result.path,
      summary: `Deleted skill ${name}`,
      timestamp: Date.now(),
    });
    emitReloadEvent(ctx.reloadEvents, workspace, "skills", {
      type: "skill",
      name,
      action: "removed",
      path: result.path,
    });
    return jsonResponse({ ok: true, name, path: result.path });
  });

  addRoute(routes, "GET", "/workspace/:id/mcp", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const items = await listMcp(workspace.path);
    return jsonResponse({ items });
  });

  addRoute(routes, "POST", "/workspace/:id/mcp", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const name = String(body.name ?? "");
    const configPayload = body.config as Record<string, unknown> | undefined;
    if (!configPayload) {
      throw new ApiError(400, "invalid_payload", "MCP config is required");
    }
    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "mcp.add",
      summary: `Add MCP ${name}`,
      paths: [opencodeConfigPath(workspace.path)],
    });
    const result = await addMcp(workspace.path, name, configPayload);
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "mcp.add",
      target: "opencode.json",
      summary: `Added MCP ${name}`,
      timestamp: Date.now(),
    });
    emitReloadEvent(ctx.reloadEvents, workspace, "mcp", {
      type: "mcp",
      name,
      action: result.action,
    });
    const items = await listMcp(workspace.path);
    return jsonResponse({ items });
  });

  addRoute(routes, "DELETE", "/workspace/:id/mcp/:name", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const name = ctx.params.name ?? "";
    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "mcp.remove",
      summary: `Remove MCP ${name}`,
      paths: [opencodeConfigPath(workspace.path)],
    });
    const removed = await removeMcp(workspace.path, name);
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "mcp.remove",
      target: "opencode.json",
      summary: `Removed MCP ${name}`,
      timestamp: Date.now(),
    });
    if (removed) {
      emitReloadEvent(ctx.reloadEvents, workspace, "mcp", {
        type: "mcp",
        name,
        action: "removed",
      });
    }
    const items = await listMcp(workspace.path);
    return jsonResponse({ items });
  });

  // Toggle `enabled` on a workspace MCP. Strict body validation — `Boolean(body.enabled)`
  // would silently disable on `{}` or coerce `"false"` to true.
  addRoute(routes, "POST", "/workspace/:id/mcp/:name/enabled", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const name = ctx.params.name ?? "";
    const body = await readJsonBody(ctx.request);
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.enabled !== "boolean") {
      throw new ApiError(400, "invalid_payload", "enabled must be a boolean");
    }
    const enabled = body.enabled;
    const action = enabled ? "mcp.enable" : "mcp.disable";
    const summary = `${enabled ? "Enable" : "Disable"} MCP ${name}`;
    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action,
      summary,
      paths: [opencodeConfigPath(workspace.path)],
    });
    const updated = await setMcpEnabled(workspace.path, name, enabled);
    if (!updated) {
      throw new ApiError(404, "mcp_not_found", `MCP ${name} not found in workspace config`);
    }
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action,
      target: "opencode.json",
      summary: `${enabled ? "Enabled" : "Disabled"} MCP ${name}`,
      timestamp: Date.now(),
    });
    // ReloadTrigger.action only allows added/removed/updated, so toggle => "updated".
    emitReloadEvent(ctx.reloadEvents, workspace, "mcp", {
      type: "mcp",
      name,
      action: "updated",
    });
    const items = await listMcp(workspace.path);
    return jsonResponse({ items });
  });

  addRoute(routes, "DELETE", "/workspace/:id/mcp/:name/auth", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const name = String(ctx.params.name ?? "").trim();
    validateMcpName(name);

    const authStorePath = join(homedir(), ".config", "opencode", "mcp-auth.json");
    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "mcp.auth.remove",
      summary: `Logout MCP ${name}`,
      paths: [authStorePath],
    });

    // Best-effort disconnect so any active connection is torn down.
    try {
      const opencode = createWorkspaceOpencodeClient(config, workspace);
      unwrapOpencodeResult(await opencode.mcp.disconnect({ name }), `/mcp/${encodeURIComponent(name)}/disconnect`);
    } catch {
      // ignore
    }

    try {
      const opencode = createWorkspaceOpencodeClient(config, workspace);
      unwrapOpencodeResult(await opencode.mcp.auth.remove({ name }), `/mcp/${encodeURIComponent(name)}/auth`);
    } catch (error) {
      // Treat missing credentials as a successful logout (idempotent).
      if (
        error instanceof ApiError &&
        error.code === "opencode_request_failed" &&
        error.details &&
        typeof error.details === "object" &&
        "status" in (error.details as Record<string, unknown>) &&
        (error.details as { status?: unknown }).status === 404
      ) {
        // ok
      } else {
        throw error;
      }
    }

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "mcp.auth.remove",
      target: authStorePath,
      summary: `Logged out MCP ${name}`,
      timestamp: Date.now(),
    });

    return jsonResponse({ ok: true });
  });

  addRoute(routes, "GET", "/workspace/:id/commands", "client", async (ctx) => {
    const scope = ctx.url.searchParams.get("scope") === "global" ? "global" : "workspace";
    if (scope === "global") {
      await requireHost(ctx.request, config, tokens);
    }
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const items = await listCommands(workspace.path, scope);
    return jsonResponse({ items });
  });

  addRoute(routes, "POST", "/workspace/:id/commands", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const name = String(body.name ?? "");
    const template = String(body.template ?? "");
    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "commands.upsert",
      summary: `Upsert command ${name}`,
      paths: [join(workspace.path, ".opencode", "commands", `${sanitizeCommandName(name)}.md`)],
    });
    const path = await upsertCommand(workspace.path, {
      name,
      description: body.description ? String(body.description) : undefined,
      template,
      agent: body.agent ? String(body.agent) : undefined,
      model: body.model ? String(body.model) : undefined,
      subtask: typeof body.subtask === "boolean" ? body.subtask : undefined,
    });
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "commands.upsert",
      target: path,
      summary: `Upserted command ${name}`,
      timestamp: Date.now(),
    });

    emitReloadEvent(ctx.reloadEvents, workspace, "commands", {
      type: "command",
      name: sanitizeCommandName(name),
      action: "updated",
      path,
    });
    const items = await listCommands(workspace.path, "workspace");
    return jsonResponse({ items });
  });

  addRoute(routes, "DELETE", "/workspace/:id/commands/:name", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const name = ctx.params.name ?? "";
    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "commands.delete",
      summary: `Delete command ${name}`,
      paths: [join(workspace.path, ".opencode", "commands", `${sanitizeCommandName(name)}.md`)],
    });
    await deleteCommand(workspace.path, name);
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "commands.delete",
      target: join(workspace.path, ".opencode", "commands"),
      summary: `Deleted command ${name}`,
      timestamp: Date.now(),
    });

    emitReloadEvent(ctx.reloadEvents, workspace, "commands", {
      type: "command",
      name: sanitizeCommandName(name),
      action: "removed",
      path: join(workspace.path, ".opencode", "commands", `${sanitizeCommandName(name)}.md`),
    });
    return jsonResponse({ ok: true });
  });

  addRoute(routes, "GET", "/workspace/:id/export", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const sensitiveMode = parseWorkspaceExportSensitiveMode(ctx.url.searchParams.get("sensitive"));
    const exportPayload = await exportWorkspace(workspace, { sensitiveMode });
    return jsonResponse(exportPayload);
  });

  addRoute(routes, "POST", "/workspace/:id/import/preview", "client", async (ctx) => {
    requireClientScope(ctx, "viewer");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const preview = await buildWorkspaceImportPreview(workspace.path, body);
    return jsonResponse(publicWorkspaceImportPreview(preview));
  });

  addRoute(routes, "POST", "/workspace/:id/import", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const expectedFingerprint = parseWorkspaceImportPreviewFingerprint(body);
    const preview = await buildWorkspaceImportPreview(workspace.path, body);
    if (expectedFingerprint && expectedFingerprint !== preview.fingerprint) {
      return jsonResponse(
        {
          ok: false,
          code: "workspace_import_preview_stale",
          message: "Workspace changed after this import was previewed. Review the latest preview before importing.",
          preview: publicWorkspaceImportPreview(preview),
        },
        409,
      );
    }
    const approvalPaths = workspaceImportPreviewApprovalPaths(preview);
    if (approvalPaths.length === 0) {
      return jsonResponse({ ok: true, preview: publicWorkspaceImportPreview(preview) });
    }
    if (!expectedFingerprint) {
      return jsonResponse(
        {
          ok: false,
          code: "workspace_import_preview_required",
          message: "Review this import preview before applying workspace changes.",
          preview: publicWorkspaceImportPreview(preview),
        },
        409,
      );
    }
    await requireApproval(ctx, {
      workspaceId: workspace.id,
      action: "config.import",
      summary: summarizeWorkspaceImportPreview(preview),
      paths: approvalPaths,
    });
    const latestPreview = await buildWorkspaceImportPreview(workspace.path, body);
    if (latestPreview.fingerprint !== expectedFingerprint) {
      return jsonResponse(
        {
          ok: false,
          code: "workspace_import_preview_stale",
          message: "Workspace changed after this import was previewed. Review the latest preview before importing.",
          preview: publicWorkspaceImportPreview(latestPreview),
        },
        409,
      );
    }
    const configFingerprintBefore = await computeReloadFingerprint(workspace.path, "config");
    await importWorkspace(workspace, body, latestPreview);
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "config.import",
      target: "workspace",
      summary: summarizeWorkspaceImportApplied(latestPreview),
      timestamp: Date.now(),
    });
    if (configFingerprintBefore !== await computeReloadFingerprint(workspace.path, "config")) {
      emitReloadEvent(ctx.reloadEvents, workspace, "config", buildConfigTrigger(opencodeConfigPath(workspace.path)));
    }
    return jsonResponse({ ok: true, preview: publicWorkspaceImportPreview(latestPreview) });
  });

  addRoute(routes, "POST", "/workspace/:id/blueprint/sessions/materialize", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const result = await materializeBlueprintSessions(config, workspace);
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "blueprint.sessions.materialize",
      target: "workspace",
      summary: result.created.length
        ? `Materialized ${result.created.length} template starter session${result.created.length === 1 ? "" : "s"}`
        : "Checked template starter sessions",
      timestamp: Date.now(),
    });
    return jsonResponse(result);
  });

  // ─── Crypto / DeFi Routes ──────────────────────────────────────────────

  addRoute(routes, "GET", "/api/prices", "client", async (ctx) => {
    const idsParam = ctx.url.searchParams.get("ids");
    if (!idsParam) {
      throw new ApiError(400, "invalid_params", "ids query param required (comma-separated CoinGecko IDs)");
    }
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      throw new ApiError(400, "invalid_params", "ids must contain at least one CoinGecko ID");
    }
    const prices = await getPrices(ids);
    return jsonResponse({ success: true, prices });
  });

  addRoute(routes, "GET", "/api/portfolio", "client", async (ctx) => {
    const chainId = Number(ctx.url.searchParams.get("chainId"));
    const address = ctx.url.searchParams.get("address");
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new ApiError(400, "invalid_address", "address must be a valid 0x address");
    }
    if (!Number.isFinite(chainId)) {
      throw new ApiError(400, "invalid_chainId", "chainId must be a number");
    }
    const result = await getPortfolio({ chainId, address: address as `0x${string}` });
    return jsonResponse(result);
  });

  const hyperliquidWatchStore = new Map<string, HyperliquidWatchDescriptor>();
  const polymarketWatchStore = new Map<string, PolymarketWatchDescriptor>();

  const coerceHyperliquidWatch = (value: unknown): HyperliquidWatchDescriptor | null => {
    if (!isRecord(value) || value.version !== "matterhorn.hyperliquid.watch.v1") return null;
    const kind = readStringField(value, "kind");
    if (!["funding_rate", "price_or_orderbook", "position_margin", "open_order_state", "market_availability"].includes(kind)) return null;
    const id = readStringField(value, "id");
    if (!id) return null;
    const direction = readStringField(value, "direction");
    const fallbackSource: HyperliquidWatchDescriptor["source"] = { source: "client", fetchedAt: new Date().toISOString(), freshness: "unknown", warnings: [] };
    const source = isRecord(value.source) ? value.source as unknown as HyperliquidWatchDescriptor["source"] : fallbackSource;
    return {
      version: "matterhorn.hyperliquid.watch.v1",
      id,
      kind: kind as HyperliquidWatchDescriptor["kind"],
      asset: readStringField(value, "asset") || null,
      address: readStringField(value, "address") || null,
      threshold: typeof value.threshold === "number" && Number.isFinite(value.threshold) ? value.threshold : null,
      direction: ["above", "below", "change", "any"].includes(direction) ? direction as HyperliquidWatchDescriptor["direction"] : "any",
      createdAt: readStringField(value, "createdAt") || new Date().toISOString(),
      source,
      warnings: Array.isArray(value.warnings) ? value.warnings.filter((entry): entry is string => typeof entry === "string") : [],
      note: readStringField(value, "note") || "Read-only Hyperliquid watch.",
    };
  };

  const coercePolymarketWatch = (value: unknown): PolymarketWatchDescriptor | null => {
    if (!isRecord(value) || value.version !== "matterhorn.polymarket.watch.v1") return null;
    const id = readStringField(value, "id");
    const marketId = readStringField(value, "marketId");
    if (!id || !marketId) return null;
    const fallbackSource: PolymarketWatchDescriptor["source"] = { source: "client", fetchedAt: new Date().toISOString(), freshness: "unknown", warnings: [] };
    const source = isRecord(value.source) ? value.source as unknown as PolymarketWatchDescriptor["source"] : fallbackSource;
    const conditions = Array.isArray(value.conditions)
      ? value.conditions.filter(isRecord).map((condition) => ({
          outcome: readStringField(condition, "outcome"),
          currentProbability: typeof condition.currentProbability === "number" ? condition.currentProbability : null,
          upperThreshold: typeof condition.upperThreshold === "number" ? condition.upperThreshold : null,
          lowerThreshold: typeof condition.lowerThreshold === "number" ? condition.lowerThreshold : null,
          note: readStringField(condition, "note"),
        })).filter((condition) => condition.outcome)
      : [];
    return {
      version: "matterhorn.polymarket.watch.v1",
      id,
      marketId,
      marketLabel: readStringField(value, "marketLabel") || marketId,
      endDate: readStringField(value, "endDate") || null,
      resolvesInDays: typeof value.resolvesInDays === "number" ? value.resolvesInDays : null,
      conditions,
      createdAt: readStringField(value, "createdAt") || new Date().toISOString(),
      source,
      warnings: Array.isArray(value.warnings) ? value.warnings.filter((entry): entry is string => typeof entry === "string") : [],
      note: readStringField(value, "note") || "Read-only Polymarket watch.",
    };
  };

  const readMarketWatchAlertIndex = (body: Record<string, unknown>) => {
    const value = body.alertIndex ?? body.alert_index;
    if (value === undefined || value === null || value === "") return 0;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || Math.floor(parsed) !== parsed) {
      throw new ApiError(400, "invalid_watch_alert_index", "alertIndex must be a non-negative integer.");
    }
    return parsed;
  };

  const rejectCustomWatchActionPrompt = (body: Record<string, unknown>, venueLabel: string) => {
    if (typeof body.message === "string" || typeof body.prompt === "string") {
      throw new ApiError(
        400,
        "watch_action_prompt_rejected",
        `${venueLabel} watch act builds a deterministic read-only review prompt from public watch data; do not provide custom message or prompt text.`,
      );
    }
  };

  const summarizeHyperliquidWatchAlert = (
    check: HyperliquidWatchCheckResult,
    watch: HyperliquidWatchDescriptor,
  ) => ({
    venue: "hyperliquid" as const,
    status: check.status,
    watchId: check.watchId || watch.id,
    asset: watch.asset,
    kind: watch.kind,
    alerts: check.alerts,
    observationCount: check.observations.length,
    source: check.source.source,
    freshness: check.source.freshness,
  });

  const summarizePolymarketWatchAlert = (
    check: PolymarketWatchCheckResult,
    watch: PolymarketWatchDescriptor,
  ) => ({
    venue: "polymarket" as const,
    status: check.status,
    watchId: check.watchId || watch.id,
    marketId: check.marketId || watch.marketId,
    marketLabel: watch.marketLabel,
    alerts: check.alerts,
    observationCount: check.observations.length,
    source: check.source.source,
    freshness: check.source.freshness,
  });

  const buildHyperliquidWatchAlertReviewPrompt = (
    check: HyperliquidWatchCheckResult,
    watch: HyperliquidWatchDescriptor,
  ) => {
    const summary = summarizeHyperliquidWatchAlert(check, watch);
    const subject = summary.asset || summary.watchId || "the selected watch";
    const alertText = summary.alerts.length ? summary.alerts.join("; ") : `status is ${summary.status}`;
    return [
      `Use unified crypto chat. Review this read-only Hyperliquid watch alert for ${subject}.`,
      `Alert context: ${alertText}.`,
      "Explain the public observations, source/freshness, risk notes, and safe next steps.",
      "Do not sign, submit, broadcast, auto-execute, request API secrets, request private keys, or accept raw signatures or signed payloads.",
    ].join(" ");
  };

  const buildPolymarketWatchAlertReviewPrompt = (
    check: PolymarketWatchCheckResult,
    watch: PolymarketWatchDescriptor,
  ) => {
    const summary = summarizePolymarketWatchAlert(check, watch);
    const subject = summary.marketId || summary.watchId || "the selected watch";
    const alertText = summary.alerts.length ? summary.alerts.join("; ") : `status is ${summary.status}`;
    return [
      `Use unified crypto chat. Review this read-only Polymarket watch alert for ${subject}.`,
      `Alert context: ${alertText}.`,
      "Explain the public observations, source/freshness, risk notes, compliance notes, and safe next steps.",
      "Do not sign, submit, broadcast, auto-execute, request API secrets, request private keys, or accept raw signatures or signed payloads.",
    ].join(" ");
  };

  const selectHyperliquidWatchAlert = (
    watches: HyperliquidWatchDescriptor[],
    checks: HyperliquidWatchCheckResult[],
    alertIndex: number,
  ) => {
    const alertCandidates = checks
      .map((check, index) => ({ check, watch: watches[index] }))
      .filter((candidate): candidate is { check: HyperliquidWatchCheckResult; watch: HyperliquidWatchDescriptor } => {
        return Boolean(candidate.watch) && candidate.check.status !== "ok";
      });
    const selected = alertCandidates[alertIndex];
    if (!selected) {
      throw new ApiError(404, "no_hyperliquid_watch_alert", `No Hyperliquid watch alert found at alertIndex ${alertIndex}.`);
    }
    return selected;
  };

  const selectPolymarketWatchAlert = (
    watches: PolymarketWatchDescriptor[],
    checks: PolymarketWatchCheckResult[],
    alertIndex: number,
  ) => {
    const alertCandidates = checks
      .map((check, index) => ({ check, watch: watches[index] }))
      .filter((candidate): candidate is { check: PolymarketWatchCheckResult; watch: PolymarketWatchDescriptor } => {
        return Boolean(candidate.watch) && candidate.check.status !== "ok";
      });
    const selected = alertCandidates[alertIndex];
    if (!selected) {
      throw new ApiError(404, "no_polymarket_watch_alert", `No Polymarket watch alert found at alertIndex ${alertIndex}.`);
    }
    return selected;
  };

  addRoute(routes, "GET", "/api/hyperliquid/markets", "client", async (ctx) => {
    const limit = ctx.url.searchParams.get("limit") ? Number(ctx.url.searchParams.get("limit")) : 20;
    const markets = await hyperliquidProvider.listMarkets(limit);
    return jsonResponse({ success: true, markets, cards: [buildHyperliquidMarketListCard(markets)] });
  });

  addRoute(routes, "GET", "/api/hyperliquid/account/:address", "client", async (ctx) => {
    const address = ctx.params.address.trim();
    if (!isValidHyperliquidAddress(address)) {
      throw new ApiError(400, "invalid_hyperliquid_address", "address must be a 42-character 0x Hyperliquid account address");
    }
    const account = await hyperliquidProvider.getAccount(address);
    return jsonResponse({ success: true, account, cards: [buildHyperliquidAccountCard(account)] });
  });

  addRoute(routes, "GET", "/api/hyperliquid/account/:address/positions", "client", async (ctx) => {
    const address = ctx.params.address.trim();
    if (!isValidHyperliquidAddress(address)) {
      throw new ApiError(400, "invalid_hyperliquid_address", "address must be a 42-character 0x Hyperliquid account address");
    }
    const account = await hyperliquidProvider.getAccount(address);
    return jsonResponse({
      success: true,
      address,
      positions: account.positions,
      notionalExposure: account.notionalExposure,
      unrealizedPnl: account.unrealizedPnl,
      source: account.source,
      warnings: account.warnings,
    });
  });

  addRoute(routes, "GET", "/api/hyperliquid/account/:address/open-orders", "client", async (ctx) => {
    const address = ctx.params.address.trim();
    if (!isValidHyperliquidAddress(address)) {
      throw new ApiError(400, "invalid_hyperliquid_address", "address must be a 42-character 0x Hyperliquid account address");
    }
    const account = await hyperliquidProvider.getAccount(address);
    return jsonResponse({
      success: true,
      address,
      orders: account.orders,
      source: account.source,
      warnings: account.warnings,
    });
  });

  addRoute(routes, "GET", "/api/hyperliquid/funding/:asset", "client", async (ctx) => {
    const asset = ctx.params.asset.trim();
    const funding = await hyperliquidProvider.getFunding(asset);
    return jsonResponse({ success: true, funding, cards: [buildHyperliquidFundingCard(funding)] });
  });

  addRoute(routes, "GET", "/api/hyperliquid/orderbook/:asset", "client", async (ctx) => {
    const asset = ctx.params.asset.trim();
    const orderbook = await hyperliquidProvider.getOrderbook(asset);
    return jsonResponse({ success: true, orderbook, cards: [buildHyperliquidOrderbookCard(orderbook)] });
  });

  addRoute(routes, "POST", "/api/hyperliquid/watches", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const forbidden = findForbiddenHyperliquidCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Hyperliquid watch input must not contain API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    const watch = buildHyperliquidWatchDescriptor({
      message: typeof body.message === "string" ? body.message : null,
      asset: typeof body.asset === "string" ? body.asset : null,
      address: typeof body.address === "string" ? body.address : null,
      watchKind: typeof body.kind === "string" ? body.kind : typeof body.watchKind === "string" ? body.watchKind : null,
      threshold: body.threshold === undefined ? null : body.threshold as never,
      direction: typeof body.direction === "string" ? body.direction : null,
    });
    hyperliquidWatchStore.set(watch.id, watch);
    const check = await checkHyperliquidWatchDescriptor(watch, hyperliquidProvider);
    return jsonResponse({ success: true, watch, check, cards: [buildHyperliquidWatchCard(watch, check)] });
  });

  addRoute(routes, "GET", "/api/hyperliquid/watches", "client", async () => {
    const watches = Array.from(hyperliquidWatchStore.values());
    return jsonResponse({ success: true, watches, count: watches.length });
  });

  addRoute(routes, "POST", "/api/hyperliquid/watches/check", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const forbidden = findForbiddenHyperliquidCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Hyperliquid watch check input must not contain API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    const explicit = coerceHyperliquidWatch(body.watch);
    const watches = explicit
      ? [explicit]
      : Array.isArray(body.watches)
        ? body.watches.map(coerceHyperliquidWatch).filter((watch): watch is HyperliquidWatchDescriptor => Boolean(watch))
        : Array.from(hyperliquidWatchStore.values());
    const checks = await Promise.all(watches.map((watch) => checkHyperliquidWatchDescriptor(watch, hyperliquidProvider)));
    return jsonResponse({
      success: true,
      checks,
      cards: watches.map((watch, index) => buildHyperliquidWatchCard(watch, checks[index])),
      digest: buildHyperliquidWatchDigest(checks),
    });
  });

  addRoute(routes, "POST", "/api/hyperliquid/watches/act", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    rejectCustomWatchActionPrompt(body, "Hyperliquid");
    const forbidden = findForbiddenHyperliquidCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Hyperliquid watch act input must not contain API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    const explicit = coerceHyperliquidWatch(body.watch);
    const watches = explicit
      ? [explicit]
      : Array.isArray(body.watches)
        ? body.watches.map(coerceHyperliquidWatch).filter((watch): watch is HyperliquidWatchDescriptor => Boolean(watch))
        : Array.from(hyperliquidWatchStore.values());
    const checks = await Promise.all(watches.map((watch) => checkHyperliquidWatchDescriptor(watch, hyperliquidProvider)));
    const selected = selectHyperliquidWatchAlert(watches, checks, readMarketWatchAlertIndex(body));
    const prompt = buildHyperliquidWatchAlertReviewPrompt(selected.check, selected.watch);
    const chat = await executeHyperliquidChatWorkflow({
      message: prompt,
      asset: selected.watch.asset,
      address: selected.watch.address,
      watchKind: selected.watch.kind,
    }, { provider: hyperliquidProvider });
    return jsonResponse({
      success: true,
      selectedAlert: summarizeHyperliquidWatchAlert(selected.check, selected.watch),
      action: {
        label: "Review alert with crypto chat",
        prompt,
        endpoint: "/api/hyperliquid/chat/execute",
      },
      chat,
      cards: chat.cards,
      safety: {
        nonCustodial: true,
        liveSubmissionEnabled: false,
        canSubmit: false,
        signsOrSubmits: false,
        autoExecutes: false,
      },
      source: "matterhorn_hyperliquid_watch_act",
    });
  });

  addRoute(routes, "GET", "/api/hyperliquid/watches/digest", "client", async () => {
    const watches = Array.from(hyperliquidWatchStore.values());
    const checks = await Promise.all(watches.map((watch) => checkHyperliquidWatchDescriptor(watch, hyperliquidProvider)));
    return jsonResponse({ success: true, digest: buildHyperliquidWatchDigest(checks), checks });
  });

  addRoute(routes, "GET", "/api/crypto/market-execution-readiness", "client", async () => {
    return jsonResponse(buildMarketExecutionReadinessResponse());
  });

  addRoute(routes, "GET", "/api/crypto/market-execution-chain", "client", async () => {
    return jsonResponse(buildMarketExecutionChainResponse());
  });

  addRoute(routes, "GET", "/api/crypto/market-sdk-validation", "client", async () => {
    return jsonResponse(buildMarketSdkValidationResponse());
  });

  addRoute(routes, "GET", "/api/services/capabilities", "client", async (ctx) => {
    const forbiddenKey = findForbiddenDecentralizedServiceQueryKey(ctx.url.searchParams.keys());
    if (forbiddenKey) {
      throw new ApiError(
        400,
        "services_secret_rejected",
        `Services capability discovery does not accept credential-shaped query fields such as ${forbiddenKey}.`,
      );
    }
    const capability = ctx.url.searchParams.get("capability") ?? ctx.url.searchParams.get("service");
    try {
      return jsonResponse(buildDecentralizedServicesCapabilityCatalog({ capability }));
    } catch (error) {
      throw new ApiError(
        400,
        "invalid_services_capability",
        error instanceof Error ? error.message : "Unknown decentralized service capability",
      );
    }
  });

  addRoute(routes, "GET", "/api/workflows/catalog", "client", async (ctx) => {
    const forbiddenKey = findForbiddenMatterhornWorkflowQueryKey(ctx.url.searchParams.keys());
    if (forbiddenKey) {
      throw new ApiError(
        400,
        "workflow_secret_rejected",
        `Matterhorn workflow catalog does not accept credential-shaped query fields such as ${forbiddenKey}.`,
      );
    }
    const workflow =
      ctx.url.searchParams.get("workflow") ?? ctx.url.searchParams.get("workflowId");
    const category = ctx.url.searchParams.get("category");
    const status = ctx.url.searchParams.get("status");
    const includePrompts = ctx.url.searchParams.get("includePrompts") === "true";
    try {
      return jsonResponse(buildMatterhornWorkflowCatalog({
        workflow,
        category,
        status,
        includePrompts,
      }));
    } catch (error) {
      throw new ApiError(
        400,
        "invalid_workflow_catalog_filter",
        error instanceof Error ? error.message : "Could not build Matterhorn workflow catalog",
      );
    }
  });

  addRoute(routes, "GET", "/api/workflows/prompts", "client", async (ctx) => {
    const forbiddenKey = findForbiddenMatterhornWorkflowQueryKey(ctx.url.searchParams.keys());
    if (forbiddenKey) {
      throw new ApiError(
        400,
        "workflow_secret_rejected",
        `Matterhorn workflow prompt packs do not accept credential-shaped query fields such as ${forbiddenKey}.`,
      );
    }
    const workflow =
      ctx.url.searchParams.get("workflow") ?? ctx.url.searchParams.get("workflowId");
    const category = ctx.url.searchParams.get("category");
    const status = ctx.url.searchParams.get("status");
    try {
      return jsonResponse(buildMatterhornWorkflowPromptPack({
        workflow,
        category,
        status,
      }));
    } catch (error) {
      throw new ApiError(
        400,
        "invalid_workflow_prompt_pack_filter",
        error instanceof Error ? error.message : "Could not build Matterhorn workflow prompt pack",
      );
    }
  });

  addRoute(routes, "GET", "/api/workflows/templates", "client", async (ctx) => {
    const forbiddenKey = findForbiddenMatterhornWorkflowQueryKey(ctx.url.searchParams.keys());
    if (forbiddenKey) {
      throw new ApiError(
        400,
        "workflow_secret_rejected",
        `Matterhorn customer workflow templates do not accept credential-shaped query fields such as ${forbiddenKey}.`,
      );
    }
    const customerTemplate =
      ctx.url.searchParams.get("customerTemplate") ??
      ctx.url.searchParams.get("customer_template") ??
      ctx.url.searchParams.get("template");
    const category = ctx.url.searchParams.get("category");
    const status = ctx.url.searchParams.get("status");
    try {
      return jsonResponse(buildMatterhornCustomerWorkflowTemplates({
        customerTemplate,
        category,
        status,
      }));
    } catch (error) {
      throw new ApiError(
        400,
        "invalid_customer_workflow_template_filter",
        error instanceof Error ? error.message : "Could not build Matterhorn customer workflow template catalog",
      );
    }
  });

  const workflowRunMutation = async <T,>(operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("workflow_run_not_found")) {
        throw new ApiError(404, "workflow_run_not_found", "Workflow run not found");
      }
      if (message.startsWith("invalid_workflow_run_transition")) {
        throw new ApiError(409, "invalid_workflow_run_transition", message);
      }
      if (message.startsWith("workflow_run_event_rejected")) {
        throw new ApiError(400, "workflow_run_event_rejected", message);
      }
      throw error;
    }
  };

  const publicWorkflowRun = <T extends object>(
    run: T,
  ): Omit<T, "hiddenAgentInstructions"> => {
    const { hiddenAgentInstructions: _hiddenAgentInstructions, ...publicRun } = run as T & {
      hiddenAgentInstructions?: string;
    };
    return publicRun as Omit<T, "hiddenAgentInstructions">;
  };

  addRoute(routes, "GET", "/api/workflows/runs", "client", async (ctx) => {
    const statusParam = ctx.url.searchParams.get("status");
    if (statusParam && !isValidWorkflowRunStatus(statusParam)) {
      throw new ApiError(400, "invalid_workflow_status", "status is invalid");
    }
    const filters: WorkflowRunFilters = {
      workspaceId: ctx.url.searchParams.get("workspaceId") ?? undefined,
      sessionId: ctx.url.searchParams.get("sessionId") ?? undefined,
      deskId: ctx.url.searchParams.get("deskId") ?? undefined,
      status: statusParam as MatterhornWorkflowRunStatus | undefined,
      limit: parseOptionalNonNegativeInteger(ctx.url.searchParams.get("limit"), "limit"),
    };
    const items = workflowRuns.listRuns(filters).map(publicWorkflowRun);
    return jsonResponse({ success: true, items });
  });

  addRoute(routes, "GET", "/api/workflows/runs/:id", "client", async (ctx) => {
    const run = workflowRuns.getRun(ctx.params.id);
    if (!run) {
      throw new ApiError(404, "workflow_run_not_found", "Workflow run not found");
    }
    return jsonResponse({ success: true, run: publicWorkflowRun(run) });
  });

  addRoute(routes, "GET", "/api/workflows/runs/:id/events", "client", async (ctx) => {
    const run = workflowRuns.getRun(ctx.params.id);
    if (!run) {
      throw new ApiError(404, "workflow_run_not_found", "Workflow run not found");
    }
    const events = workflowRuns.listEvents(ctx.params.id);
    return jsonResponse({ success: true, events });
  });

  addRoute(routes, "POST", "/api/workflows/runs/stage", "client", async (ctx) => {
    requireClientScope(ctx, "viewer");
    const body = await readJsonBody(ctx.request);

    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const deskId = typeof body.deskId === "string" ? body.deskId.trim() : "";
    const visibleUserIntent = typeof body.visibleUserIntent === "string" ? body.visibleUserIntent.trim() : "";

    if (!workspaceId) {
      throw new ApiError(400, "invalid_workspace_id", "workspaceId is required");
    }
    if (!sessionId) {
      throw new ApiError(400, "invalid_session_id", "sessionId is required");
    }
    if (!deskId) {
      throw new ApiError(400, "invalid_desk_id", "deskId is required");
    }
    if (!visibleUserIntent) {
      throw new ApiError(400, "invalid_user_intent", "visibleUserIntent is required");
    }

    const agentManifest = getMatterhornDeskAgent(deskId);
    if (!agentManifest) {
      throw new ApiError(400, "unknown_desk_agent", `No Matterhorn desk agent is registered for ${deskId}`);
    }
    const actionId = typeof body.actionId === "string" && body.actionId.trim()
      ? body.actionId.trim()
      : agentManifest.defaultActionId;
    const stageId = typeof body.stageId === "string" && body.stageId.trim()
      ? body.stageId.trim()
      : agentManifest.defaultStageId;
    const outputBasePath = makeOutputBasePath(
      agentManifest.outputDeskId,
      normalizeSessionSlug(sessionId),
    );

    const run = await workflowRuns.stageRun({
      workspaceId,
      sessionId,
      deskId: agentManifest.deskId,
      actionId,
      stageId,
      visibleUserIntent,
      agentId: agentManifest.agentId,
      workflowId: agentManifest.workflowId,
      workflowManifestRef: agentManifest.workflowManifestRef,
      hiddenAgentInstructions: agentManifest.instructions,
      outputBasePath,
    });

    return jsonResponse({ success: true, run: publicWorkflowRun(run) }, 201);
  });

  addRoute(routes, "POST", "/api/workflows/runs/:id/start", "client", async (ctx) => {
    requireClientScope(ctx, "viewer");
    const run = await workflowRunMutation(() => workflowRuns.startRun(ctx.params.id));
    return jsonResponse({ success: true, run: publicWorkflowRun(run) });
  });

  addRoute(routes, "POST", "/api/workflows/runs/:id/stage", "client", async (ctx) => {
    requireClientScope(ctx, "viewer");
    const body = await readJsonBody(ctx.request);
    const stageId = typeof body.stageId === "string" ? body.stageId.trim() : "";
    if (!stageId) {
      throw new ApiError(400, "invalid_stage_id", "stageId is required");
    }
    const actionId = typeof body.actionId === "string" && body.actionId.trim()
      ? body.actionId.trim()
      : undefined;
    const run = await workflowRunMutation(() => workflowRuns.advanceStage(ctx.params.id, stageId, actionId));
    return jsonResponse({ success: true, run: publicWorkflowRun(run) });
  });

  addRoute(routes, "POST", "/api/workflows/runs/:id/tool-call", "client", async (ctx) => {
    requireClientScope(ctx, "viewer");
    const body = await readJsonBody(ctx.request);
    const run = await workflowRunMutation(() => workflowRuns.recordToolCall(ctx.params.id, body.payload ?? body));
    return jsonResponse({ success: true, run: publicWorkflowRun(run) });
  });

  addRoute(routes, "POST", "/api/workflows/runs/:id/artifact", "client", async (ctx) => {
    requireClientScope(ctx, "viewer");
    const body = await readJsonBody(ctx.request);
    const path = typeof body.path === "string" ? body.path.trim() : "";
    if (!path) {
      throw new ApiError(400, "invalid_artifact_path", "path is required");
    }
    const run = await workflowRunMutation(() => workflowRuns.recordArtifactSaved(ctx.params.id, path));
    return jsonResponse({ success: true, run: publicWorkflowRun(run) });
  });

  addRoute(routes, "POST", "/api/workflows/runs/:id/waiting", "client", async (ctx) => {
    requireClientScope(ctx, "viewer");
    const body = await readJsonBody(ctx.request);
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : undefined;
    const run = await workflowRunMutation(() => workflowRuns.recordWaitingForUser(ctx.params.id, reason));
    return jsonResponse({ success: true, run: publicWorkflowRun(run) });
  });

  addRoute(routes, "POST", "/api/workflows/runs/:id/complete", "client", async (ctx) => {
    requireClientScope(ctx, "viewer");
    const run = await workflowRunMutation(() => workflowRuns.completeRun(ctx.params.id));
    return jsonResponse({ success: true, run: publicWorkflowRun(run) });
  });

  addRoute(routes, "POST", "/api/workflows/runs/:id/fail", "client", async (ctx) => {
    requireClientScope(ctx, "viewer");
    const body = await readJsonBody(ctx.request);
    const error = typeof body.error === "string" && body.error.trim() ? body.error.trim() : "Workflow failed";
    const run = await workflowRunMutation(() => workflowRuns.failRun(ctx.params.id, error));
    return jsonResponse({ success: true, run: publicWorkflowRun(run) });
  });

  addRoute(routes, "POST", "/api/workflows/runs/:id/cancel", "client", async (ctx) => {
    requireClientScope(ctx, "viewer");
    const run = await workflowRunMutation(() => workflowRuns.cancelRun(ctx.params.id));
    return jsonResponse({ success: true, run: publicWorkflowRun(run) });
  });

  addRoute(routes, "GET", "/api/memory/search", "client", async (ctx) => {
    try {
      const records = await memoryVault.searchRecords({
        query: ctx.url.searchParams.get("q") ?? ctx.url.searchParams.get("query") ?? undefined,
        kind: ctx.url.searchParams.get("kind") as MatterhornMemoryRecord["kind"] | null ?? undefined,
        scope: ctx.url.searchParams.get("scope") as MatterhornMemoryRecord["scope"] | null ?? undefined,
        tags: normalizeMemoryTags(ctx.url.searchParams.get("tags")),
        limit: normalizeMemoryLimit(ctx.url.searchParams.get("limit")),
        includeDeleted: ctx.url.searchParams.get("includeDeleted") === "true" || ctx.url.searchParams.get("include_deleted") === "true",
      });
      const filteredRecords = filterMemoryRecordsForSurface(records, memorySurface(ctx.url));
      return jsonResponse({ success: true, records: filteredRecords, count: filteredRecords.length });
    } catch (error) {
      throw memoryApiError(error);
    }
  });

  addRoute(routes, "GET", "/api/memory/entities", "client", async (ctx) => {
    try {
      const records = await memoryVault.listRecords({
        kind: ctx.url.searchParams.get("kind") as MatterhornMemoryRecord["kind"] | null ?? undefined,
        scope: ctx.url.searchParams.get("scope") as MatterhornMemoryRecord["scope"] | null ?? undefined,
        tags: normalizeMemoryTags(ctx.url.searchParams.get("tags")),
        limit: normalizeMemoryLimit(ctx.url.searchParams.get("limit")),
        includeDeleted: ctx.url.searchParams.get("includeDeleted") === "true" || ctx.url.searchParams.get("include_deleted") === "true",
      });
      const filteredRecords = filterMemoryRecordsForSurface(records, memorySurface(ctx.url));
      return jsonResponse({ success: true, records: filteredRecords, count: filteredRecords.length });
    } catch (error) {
      throw memoryApiError(error);
    }
  });

  addRoute(routes, "GET", "/api/memory/entities/:id", "client", async (ctx) => {
    const record = await memoryVault.getRecord(ctx.params.id);
    if (!record) {
      throw new ApiError(404, "memory_not_found", "Memory record not found");
    }
    assertMemoryRecordAllowedForSurface(record, memorySurface(ctx.url));
    return jsonResponse({ success: true, record });
  });

  addRoute(routes, "POST", "/api/memory/capture", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    try {
      const body = await readJsonBody(ctx.request);
      const auditWorkspace = await resolveMemoryMutationWorkspace(config, body);
      const record = coerceMemoryRecord(body.record ?? body);
      assertMemoryRecordAllowedForSurface(record, memorySurface(ctx.url));
      const result = await memoryVault.captureRecord(record);
      await recordMemoryMutationAudit(auditWorkspace, ctx, {
        action: "memory.capture",
        target: result.record.id,
        summary: `Captured memory ${result.record.title}`,
      });
      return jsonResponse({ success: true, ...result });
    } catch (error) {
      throw memoryApiError(error);
    }
  });

  addRoute(routes, "POST", "/api/memory/suggestions/plan", "client", async (ctx) => {
    try {
      const body = await readJsonBody(ctx.request);
      const input = (body.input && typeof body.input === "object" && !Array.isArray(body.input)
        ? body.input
        : body) as MatterhornMemorySuggestionPlanInput;
      if (hasForbiddenMatterhornMemorySuggestionInput(input)) {
        throw new ApiError(
          400,
          "memory_suggestion_secret_rejected",
          "Memory suggestions cannot be planned from seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, or secret-shaped fields.",
        );
      }
      const plan = planMatterhornMemorySuggestions(input);
      return jsonResponse({ success: true, ...plan });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw memoryApiError(error);
    }
  });

  addRoute(routes, "POST", "/api/memory/suggestions", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    try {
      const body = await readJsonBody(ctx.request);
      const auditWorkspace = await resolveMemoryMutationWorkspace(config, body);
      const input = (body.input && typeof body.input === "object" && !Array.isArray(body.input)
        ? body.input
        : body) as MatterhornMemorySuggestionPlanInput;
      if (hasForbiddenMatterhornMemorySuggestionInput(input)) {
        throw new ApiError(
          400,
          "memory_suggestion_secret_rejected",
          "Memory suggestions cannot be created from seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, or secret-shaped fields.",
        );
      }
      const plan = planMatterhornMemorySuggestions(input);
      const inbox = await memoryVault.storeSuggestions(plan.suggestions);
      await recordMemoryMutationAudit(auditWorkspace, ctx, {
        action: "memory.suggestions.create",
        target: "memory-suggestions",
        summary: `Created ${inbox.entries.length} memory suggestion${inbox.entries.length === 1 ? "" : "s"}`,
      });
      return jsonResponse({ success: true, ...plan, inbox });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw memoryApiError(error);
    }
  });

  addRoute(routes, "GET", "/api/memory/suggestions", "client", async (ctx) => {
    try {
      const entries = await memoryVault.listSuggestions({
        status: coerceMemorySuggestionStatus(ctx.url.searchParams.get("status")),
        desk: ctx.url.searchParams.get("desk") as MatterhornMemorySuggestion["desk"] | null ?? undefined,
        includeResolved: ctx.url.searchParams.get("includeResolved") === "true" || ctx.url.searchParams.get("include_resolved") === "true",
        limit: normalizeMemoryLimit(ctx.url.searchParams.get("limit")),
      });
      return jsonResponse({ success: true, entries, count: entries.length });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw memoryApiError(error);
    }
  });

  addRoute(routes, "GET", "/api/memory/suggestions/:id", "client", async (ctx) => {
    const entry = await memoryVault.getSuggestion(ctx.params.id);
    if (!entry) {
      throw new ApiError(404, "memory_suggestion_not_found", "Memory suggestion not found");
    }
    return jsonResponse({ success: true, entry });
  });

  addRoute(routes, "POST", "/api/memory/suggestions/:id/resolve", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    try {
      const body = await readJsonBody(ctx.request);
      const auditWorkspace = await resolveMemoryMutationWorkspace(config, body);
      const action = coerceMemorySuggestionAction(body.action);
      const patch = body.patch && typeof body.patch === "object" && !Array.isArray(body.patch)
        ? body.patch as Partial<Omit<MatterhornMemoryRecord, "id" | "createdAt">>
        : undefined;
      const entry = await memoryVault.getSuggestion(ctx.params.id);
      if (!entry) {
        throw new ApiError(404, "memory_suggestion_not_found", "Memory suggestion not found");
      }
      const effectiveAction = action ?? entry.suggestion.userAction;
      if (effectiveAction === "confirm" || effectiveAction === "edit") {
        assertMemoryRecordAllowedForSurface({ ...entry.suggestion.proposedRecord, ...(patch ?? {}) } as MatterhornMemoryRecord, memorySurface(ctx.url));
      }
      const result = await memoryVault.resolveStoredSuggestion(ctx.params.id, {
        action,
        patch,
        reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : undefined,
      });
      await recordMemoryMutationAudit(auditWorkspace, ctx, {
        action: "memory.suggestion.resolve",
        target: ctx.params.id,
        summary: `Resolved memory suggestion ${ctx.params.id} as ${effectiveAction}`,
      });
      return jsonResponse({ success: true, ...result });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw memoryApiError(error);
    }
  });

  addRoute(routes, "POST", "/api/memory/suggestions/resolve", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    try {
      const body = await readJsonBody(ctx.request);
      const auditWorkspace = await resolveMemoryMutationWorkspace(config, body);
      const suggestion = coerceMemorySuggestion(body.suggestion ?? body);
      const action = coerceMemorySuggestionAction(body.action);
      const patch = body.patch && typeof body.patch === "object" && !Array.isArray(body.patch)
        ? body.patch as Partial<Omit<MatterhornMemoryRecord, "id" | "createdAt">>
        : undefined;
      const effectiveAction = action ?? suggestion.userAction;
      if (effectiveAction === "confirm" || effectiveAction === "edit") {
        assertMemoryRecordAllowedForSurface({ ...suggestion.proposedRecord, ...(patch ?? {}) } as MatterhornMemoryRecord, memorySurface(ctx.url));
      }
      const result = await memoryVault.resolveSuggestion(suggestion, {
        action,
        patch,
        reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : undefined,
      });
      await recordMemoryMutationAudit(auditWorkspace, ctx, {
        action: "memory.suggestion.resolve",
        target: suggestion.id,
        summary: `Resolved memory suggestion ${suggestion.id} as ${effectiveAction}`,
      });
      return jsonResponse({ success: true, ...result });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw memoryApiError(error);
    }
  });

  addRoute(routes, "PATCH", "/api/memory/entities/:id", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    try {
      const body = await readJsonBody(ctx.request);
      const auditWorkspace = await resolveMemoryMutationWorkspace(config, body);
      const patch = body.patch && typeof body.patch === "object" && !Array.isArray(body.patch)
        ? body.patch as Partial<Omit<MatterhornMemoryRecord, "id" | "createdAt">>
        : body as Partial<Omit<MatterhornMemoryRecord, "id" | "createdAt">>;
      const existingRecord = await memoryVault.getRecord(ctx.params.id);
      if (existingRecord) {
        assertMemoryRecordAllowedForSurface({ ...existingRecord, ...patch } as MatterhornMemoryRecord, memorySurface(ctx.url));
      }
      const record = await memoryVault.updateRecord(ctx.params.id, patch);
      await recordMemoryMutationAudit(auditWorkspace, ctx, {
        action: "memory.record.update",
        target: record.id,
        summary: `Updated memory ${record.title}`,
      });
      return jsonResponse({ success: true, record });
    } catch (error) {
      throw memoryApiError(error);
    }
  });

  addRoute(routes, "DELETE", "/api/memory/entities/:id", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    try {
      const auditWorkspace = await resolveMemoryMutationWorkspace(config, {});
      const result = await memoryVault.forgetRecord(ctx.params.id, "Deleted through Matterhorn Work memory API.");
      await recordMemoryMutationAudit(auditWorkspace, ctx, {
        action: "memory.record.forget",
        target: ctx.params.id,
        summary: `Forgot memory ${ctx.params.id}`,
      });
      return jsonResponse({ success: true, ...result });
    } catch (error) {
      throw memoryApiError(error);
    }
  });

  addRoute(routes, "POST", "/api/memory/forget", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    try {
      const body = await readJsonBody(ctx.request);
      const auditWorkspace = await resolveMemoryMutationWorkspace(config, body);
      const id = typeof body.id === "string" ? body.id.trim() : "";
      if (!id) {
        throw new ApiError(400, "invalid_memory_id", "id is required");
      }
      const reason = typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "User requested memory deletion.";
      const result = await memoryVault.forgetRecord(id, reason);
      await recordMemoryMutationAudit(auditWorkspace, ctx, {
        action: "memory.record.forget",
        target: id,
        summary: `Forgot memory ${id}`,
      });
      return jsonResponse({ success: true, ...result });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw memoryApiError(error);
    }
  });

  addRoute(routes, "POST", "/api/memory/export", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    try {
      const body = await readJsonBody(ctx.request);
      const auditWorkspace = await resolveMemoryMutationWorkspace(config, body);
      const outputDir = typeof body.outputDir === "string" && body.outputDir.trim()
        ? body.outputDir.trim()
        : join(memoryVault.rootDir, "Exports", `memory-export-${Date.now()}`);
      const result = await memoryVault.exportBundle(outputDir);
      await recordMemoryMutationAudit(auditWorkspace, ctx, {
        action: "memory.export",
        target: result.outputDir,
        summary: `Exported ${result.recordCount} memory record${result.recordCount === 1 ? "" : "s"}`,
      });
      return jsonResponse({ success: true, export: result });
    } catch (error) {
      throw memoryApiError(error);
    }
  });

  addRoute(routes, "POST", "/api/services/chat/plan", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const message = typeof body.message === "string" ? body.message : "";
    if (!message.trim()) {
      throw new ApiError(400, "invalid_message", "message is required");
    }
    const forbidden = findForbiddenDecentralizedServiceInput(body);
    if (forbidden) {
      throw new ApiError(
        400,
        "services_secret_rejected",
        `Services chat planning does not accept seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, or provider credentials (${forbidden}).`,
      );
    }
    try {
      return jsonResponse(planDecentralizedServicesChat({
        message,
        capability: typeof body.capability === "string" ? body.capability : null,
      }));
    } catch (error) {
      throw new ApiError(
        400,
        "invalid_services_chat_plan",
        error instanceof Error ? error.message : "Could not plan decentralized service workflow",
      );
    }
  });

  addRoute(routes, "GET", "/api/crypto/readiness", "client", async () => {
    const bittensor = await auditBittensorReadiness();
    const checks = [
      {
        id: "bittensor.readiness",
        label: "Bittensor readiness",
        status: bittensor.status,
        summary: bittensor.status === "pass"
          ? "Bittensor chat, read, preview, and non-custodial safety checks are ready."
          : "Review Bittensor blockers or warnings before a customer demo.",
      },
      {
        id: "hyperliquid.read_preview",
        label: "Hyperliquid read/preview",
        status: "pass" as const,
        summary: "Hyperliquid is limited to read-only data, unsigned previews, external signer handoff, and public receipt evidence.",
      },
      {
        id: "polymarket.read_preview",
        label: "Polymarket read/preview",
        status: "pass" as const,
        summary: "Polymarket is limited to read-only data, compliance-gated previews, external signer handoff, and public receipt evidence.",
      },
      {
        id: "market.execution_safety",
        label: "Market execution safety",
        status: "pass" as const,
        summary: "Matterhorn exposes no live Hyperliquid or Polymarket submit route and does not accept signing secrets.",
      },
    ];
    const blockers = [
      ...bittensor.blockers,
      ...checks.filter((check) => check.status === "fail").map((check) => check.summary),
    ];
    const warnings = [
      ...bittensor.warnings,
      "This route summarizes runtime and static safety surfaces. Attach offline smoke/CI evidence before saying a customer packet is complete.",
    ];
    const ready = blockers.length === 0;
    const report = {
      status: ready ? (checks.some((check) => check.status === "warning") ? "warning" : "pass") : "fail",
      ready,
      checkedAt: new Date().toISOString(),
      checks,
      blockers,
      warnings,
      nextActions: ready
        ? [
            "Run pnpm smoke:customer-ready-crypto before a customer session.",
            "Attach matterhorn-work crypto customer-packet output to the customer handoff.",
          ]
        : bittensor.nextActions,
      safety: {
        nonCustodial: true,
        liveSubmissionEnabled: false,
        canSubmit: false,
      },
    };
    return jsonResponse({
      success: true,
      report,
      cards: [{
        kind: "readiness_report",
        title: "Crypto customer readiness",
        summary: ready
          ? "Runtime crypto surfaces are ready for a guarded customer demo after offline smoke evidence is attached."
          : "Resolve readiness blockers before a customer demo.",
        tone: ready ? "good" : "danger",
        items: [
          { label: "Bittensor", value: bittensor.status, tone: bittensor.status === "pass" ? "good" : bittensor.status === "warning" ? "warning" : "danger" },
          { label: "Hyperliquid", value: "Read/preview only", tone: "good" },
          { label: "Polymarket", value: "Read/preview only", tone: "good" },
          { label: "Live submission", value: "Off", tone: "good" },
        ],
        warnings,
        data: { report },
      }],
    });
  });

  addRoute(routes, "POST", "/api/crypto/chat/execute", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const message = typeof body.message === "string" ? body.message : "";
    if (!message.trim()) {
      throw new ApiError(400, "invalid_message", "message is required");
    }
    const forbidden = findForbiddenUnifiedCryptoCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Unified crypto chat input must not contain seed phrases, private keys, API secrets, raw signatures, signed payloads, or wallet exports (${forbidden}).`);
    }
    const venue = body.venue === "bittensor" || body.venue === "hyperliquid" || body.venue === "polymarket" || body.venue === "auto"
      ? body.venue
      : "auto";
    const strategy = typeof body.strategy === "string" && ["balanced", "yield", "safety"].includes(body.strategy)
      ? body.strategy
      : null;
    const result = await executeUnifiedCryptoChatWorkflow({
      venue,
      message,
      address: typeof body.address === "string" ? body.address : null,
      ss58Address: typeof body.ss58Address === "string" ? body.ss58Address : null,
      marketId: typeof body.marketId === "string" ? body.marketId : null,
      outcome: typeof body.outcome === "string" ? body.outcome : null,
      asset: typeof body.asset === "string" ? body.asset : null,
      side: typeof body.side === "string" ? body.side : null,
      size: body.size === undefined ? null : body.size as UnifiedCryptoChatInput["size"],
      price: body.price === undefined ? null : body.price as UnifiedCryptoChatInput["price"],
      amountUsdc: body.amountUsdc === undefined ? null : body.amountUsdc as UnifiedCryptoChatInput["amountUsdc"],
      amountTao: body.amountTao === undefined ? null : body.amountTao as UnifiedCryptoChatInput["amountTao"],
      netuid: body.netuid === undefined ? null : body.netuid as UnifiedCryptoChatInput["netuid"],
      validatorHotkey: typeof body.validatorHotkey === "string" ? body.validatorHotkey : null,
      coldkey: typeof body.coldkey === "string" ? body.coldkey : null,
      recipient: typeof body.recipient === "string" ? body.recipient : null,
      destination: typeof body.destination === "string" ? body.destination : null,
      contextId: typeof body.contextId === "string" ? body.contextId : null,
      context: body.context && typeof body.context === "object" && !Array.isArray(body.context)
        ? body.context as UnifiedCryptoChatInput["context"]
        : null,
      limit: body.limit === undefined ? null : body.limit as UnifiedCryptoChatInput["limit"],
      strategy,
      slippageTolerance: body.slippageTolerance === undefined ? null : body.slippageTolerance as UnifiedCryptoChatInput["slippageTolerance"],
      rateTolerance: body.rateTolerance === undefined ? null : body.rateTolerance as UnifiedCryptoChatInput["rateTolerance"],
      reduceOnly: typeof body.reduceOnly === "boolean" ? body.reduceOnly : null,
    });
    return jsonResponse({ success: true, ...result });
  });

  addRoute(routes, "POST", "/api/hyperliquid/orders/preview", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const forbidden = findForbiddenHyperliquidCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Hyperliquid preview input must not contain API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    try {
      const preview = await prepareHyperliquidOrderPreview({
        asset: typeof body.asset === "string" ? body.asset : null,
        side: typeof body.side === "string" ? body.side as never : null,
        size: body.size === undefined ? null : body.size as never,
        price: body.price === undefined ? null : body.price as never,
        reduceOnly: typeof body.reduceOnly === "boolean" ? body.reduceOnly : null,
        slippageTolerance: body.slippageTolerance === undefined ? null : body.slippageTolerance as never,
        address: typeof body.address === "string" ? body.address : null,
        message: typeof body.message === "string" ? body.message : null,
      });
      return jsonResponse({ success: true, preview, cards: [buildHyperliquidOrderPreviewCard(preview)] });
    } catch (err) {
      throw new ApiError(400, "invalid_hyperliquid_preview", err instanceof Error ? err.message : "Could not prepare Hyperliquid order preview");
    }
  });

  addRoute(routes, "POST", "/api/hyperliquid/chat/execute", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const message = typeof body.message === "string" ? body.message : "";
    if (!message.trim()) {
      throw new ApiError(400, "invalid_message", "message is required");
    }
    const forbidden = findForbiddenHyperliquidCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Hyperliquid chat input must not contain API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    const result = await executeHyperliquidChatWorkflow({
      message,
      address: typeof body.address === "string" ? body.address : null,
      asset: typeof body.asset === "string" ? body.asset : null,
      side: typeof body.side === "string" ? body.side as never : null,
      size: body.size === undefined ? null : body.size as never,
      price: body.price === undefined ? null : body.price as never,
      limit: body.limit === undefined ? null : body.limit as never,
      slippageTolerance: body.slippageTolerance === undefined ? null : body.slippageTolerance as never,
      reduceOnly: typeof body.reduceOnly === "boolean" ? body.reduceOnly : null,
    });
    return jsonResponse({ success: true, ...result });
  });

  addRoute(routes, "POST", "/api/hyperliquid/orders/handoff", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const forbidden = findForbiddenHyperliquidCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Hyperliquid handoff input must not contain API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    try {
      // Resolves the asset index, builds the preview, and attaches the L1
      // order-action payload in one pass.
      const { preview, handoff } = await prepareHyperliquidHandoffFromRequest({
        asset: typeof body.asset === "string" ? body.asset : null,
        side: typeof body.side === "string" ? body.side as never : null,
        size: body.size === undefined ? null : body.size as never,
        price: body.price === undefined ? null : body.price as never,
        reduceOnly: typeof body.reduceOnly === "boolean" ? body.reduceOnly : null,
        slippageTolerance: body.slippageTolerance === undefined ? null : body.slippageTolerance as never,
      });
      return jsonResponse({ success: true, handoff, preview });
    } catch (err) {
      throw new ApiError(400, "invalid_hyperliquid_handoff", err instanceof Error ? err.message : "Could not prepare Hyperliquid signing handoff");
    }
  });

  addRoute(routes, "POST", "/api/hyperliquid/orders/external-sign-request", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const forbidden = findForbiddenHyperliquidCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Hyperliquid sign-request input must not contain API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    try {
      const { preview, handoff, signRequest } = await prepareHyperliquidExternalSignRequestFromRequest({
        asset: typeof body.asset === "string" ? body.asset : null,
        side: typeof body.side === "string" ? body.side as never : null,
        size: body.size === undefined ? null : body.size as never,
        price: body.price === undefined ? null : body.price as never,
        reduceOnly: typeof body.reduceOnly === "boolean" ? body.reduceOnly : null,
        slippageTolerance: body.slippageTolerance === undefined ? null : body.slippageTolerance as never,
        executionMode: typeof body.executionMode === "string" ? body.executionMode : null,
      });
      return jsonResponse({ success: true, signRequest, handoff, preview });
    } catch (err) {
      throw new ApiError(400, "invalid_hyperliquid_sign_request", err instanceof Error ? err.message : "Could not prepare Hyperliquid external sign request");
    }
  });

  addRoute(routes, "POST", "/api/hyperliquid/orders/external-artifact/validate", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const forbidden = findForbiddenHyperliquidCredentialInput(sanitizeMarketArtifactValidationInputForSecretScan(body));
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Hyperliquid artifact validation input must contain only public/redacted metadata (${forbidden}).`);
    }
    try {
      const validation = validateHyperliquidRedactedArtifactEnvelope(body.signRequest as never, body.artifact as never);
      return jsonResponse({ success: validation.status === "accepted_public_metadata", validation, receiptCandidate: validation.publicAuditReceiptCandidate });
    } catch (err) {
      throw new ApiError(400, "invalid_hyperliquid_artifact_validation", err instanceof Error ? err.message : "Could not validate Hyperliquid public artifact metadata");
    }
  });

  addRoute(routes, "POST", "/api/hyperliquid/orders/receipt", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const forbidden = findForbiddenHyperliquidCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Hyperliquid receipt must contain only public status — no API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    const handoff = coerceHyperliquidHandoffReference(body.handoff);
    if (!handoff) {
      throw new ApiError(400, "invalid_handoff", "A valid signing handoff (previewSha256, handoffSha256, asset, side) is required to verify a receipt.");
    }
    const verification = verifyHyperliquidReceipt(handoff, coerceHyperliquidReceiptInput(body.receipt));
    return jsonResponse({ success: verification.ok, ...verification });
  });

  addRoute(routes, "GET", "/api/polymarket/markets", "client", async (ctx) => {
    const query = ctx.url.searchParams.get("q") ?? ctx.url.searchParams.get("query") ?? "";
    const limit = ctx.url.searchParams.get("limit") ? Number(ctx.url.searchParams.get("limit")) : 10;
    const markets = await polymarketProvider.searchMarkets(query, limit);
    return jsonResponse({ success: true, markets, cards: [buildPolymarketMarketListCard(markets)] });
  });

  addRoute(routes, "GET", "/api/polymarket/events", "client", async (ctx) => {
    const query = ctx.url.searchParams.get("q") ?? ctx.url.searchParams.get("query") ?? "";
    const limit = ctx.url.searchParams.get("limit") ? Number(ctx.url.searchParams.get("limit")) : 8;
    const events = await polymarketProvider.searchEvents(query, limit);
    return jsonResponse({ success: true, events, cards: [buildPolymarketEventListCard(events)] });
  });

  addRoute(routes, "GET", "/api/polymarket/markets/:id", "client", async (ctx) => {
    const market = await polymarketProvider.getMarket(ctx.params.id.trim());
    return jsonResponse({ success: true, market, cards: [buildPolymarketMarketDetailCard(market)] });
  });

  addRoute(routes, "GET", "/api/polymarket/orderbook/:tokenId", "client", async (ctx) => {
    const tokenId = ctx.params.tokenId.trim();
    const outcome = ctx.url.searchParams.get("outcome");
    const marketId = ctx.url.searchParams.get("marketId");
    const orderbook = await polymarketProvider.getOrderbook(tokenId, { marketId, outcome });
    return jsonResponse({ success: true, orderbook, cards: [buildPolymarketOrderbookCard(orderbook)] });
  });

  addRoute(routes, "GET", "/api/polymarket/compliance", "client", async () => {
    const compliance = await polymarketProvider.checkCompliance();
    return jsonResponse({ success: true, compliance, cards: [buildPolymarketComplianceCard(compliance)] });
  });

  addRoute(routes, "POST", "/api/polymarket/watches", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const forbidden = findForbiddenPolymarketCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Polymarket watch input must not contain API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    const marketId = typeof body.marketId === "string" ? body.marketId.trim() : "";
    if (!marketId) {
      throw new ApiError(400, "invalid_polymarket_watch", "marketId is required to create a Polymarket watch");
    }
    const market = await polymarketProvider.getMarket(marketId);
    const watch = buildPolymarketWatchDescriptor(market);
    polymarketWatchStore.set(watch.id, watch);
    const check = await checkPolymarketWatchDescriptor(watch, polymarketProvider);
    return jsonResponse({ success: true, market, watch, check, cards: [buildPolymarketWatchCard(watch, check)] });
  });

  addRoute(routes, "GET", "/api/polymarket/watches", "client", async () => {
    const watches = Array.from(polymarketWatchStore.values());
    return jsonResponse({ success: true, watches, count: watches.length });
  });

  addRoute(routes, "POST", "/api/polymarket/watches/check", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const forbidden = findForbiddenPolymarketCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Polymarket watch check input must not contain API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    const explicit = coercePolymarketWatch(body.watch);
    const watches = explicit
      ? [explicit]
      : Array.isArray(body.watches)
        ? body.watches.map(coercePolymarketWatch).filter((watch): watch is PolymarketWatchDescriptor => Boolean(watch))
        : Array.from(polymarketWatchStore.values());
    const checks = await Promise.all(watches.map((watch) => checkPolymarketWatchDescriptor(watch, polymarketProvider)));
    return jsonResponse({
      success: true,
      checks,
      cards: watches.map((watch, index) => buildPolymarketWatchCard(watch, checks[index])),
      digest: buildPolymarketWatchDigest(checks),
    });
  });

  addRoute(routes, "POST", "/api/polymarket/watches/act", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    rejectCustomWatchActionPrompt(body, "Polymarket");
    const forbidden = findForbiddenPolymarketCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Polymarket watch act input must not contain API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    const explicit = coercePolymarketWatch(body.watch);
    const watches = explicit
      ? [explicit]
      : Array.isArray(body.watches)
        ? body.watches.map(coercePolymarketWatch).filter((watch): watch is PolymarketWatchDescriptor => Boolean(watch))
        : Array.from(polymarketWatchStore.values());
    const checks = await Promise.all(watches.map((watch) => checkPolymarketWatchDescriptor(watch, polymarketProvider)));
    const selected = selectPolymarketWatchAlert(watches, checks, readMarketWatchAlertIndex(body));
    const prompt = buildPolymarketWatchAlertReviewPrompt(selected.check, selected.watch);
    const chat = await executePolymarketChatWorkflow({
      message: prompt,
      marketId: selected.watch.marketId,
    }, { provider: polymarketProvider });
    return jsonResponse({
      success: true,
      selectedAlert: summarizePolymarketWatchAlert(selected.check, selected.watch),
      action: {
        label: "Review alert with crypto chat",
        prompt,
        endpoint: "/api/polymarket/chat/execute",
      },
      chat,
      cards: chat.cards,
      safety: {
        nonCustodial: true,
        liveSubmissionEnabled: false,
        canSubmit: false,
        signsOrSubmits: false,
        autoExecutes: false,
      },
      source: "matterhorn_polymarket_watch_act",
    });
  });

  addRoute(routes, "GET", "/api/polymarket/watches/digest", "client", async () => {
    const watches = Array.from(polymarketWatchStore.values());
    const checks = await Promise.all(watches.map((watch) => checkPolymarketWatchDescriptor(watch, polymarketProvider)));
    return jsonResponse({ success: true, digest: buildPolymarketWatchDigest(checks), checks });
  });

  addRoute(routes, "POST", "/api/polymarket/orders/preview", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const forbidden = findForbiddenPolymarketCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Polymarket preview input must not contain API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    try {
      const preview = await preparePolymarketOrderFromRequest({
        marketId: typeof body.marketId === "string" ? body.marketId : "",
        outcome: typeof body.outcome === "string" ? body.outcome : null,
        side: typeof body.side === "string" ? body.side as never : null,
        amountUsdc: Number(body.amountUsdc),
        slippageTolerance: body.slippageTolerance === undefined ? null : Number(body.slippageTolerance),
      });
      return jsonResponse({ success: true, preview, cards: [buildPolymarketOrderPreviewCard(preview)] });
    } catch (err) {
      throw new ApiError(400, "invalid_polymarket_preview", err instanceof Error ? err.message : "Could not prepare Polymarket order preview");
    }
  });

  addRoute(routes, "POST", "/api/polymarket/chat/execute", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const message = typeof body.message === "string" ? body.message : "";
    if (!message.trim()) {
      throw new ApiError(400, "invalid_message", "message is required");
    }
    const forbidden = findForbiddenPolymarketCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Polymarket chat input must not contain API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    const result = await executePolymarketChatWorkflow({
      message,
      marketId: typeof body.marketId === "string" ? body.marketId : null,
      outcome: typeof body.outcome === "string" ? body.outcome : null,
      side: typeof body.side === "string" ? body.side as never : null,
      amountUsdc: body.amountUsdc === undefined ? null : body.amountUsdc as never,
      slippageTolerance: body.slippageTolerance === undefined ? null : body.slippageTolerance as never,
      limit: body.limit === undefined ? null : body.limit as never,
    });
    return jsonResponse({ success: true, ...result });
  });

  addRoute(routes, "POST", "/api/polymarket/orders/handoff", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const forbidden = findForbiddenPolymarketCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Polymarket handoff input must not contain API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    try {
      // Resolves the market + token id, runs the compliance gate, builds the
      // preview, and attaches EIP-712 typed-data when an exchange is configured.
      const { preview, handoff, blocked } = await preparePolymarketHandoffFromRequest({
        marketId: typeof body.marketId === "string" ? body.marketId : "",
        outcome: typeof body.outcome === "string" ? body.outcome : null,
        side: typeof body.side === "string" ? body.side as never : null,
        amountUsdc: Number(body.amountUsdc),
        slippageTolerance: body.slippageTolerance === undefined ? null : Number(body.slippageTolerance),
      });
      // Compliance still gates: a blocked region gets no signing handoff.
      if (blocked) {
        return jsonResponse({ success: true, blocked: true, preview, cards: [buildPolymarketOrderPreviewCard(preview)] });
      }
      return jsonResponse({ success: true, handoff, preview });
    } catch (err) {
      throw new ApiError(400, "invalid_polymarket_handoff", err instanceof Error ? err.message : "Could not prepare Polymarket signing handoff");
    }
  });

  addRoute(routes, "POST", "/api/polymarket/orders/external-sign-request", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const forbidden = findForbiddenPolymarketCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Polymarket sign-request input must not contain API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    try {
      const { preview, handoff, signRequest, blocked } = await preparePolymarketExternalSignRequestFromRequest({
        marketId: typeof body.marketId === "string" ? body.marketId : "",
        outcome: typeof body.outcome === "string" ? body.outcome : null,
        side: typeof body.side === "string" ? body.side as never : null,
        amountUsdc: Number(body.amountUsdc),
        slippageTolerance: body.slippageTolerance === undefined ? null : Number(body.slippageTolerance),
        executionMode: typeof body.executionMode === "string" ? body.executionMode : null,
      });
      if (blocked) {
        return jsonResponse({ success: true, blocked: true, preview, handoff: null, signRequest: null, cards: [buildPolymarketOrderPreviewCard(preview)] });
      }
      return jsonResponse({ success: true, signRequest, handoff, preview });
    } catch (err) {
      throw new ApiError(400, "invalid_polymarket_sign_request", err instanceof Error ? err.message : "Could not prepare Polymarket external sign request");
    }
  });

  addRoute(routes, "POST", "/api/polymarket/orders/external-artifact/validate", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const forbidden = findForbiddenPolymarketCredentialInput(sanitizeMarketArtifactValidationInputForSecretScan(body));
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Polymarket artifact validation input must contain only public/redacted metadata (${forbidden}).`);
    }
    try {
      const validation = validatePolymarketRedactedArtifactEnvelope(body.signRequest as never, body.artifact as never);
      return jsonResponse({ success: validation.status === "accepted_public_metadata", validation, receiptCandidate: validation.publicAuditReceiptCandidate });
    } catch (err) {
      throw new ApiError(400, "invalid_polymarket_artifact_validation", err instanceof Error ? err.message : "Could not validate Polymarket public artifact metadata");
    }
  });

  addRoute(routes, "POST", "/api/polymarket/orders/receipt", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const forbidden = findForbiddenPolymarketCredentialInput(body);
    if (forbidden) {
      throw new ApiError(400, "market_secret_rejected", `Polymarket receipt must contain only public status — no API secrets, private keys, signatures, or signed payloads (${forbidden}).`);
    }
    const handoff = coercePolymarketHandoffReference(body.handoff);
    if (!handoff) {
      throw new ApiError(400, "invalid_handoff", "A valid signing handoff (previewSha256, handoffSha256, marketId, outcome, side) is required to verify a receipt.");
    }
    const verification = verifyPolymarketReceipt(handoff, coercePolymarketReceiptInput(body.receipt));
    return jsonResponse({ success: verification.ok, ...verification });
  });

  addRoute(routes, "GET", "/api/sui/account/:address", "client", async (ctx) => {
    try {
      const account = await suiProvider.getAccountSnapshot(ctx.params.address, {
        network: ctx.url.searchParams.get("network"),
        signal: ctx.request.signal,
      });
      return jsonResponse({ success: true, account, cards: [buildSuiAccountCard(account)] });
    } catch (err) {
      throw suiApiError(err);
    }
  });

  addRoute(routes, "GET", "/api/sui/balance/:address", "client", async (ctx) => {
    try {
      const balance = await suiProvider.getBalance(ctx.params.address, {
        network: ctx.url.searchParams.get("network"),
        coinType: ctx.url.searchParams.get("coinType") ?? ctx.url.searchParams.get("coin_type"),
        signal: ctx.request.signal,
      });
      return jsonResponse({ success: true, balance });
    } catch (err) {
      throw suiApiError(err);
    }
  });

  addRoute(routes, "POST", "/api/sui/transactions/preview", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    try {
      const preview = buildSuiTransferPreview(body as SuiTransferPreviewInput);
      return jsonResponse({ success: true, preview, cards: [buildSuiTransactionPreviewCard(preview)] });
    } catch (err) {
      throw suiApiError(err);
    }
  });

  addRoute(routes, "POST", "/api/sui/transactions/receipt", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    try {
      const receipt = buildSuiTransactionReceipt(body as SuiTransactionReceiptInput);
      return jsonResponse({ success: true, receipt, cards: [buildSuiTransactionReceiptCard(receipt)] });
    } catch (err) {
      throw suiApiError(err);
    }
  });

  addRoute(routes, "POST", "/workspace/:id/sui/transactions/preview", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const payload = body && typeof body === "object" && !Array.isArray(body) && "payload" in body
      ? (body as Record<string, unknown>).payload
      : body;
    try {
      const preview = buildSuiTransferPreview(payload as SuiTransferPreviewInput);
      const cards = [buildSuiTransactionPreviewCard(preview)];
      const bodyRecord = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
      const requestedSessionId = typeof bodyRecord.sessionId === "string" ? bodyRecord.sessionId.trim() : "";
      const sessionSlug = normalizeSessionSlug(requestedSessionId || `sui_${preview.id}`);
      const taskId = preview.id;
      const outputPath = `outputs/sui/${sessionSlug}/transfer-preview-${preview.previewSha256.slice(0, 16)}.json`;

      await recordSuiWorkspaceEvidence({
        workspace,
        ctx,
        taskId,
        sessionSlug,
        outputPath,
        summary: "Sui transfer preview saved",
        auditAction: "workspace.sui.preview.create",
        outputPayload: {
          version: "matterhorn.sui.workspace-evidence.v1",
          kind: "transaction_preview",
          workspaceId: workspace.id,
          outputPath,
          preview,
          cards,
          safety: {
            custody: false,
            canSubmit: false,
            liveSubmissionEnabled: false,
            signingInMatterhorn: false,
          },
        },
      });

      return jsonResponse({
        success: true,
        preview,
        cards,
        evidence: {
          workspaceId: workspace.id,
          outputPath,
          taskId,
          sessionSlug,
          source: "task_events",
        },
      }, 201);
    } catch (err) {
      throw suiApiError(err);
    }
  });

  addRoute(routes, "POST", "/workspace/:id/sui/transactions/receipt", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const payload = body && typeof body === "object" && !Array.isArray(body) && "payload" in body
      ? (body as Record<string, unknown>).payload
      : body;
    try {
      const receipt = buildSuiTransactionReceipt(payload as SuiTransactionReceiptInput);
      const cards = [buildSuiTransactionReceiptCard(receipt)];
      const bodyRecord = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
      const requestedSessionId = typeof bodyRecord.sessionId === "string" ? bodyRecord.sessionId.trim() : "";
      const sessionSlug = normalizeSessionSlug(requestedSessionId || `sui_${receipt.transactionDigest.slice(0, 16)}`);
      const taskId = `sui_receipt_${receipt.receiptSha256.slice(0, 16)}`;
      const outputPath = `outputs/sui/${sessionSlug}/transaction-receipt-${receipt.transactionDigest.slice(0, 16)}.json`;

      await recordSuiWorkspaceEvidence({
        workspace,
        ctx,
        taskId,
        sessionSlug,
        outputPath,
        summary: "Sui transaction receipt saved",
        auditAction: "workspace.sui.receipt.import",
        outputPayload: {
          version: "matterhorn.sui.workspace-evidence.v1",
          kind: "transaction_receipt",
          workspaceId: workspace.id,
          outputPath,
          receipt,
          cards,
          safety: {
            custody: false,
            containsSignatureMaterial: false,
            liveSubmissionByMatterhorn: false,
          },
        },
      });

      return jsonResponse({
        success: true,
        receipt,
        cards,
        evidence: {
          workspaceId: workspace.id,
          outputPath,
          taskId,
          sessionSlug,
          source: "task_events",
        },
      }, 201);
    } catch (err) {
      throw suiApiError(err);
    }
  });

  addRoute(routes, "GET", "/api/bittensor/subnets", "client", async () => {
    const subnets = await bittensorProvider.listSubnets();
    return jsonResponse({ success: true, subnets, cards: buildBittensorSubnetCards(subnets) });
  });

  addRoute(routes, "POST", "/api/bittensor/subnets/discover", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const goal = typeof body.goal === "string" ? body.goal : typeof body.query === "string" ? body.query : "";
    if (!goal.trim()) {
      throw new ApiError(400, "invalid_goal", "goal is required");
    }
    const result = await findBittensorSubnetsForGoal({
      goal,
      limit: body.limit === null || body.limit === undefined || body.limit === "" ? null : Number(body.limit),
    });
    return jsonResponse({ success: true, ...result });
  });

  addRoute(routes, "GET", "/api/bittensor/subnets/:netuid", "client", async (ctx) => {
    const netuid = Number(ctx.params.netuid);
    if (!Number.isInteger(netuid) || netuid < 0) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const subnet = await bittensorProvider.getSubnet(netuid);
    return jsonResponse({ success: true, subnet, cards: buildBittensorSubnetCards([subnet]) });
  });

  addRoute(routes, "GET", "/api/bittensor/wallet/timeline/status", "client", async () => {
    return jsonResponse({ success: true, status: getBittensorWalletTimelineStoreStatus() });
  });

  addRoute(routes, "GET", "/api/bittensor/wallet/timeline/export", "client", async (ctx) => {
    const ss58Address = ctx.url.searchParams.get("ss58Address") ?? ctx.url.searchParams.get("ss58_address");
    if (ss58Address && !isValidSs58Address(ss58Address)) throw new ApiError(400, "invalid_ss58", "invalid SS58 address");
    const timeline = exportBittensorWalletTimeline({ ss58Address });
    return jsonResponse({ success: true, timeline });
  });

  addRoute(routes, "POST", "/api/bittensor/wallet/timeline/clear", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const ss58Address = typeof body.ss58Address === "string" ? body.ss58Address : "";
    if (!isValidSs58Address(ss58Address)) throw new ApiError(400, "invalid_ss58", "valid SS58 address is required");
    const report = clearBittensorWalletSnapshotBaseline(ss58Address);
    return jsonResponse({ success: true, report });
  });

  addRoute(routes, "GET", "/api/bittensor/wallet/:ss58Address", "client", async (ctx) => {
    const ss58Address = ctx.params.ss58Address.trim();
    if (!isValidSs58Address(ss58Address)) {
      throw new ApiError(400, "invalid_ss58_address", "ss58Address must be a valid watch-only SS58 public address");
    }
    const wallet = await bittensorProvider.getWallet(ss58Address);
    return jsonResponse({ success: true, wallet, cards: [buildBittensorWalletCard(wallet)] });
  });

  addRoute(routes, "GET", "/api/bittensor/intelligence/subnet/:netuid", "client", async (ctx) => {
    const netuid = Number(ctx.params.netuid);
    if (!Number.isInteger(netuid) || netuid < 0) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const report = await analyzeBittensorSubnetIntelligence(netuid);
    return jsonResponse({ success: true, report, cards: [buildBittensorSubnetIntelligenceCard(report)] });
  });

  addRoute(routes, "GET", "/api/bittensor/intelligence/wallet/:ss58Address", "client", async (ctx) => {
    const ss58Address = ctx.params.ss58Address.trim();
    if (!isValidSs58Address(ss58Address)) {
      throw new ApiError(400, "invalid_ss58_address", "ss58Address must be a valid watch-only SS58 public address");
    }
    const report = await analyzeBittensorWalletIntelligence(ss58Address);
    return jsonResponse({ success: true, report, cards: [buildBittensorWalletIntelligenceCard(report)] });
  });

  addRoute(routes, "GET", "/api/bittensor/intelligence/validator/:netuid/:validatorHotkey", "client", async (ctx) => {
    const netuid = Number(ctx.params.netuid);
    const validatorHotkey = ctx.params.validatorHotkey.trim();
    if (!Number.isInteger(netuid) || netuid < 0) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    if (!isValidSs58Address(validatorHotkey)) {
      throw new ApiError(400, "invalid_validator_hotkey", "validatorHotkey must be a valid SS58 public address");
    }
    const report = await analyzeBittensorValidatorIntelligence({ netuid, validatorHotkey });
    return jsonResponse({ success: true, report, cards: [buildBittensorValidatorIntelligenceCard(report)] });
  });

  addRoute(routes, "POST", "/api/bittensor/staking/plan", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const message = typeof body.message === "string" ? body.message : "Build a Bittensor staking plan.";
    const amountTao = body.amountTao === undefined || body.amountTao === null || body.amountTao === "" ? null : String(body.amountTao);
    if (!amountTao) {
      throw new ApiError(400, "invalid_amount", "amountTao is required for a staking plan");
    }
    const strategy = typeof body.strategy === "string" && ["balanced", "yield", "safety"].includes(body.strategy)
      ? body.strategy as "balanced" | "yield" | "safety"
      : "balanced";
    const plan = await buildBittensorStakingPlan({
      message,
      amountTao,
      coldkey: typeof body.coldkey === "string" ? body.coldkey : typeof body.ss58Address === "string" ? body.ss58Address : null,
      strategy,
      limit: body.limit === null || body.limit === undefined || body.limit === "" ? null : Number(body.limit),
    });
    return jsonResponse({
      success: true,
      plan,
      cards: [
        buildBittensorStakingPlanCard(plan),
        ...plan.unsignedPreviews.slice(0, 2).map(buildBittensorExtrinsicPreviewCard),
      ],
    });
  });

  addRoute(routes, "POST", "/api/bittensor/actions/quote", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const action = String(body.action);
    if (!["stake", "unstake", "transfer", "compare"].includes(action)) {
      throw new ApiError(400, "invalid_action", "action must be stake, unstake, transfer, or compare");
    }
    const input: BittensorActionQuoteInput = {
      action: action as BittensorActionQuoteInput["action"],
      netuid: body.netuid === null || body.netuid === undefined || body.netuid === "" ? null : Number(body.netuid),
      amountTao: body.amountTao === undefined ? null : String(body.amountTao),
      validatorHotkey: typeof body.validatorHotkey === "string" ? body.validatorHotkey : null,
      recipient: typeof body.recipient === "string" ? body.recipient : null,
    };
    const quote = await bittensorProvider.quoteAction(input);
    return jsonResponse({ success: true, quote, cards: [buildBittensorQuoteCard(quote)] });
  });

  addRoute(routes, "POST", "/api/bittensor/chat/plan", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const message = typeof body.message === "string" ? body.message : "";
    if (!message.trim()) {
      throw new ApiError(400, "invalid_message", "message is required");
    }
    const ss58Address = typeof body.ss58Address === "string" ? body.ss58Address : null;
    const plan = planBittensorChat({ message, ss58Address });
    return jsonResponse({ success: true, plan, cards: buildBittensorPlanCards(plan) });
  });

  addRoute(routes, "POST", "/api/bittensor/chat/execute", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const message = typeof body.message === "string" ? body.message : "";
    if (!message.trim()) {
      throw new ApiError(400, "invalid_message", "message is required");
    }
    const strategy = typeof body.strategy === "string" && ["balanced", "yield", "safety"].includes(body.strategy)
      ? body.strategy as BittensorChatExecutionInput["strategy"]
      : null;
    const result = await executeBittensorChatWorkflow({
      message,
      contextId: typeof body.contextId === "string" ? body.contextId : null,
      context: body.context && typeof body.context === "object" && !Array.isArray(body.context)
        ? body.context as BittensorChatExecutionInput["context"]
        : null,
      ss58Address: typeof body.ss58Address === "string" ? body.ss58Address : null,
      netuid: body.netuid === null || body.netuid === undefined || body.netuid === "" ? null : Number(body.netuid),
      amountTao: body.amountTao === undefined ? null : String(body.amountTao),
      validatorHotkey: typeof body.validatorHotkey === "string" ? body.validatorHotkey : null,
      coldkey: typeof body.coldkey === "string" ? body.coldkey : null,
      recipient: typeof body.recipient === "string" ? body.recipient : null,
      destination: typeof body.destination === "string" ? body.destination : null,
      limit: body.limit === null || body.limit === undefined || body.limit === "" ? null : Number(body.limit),
      strategy,
      rateTolerance: body.rateTolerance === null || body.rateTolerance === undefined || body.rateTolerance === "" ? null : Number(body.rateTolerance),
    });
    return jsonResponse({ success: true, ...result });
  });

  addRoute(routes, "GET", "/api/bittensor/chat/context/:contextId", "client", async (ctx) => {
    const context = getBittensorChatContext(ctx.params.contextId);
    if (!context) {
      throw new ApiError(404, "context_not_found", "Bittensor chat context was not found or has expired.");
    }
    return jsonResponse({ success: true, context });
  });

  addRoute(routes, "GET", "/api/bittensor/capabilities", "client", async () => {
    const capabilities = await listBittensorCapabilities();
    return jsonResponse({ success: true, capabilities });
  });

  addRoute(routes, "GET", "/api/bittensor/capabilities/:netuid", "client", async (ctx) => {
    const netuid = Number(ctx.params.netuid);
    if (!Number.isInteger(netuid) || netuid < 0) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const capability = await getBittensorCapability(netuid);
    return jsonResponse({ success: true, capability });
  });

  addRoute(routes, "GET", "/api/bittensor/signer/status", "client", async (ctx) => {
    const address = ctx.url.searchParams.get("address");
    const signer = getBittensorSignerStatus(address);
    return jsonResponse({ success: true, signer, cards: [buildBittensorSignerCard(signer)] });
  });

  addRoute(routes, "GET", "/api/bittensor/sidecar/status", "client", async () => {
    const sidecar = getSubtensorSidecarStatus();
    return jsonResponse({ success: true, sidecar });
  });

  addRoute(routes, "GET", "/api/bittensor/sidecar/health", "client", async () => {
    const health = await checkSubtensorSidecarHealth();
    return jsonResponse({ success: true, health, cards: [buildBittensorSidecarHealthCard(health)] });
  });

  addRoute(routes, "GET", "/api/bittensor/readiness", "client", async () => {
    const report = await auditBittensorReadiness();
    return jsonResponse({ success: true, report, cards: [buildBittensorReadinessCard(report)] });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/doctor", "client", async () => {
    const report = doctorBittensorSubnetAdapters();
    return jsonResponse({ success: true, report });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/marketplace", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const limitParam = ctx.url.searchParams.get("limit");
    const limit = limitParam === null || limitParam === "" ? null : Number(limitParam);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      throw new ApiError(400, "invalid_limit", "limit must be a positive integer");
    }
    const marketplace = await listBittensorSubnetAdapterMarketplace({
      adapter: ctx.url.searchParams.get("adapter") ?? ctx.url.searchParams.get("serviceAdapter"),
      netuid,
      limit,
    });
    return jsonResponse({ success: true, marketplace, cards: [buildBittensorAdapterMarketplaceCard(marketplace)] });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/marketplace-export", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const limitParam = ctx.url.searchParams.get("limit");
    const limit = limitParam === null || limitParam === "" ? null : Number(limitParam);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      throw new ApiError(400, "invalid_limit", "limit must be a positive integer");
    }
    const marketplaceExport = await exportBittensorSubnetAdapterMarketplace({
      adapter: ctx.url.searchParams.get("adapter") ?? ctx.url.searchParams.get("serviceAdapter"),
      netuid,
      limit,
    });
    return jsonResponse({ success: true, marketplaceExport });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/roadmap", "client", async (ctx) => {
    const limitParam = ctx.url.searchParams.get("limit");
    const limit = limitParam === null || limitParam === "" ? null : Number(limitParam);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      throw new ApiError(400, "invalid_limit", "limit must be a positive integer");
    }
    const roadmap = await planBittensorSubnetAdapterRoadmap({
      goal: ctx.url.searchParams.get("goal") ?? ctx.url.searchParams.get("query"),
      limit,
    });
    return jsonResponse({ success: true, roadmap });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/roadmap-export", "client", async (ctx) => {
    const limitParam = ctx.url.searchParams.get("limit");
    const limit = limitParam === null || limitParam === "" ? null : Number(limitParam);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      throw new ApiError(400, "invalid_limit", "limit must be a positive integer");
    }
    const roadmapExport = await exportBittensorSubnetAdapterRoadmap({
      goal: ctx.url.searchParams.get("goal"),
      query: ctx.url.searchParams.get("query"),
      limit,
    });
    return jsonResponse({ success: true, roadmapExport });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/spec", "client", async () => {
    return jsonResponse({ success: true, spec: getBittensorSubnetAdapterSpec() });
  });

  addRoute(routes, "POST", "/api/bittensor/adapters/spec/validate", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const manifest = body.manifest && typeof body.manifest === "object" ? body.manifest : body;
    const validation = validateBittensorSubnetAdapterManifest(manifest);
    return jsonResponse({ success: validation.status !== "fail", validation, cards: [buildBittensorAdapterManifestValidationCard(validation)] });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/spec/examples", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const limitParam = ctx.url.searchParams.get("limit");
    const limit = limitParam === null || limitParam === "" ? null : Number(limitParam);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      throw new ApiError(400, "invalid_limit", "limit must be a positive integer");
    }
    const report = getBittensorSubnetAdapterManifestExamples({
      adapter: ctx.url.searchParams.get("adapter") ?? ctx.url.searchParams.get("serviceAdapter"),
      netuid,
      limit,
    });
    return jsonResponse({ success: true, report, cards: report.examples.slice(0, 6).map((example) => buildBittensorAdapterManifestValidationCard(example.validation)) });
  });

  addRoute(routes, "POST", "/api/bittensor/adapters/result/validate", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const result = body.result && typeof body.result === "object" ? body.result : body;
    const maxResponseBytes = body.maxResponseBytes === null || body.maxResponseBytes === undefined || body.maxResponseBytes === ""
      ? null
      : Number(body.maxResponseBytes);
    if (maxResponseBytes !== null && (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1)) {
      throw new ApiError(400, "invalid_max_response_bytes", "maxResponseBytes must be a positive integer");
    }
    const validation = validateBittensorSubnetAdapterResult(result, { maxResponseBytes });
    return jsonResponse({ success: validation.status !== "fail", validation, cards: [buildBittensorAdapterResultValidationCard(validation)] });
  });

  addRoute(routes, "POST", "/api/bittensor/adapters/preflight", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const maxResponseBytes = body.maxResponseBytes === null || body.maxResponseBytes === undefined || body.maxResponseBytes === ""
      ? null
      : Number(body.maxResponseBytes);
    if (maxResponseBytes !== null && (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1)) {
      throw new ApiError(400, "invalid_max_response_bytes", "maxResponseBytes must be a positive integer");
    }
    const packet = buildBittensorSubnetAdapterPreflightPacket({
      manifest: body.manifest,
      result: body.result,
      maxResponseBytes,
    });
    const cards = [
      buildBittensorAdapterManifestValidationCard(packet.manifestValidation),
      ...(packet.resultValidation ? [buildBittensorAdapterResultValidationCard(packet.resultValidation)] : []),
    ];
    return jsonResponse({ success: packet.status !== "fail", packet, cards });
  });

  addRoute(routes, "POST", "/api/bittensor/adapters/preflight-export", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const maxResponseBytes = body.maxResponseBytes === null || body.maxResponseBytes === undefined || body.maxResponseBytes === ""
      ? null
      : Number(body.maxResponseBytes);
    if (maxResponseBytes !== null && (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1)) {
      throw new ApiError(400, "invalid_max_response_bytes", "maxResponseBytes must be a positive integer");
    }
    const preflightExport = buildBittensorSubnetAdapterPreflightPacketExport({
      manifest: body.manifest,
      result: body.result,
      maxResponseBytes,
    });
    return jsonResponse({ success: preflightExport.status !== "fail", preflightExport });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/approvals", "client", async () => {
    const report = auditBittensorSubnetAdapterRuntimeApprovals();
    return jsonResponse({ success: true, report, cards: [buildBittensorAdapterApprovalAuditCard(report)] });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/approval-template", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid === null || !Number.isInteger(netuid) || netuid < 0) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const requestSha256 = ctx.url.searchParams.get("requestSha256") ?? ctx.url.searchParams.get("request_sha256") ?? "";
    const ttlParam = ctx.url.searchParams.get("ttlMinutes") ?? ctx.url.searchParams.get("ttl_minutes");
    const ttlMinutes = ttlParam === null || ttlParam === "" ? null : Number(ttlParam);
    if (ttlMinutes !== null && (!Number.isFinite(ttlMinutes) || ttlMinutes < 1)) {
      throw new ApiError(400, "invalid_ttl", "ttlMinutes must be a positive number");
    }
    try {
      const template = buildBittensorSubnetAdapterRuntimeApprovalTemplate({
        netuid,
        serviceAdapter: (ctx.url.searchParams.get("serviceAdapter") ??
          ctx.url.searchParams.get("adapter") ??
          "unsupported") as Parameters<typeof buildBittensorSubnetAdapterRuntimeApprovalTemplate>[0]["serviceAdapter"],
        requestSha256,
        approvedBy: ctx.url.searchParams.get("approvedBy") ?? ctx.url.searchParams.get("approved_by"),
        reason: ctx.url.searchParams.get("reason"),
        ttlMinutes,
      });
      return jsonResponse({ success: true, template, cards: [buildBittensorAdapterApprovalTemplateCard(template)] });
    } catch (err) {
      throw new ApiError(400, "invalid_approval_template", err instanceof Error ? err.message : "Invalid approval template request");
    }
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/canary-packet", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const limitParam = ctx.url.searchParams.get("limit");
    const limit = limitParam === null || limitParam === "" ? null : Number(limitParam);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      throw new ApiError(400, "invalid_limit", "limit must be a positive integer");
    }
    const ttlParam = ctx.url.searchParams.get("ttlMinutes") ?? ctx.url.searchParams.get("ttl_minutes");
    const ttlMinutes = ttlParam === null || ttlParam === "" ? null : Number(ttlParam);
    if (ttlMinutes !== null && (!Number.isFinite(ttlMinutes) || ttlMinutes < 1)) {
      throw new ApiError(400, "invalid_ttl", "ttlMinutes must be a positive number");
    }
    const packet = await buildBittensorSubnetAdapterCanaryOperatorPacket({
      adapter: ctx.url.searchParams.get("adapter") ?? ctx.url.searchParams.get("serviceAdapter"),
      netuid,
      limit,
      requestSha256: ctx.url.searchParams.get("requestSha256") ?? ctx.url.searchParams.get("request_sha256"),
      approvedBy: ctx.url.searchParams.get("approvedBy") ?? ctx.url.searchParams.get("approved_by"),
      reason: ctx.url.searchParams.get("reason"),
      ttlMinutes,
    });
    return jsonResponse({ success: true, packet, cards: [buildBittensorAdapterCanaryOperatorPacketCard(packet)] });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/canary-packet-export", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const limitParam = ctx.url.searchParams.get("limit");
    const limit = limitParam === null || limitParam === "" ? null : Number(limitParam);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      throw new ApiError(400, "invalid_limit", "limit must be a positive integer");
    }
    const ttlParam = ctx.url.searchParams.get("ttlMinutes") ?? ctx.url.searchParams.get("ttl_minutes");
    const ttlMinutes = ttlParam === null || ttlParam === "" ? null : Number(ttlParam);
    if (ttlMinutes !== null && (!Number.isFinite(ttlMinutes) || ttlMinutes < 1)) {
      throw new ApiError(400, "invalid_ttl", "ttlMinutes must be a positive number");
    }
    const canaryPacketExport = await buildBittensorSubnetAdapterCanaryPacketExport({
      adapter: ctx.url.searchParams.get("adapter") ?? ctx.url.searchParams.get("serviceAdapter"),
      netuid,
      limit,
      requestSha256: ctx.url.searchParams.get("requestSha256") ?? ctx.url.searchParams.get("request_sha256"),
      approvedBy: ctx.url.searchParams.get("approvedBy") ?? ctx.url.searchParams.get("approved_by"),
      reason: ctx.url.searchParams.get("reason"),
      ttlMinutes,
    });
    return jsonResponse({ success: true, canaryPacketExport });
  });

  addRoute(routes, "POST", "/api/bittensor/adapters/canary-outcome", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const netuidRaw = body.netuid;
    const netuid = netuidRaw === null || netuidRaw === undefined || netuidRaw === "" ? null : Number(netuidRaw);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const expectedRequestSha256 =
      typeof body.expectedRequestSha256 === "string"
        ? body.expectedRequestSha256
        : typeof body.requestSha256 === "string"
          ? body.requestSha256
          : typeof body.previewRequestSha256 === "string"
            ? body.previewRequestSha256
            : null;
    const report = buildBittensorSubnetAdapterCanaryOutcomeReport({
      adapter: typeof body.adapter === "string"
        ? body.adapter
        : typeof body.serviceAdapter === "string"
          ? body.serviceAdapter
          : null,
      netuid,
      expectedRequestSha256,
      result: body.result,
    });
    return jsonResponse({
      success: report.status !== "fail" && report.status !== "blocked",
      report,
      cards: [buildBittensorAdapterCanaryOutcomeReportCard(report)],
    });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/templates", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const report = getBittensorSubnetAdapterTemplates({
      adapter: ctx.url.searchParams.get("adapter"),
      netuid,
    });
    return jsonResponse({ success: true, report });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/candidates", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const report = getBittensorSubnetAdapterCandidateProfiles({
      adapter: ctx.url.searchParams.get("adapter"),
      netuid,
    });
    return jsonResponse({ success: true, report });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/onboarding-plan", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const limitParam = ctx.url.searchParams.get("limit");
    const limit = limitParam === null || limitParam === "" ? null : Number(limitParam);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      throw new ApiError(400, "invalid_limit", "limit must be a positive integer");
    }
    const report = await planBittensorSubnetAdapterOnboarding({
      adapter: ctx.url.searchParams.get("adapter"),
      netuid,
      limit,
    });
    return jsonResponse({ success: true, report, cards: [buildBittensorAdapterOnboardingCard(report)] });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/launch-gate", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const limitParam = ctx.url.searchParams.get("limit");
    const limit = limitParam === null || limitParam === "" ? null : Number(limitParam);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      throw new ApiError(400, "invalid_limit", "limit must be a positive integer");
    }
    const report = await checkBittensorSubnetAdapterLaunchGate({
      adapter: ctx.url.searchParams.get("adapter"),
      netuid,
      limit,
    });
    return jsonResponse({ success: true, report, cards: [buildBittensorAdapterLaunchGateCard(report)] });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/canary-review", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const report = getBittensorSubnetAdapterCanaryReviewChecklist({
      adapter: ctx.url.searchParams.get("adapter"),
      netuid,
    });
    return jsonResponse({ success: true, report });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/evidence-bundle", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const limitParam = ctx.url.searchParams.get("limit");
    const limit = limitParam === null || limitParam === "" ? null : Number(limitParam);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      throw new ApiError(400, "invalid_limit", "limit must be a positive integer");
    }
    const report = await buildBittensorSubnetAdapterEvidenceBundle({
      adapter: ctx.url.searchParams.get("adapter"),
      netuid,
      limit,
    });
    return jsonResponse({ success: true, report, cards: [buildBittensorAdapterEvidenceBundleCard(report)] });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/evidence-export", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const limitParam = ctx.url.searchParams.get("limit");
    const limit = limitParam === null || limitParam === "" ? null : Number(limitParam);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      throw new ApiError(400, "invalid_limit", "limit must be a positive integer");
    }
    const evidenceExport = await buildBittensorSubnetAdapterEvidenceExport({
      adapter: ctx.url.searchParams.get("adapter"),
      netuid,
      limit,
    });
    return jsonResponse({ success: true, evidenceExport });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/evidence-review", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const limitParam = ctx.url.searchParams.get("limit");
    const limit = limitParam === null || limitParam === "" ? null : Number(limitParam);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      throw new ApiError(400, "invalid_limit", "limit must be a positive integer");
    }
    const review = await reviewBittensorSubnetAdapterEvidence({
      adapter: ctx.url.searchParams.get("adapter"),
      netuid,
      limit,
    });
    return jsonResponse({ success: true, review, cards: [buildBittensorAdapterEvidenceReviewCard(review)] });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/conformance", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const report = await probeBittensorSubnetAdapterConformance({
      netuid,
      limit: ctx.url.searchParams.get("limit") ? Number(ctx.url.searchParams.get("limit")) : null,
    });
    return jsonResponse({ success: true, report });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/conformance-export", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const conformanceExport = await buildBittensorSubnetAdapterConformanceExport({
      netuid,
      limit: ctx.url.searchParams.get("limit") ? Number(ctx.url.searchParams.get("limit")) : null,
    });
    return jsonResponse({ success: true, conformanceExport });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/operator-handoff", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const limitParam = ctx.url.searchParams.get("limit");
    const limit = limitParam === null || limitParam === "" ? null : Number(limitParam);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      throw new ApiError(400, "invalid_limit", "limit must be a positive integer");
    }
    const handoff = await buildBittensorSubnetAdapterOperatorHandoff({
      adapter: ctx.url.searchParams.get("adapter"),
      netuid,
      task: ctx.url.searchParams.get("task"),
      ss58Address: ctx.url.searchParams.get("ss58Address"),
      limit,
    });
    return jsonResponse({ success: true, handoff, cards: [buildBittensorAdapterOperatorHandoffCard(handoff)] });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/dry-run", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const report = await runBittensorSubnetAdapterDryRun({
      netuid,
      task: ctx.url.searchParams.get("task"),
      ss58Address: ctx.url.searchParams.get("ss58Address"),
      limit: ctx.url.searchParams.get("limit") ? Number(ctx.url.searchParams.get("limit")) : null,
    });
    return jsonResponse({ success: true, report });
  });

  addRoute(routes, "GET", "/api/bittensor/adapters/dry-run-export", "client", async (ctx) => {
    const netuidParam = ctx.url.searchParams.get("netuid");
    const netuid = netuidParam === null || netuidParam === "" ? null : Number(netuidParam);
    if (netuid !== null && (!Number.isInteger(netuid) || netuid < 0)) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const dryRunExport = await buildBittensorSubnetAdapterDryRunExport({
      netuid,
      task: ctx.url.searchParams.get("task"),
      ss58Address: ctx.url.searchParams.get("ss58Address"),
      limit: ctx.url.searchParams.get("limit") ? Number(ctx.url.searchParams.get("limit")) : null,
    });
    return jsonResponse({ success: true, dryRunExport });
  });

  addRoute(routes, "POST", "/api/bittensor/extrinsics/prepare", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const action = String(body.action) as BittensorExtrinsicAction;
    if (!["stake", "unstake", "move_stake", "transfer", "set_child_hotkey", "register", "serve"].includes(action)) {
      throw new ApiError(400, "invalid_action", "action must be a supported Bittensor extrinsic preview action");
    }
    const preview = await prepareBittensorExtrinsic({
      action,
      netuid: body.netuid === null || body.netuid === undefined || body.netuid === "" ? null : Number(body.netuid),
      amountTao: body.amountTao === undefined ? null : String(body.amountTao),
      coldkey: typeof body.coldkey === "string" ? body.coldkey : null,
      hotkey: typeof body.hotkey === "string" ? body.hotkey : null,
      destination: typeof body.destination === "string" ? body.destination : null,
      originNetuid: body.originNetuid === null || body.originNetuid === undefined || body.originNetuid === "" ? null : Number(body.originNetuid),
      destinationNetuid: body.destinationNetuid === null || body.destinationNetuid === undefined || body.destinationNetuid === "" ? null : Number(body.destinationNetuid),
      rateTolerance: body.rateTolerance === null || body.rateTolerance === undefined || body.rateTolerance === "" ? null : Number(body.rateTolerance),
    });
    return jsonResponse({ success: true, preview, cards: [buildBittensorExtrinsicPreviewCard(preview)] });
  });

  addRoute(routes, "POST", "/api/bittensor/extrinsics/handoff", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    if (!body.preview || typeof body.preview !== "object") {
      throw new ApiError(400, "invalid_preview", "preview is required");
    }
    try {
      const preview = body.preview as BittensorExtrinsicPreview;
      const handoff = createBittensorSigningHandoff(preview);
      const receipt = createBittensorSigningReceipt({ preview, handoff });
      return jsonResponse({
        success: true,
        handoff,
        receipt,
        cards: [buildBittensorSigningHandoffCard(handoff), buildBittensorSigningReceiptCard(receipt)],
      });
    } catch (err) {
      throw new ApiError(400, "invalid_handoff", err instanceof Error ? err.message : "Could not create Bittensor signing handoff");
    }
  });

  const BITTENSOR_RECEIPT_FORBIDDEN_KEY_RE = /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri)/i;
  const BITTENSOR_RECEIPT_RAW_SIGNATURE_KEY_RE = /^(signature|signedPayload|signedPayloadHex|signedExtrinsic)$/i;

  function findForbiddenBittensorReceiptInput(value: unknown, path: string[] = []): string | null {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const nested = findForbiddenBittensorReceiptInput(value[index], [...path, String(index)]);
        if (nested) return nested;
      }
      return null;
    }
    if (!value || typeof value !== "object") return null;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (BITTENSOR_RECEIPT_FORBIDDEN_KEY_RE.test(key) || BITTENSOR_RECEIPT_RAW_SIGNATURE_KEY_RE.test(key)) {
        return [...path, key].join(".");
      }
      const nested = findForbiddenBittensorReceiptInput(child, [...path, key]);
      if (nested) return nested;
    }
    return null;
  }

  function normalizeBittensorReceiptString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  function normalizeBittensorReceiptHash(value: unknown): string | null {
    const text = normalizeBittensorReceiptString(value);
    return text && /^[a-f0-9]{64}$/i.test(text) ? text.toLowerCase() : null;
  }

  function normalizeBittensorReceiptResult(value: unknown): BittensorSignedResult | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const status = normalizeBittensorReceiptString(record.status);
    if (!status || !["submitted", "sidecar_unavailable", "rejected", "invalid_signature"].includes(status)) {
      return null;
    }
    return {
      status: status as BittensorSignedResult["status"],
      txHash: normalizeBittensorReceiptString(record.txHash),
      blockHash: normalizeBittensorReceiptString(record.blockHash),
      message: normalizeBittensorReceiptString(record.message) ?? "External signer receipt evidence imported by Matterhorn.",
      explorerUrl: normalizeBittensorReceiptString(record.explorerUrl),
    };
  }

  addRoute(routes, "POST", "/api/bittensor/extrinsics/receipt", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const forbidden = findForbiddenBittensorReceiptInput(body);
    if (forbidden) {
      throw new ApiError(400, "signing_material_rejected", `Bittensor receipt input must not contain seed phrases, private keys, raw signatures, or signed payloads (${forbidden}). Submit only public hashes and routing metadata.`);
    }
    if (!body.preview || typeof body.preview !== "object") {
      throw new ApiError(400, "invalid_preview", "preview is required");
    }
    const signatureSha256 = normalizeBittensorReceiptHash(body.signatureSha256);
    if (body.signatureSha256 !== undefined && !signatureSha256) {
      throw new ApiError(400, "invalid_signature_hash", "signatureSha256 must be a 64-character SHA-256 hex digest");
    }
    const preview = body.preview as BittensorExtrinsicPreview;
    const handoff = body.handoff && typeof body.handoff === "object" ? body.handoff as BittensorSigningHandoff : null;
    const result = normalizeBittensorReceiptResult(body.result);
    const receipt = createBittensorSigningReceipt({
      preview,
      handoff,
      result,
      signatureSha256,
      signerAddress: typeof body.signerAddress === "string" ? body.signerAddress : null,
    });
    return jsonResponse({ success: true, receipt, cards: [buildBittensorSigningReceiptCard(receipt)] });
  });

  addRoute(routes, "POST", "/api/bittensor/extrinsics/submit", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    if (!body.preview || typeof body.preview !== "object") {
      throw new ApiError(400, "invalid_preview", "preview is required");
    }
    const preview = body.preview as BittensorExtrinsicPreview;
    const result = await submitSignedBittensorExtrinsic({
      preview,
      signature: typeof body.signature === "string" ? body.signature : null,
      signerAddress: typeof body.signerAddress === "string" ? body.signerAddress : null,
    });
    const receipt = createBittensorSigningReceipt({
      preview,
      result,
      signature: typeof body.signature === "string" ? body.signature : null,
      signerAddress: typeof body.signerAddress === "string" ? body.signerAddress : null,
    });
    return jsonResponse({ success: true, result, receipt, cards: [buildBittensorSignedResultCard(result), buildBittensorSigningReceiptCard(receipt)] });
  });

  addRoute(routes, "POST", "/api/bittensor/subnets/:netuid/invoke", "client", async (ctx) => {
    const netuid = Number(ctx.params.netuid);
    if (!Number.isInteger(netuid) || netuid < 0) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const body = await readJsonBody(ctx.request);
    const intent = typeof body.intent === "string" ? body.intent : "explain";
    if (!["explain", "metagraph", "stake_guidance", "wallet_guidance", "service_call"].includes(intent)) {
      throw new ApiError(400, "invalid_intent", "intent must be explain, metagraph, stake_guidance, wallet_guidance, or service_call");
    }
    const expectedRequestSha256 = typeof body.previewRequestSha256 === "string" ? body.previewRequestSha256 : null;
    const reviewedRequestSha256 = typeof body.reviewedRequestSha256 === "string" ? body.reviewedRequestSha256 : expectedRequestSha256;
    if (expectedRequestSha256) {
      const preview = await previewBittensorSubnetInvocation(netuid, {
        intent: intent as BittensorSubnetInvocation["intent"],
        task: typeof body.task === "string" ? body.task : null,
        ss58Address: typeof body.ss58Address === "string" ? body.ss58Address : null,
      });
      if (preview.requestSha256 !== expectedRequestSha256) {
        throw new ApiError(409, "preview_mismatch", "Confirmed subnet service request does not match the reviewed preview hash.");
      }
    }
    const invocation = await invokeBittensorSubnet(netuid, {
      intent: intent as BittensorSubnetInvocation["intent"],
      task: typeof body.task === "string" ? body.task : null,
      ss58Address: typeof body.ss58Address === "string" ? body.ss58Address : null,
      reviewedRequestSha256,
    });
    return jsonResponse({ success: true, invocation, cards: [buildBittensorInvocationCard(invocation)] });
  });

  addRoute(routes, "POST", "/api/bittensor/subnets/:netuid/preview", "client", async (ctx) => {
    const netuid = Number(ctx.params.netuid);
    if (!Number.isInteger(netuid) || netuid < 0) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const body = await readJsonBody(ctx.request);
    const intent = typeof body.intent === "string" ? body.intent : "service_call";
    if (!["explain", "metagraph", "stake_guidance", "wallet_guidance", "service_call"].includes(intent)) {
      throw new ApiError(400, "invalid_intent", "intent must be explain, metagraph, stake_guidance, wallet_guidance, or service_call");
    }
    const preview = await previewBittensorSubnetInvocation(netuid, {
      intent: intent as BittensorSubnetInvocation["intent"],
      task: typeof body.task === "string" ? body.task : null,
      ss58Address: typeof body.ss58Address === "string" ? body.ss58Address : null,
    });
    return jsonResponse({ success: true, preview, cards: [buildBittensorInvocationPreviewCard(preview)] });
  });

  addRoute(routes, "POST", "/api/bittensor/validators/compare", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const netuid = Number(body.netuid);
    if (!Number.isInteger(netuid) || netuid < 0) {
      throw new ApiError(400, "invalid_netuid", "netuid must be a non-negative integer");
    }
    const strategy = typeof body.strategy === "string" ? body.strategy : "balanced";
    if (!["balanced", "yield", "safety"].includes(strategy)) {
      throw new ApiError(400, "invalid_strategy", "strategy must be balanced, yield, or safety");
    }
    const hotkeys = Array.isArray(body.hotkeys)
      ? body.hotkeys.filter((value): value is string => typeof value === "string" && isValidSs58Address(value))
      : null;
    const comparison = await compareBittensorValidators({
      netuid,
      hotkeys,
      limit: typeof body.limit === "number" ? body.limit : null,
      strategy: strategy as "balanced" | "yield" | "safety",
    });
    return jsonResponse({ success: true, comparison, cards: buildBittensorValidatorComparisonCards(comparison) });
  });

  addRoute(routes, "GET", "/api/bittensor/monitoring/watchlist", "client", async () => {
    const watches = listBittensorWatches();
    return jsonResponse({ success: true, watches, cards: buildBittensorWatchCards(watches) });
  });

  addRoute(routes, "POST", "/api/bittensor/monitoring/watchlist", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const watchKind: BittensorWatch["kind"] =
      typeof body.kind === "string" && ["subnet", "wallet", "validator", "emissions", "slippage"].includes(body.kind)
        ? (body.kind as BittensorWatch["kind"])
        : "subnet";
    const watch = createBittensorWatch({
      kind: watchKind,
      label: typeof body.label === "string" ? body.label : undefined,
      netuid: body.netuid === null || body.netuid === undefined || body.netuid === "" ? null : Number(body.netuid),
      ss58Address: typeof body.ss58Address === "string" ? body.ss58Address : null,
      validatorHotkey: typeof body.validatorHotkey === "string" ? body.validatorHotkey : null,
      threshold: body.threshold === null || body.threshold === undefined || body.threshold === "" ? null : Number(body.threshold),
      reason: typeof body.reason === "string" ? body.reason : null,
    });
    const watches = listBittensorWatches();
    return jsonResponse({ success: true, watch, watches, cards: buildBittensorWatchCards([watch]) });
  });

  addRoute(routes, "GET", "/api/bittensor/monitoring/check", "client", async () => {
    const evaluations = await evaluateBittensorWatches();
    return jsonResponse({ success: true, evaluations, cards: buildBittensorWatchEvaluationCards(evaluations) });
  });

  addRoute(routes, "GET", "/api/bittensor/monitoring/digest", "client", async (ctx) => {
    const evaluations = await evaluateBittensorWatches();
    const maxAlertsParam = ctx.url.searchParams.get("maxAlerts") ?? ctx.url.searchParams.get("max_alerts");
    const includeOk = ctx.url.searchParams.get("includeOk") === "true" || ctx.url.searchParams.get("include_ok") === "true";
    const maxAlerts = maxAlertsParam ? Number(maxAlertsParam) : null;
    return jsonResponse({
      success: true,
      digest: buildBittensorWatchDigest(evaluations, { maxAlerts, includeOk }),
      cards: buildBittensorWatchEvaluationCards(evaluations),
    });
  });

  addRoute(routes, "GET", "/api/cow/quote", "client", async (ctx) => {
    const chainId = Number(ctx.url.searchParams.get("chainId"));
    const sellToken = ctx.url.searchParams.get("sellToken");
    const buyToken = ctx.url.searchParams.get("buyToken");
    const sellAmount = ctx.url.searchParams.get("sellAmount");
    const receiver = ctx.url.searchParams.get("receiver");
    if (!sellToken || !buyToken || !sellAmount || !receiver) {
      throw new ApiError(400, "invalid_params", "sellToken, buyToken, sellAmount, receiver required");
    }
    const result = await getCowQuote({ chainId, sellToken: sellToken as `0x${string}`, buyToken: buyToken as `0x${string}`, sellAmount, receiver: receiver as `0x${string}` });
    return jsonResponse(result);
  });

  addRoute(routes, "POST", "/api/cow/order", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const { chainId, order, signature } = body;
    if (!chainId || !order || !signature) {
      throw new ApiError(400, "invalid_params", "chainId, order, signature required");
    }
    const result = await submitCowOrder({
      chainId: Number(chainId),
      order: order as Record<string, unknown>,
      signature: signature as `0x${string}`,
    });
    return jsonResponse(result);
  });

  // Aave V3 routes
  addRoute(routes, "POST", "/api/aave/deposit", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const chainId = Number(body.chainId);
    const result = buildAaveSupplyTx({ chainId, asset: String(body.asset) as `0x${string}`, amount: String(body.amount), onBehalfOf: String(body.onBehalfOf) as `0x${string}` });
    return jsonResponse(result);
  });
  addRoute(routes, "POST", "/api/aave/withdraw", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const chainId = Number(body.chainId);
    const result = buildAaveWithdrawTx({ chainId, asset: String(body.asset) as `0x${string}`, amount: String(body.amount), to: String(body.to) as `0x${string}` });
    return jsonResponse(result);
  });
  addRoute(routes, "POST", "/api/aave/borrow", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const chainId = Number(body.chainId);
    const result = buildAaveBorrowTx({ chainId, asset: String(body.asset) as `0x${string}`, amount: String(body.amount), onBehalfOf: String(body.onBehalfOf) as `0x${string}` });
    return jsonResponse(result);
  });
  addRoute(routes, "POST", "/api/aave/repay", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const chainId = Number(body.chainId);
    const result = buildAaveRepayTx({ chainId, asset: String(body.asset) as `0x${string}`, amount: String(body.amount), onBehalfOf: String(body.onBehalfOf) as `0x${string}` });
    return jsonResponse(result);
  });
  addRoute(routes, "GET", "/api/aave/positions", "client", async (ctx) => {
    const chainId = Number(ctx.url.searchParams.get("chainId"));
    const user = (ctx.url.searchParams.get("address") || "") as `0x${string}`;
    const result = await getAaveUserPositions({ chainId, user });
    return jsonResponse(result);
  });
  addRoute(routes, "GET", "/api/aave/apy", "client", async (ctx) => {
    const chainId = Number(ctx.url.searchParams.get("chainId"));
    const asset = (ctx.url.searchParams.get("asset") || "") as `0x${string}`;
    const result = await getAaveSupplyApy({ chainId, asset });
    return jsonResponse(result);
  });
  addRoute(routes, "GET", "/api/aave/deposits", "client", async (ctx) => {
    const chainId = Number(ctx.url.searchParams.get("chainId"));
    const user = (ctx.url.searchParams.get("address") || "") as `0x${string}`;
    const result = await getAaveTokenDeposits({ chainId, user });
    return jsonResponse(result);
  });

  // Bridge routes
  addRoute(routes, "GET", "/api/bridge/quote", "client", async (ctx) => {
    const originChainId = Number(ctx.url.searchParams.get("originChainId"));
    const destinationChainId = Number(ctx.url.searchParams.get("destinationChainId"));
    const originToken = (ctx.url.searchParams.get("originToken") || "") as `0x${string}`;
    const amount = ctx.url.searchParams.get("amount") || "0";
    const recipient = (ctx.url.searchParams.get("recipient") || "") as `0x${string}`;
    const result = await getBridgeQuote({ originChainId, destinationChainId, originToken, amount, recipient });
    return jsonResponse(result);
  });
  addRoute(routes, "POST", "/api/bridge/deposit", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const result = buildBridgeDepositTx({
      chainId: Number(body.chainId),
      destinationChainId: Number(body.destinationChainId),
      inputToken: String(body.inputToken) as `0x${string}`,
      outputToken: String(body.outputToken) as `0x${string}`,
      inputAmount: String(body.inputAmount),
      outputAmount: String(body.outputAmount),
      recipient: String(body.recipient) as `0x${string}`,
      quoteTimestamp: Number(body.quoteTimestamp),
    });
    return jsonResponse(result);
  });

  // Transfer route
  addRoute(routes, "POST", "/api/transfer/build", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const result = buildTransferTx({
      chainId: Number(body.chainId),
      token: body.token === "native" ? "native" : String(body.token) as `0x${string}`,
      to: String(body.to) as `0x${string}`,
      amount: String(body.amount),
    });
    return jsonResponse(result);
  });

  // Schedule / Agent routes
  addRoute(routes, "POST", "/api/schedule/parse", "client", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const result = parseIntent(String(body.intent));
    return jsonResponse(result);
  });

  addRoute(routes, "GET", "/approvals", "host", async (ctx) => {
    return jsonResponse({ items: ctx.approvals.list() });
  });

  addRoute(routes, "POST", "/approvals/:id", "host", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const reply = body.reply === "allow" ? "allow" : "deny";
    const result = ctx.approvals.respond(ctx.params.id, reply);
    if (!result) {
      throw new ApiError(404, "approval_not_found", "Approval request not found");
    }
    return jsonResponse({ ok: true, allowed: result.allowed });
  });

  return routes;
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "boolean");
}

function parseSessionPromptParts(body: Record<string, unknown>): unknown[] {
  if (Array.isArray(body.parts) && body.parts.length > 0) {
    return body.parts;
  }
  if (typeof body.message === "string" && body.message.trim()) {
    return [{ type: "text", text: body.message }];
  }
  throw new ApiError(400, "invalid_payload", "message or non-empty parts is required");
}

function parseSessionPromptModel(body: Record<string, unknown>): { providerID: string; modelID: string } | undefined {
  if (isRecord(body.model)) {
    const providerID = typeof body.model.providerID === "string" ? body.model.providerID.trim() : "";
    const modelID = typeof body.model.modelID === "string" ? body.model.modelID.trim() : "";
    if (!providerID && !modelID) return undefined;
    if (!providerID || !modelID) {
      throw new ApiError(400, "invalid_payload", "model requires providerID and modelID");
    }
    return { providerID, modelID };
  }
  const providerID = typeof body.providerID === "string" ? body.providerID.trim() : "";
  const modelID = typeof body.modelID === "string" ? body.modelID.trim() : "";
  if (!providerID && !modelID) return undefined;
  if (!providerID || !modelID) {
    throw new ApiError(400, "invalid_payload", "providerID and modelID must be provided together");
  }
  return { providerID, modelID };
}

function remapSessionReadError(error: unknown): never {
  if (error instanceof ApiError && error.code === "opencode_request_failed") {
    const details = error.details;
    const upstreamStatus =
      details && typeof details === "object" && "status" in details ? Number((details as { status?: unknown }).status) : NaN;
    if (upstreamStatus === 400) {
      throw new ApiError(400, "invalid_query", "OpenCode rejected the session read request", details);
    }
    if (upstreamStatus === 404) {
      throw new ApiError(404, "session_not_found", "Session not found", details);
    }
  }
  throw error;
}

async function listWorkspaceSessions(
  config: ServerConfig,
  workspace: WorkspaceInfo,
  input: { roots?: boolean; start?: number; search?: string; limit?: number },
) {
  try {
    const opencode = createWorkspaceOpencodeClient(config, workspace);
    return buildSessionList(
      unwrapOpencodeResult(
        await opencode.session.list({
          roots: input.roots,
          start: input.start,
          search: input.search,
          limit: input.limit,
        }),
        "/session",
      ),
    );
  } catch (error) {
    remapSessionReadError(error);
  }
}

async function readWorkspaceSession(config: ServerConfig, workspace: WorkspaceInfo, sessionId: string) {
  try {
    const opencode = createWorkspaceOpencodeClient(config, workspace);
    return buildSession(
      unwrapOpencodeResult(
        await opencode.session.get({ sessionID: sessionId }),
        `/session/${encodeURIComponent(sessionId)}`,
      ),
    );
  } catch (error) {
    remapSessionReadError(error);
  }
}

async function readWorkspaceSessionMessages(
  config: ServerConfig,
  workspace: WorkspaceInfo,
  sessionId: string,
  input: { limit?: number },
) {
  try {
    const opencode = createWorkspaceOpencodeClient(config, workspace);
    return buildSessionMessages(
      unwrapOpencodeResult(
        await opencode.session.messages({ sessionID: sessionId, limit: input.limit }),
        `/session/${encodeURIComponent(sessionId)}/message`,
      ),
    );
  } catch (error) {
    remapSessionReadError(error);
  }
}

async function readWorkspaceSessionTodos(config: ServerConfig, workspace: WorkspaceInfo, sessionId: string) {
  try {
    const opencode = createWorkspaceOpencodeClient(config, workspace);
    return buildSessionTodos(
      unwrapOpencodeResult(
        await opencode.session.todo({ sessionID: sessionId }),
        `/session/${encodeURIComponent(sessionId)}/todo`,
      ),
    );
  } catch (error) {
    remapSessionReadError(error);
  }
}

async function readWorkspaceSessionStatuses(config: ServerConfig, workspace: WorkspaceInfo) {
  try {
    const opencode = createWorkspaceOpencodeClient(config, workspace);
    return buildSessionStatuses(
      unwrapOpencodeResult(await opencode.session.status(), "/session/status"),
    );
  } catch (error) {
    remapSessionReadError(error);
  }
}

async function readWorkspaceSessionExecutionStatus(config: ServerConfig, workspace: WorkspaceInfo, sessionId: string) {
  try {
    const opencode = createWorkspaceOpencodeClient(config, workspace);
    const [session, statuses] = await Promise.all([
      opencode.session
        .get({ sessionID: sessionId })
        .then((result) => unwrapOpencodeResult(result, `/session/${encodeURIComponent(sessionId)}`)),
      opencode.session.status().then((result) => unwrapOpencodeResult(result, "/session/status")),
    ]);
    return buildSessionExecutionStatus({ session, statuses });
  } catch (error) {
    remapSessionReadError(error);
  }
}

async function readWorkspaceSessionSnapshot(
  config: ServerConfig,
  workspace: WorkspaceInfo,
  sessionId: string,
  input: { limit?: number },
) {
  try {
    const opencode = createWorkspaceOpencodeClient(config, workspace);
    const [session, messages, todos, statuses] = await Promise.all([
      opencode.session
        .get({ sessionID: sessionId })
        .then((result) => unwrapOpencodeResult(result, `/session/${encodeURIComponent(sessionId)}`)),
      opencode.session
        .messages({ sessionID: sessionId, limit: input.limit })
        .then((result) => unwrapOpencodeResult(result, `/session/${encodeURIComponent(sessionId)}/message`)),
      opencode.session
        .todo({ sessionID: sessionId })
        .then((result) => unwrapOpencodeResult(result, `/session/${encodeURIComponent(sessionId)}/todo`)),
      opencode.session.status().then((result) => unwrapOpencodeResult(result, "/session/status")),
    ]);
    return buildSessionSnapshot({ session, messages, todos, statuses });
  } catch (error) {
    remapSessionReadError(error);
  }
}

async function resolveWorkspace(config: ServerConfig, id: string): Promise<WorkspaceInfo> {
  const workspaceId = id.trim();
  const aliasWorkspaceId = workspaceId.startsWith("rem_") ? workspaceId.slice("rem_".length) : "";
  const workspace =
    config.workspaces.find((entry) => entry.id === workspaceId) ??
    (aliasWorkspaceId ? config.workspaces.find((entry) => entry.id === aliasWorkspaceId) : undefined);
  if (!workspace) {
    throw new ApiError(404, "workspace_not_found", "Workspace not found");
  }
  const resolvedWorkspace = resolve(workspace.path);
  const authorized = await isAuthorizedRoot(resolvedWorkspace, config.authorizedRoots);
  if (!authorized) {
    throw new ApiError(403, "workspace_unauthorized", "Workspace is not authorized");
  }
  if (!config.readOnly) {
    const ensured = await ensureWorkspaceFiles(resolvedWorkspace, workspace.preset ?? "starter");
    const bootstrapReloadReasons = new Set<ReloadReason>(ensured.reloadReasons);
    if (await repairCommands(resolvedWorkspace)) {
      bootstrapReloadReasons.add("commands");
    }
    if (bootstrapReloadReasons.size > 0) {
      await reloadBaselineRefreshers.get(config)?.(workspace.id, Array.from(bootstrapReloadReasons));
      reloadOpencodeEngineAfterInternalBootstrap(config, { ...workspace, path: resolvedWorkspace });
    }
  }
  return { ...workspace, path: resolvedWorkspace };
}

function reloadOpencodeEngineAfterInternalBootstrap(config: ServerConfig, workspace: WorkspaceInfo): void {
  const connection = resolveWorkspaceOpencodeConnection(config, workspace);
  if (!connection.baseUrl?.trim()) return;
  void reloadOpencodeEngine(config, workspace).catch(() => undefined);
}

async function isAuthorizedRoot(workspacePath: string, roots: string[]): Promise<boolean> {
  const resolvedWorkspace = resolve(workspacePath);
  for (const root of roots) {
    const resolvedRoot = resolve(root);
    if (resolvedWorkspace === resolvedRoot) return true;
    if (resolvedWorkspace.startsWith(resolvedRoot + sep)) return true;
  }
  return false;
}

function ensureWritable(config: ServerConfig): void {
  if (config.readOnly) {
    throw new ApiError(403, "read_only", "Server is read-only");
  }
}

function scopeRank(scope: TokenScope): number {
  if (scope === "viewer") return 1;
  if (scope === "collaborator") return 2;
  return 3;
}

function requireClientScope(ctx: RequestContext, required: TokenScope): void {
  const scope = ctx.actor?.scope;
  if (!scope) {
    throw new ApiError(401, "unauthorized", "Missing token scope");
  }
  if (scopeRank(scope) < scopeRank(required)) {
    throw new ApiError(403, "forbidden", "Insufficient token scope", { required, scope });
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const json = await request.json();
    return json as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "invalid_json", "Invalid JSON body");
  }
}

function parseOptionalPositiveInteger(value: string | null, name: string): number | undefined {
  if (value === null) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(400, "invalid_query", `${name} must be a positive integer`);
  }
  return parsed;
}

function parseOptionalNonNegativeInteger(value: string | null, name: string): number | undefined {
  if (value === null) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ApiError(400, "invalid_query", `${name} must be a non-negative integer`);
  }
  return parsed;
}

function parseOptionalBoolean(value: string | null, name: string): boolean | undefined {
  if (value === null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new ApiError(400, "invalid_query", `${name} must be a boolean`);
}

function ensurePlainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

type OpenworkServerConfigFile = Record<string, unknown> & {
  workspaces?: Array<Record<string, unknown>>;
  authorizedRoots?: string[];
};

async function readServerConfigFile(configPath: string): Promise<OpenworkServerConfigFile> {
  if (!(await exists(configPath))) {
    return {};
  }

  try {
    const raw = await readFile(configPath, "utf8");
    return ensurePlainObject(JSON.parse(raw)) as OpenworkServerConfigFile;
  } catch (error) {
    throw new ApiError(422, "invalid_json", "Failed to parse server config", {
      path: configPath,
      error: String(error),
    });
  }
}

function serializeWorkspaceConfigEntry(workspace: WorkspaceInfo): Record<string, unknown> {
  return {
    id: workspace.id,
    path: workspace.path,
    name: workspace.name,
    preset: workspace.preset,
    workspaceType: workspace.workspaceType,
    ...(workspace.remoteType ? { remoteType: workspace.remoteType } : {}),
    ...(workspace.baseUrl ? { baseUrl: workspace.baseUrl } : {}),
    ...(workspace.directory ? { directory: workspace.directory } : {}),
    ...(workspace.displayName ? { displayName: workspace.displayName } : {}),
    ...(workspace.openworkHostUrl ? { openworkHostUrl: workspace.openworkHostUrl } : {}),
    ...(workspace.openworkToken ? { openworkToken: workspace.openworkToken } : {}),
    ...(workspace.openworkWorkspaceId ? { openworkWorkspaceId: workspace.openworkWorkspaceId } : {}),
    ...(workspace.openworkWorkspaceName ? { openworkWorkspaceName: workspace.openworkWorkspaceName } : {}),
    ...(workspace.sandboxBackend ? { sandboxBackend: workspace.sandboxBackend } : {}),
    ...(workspace.sandboxRunId ? { sandboxRunId: workspace.sandboxRunId } : {}),
    ...(workspace.sandboxContainerName ? { sandboxContainerName: workspace.sandboxContainerName } : {}),
    ...(workspace.opencodeUsername ? { opencodeUsername: workspace.opencodeUsername } : {}),
    ...(workspace.opencodePassword ? { opencodePassword: workspace.opencodePassword } : {}),
  };
}

async function persistServerWorkspaceState(config: ServerConfig): Promise<boolean> {
  const configPath = config.configPath?.trim() ?? "";
  if (!configPath) return false;
  if (!(await exists(configPath))) return false;

  const parsed = await readServerConfigFile(configPath);
  const next: OpenworkServerConfigFile = {
    ...parsed,
    workspaces: config.workspaces.map(serializeWorkspaceConfigEntry),
    authorizedRoots: Array.from(new Set(config.authorizedRoots.map((root) => resolve(root)))),
  };

  await ensureDir(dirname(configPath));
  const tmpPath = `${configPath}.tmp.${shortId()}`;
  try {
    await writeFile(tmpPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(tmpPath, configPath);
    return true;
  } finally {
    try {
      await rm(tmpPath);
    } catch {
      // ignore
    }
  }
}

function normalizeOpencodeScope(value: string | null | undefined): "project" | "global" {
  return value?.trim().toLowerCase() === "global" ? "global" : "project";
}

function resolveOpencodeConfigFilePath(scope: "project" | "global", workspaceRoot: string): string {
  if (scope === "global") {
    const base = join(homedir(), ".config", "opencode");
    const jsoncPath = join(base, "opencode.jsonc");
    const jsonPath = join(base, "opencode.json");
    if (existsSync(jsoncPath)) return jsoncPath;
    if (existsSync(jsonPath)) return jsonPath;
    return jsoncPath;
  }
  return opencodeConfigPath(workspaceRoot);
}

function getRuntimeControlConfig(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.OPENWORK_CONTROL_BASE_URL?.trim() ?? "";
  const token = process.env.OPENWORK_CONTROL_TOKEN?.trim() ?? "";
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

async function fetchRuntimeControl(path: string, init?: { method?: string; body?: unknown }) {
  const control = getRuntimeControlConfig();
  if (!control) {
    throw new ApiError(501, "runtime_upgrade_unavailable", "Worker runtime control is not configured on this host");
  }
  const response = await fetch(`${control.baseUrl}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${control.token}`,
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(response.status, "runtime_upgrade_failed", "Worker runtime control request failed", json);
  }
  return json;
}

async function readOpencodeConfig(workspaceRoot: string): Promise<Record<string, unknown>> {
  const { data } = await readJsoncFile(opencodeConfigPath(workspaceRoot), {} as Record<string, unknown>);
  return data;
}

async function readOpenworkConfig(workspaceRoot: string): Promise<Record<string, unknown>> {
  const path = openworkConfigPath(workspaceRoot);
  if (!(await exists(path))) return {};
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new ApiError(422, "invalid_json", "Failed to parse openwork.json");
  }
}

function resolveOpencodeDirectory(workspace: WorkspaceInfo): string | null {
  const explicit = workspace.directory?.trim() ?? "";
  if (explicit) return normalizeOpencodeDirectory(explicit);
  if (workspace.workspaceType === "local") return normalizeOpencodeDirectory(workspace.path);
  return null;
}

function normalizeOpencodeDirectory(directory: string): string {
  // OpenCode stores/list-filters Windows sessions by regular drive paths
  // (`C:\Users\...`). Electron can persist local workspaces as extended-length
  // paths (`\\?\C:\Users\...`); passing those through as the directory query
  // makes OpenCode return an empty session list even though the sessions exist.
  if (process.platform === "win32") {
    return directory.replace(/^\\\\\?\\/, "").replace(/^\/\/\?\//, "");
  }
  return directory;
}

function buildOpencodeReloadUrl(baseUrl: string, directory?: string | null): string {
  try {
    const url = new URL(baseUrl);
    url.pathname = "/instance/dispose";
    url.search = "";
    if (directory) {
      url.searchParams.set("directory", directory);
    }
    return url.toString();
  } catch {
    throw new ApiError(400, "opencode_url_invalid", "OpenCode base URL is invalid");
  }
}

function parseOpencodeErrorBody(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

async function reloadOpencodeEngine(config: ServerConfig, workspace: WorkspaceInfo): Promise<void> {
  const connection = resolveWorkspaceOpencodeConnection(config, workspace);
  const baseUrl = connection.baseUrl?.trim() ?? "";
  if (!baseUrl) {
    throw new ApiError(400, "opencode_unconfigured", "OpenCode base URL is missing for this workspace");
  }

  const directory = resolveOpencodeDirectory(workspace);
  const targetUrl = buildOpencodeReloadUrl(baseUrl, directory);
  const headers: Record<string, string> = {};
  const auth = connection.authHeader ?? null;
  if (auth) headers.Authorization = auth;

  const response = await fetch(targetUrl, { method: "POST", headers });
  if (response.ok) return;
  const body = parseOpencodeErrorBody(await response.text());
  throw new ApiError(502, "opencode_reload_failed", "OpenCode reload failed", {
    status: response.status,
    body,
  });
}

async function writeOpenworkConfig(workspaceRoot: string, payload: Record<string, unknown>, merge: boolean): Promise<void> {
  const path = openworkConfigPath(workspaceRoot);
  const next = merge ? { ...(await readOpenworkConfig(workspaceRoot)), ...payload } : payload;
  await ensureDir(join(workspaceRoot, ".opencode"));
  await writeFile(path, JSON.stringify(next, null, 2) + "\n", "utf8");
}

async function requireApproval(
  ctx: RequestContext,
  input: Omit<ApprovalRequest, "id" | "createdAt" | "actor">,
): Promise<void> {
  const actor = ctx.actor ?? { type: "remote" };
  const result = await ctx.approvals.requestApproval({ ...input, actor });
  if (!result.allowed) {
    throw new ApiError(403, "write_denied", "Write request denied", {
      requestId: result.id,
      reason: result.reason,
    });
  }
}

async function exportWorkspace(
  workspace: WorkspaceInfo,
  options?: { sensitiveMode?: WorkspaceExportSensitiveMode },
) {
  const sensitiveMode = options?.sensitiveMode ?? "auto";
  const rawOpencode = await readOpencodeConfig(workspace.path);
  let opencode = sanitizePortableOpencodeConfig(rawOpencode);
  const openwork = sanitizeOpenworkTemplateConfig(await readOpenworkConfig(workspace.path));
  const skills = await listSkills(workspace.path, false);
  const commands = await listCommands(workspace.path, "workspace");
  let files = await listPortableFiles(workspace.path);
  const warnings = collectWorkspaceExportWarnings({ opencode: rawOpencode, files });
  if (warnings.length && sensitiveMode === "auto") {
    throw new ApiError(
      409,
      "workspace_export_requires_decision",
      "This workspace includes sensitive config. Choose whether to exclude it or include it before exporting.",
      { warnings },
    );
  }
  if (sensitiveMode === "exclude") {
    const sanitized = stripSensitiveWorkspaceExportData({ opencode, files });
    opencode = sanitized.opencode;
    files = sanitized.files;
  }
  const skillContents = await Promise.all(
    skills.map(async (skill) => ({
      name: skill.name,
      description: skill.description,
      content: await readFile(skill.path, "utf8"),
    })),
  );
  const commandContents = await Promise.all(
    commands.map(async (command) => ({
      name: command.name,
      description: command.description,
      template: command.template,
    })),
  );

  return {
    workspaceId: workspace.id,
    exportedAt: Date.now(),
    opencode,
    openwork,
    skills: skillContents,
    commands: commandContents,
    ...(files.length ? { files } : {}),
  };
}

function parseWorkspaceExportSensitiveMode(input: string | null): WorkspaceExportSensitiveMode {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return "auto";
  if (trimmed === "auto" || trimmed === "include" || trimmed === "exclude") {
    return trimmed;
  }
  throw new ApiError(400, "invalid_workspace_export_sensitive_mode", `Invalid workspace export sensitive mode: ${trimmed}`);
}

function parseWorkspaceImportPreviewFingerprint(payload: Record<string, unknown>): string | null {
  const value = payload.previewFingerprint;
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ApiError(
      400,
      "invalid_workspace_import_preview_fingerprint",
      "Workspace import preview fingerprint must be a string",
    );
  }
  return value;
}

function workspaceImportRelativePath(workspace: WorkspaceInfo, path: string): string {
  return relative(workspace.path, path).replaceAll("\\", "/");
}

async function importWorkspace(workspace: WorkspaceInfo, payload: Record<string, unknown>, preview: WorkspaceImportPlan): Promise<void> {
  const input = normalizeWorkspaceImportPayload(workspace.path, payload);
  const changed = new Set(
    preview.changes
      .filter((change) => change.action !== "unchanged")
      .map((change) => `${change.kind}:${change.path}`),
  );
  const changedPath = (kind: string, path: string) => changed.has(`${kind}:${path}`);

  if (
    input.opencode !== undefined &&
    changedPath("opencode", workspaceImportRelativePath(workspace, opencodeConfigPath(workspace.path)))
  ) {
    if (input.modes.opencode === "replace") {
      await writeJsoncFile(opencodeConfigPath(workspace.path), input.opencode);
    } else {
      await updateJsoncTopLevel(opencodeConfigPath(workspace.path), input.opencode);
    }
  }

  if (
    input.openwork !== undefined &&
    changedPath("openwork", workspaceImportRelativePath(workspace, openworkConfigPath(workspace.path)))
  ) {
    if (input.modes.openwork === "replace") {
      await writeOpenworkConfig(workspace.path, input.openwork, false);
    } else {
      await writeOpenworkConfig(workspace.path, input.openwork, true);
    }
  }

  if (input.sections.skills) {
    for (const skill of input.skills) {
      const path = workspaceImportRelativePath(workspace, join(projectSkillsDir(workspace.path), skill.name, "SKILL.md"));
      if (!changedPath("skill", path)) continue;
      await upsertSkill(workspace.path, skill);
    }
    if (input.modes.skills === "replace") {
      for (const change of preview.changes) {
        if (change.kind === "skill" && change.action === "delete") {
          await rm(change.absolutePath, { recursive: true, force: true });
        }
      }
    }
  }

  if (input.sections.commands) {
    for (const command of input.commands) {
      const path = workspaceImportRelativePath(workspace, join(projectCommandsDir(workspace.path), `${command.name}.md`));
      if (!changedPath("command", path)) continue;
      await upsertCommand(workspace.path, command);
    }
    if (input.modes.commands === "replace") {
      for (const change of preview.changes) {
        if (change.kind === "command" && change.action === "delete") {
          await rm(change.absolutePath, { force: true });
        }
      }
    }
  }

  if (input.sections.files) {
    for (const file of input.files) {
      if (!changedPath("file", file.path)) continue;
      const path = join(workspace.path, file.path);
      await ensureDir(dirname(path));
      await writeFile(path, file.content, "utf8");
    }
    if (input.modes.files === "replace") {
      for (const change of preview.changes) {
        if (change.kind === "file" && change.action === "delete") {
          await rm(change.absolutePath, { force: true });
        }
      }
    }
  }
}

async function materializeBlueprintSessions(config: ServerConfig, workspace: WorkspaceInfo): Promise<{
  ok: boolean;
  created: Array<{ templateId: string; sessionId: string; title: string }>;
  existing: Array<{ templateId: string; sessionId: string }>;
  openSessionId: string | null;
}> {
  const openwork = await readOpenworkConfig(workspace.path);
  const templates = normalizeBlueprintSessionTemplates(openwork);
  if (!templates.length) {
    return { ok: true, created: [], existing: [], openSessionId: null };
  }

  const existing = readMaterializedBlueprintSessions(openwork);
  if (existing.length > 0) {
    const preferredTemplate = templates.find((template) => template.openOnFirstLoad) ?? templates[0] ?? null;
    const openSessionId = preferredTemplate
      ? existing.find((item) => item.templateId === preferredTemplate.id)?.sessionId ?? existing[0]?.sessionId ?? null
      : existing[0]?.sessionId ?? null;
    return { ok: true, created: [], existing, openSessionId };
  }

  const created: Array<{ templateId: string; sessionId: string; title: string }> = [];
  const opencode = createWorkspaceOpencodeClient(config, workspace);
  for (const template of templates) {
    const result = unwrapOpencodeResult(await opencode.session.create({ title: template.title }), "/session");
    const sessionId =
      result && typeof result === "object" && "id" in result && typeof result.id === "string" ? result.id.trim() : "";
    if (!sessionId) {
      throw new ApiError(502, "opencode_failed", "OpenCode session did not return an id");
    }
    seedOpencodeSessionMessages({
      sessionId,
      workspaceRoot: resolveOpencodeDirectory(workspace) ?? workspace.path,
      messages: template.messages,
    });
    created.push({ templateId: template.id, sessionId, title: template.title });
  }

  const now = Date.now();
  const nextOpenwork = applyMaterializedBlueprintSessions(
    openwork,
    created.map(({ templateId, sessionId }) => ({ templateId, sessionId })),
    now,
  );
  await writeOpenworkConfig(workspace.path, nextOpenwork, false);

  const preferredTemplate = templates.find((template) => template.openOnFirstLoad) ?? templates[0] ?? null;
  const openSessionId = preferredTemplate
    ? created.find((item) => item.templateId === preferredTemplate.id)?.sessionId ?? created[0]?.sessionId ?? null
    : created[0]?.sessionId ?? null;

  return { ok: true, created, existing: [], openSessionId };
}
