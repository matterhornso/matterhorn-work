/**
 * Security audit log for wallet actions.
 * Persisted to localStorage — keyed by session for visibility.
 */

export type WalletSafetyReviewTrail = {
  reviewed: {
    chainId: number;
    to: string;
    value: string;
    valueUSD: number;
    dataSelector?: string | null;
    displayValue?: string | null;
    proposedBy?: string | null;
  };
  submitted?: {
    chainId: number;
    to: string;
    value: string;
    dataSelector?: string | null;
    txHash?: string | null;
  } | null;
};

export type SecurityLogEntry = {
  timestamp: number;
  action:
    | "tx_proposed"
    | "tx_approved"
    | "tx_rejected"
    | "chain_mismatch"
    | "mainnet_blocked"
    | "wallet_unavailable"
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
  txHash?: string | null;
  review?: WalletSafetyReviewTrail | null;
};

const SECURITY_LOG_KEY = "matterhorn:wallet:securityLog";
const SECURITY_LOG_UPDATED_EVENT = "matterhorn:wallet:security-log-updated";
const MAX_ENTRIES = 50;
const SECURITY_LOG_ACTIONS = new Set<SecurityLogEntry["action"]>([
  "tx_proposed",
  "tx_approved",
  "tx_rejected",
  "chain_mismatch",
  "mainnet_blocked",
  "wallet_unavailable",
  "limit_hit",
  "whitelist_denied",
  "rate_limit_hit",
  "simulation_failed",
  "countdown_expired",
]);

type SecurityLogReporter = {
  workspaceId: string;
  report: (entry: SecurityLogEntry) => Promise<void> | void;
};

let securityLogReporter: SecurityLogReporter | null = null;

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
    typeof e.action === "string" &&
    SECURITY_LOG_ACTIONS.has(e.action as SecurityLogEntry["action"])
  );
}

export function appendSecurityLog(entry: SecurityLogEntry): void {
  const log = readLog();
  log.unshift(entry);
  writeLog(log);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SECURITY_LOG_UPDATED_EVENT, { detail: { entry } }));
  }
  const reporter = securityLogReporter;
  if (reporter?.workspaceId) {
    void Promise.resolve(reporter.report(entry)).catch(() => {
      // Safety ledger reporting must never block or leak details into the UI.
    });
  }
}

export function getSecurityLog(limit = 5): SecurityLogEntry[] {
  return readLog().slice(0, limit);
}

export function subscribeSecurityLog(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (event.key === SECURITY_LOG_KEY) listener();
  };
  window.addEventListener(SECURITY_LOG_UPDATED_EVENT, listener);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(SECURITY_LOG_UPDATED_EVENT, listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function configureSecurityLogReporter(reporter: SecurityLogReporter | null): () => void {
  securityLogReporter = reporter;
  return () => {
    if (securityLogReporter === reporter) {
      securityLogReporter = null;
    }
  };
}
