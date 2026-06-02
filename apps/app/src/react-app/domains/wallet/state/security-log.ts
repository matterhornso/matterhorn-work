/**
 * Security audit log for wallet actions.
 * Persisted to localStorage — keyed by session for visibility.
 */

export type SecurityLogEntry = {
  timestamp: number;
  action:
    | "tx_proposed"
    | "tx_approved"
    | "tx_rejected"
    | "limit_hit"
    | "whitelist_denied"
    | "rate_limit_hit"
    | "simulation_failed"
    | "countdown_expired";
  chainId: number;
  to: string;
  valueUSD: number;
  riskLevel: "low" | "medium" | "high";
  reason: string;
};

const SECURITY_LOG_KEY = "matterhorn:wallet:securityLog";
const MAX_ENTRIES = 50;

function readLog(): SecurityLogEntry[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(SECURITY_LOG_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown[];
    return parsed.filter(isSecurityLogEntry);
  } catch {
    return [];
  }
}

function writeLog(entries: SecurityLogEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SECURITY_LOG_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

function isSecurityLogEntry(v: unknown): v is SecurityLogEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.timestamp === "number" &&
    typeof e.chainId === "number" &&
    typeof e.to === "string" &&
    typeof e.valueUSD === "number" &&
    typeof e.riskLevel === "string" &&
    typeof e.reason === "string" &&
    typeof e.action === "string"
  );
}

export function appendSecurityLog(entry: SecurityLogEntry): void {
  const log = readLog();
  log.unshift(entry);
  writeLog(log);
}

export function getSecurityLog(limit = 5): SecurityLogEntry[] {
  return readLog().slice(0, limit);
}
