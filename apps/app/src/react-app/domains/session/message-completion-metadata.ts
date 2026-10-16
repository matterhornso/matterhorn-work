import type { UIMessage } from "ai";

type RecordValue = Record<string, unknown>;

export type ResponseCompletionSummary = {
  canContinue: boolean;
  state: "completed" | "incomplete" | "failed" | "stopped" | "step" | "unknown";
  label: string;
  detail: string;
  tokenLabel: string;
  tokenDetail: string;
  durationLabel: string;
  durationDetail: string;
  transaction: {
    state: "none" | "preview" | "chat" | "persisted";
    label: string;
    detail: string;
  };
};

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function messageMetadata(message: UIMessage): RecordValue | null {
  return isRecord(message.metadata) ? message.metadata : null;
}

function opencodeMetadata(message: UIMessage): RecordValue | null {
  const metadata = messageMetadata(message);
  return metadata && isRecord(metadata.opencode) ? metadata.opencode : null;
}

function tokenCount(tokens: RecordValue | null) {
  if (!tokens) return null;
  const explicitTotal = finiteNonNegativeNumber(tokens.total);
  if (explicitTotal !== null) return explicitTotal;

  const input = finiteNonNegativeNumber(tokens.input);
  const output = finiteNonNegativeNumber(tokens.output);
  const reasoning = tokens.reasoning === undefined ? 0 : finiteNonNegativeNumber(tokens.reasoning);
  if (input === null || output === null || reasoning === null) return null;
  const total = input + output + reasoning;
  // OpenCode initializes these counters to zero, including when Stop leaves
  // a partial answer without provider usage. They are not a reported zero.
  return total > 0 ? total : null;
}

function tokenBreakdown(tokens: RecordValue | null) {
  if (!tokens) return "Token usage is unavailable for this response.";
  const input = finiteNonNegativeNumber(tokens.input);
  const output = finiteNonNegativeNumber(tokens.output);
  const reasoning = finiteNonNegativeNumber(tokens.reasoning);
  const cache = isRecord(tokens.cache) ? tokens.cache : null;
  const cacheRead = finiteNonNegativeNumber(cache?.read);
  const cacheWrite = finiteNonNegativeNumber(cache?.write);
  const parts: string[] = [];
  if (input !== null) parts.push(`${input.toLocaleString()} input`);
  if (output !== null) parts.push(`${output.toLocaleString()} output`);
  if (reasoning !== null && reasoning > 0) parts.push(`${reasoning.toLocaleString()} reasoning`);
  if (cacheRead !== null && cacheRead > 0) parts.push(`${cacheRead.toLocaleString()} cache read`);
  if (cacheWrite !== null && cacheWrite > 0) parts.push(`${cacheWrite.toLocaleString()} cache write`);
  const total = finiteNonNegativeNumber(tokens.total);
  if (!parts.length && total !== null) parts.push(`${total.toLocaleString()} total tokens`);
  return parts.length
    ? `Provider-reported usage: ${parts.join(", ")}.`
    : "Token usage is unavailable for this response.";
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) {
    const seconds = milliseconds / 1_000;
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`;
  }
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.round((milliseconds % 60_000) / 1_000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function normalizedMarker(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
}

function visitStructuredValue(
  value: unknown,
  state: { receipt: boolean; preview: boolean; outputPath: boolean },
  depth = 0,
) {
  if (depth > 20 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item) => visitStructuredValue(item, state, depth + 1));
    return;
  }
  if (!isRecord(value)) return;

  const kind = normalizedMarker(value.kind);
  const originalKind = normalizedMarker(value.originalKind);
  const markers = [kind, originalKind].filter(Boolean);
  if (markers.some((marker) => (
    marker === "receipt" ||
    marker === "receipt_status" ||
    marker.endsWith("_receipt") ||
    marker.includes("transaction_receipt") ||
    marker.includes("signing_receipt")
  ))) {
    state.receipt = true;
  }
  if (markers.some((marker) => marker.includes("preview") || marker.includes("signing_handoff") || marker.includes("external_signer_handoff"))) {
    state.preview = true;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizedMarker(key);
    if (
      ["transaction_digest", "transactiondigest", "transaction_hash", "transactionhash", "tx_hash", "txhash", "extrinsic_hash", "extrinsichash"].includes(normalizedKey) &&
      typeof child === "string" &&
      child.trim()
    ) {
      state.receipt = true;
    }
    if (
      ["output_path", "outputpath", "artifact_path", "artifactpath"].includes(normalizedKey) &&
      typeof child === "string" &&
      child.trim()
    ) {
      state.outputPath = true;
    }
    visitStructuredValue(child, state, depth + 1);
  }
}

function transactionSummary(message: UIMessage): ResponseCompletionSummary["transaction"] {
  const state = { receipt: false, preview: false, outputPath: false };
  for (const part of message.parts) {
    if (!("output" in part)) continue;
    visitStructuredValue(part.output, state);
  }

  if (state.receipt && state.outputPath) {
    return {
      state: "persisted",
      label: "Tx receipt · Outputs + Activity",
      detail: "Public transaction receipt metadata is stored in workspace Outputs and indexed in Project Activity. Matterhorn does not store private keys or seed phrases.",
    };
  }
  if (state.receipt) {
    return {
      state: "chat",
      label: "Tx receipt · chat history",
      detail: "A public transaction receipt is recorded in this chat. No workspace output path was reported for this response. Matterhorn does not store private keys or seed phrases.",
    };
  }
  if (state.preview) {
    return {
      state: "preview",
      label: "Preview only · no transaction",
      detail: "This response prepared a review or signing preview. No submitted transaction or transaction receipt is stored for this response.",
    };
  }
  return {
    state: "none",
    label: "No transaction",
    detail: "No transaction was submitted and no transaction receipt is stored for this response.",
  };
}

export function buildOpenCodeMessageMetadata(info: unknown): UIMessage["metadata"] | undefined {
  if (!isRecord(info)) return undefined;
  const time = isRecord(info.time) ? info.time : null;
  const created = finiteNonNegativeNumber(time?.created);
  const completed = finiteNonNegativeNumber(time?.completed);
  const sourceTokens = isRecord(info.tokens) ? info.tokens : null;
  const cache = sourceTokens && isRecord(sourceTokens.cache) ? sourceTokens.cache : null;
  const tokens = sourceTokens && tokenCount(sourceTokens) !== null
    ? {
        ...(finiteNonNegativeNumber(sourceTokens.total) !== null ? { total: finiteNonNegativeNumber(sourceTokens.total) } : {}),
        ...(finiteNonNegativeNumber(sourceTokens.input) !== null ? { input: finiteNonNegativeNumber(sourceTokens.input) } : {}),
        ...(finiteNonNegativeNumber(sourceTokens.output) !== null ? { output: finiteNonNegativeNumber(sourceTokens.output) } : {}),
        ...(finiteNonNegativeNumber(sourceTokens.reasoning) !== null ? { reasoning: finiteNonNegativeNumber(sourceTokens.reasoning) } : {}),
        ...(cache
          ? {
              cache: {
                ...(finiteNonNegativeNumber(cache.read) !== null ? { read: finiteNonNegativeNumber(cache.read) } : {}),
                ...(finiteNonNegativeNumber(cache.write) !== null ? { write: finiteNonNegativeNumber(cache.write) } : {}),
              },
            }
          : {}),
      }
    : null;

  const opencode = {
    ...(typeof info.finish === "string" ? { finish: info.finish } : {}),
    ...(isRecord(info.error) ? { errorName: typeof info.error.name === "string" ? info.error.name : "UnknownError" } : {}),
    ...(created !== null ? { created } : {}),
    ...(completed !== null ? { completed } : {}),
    ...(tokens ? { tokens } : {}),
  };
  return Object.keys(opencode).length ? { opencode } : undefined;
}

export function responseCompletionSummary(message: UIMessage): ResponseCompletionSummary {
  const metadata = opencodeMetadata(message);
  const sourceTokens = metadata && isRecord(metadata.tokens) ? metadata.tokens : null;
  const reportedTokens = tokenCount(sourceTokens);
  // Even an explicit zero can be a placeholder on an interrupted request.
  // A verified, non-error finish is needed before presenting zero as usage.
  const verifiedFinish = ["stop", "length", "tool-calls", "content-filter"].includes(String(metadata?.finish));
  const totalTokens = reportedTokens === 0 && (metadata?.errorName || !verifiedFinish) ? null : reportedTokens;
  const tokens = totalTokens === null ? null : sourceTokens;
  const created = finiteNonNegativeNumber(metadata?.created);
  const completed = finiteNonNegativeNumber(metadata?.completed);
  const duration = created !== null && completed !== null && completed >= created
    ? completed - created
    : null;

  return {
    ...responseOutcome(metadata),
    canContinue: metadata?.finish === "length" && !metadata.errorName && completed !== null,
    tokenLabel: totalTokens === null ? "Tokens unavailable" : `${totalTokens.toLocaleString()} tokens`,
    tokenDetail: tokenBreakdown(tokens),
    durationLabel: duration === null ? "Time unavailable" : formatDuration(duration),
    durationDetail: duration === null
      ? "Response timing was not reported for this message."
      : `Elapsed time from provider request start to completed response: ${formatDuration(duration)}.`,
    transaction: transactionSummary(message),
  };
}

function responseOutcome(metadata: RecordValue | null): Pick<ResponseCompletionSummary, "state" | "label" | "detail"> {
  if (metadata?.errorName === "MessageAbortedError") {
    return { state: "stopped", label: "Stopped", detail: "Generation stopped. Any partial answer is preserved." };
  }
  if (metadata?.errorName) return { state: "failed", label: "Failed", detail: "The model could not finish this response." };
  if (metadata?.finish === "length") {
    return { state: "incomplete", label: "Incomplete", detail: "The model reached its output limit before finishing." };
  }
  if (metadata?.finish === "stop") return { state: "completed", label: "Completed", detail: "The model finished this response." };
  if (metadata?.finish === "tool-calls") return { state: "step", label: "Tool step", detail: "This tool step is not the final answer." };
  if (metadata?.finish === "content-filter") {
    return { state: "incomplete", label: "Incomplete", detail: "The provider stopped this response because of its content policy." };
  }
  return { state: "unknown", label: "Completion unverified", detail: "The provider did not report a verified final completion state." };
}
