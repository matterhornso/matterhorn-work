export type RuntimeServiceName = "openwork-server" | "opencode" | "opencode-router";

export type RuntimeUpgradeState = {
  status: "idle" | "running" | "failed";
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  operationId: string | null;
  services: RuntimeServiceName[];
};

export type RuntimeUpgradePhase =
  | "validate"
  | "install-openwork-server"
  | "install-opencode-router"
  | "resolve-openwork-server"
  | "resolve-opencode"
  | "resolve-opencode-router"
  | "restart-opencode"
  | "restart-opencode-router"
  | "restart-openwork-server";

export const RUNTIME_UPGRADE_FAILURE_MESSAGE = "Runtime upgrade failed. Check local orchestrator diagnostics.";

export function startRuntimeUpgrade(
  services: RuntimeServiceName[],
  operationId: string,
  now: number,
): RuntimeUpgradeState {
  return {
    status: "running",
    startedAt: now,
    finishedAt: null,
    error: null,
    operationId,
    services: [...services],
  };
}

export function failRuntimeUpgrade(state: RuntimeUpgradeState, now: number): RuntimeUpgradeState {
  return { ...state, status: "failed", finishedAt: now, error: RUNTIME_UPGRADE_FAILURE_MESSAGE };
}

const LOCAL_ERROR_CODES = [
  "EACCES", "ENOENT", "EPERM", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT",
  "EADDRINUSE", "ENOSPC", "EIO", "ENOTDIR", "ERR_INVALID_ARG_TYPE",
  "ERR_INVALID_ARG_VALUE", "ABORT_ERR",
];

// Keep useful local categories without serializing arbitrary exception text,
// stacks, subprocess output, URLs, credentials, custom names or toString hooks.
export function runtimeUpgradeFailureDiagnostic(error: unknown): { kind: string; code?: string } {
  try {
    const kind = error instanceof TypeError ? "TypeError" : error instanceof RangeError ? "RangeError"
      : error instanceof SyntaxError ? "SyntaxError" : error instanceof Error ? "Error" : "unknown";
    const candidate = typeof error === "object" && error !== null
      ? Object.getOwnPropertyDescriptor(error, "code")?.value : undefined;
    const code = LOCAL_ERROR_CODES.find(value => value === candidate);
    return code ? { kind, code } : { kind };
  } catch {
    return { kind: "unknown" };
  }
}
