import type {
  MatterhornCoworkerWatch,
  MatterhornCryptoAppResult,
} from "@matterhorn-work/types/crypto-coworkers";

import { MatterhornCryptoAppAdapterError } from "./crypto-app-adapter-router.js";
import { verifyCryptoAppResultEvidence } from "./crypto-app-evidence-identity.js";
import { MatterhornCoworkers, type MatterhornCoworkerInboxItemInput } from "./crypto-coworkers.js";
import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";

export type MatterhornCoworkerWatchExecutor = (
  watch: MatterhornCoworkerWatch,
) => Promise<MatterhornCryptoAppResult>;

type WatchRunnerOptions = {
  coworkers: MatterhornCoworkers;
  execute: MatterhornCoworkerWatchExecutor;
  now?: () => Date;
  batchSize?: number;
};

const METRIC_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SAFE_EXECUTION_ERRORS = new Set([
  "adapter_connection_unavailable",
  "adapter_action_not_allowed",
  "adapter_network_not_allowed",
  "adapter_arguments_invalid",
  "adapter_authorization_denied",
  "adapter_transport_unavailable",
  "adapter_endpoint_blocked",
  "adapter_circuit_open",
  "adapter_quota_exceeded",
  "adapter_cost_limit_exceeded",
  "adapter_policy_unavailable",
  "adapter_timeout",
  "adapter_upstream_failed",
  "adapter_connected_address_invalid",
  "adapter_output_invalid",
  "adapter_output_stale",
  "adapter_result_too_large",
  "adapter_usage_reconciliation_failed",
]);

function scalar(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value.length <= 160 ? value : value.slice(0, 160);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function metricValue(result: unknown, path: string): string | null | undefined {
  const segments = path.split(".");
  if (segments.length < 1 || segments.length > 4 || segments.some((segment) => !METRIC_SEGMENT.test(segment))) {
    return undefined;
  }
  let current = result;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current)
      || !Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return scalar(current);
}

function semanticResult(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticResult);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "observedAt")
    .map(([key, item]) => [key, semanticResult(item)]));
}

function matches(
  operator: MatterhornCoworkerWatch["conditions"][number]["operator"],
  current: string | null,
  expected: string | null,
  previous: string | null | undefined,
): boolean {
  if (operator === "changed") return previous !== undefined && previous !== current;
  if (expected === null) return false;
  if (operator === "eq") return current === expected;
  if (current === null) return false;
  const left = Number(current);
  const right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (operator === "gt") return left > right;
  if (operator === "gte") return left >= right;
  if (operator === "lt") return left < right;
  return left <= right;
}

function freshness(result: MatterhornCryptoAppResult): "fresh" | "stale" | "unknown" {
  if (!result.observation.observedAt || result.observation.ageMs === null) return "unknown";
  const maxAge = result.observation.freshnessMaxAgeMs;
  return maxAge !== null && result.observation.ageMs > maxAge ? "stale" : "fresh";
}

function evidenceReferenceHash(result: MatterhornCryptoAppResult): string {
  if (!verifyCryptoAppResultEvidence(result)) {
    throw new MatterhornCryptoAppAdapterError("adapter_output_invalid");
  }
  // The observation proof also binds the exact projection proof, app,
  // action, network, source, block/version and observation time.
  return result.provenance.observationHash!;
}

function safeExecutionReason(error: unknown): string {
  const code = error instanceof MatterhornCryptoAppAdapterError ? error.code : "watch_execution_failed";
  return SAFE_EXECUTION_ERRORS.has(code) ? code : "watch_execution_failed";
}

export class MatterhornCoworkerWatchRunner {
  readonly #coworkers: MatterhornCoworkers;
  readonly #execute: MatterhornCoworkerWatchExecutor;
  readonly #now: () => Date;
  readonly #batchSize: number;
  #running = false;

  constructor(options: WatchRunnerOptions) {
    this.#coworkers = options.coworkers;
    this.#execute = options.execute;
    this.#now = options.now ?? (() => new Date());
    this.#batchSize = Math.max(1, Math.min(20, options.batchSize ?? 10));
  }

  async tick(): Promise<{ claimed: number; completed: number; alerted: number; failed: number }> {
    if (this.#running) return { claimed: 0, completed: 0, alerted: 0, failed: 0 };
    this.#running = true;
    try {
      const watches = this.#coworkers.claimDueWatches(this.#now(), this.#batchSize);
      const summary = { claimed: watches.length, completed: 0, alerted: 0, failed: 0 };
      for (const watch of watches) {
        const outcome = await this.#runWatch(watch);
        if (outcome === "completed") summary.completed += 1;
        if (outcome === "alerted") {
          summary.completed += 1;
          summary.alerted += 1;
        }
        if (outcome === "failed") summary.failed += 1;
      }
      return summary;
    } finally {
      this.#running = false;
    }
  }

  async #runWatch(watch: MatterhornCoworkerWatch): Promise<"completed" | "alerted" | "failed" | "stale"> {
    try {
      const result = await this.#execute(watch);
      const completedAt = this.#now();
      const exactEvidenceReferenceHash = evidenceReferenceHash(result);
      const resultHash = sha256({
        app: result.app,
        action: result.action,
        observation: result.observation,
        result: JSON.parse(canonicalJson(result.result)),
      });
      const semanticResultHash = sha256(semanticResult(result.result));
      const values: Record<string, string | null> = {};
      const matched: string[] = [];
      for (const condition of watch.conditions) {
        const value = condition.metric === "matterhorn_result_hash"
          ? semanticResultHash
          : metricValue(result.result, condition.metric);
        if (value === undefined) throw new MatterhornCryptoAppAdapterError("adapter_output_invalid");
        values[condition.id] = value;
        if (matches(
          condition.operator,
          value,
          condition.value,
          watch.schedule.lastConditionValues[condition.id],
        )) matched.push(condition.id);
      }
      let inboxItem: MatterhornCoworkerInboxItemInput | null = null;
      if (matched.length > 0) {
        inboxItem = {
          watchId: watch.id,
          kind: "alert",
          severity: "medium",
          title: `${watch.name} needs review`,
          summary: `${matched.length} approved watch condition${matched.length === 1 ? "" : "s"} matched fresh certified evidence.`,
          reasonCodes: matched,
          source: {
            appId: watch.appId,
            actionId: watch.actionId,
            evidenceReferenceHash: exactEvidenceReferenceHash,
            freshness: freshness(result),
            observedAt: result.observation.observedAt ?? result.timing.completedAt,
          },
          budgetImpact: {
            readCallsConsumed: 1,
            modelTokensConsumed: 0,
            costMicros: result.metering.costMicros,
          },
          nextSafeAction: { kind: "review", label: "Review the certified evidence" },
        };
      }
      if (result.metering.costMicros > watch.budgets.maxCostMicrosPerCheck) {
        throw new MatterhornCryptoAppAdapterError("adapter_cost_limit_exceeded");
      }
      const completed = this.#coworkers.completeWatchCheck(watch, {
        checkedAt: completedAt,
        resultHash,
        conditionValues: values,
        inboxItem,
      });
      if (!completed) return "stale";
      return inboxItem ? "alerted" : "completed";
    } catch (error) {
      const completedAt = this.#now();
      const reason = safeExecutionReason(error);
      const completed = this.#coworkers.completeWatchCheck(watch, {
        checkedAt: completedAt,
        resultHash: null,
        conditionValues: null,
        inboxItem: {
          watchId: watch.id,
          kind: "notice",
          severity: "low",
          title: `${watch.name} check did not complete`,
          summary: "Matterhorn could not complete this bounded check. No transaction was prepared or submitted.",
          reasonCodes: [reason],
          source: null,
          budgetImpact: { readCallsConsumed: 1, modelTokensConsumed: 0, costMicros: 0 },
          nextSafeAction: { kind: "review", label: "Review the watch connection" },
        },
      });
      return completed ? "failed" : "stale";
    }
  }
}
