import type { UIMessage } from "ai";

type RecordValue = Record<string, unknown>;

export type ResponseCompletionSummary = {
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

  const values = [tokens.input, tokens.output, tokens.reasoning]
    .map(finiteNonNegativeNumber)
    .filter((value): value is number => value !== null);
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0);
}

function tokenBreakdown(tokens: RecordValue | null) {
  if (!tokens) return "Token usage was not reported by the selected model provider.";
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
  return parts.length
    ? `Provider-reported usage: ${parts.join(", ")}.`
    : "Token usage was not reported by the selected model provider.";
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
  const tokens = sourceTokens
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
    ...(created !== null ? { created } : {}),
    ...(completed !== null ? { completed } : {}),
    ...(tokens ? { tokens } : {}),
  };
  return Object.keys(opencode).length ? { opencode } : undefined;
}

export function responseCompletionSummary(message: UIMessage): ResponseCompletionSummary {
  const metadata = opencodeMetadata(message);
  const tokens = metadata && isRecord(metadata.tokens) ? metadata.tokens : null;
  const totalTokens = tokenCount(tokens);
  const created = finiteNonNegativeNumber(metadata?.created);
  const completed = finiteNonNegativeNumber(metadata?.completed);
  const duration = created !== null && completed !== null && completed >= created
    ? completed - created
    : null;

  return {
    tokenLabel: totalTokens === null ? "Tokens unavailable" : `${totalTokens.toLocaleString()} tokens`,
    tokenDetail: tokenBreakdown(tokens),
    durationLabel: duration === null ? "Time unavailable" : formatDuration(duration),
    durationDetail: duration === null
      ? "Response timing was not reported for this message."
      : `Elapsed time from provider request start to completed response: ${formatDuration(duration)}.`,
    transaction: transactionSummary(message),
  };
}
