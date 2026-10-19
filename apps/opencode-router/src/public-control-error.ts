import type { SendMessageResult } from "./health.js";

const PUBLIC_ERRORS = {
  invalid_json: { status: 400, message: "Request body must be a JSON object." },
  invalid_channel: { status: 400, message: "Invalid channel" },
  reserved_identity: { status: 400, message: "identity id 'env' is reserved" },
  reserved_identity_delete: { status: 400, message: "env identity cannot be deleted" },
  token_required: { status: 400, message: "token is required" },
  slack_tokens_required: { status: 400, message: "botToken and appToken are required" },
  pairing_required: { status: 400, message: "pairingCodeHash is required when Telegram access is private" },
  invalid_peer: { status: 400, message: "Telegram requires a numeric chat_id for direct targets. Usernames like @name cannot be used as peerId." },
  directory_required: { status: 400, message: "Directory is required." },
  outside_workspace: { status: 400, message: "Directory must stay within workspace root." },
  file_outside_workspace: { status: 400, message: "File path must stay within the active workspace." },
  file_required: { status: 400, message: "filePath is required" },
  file_unavailable: { status: 404, message: "File not found." },
  not_regular_file: { status: 400, message: "Not a file." },
  payload_too_large: { status: 413, message: "File exceeds maximum allowed size." },
  message_required: { status: 400, message: "text or parts is required" },
  target_required: { status: 400, message: "directory or peerId is required" },
  binding_required: { status: 400, message: "peerId and directory are required" },
  peer_required: { status: 400, message: "peerId is required" },
};

export type RouterPublicErrorCode = keyof typeof PUBLIC_ERRORS;
const publicCodes = new WeakMap<object, RouterPublicErrorCode>();

export const ROUTER_CONTROL_FAILURE = "Router control request failed. Check local router diagnostics.";
export const ROUTER_ADAPTER_START_FAILURE = "Messaging adapter could not start. Check local router diagnostics.";

export function createRouterPublicError(code: RouterPublicErrorCode): Error {
  const error = new Error(PUBLIC_ERRORS[code].message);
  Object.defineProperty(error, "status", { value: PUBLIC_ERRORS[code].status });
  publicCodes.set(error, code);
  return error;
}

function ownValue(value: unknown, key: string): unknown {
  try {
    return typeof value === "object" && value !== null
      ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
  } catch {
    return undefined;
  }
}

export function publicRouterFailure(error: unknown): { status: number; message: string } {
  const code = typeof error === "object" && error !== null ? publicCodes.get(error) : undefined;
  if (code) return { ...PUBLIC_ERRORS[code] };
  // Compatibility for existing validation errors: return the constant, never
  // arbitrary exception text, custom toString, getters, cause, or status.
  const message = ownValue(error, "message");
  const known = Object.values(PUBLIC_ERRORS).find(entry => entry.message === message);
  return known ? { ...known } : { status: 500, message: ROUTER_CONTROL_FAILURE };
}

export function parseControlJson(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    if (isRecord(value)) return value;
  } catch {
    // A parser error may contain submitted credentials; it is not public text.
  }
  throw createRouterPublicError("invalid_json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DIAGNOSTIC_CODES = ["EACCES", "ENOENT", "EPERM", "ENOSPC", "EIO", "ENOTDIR", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "SQLITE_BUSY", "SQLITE_CORRUPT"];

export function routerFailureDiagnostic(error: unknown): { kind: string; code?: string } {
  try {
    const kind = error instanceof SyntaxError ? "SyntaxError" : error instanceof TypeError ? "TypeError"
      : error instanceof Error ? "Error" : "unknown";
    const candidate = ownValue(error, "code");
    const code = DIAGNOSTIC_CODES.find(value => value === candidate);
    return code ? { kind, code } : { kind };
  } catch {
    return { kind: "unknown" };
  }
}

export function publicIdentityResult<T extends { error?: string }>(result: T): T {
  return result.error === undefined ? result : { ...result, error: ROUTER_ADAPTER_START_FAILURE };
}

const DELIVERY_MESSAGES = new Map([
  ["auth", "Messaging authentication failed."],
  ["forbidden", "Messaging delivery is not permitted."],
  ["not_found", "Messaging target was not found."],
  ["invalid_target", "Messaging target is invalid."],
  ["rate_limited", "Messaging delivery was rate limited."],
  ["payload_too_large", "Messaging attachment is too large."],
  ["unsupported_media", "Messaging attachment is not supported."],
  ["network", "Messaging service is unavailable."],
  ["timeout", "Messaging delivery timed out."],
]);
const SAFE_DELIVERY_MESSAGES = ["Adapter not running", "Invalid Telegram peerId binding removed (expected numeric chat_id)"];

function publicDeliveryMessage(message: unknown, code?: string): string {
  return SAFE_DELIVERY_MESSAGES.find(value => value === message)
    ?? DELIVERY_MESSAGES.get(code ?? "") ?? "Message delivery failed.";
}

export function publicSendResult(result: SendMessageResult): SendMessageResult {
  return {
    ...result,
    ...(result.failures ? { failures: result.failures.map(failure => {
      const target = result.targets?.find(item => item.identityId === failure.identityId && item.peerId === failure.peerId);
      const code = target?.partResults.find(part => !part.sent)?.code;
      return { ...failure, error: publicDeliveryMessage(failure.error, code) };
    }) } : {}),
    ...(result.targets ? { targets: result.targets.map(target => ({
      ...target,
      partResults: target.partResults.map(part => part.error === undefined ? part : {
        ...part, error: publicDeliveryMessage(part.error, part.code),
      }),
    })) } : {}),
  };
}
