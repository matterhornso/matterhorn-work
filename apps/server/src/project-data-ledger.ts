import type {
  MatterhornProjectDataLedgerEntry,
  MatterhornProjectDataLedgerListOptions,
  MatterhornProjectDataLedgerPolicy,
  MatterhornProjectDataLedgerResponse,
  MatterhornProjectFeedbackEntry,
} from "@matterhorn-work/types/project-data-ledger";
import type { MatterhornProjectEvidenceEvent } from "@matterhorn-work/types/project-evidence";
import type { AuditEntry, WorkspaceInfo } from "./types.js";
import type { MatterhornCapability } from "@matterhorn-work/types/backend-capabilities";
import { buildProjectEvidenceTimeline } from "./project-evidence.js";
import { readAuditEntries } from "./audit.js";
import { readProjectFeedbackEntries } from "./project-feedback.js";

type BuildProjectDataLedgerOptions = MatterhornProjectDataLedgerListOptions & {
  workspace: WorkspaceInfo;
};

const SECRET_PATTERNS: RegExp[] = [
  /\b(seed phrase|mnemonic|private key|privateKey|wallet export|api secret|raw signature|signed payload)\b/gi,
  /\bBearer\s+[A-Za-z0-9._-]{8,}\b/g,
  /\b[A-Fa-f0-9]{64}\b/g,
];

function capability(status: MatterhornCapability["status"], label: string, description: string): MatterhornCapability {
  return { status, label, description };
}

function scrubString(value: string | undefined): { value: string | undefined; redacted: boolean } {
  if (!value) return { value, redacted: false };
  let redacted = false;
  let output = value;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, () => {
      redacted = true;
      return "[redacted]";
    });
  }
  return { value: output, redacted };
}

function actorFromAudit(entry: AuditEntry): MatterhornProjectDataLedgerEntry["actor"] {
  const actor = entry.actor;
  if (!actor) return undefined;
  return {
    type: actor.type,
    scope: "scope" in actor && typeof actor.scope === "string" ? actor.scope : undefined,
  };
}

function actorFromFeedback(entry: MatterhornProjectFeedbackEntry): MatterhornProjectDataLedgerEntry["actor"] {
  if (!entry.actor) return undefined;
  return {
    type: entry.actor.type,
    scope: entry.actor.scope,
  };
}

function ledgerKindFromEvidence(event: MatterhornProjectEvidenceEvent): MatterhornProjectDataLedgerEntry["kind"] {
  if (event.type === "note.created") return "note";
  if (event.type === "note.memory_suggested") return "memory_suggestion";
  if (event.type === "task.output_saved" || event.outputPath || event.artifactPaths?.length) return "output";
  return "task";
}

function evidenceToLedgerEntry(event: MatterhornProjectEvidenceEvent): MatterhornProjectDataLedgerEntry {
  const title = scrubString(event.title);
  const summary = scrubString(event.summary);
  const kind = ledgerKindFromEvidence(event);
  const containsUserContent = kind === "note" || kind === "memory_suggestion" || kind === "output";
  return {
    id: `evidence:${event.id}`,
    workspaceId: event.workspaceId,
    source: "project_evidence",
    kind,
    timestamp: event.timestamp,
    title: title.value ?? "Untitled event",
    summary: summary.value,
    desk: event.desk,
    sessionId: event.sessionId,
    sessionSlug: event.sessionSlug,
    taskId: event.taskId,
    noteId: event.noteId,
    outputPath: event.outputPath,
    artifactPaths: event.artifactPaths,
    href: event.href,
    dataClass: containsUserContent ? "user_content" : "system_event",
    containsUserContent,
    containsSecrets: containsUserContent ? "redacted" : "never",
    retention: containsUserContent ? "user_controlled" : "runtime_controlled",
    exportable: true,
    deletable: kind === "note" || kind === "memory_suggestion",
    redactionApplied: title.redacted || summary.redacted,
    trainingUse: "none",
    eventType: event.type,
  };
}

function auditToLedgerEntry(entry: AuditEntry): MatterhornProjectDataLedgerEntry {
  const title = scrubString(entry.action);
  const summary = scrubString(entry.summary);
  return {
    id: `audit:${entry.id}`,
    workspaceId: entry.workspaceId,
    source: "audit",
    kind: "audit",
    timestamp: new Date(entry.timestamp).toISOString(),
    title: title.value ?? "Audit event",
    summary: summary.value,
    actor: actorFromAudit(entry),
    dataClass: "audit_metadata",
    containsUserContent: false,
    containsSecrets: "never",
    retention: "append_only",
    exportable: true,
    deletable: false,
    redactionApplied: title.redacted || summary.redacted,
    trainingUse: "none",
    eventType: entry.action,
  };
}

function feedbackToLedgerEntry(entry: MatterhornProjectFeedbackEntry): MatterhornProjectDataLedgerEntry {
  const title = scrubString(`Feedback: ${entry.kind}`);
  const summary = scrubString(entry.comment);
  const sourceId = scrubString(entry.target?.sourceId);
  return {
    id: `feedback:${entry.id}`,
    workspaceId: entry.workspaceId,
    source: "feedback",
    kind: "feedback",
    timestamp: entry.createdAt,
    title: title.value ?? "Feedback",
    summary: summary.value,
    href: entry.target?.href,
    actor: actorFromFeedback(entry),
    dataClass: "feedback",
    containsUserContent: true,
    containsSecrets: "redacted",
    retention: "append_only",
    exportable: true,
    deletable: false,
    redactionApplied: entry.redactionApplied || title.redacted || summary.redacted || sourceId.redacted,
    trainingUse: "eval_routing_product_quality_only",
    eventType: entry.kind,
    metadata: {
      feedbackKind: entry.kind,
      rating: entry.rating ?? null,
      targetSourceType: entry.target?.sourceType ?? null,
      targetSourceId: sourceId.value ?? null,
    },
  };
}

function matchesFilters(entry: MatterhornProjectDataLedgerEntry, options: MatterhornProjectDataLedgerListOptions): boolean {
  if (options.source && entry.source !== options.source) return false;
  if (options.kind && entry.kind !== options.kind) return false;
  return true;
}

function summarize(items: MatterhornProjectDataLedgerEntry[]): MatterhornProjectDataLedgerResponse["summary"] {
  return {
    total: items.length,
    notes: items.filter((item) => item.kind === "note").length,
    memorySuggestions: items.filter((item) => item.kind === "memory_suggestion").length,
    tasks: items.filter((item) => item.kind === "task").length,
    outputs: items.filter((item) => item.kind === "output").length,
    audits: items.filter((item) => item.kind === "audit").length,
    feedback: items.filter((item) => item.kind === "feedback").length,
    redacted: items.filter((item) => item.redactionApplied).length,
  };
}

function ledgerPolicy(): MatterhornProjectDataLedgerPolicy {
  return {
    trainingUse: "none_by_default",
    feedbackUse: "eval_routing_product_quality_only",
    redaction: capability("working", "Redaction", "Known secret-shaped tokens, wallet material, raw signatures, and private-key phrases are redacted from ledger text fields."),
    retention: capability("preview", "Retention", "Notes and outputs are user-controlled; audit, task, and feedback events are append-only in this v1 ledger."),
    export: capability("preview", "Export", "The ledger response is exportable as JSON. Full project export packaging remains planned."),
    deletion: capability("preview", "Deletion", "User notes and memory records can be deleted elsewhere; append-only audit, task, and feedback events are retained for accountability."),
    limitations: [
      "Chat/session history remains in the OpenCode runtime store and is not fully materialized into this v1 ledger.",
      "Feedback is stored for eval, routing, and product quality review only; it is not used for RL or model training by default.",
      "Team collaboration is not durable here yet; this ledger is scoped to the local workspace server.",
    ],
  };
}

export async function buildProjectDataLedger(options: BuildProjectDataLedgerOptions): Promise<MatterhornProjectDataLedgerResponse> {
  const limit = Math.max(1, Math.min(options.limit ?? 100, 300));
  const [evidence, auditEntries, feedbackEntries] = await Promise.all([
    buildProjectEvidenceTimeline({
      workspaceId: options.workspace.id,
      workspaceRoot: options.workspace.path,
      limit: 300,
    }),
    readAuditEntries(options.workspace.path, options.workspace.id, 300),
    readProjectFeedbackEntries(options.workspace.id, 300),
  ]);

  const allItems = [
    ...evidence.items.map(evidenceToLedgerEntry),
    ...auditEntries.map(auditToLedgerEntry),
    ...feedbackEntries.map(feedbackToLedgerEntry),
  ]
    .filter((entry) => matchesFilters(entry, options))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const items = allItems.slice(0, limit);
  return {
    success: true,
    version: "matterhorn.project-data-ledger.v1",
    generatedAt: new Date().toISOString(),
    workspace: {
      id: options.workspace.id,
      name: options.workspace.name,
      path: options.workspace.path,
      type: options.workspace.workspaceType,
      preset: options.workspace.preset,
    },
    items,
    count: items.length,
    summary: summarize(allItems),
    policy: ledgerPolicy(),
  };
}

export function scrubProjectLedgerText(value: string | undefined): { value: string | undefined; redacted: boolean } {
  return scrubString(value);
}
