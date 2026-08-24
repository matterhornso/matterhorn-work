import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const MATTERHORN_HOST_BACKUP_VERSION = "matterhorn.host-recovery.v1";
export const DEFAULT_HOST_BACKUP_MAX_AGE_MS = 36 * 60 * 60 * 1_000;

type HostBackupMarker = {
  version?: unknown;
  capturedAt?: unknown;
  sha256?: unknown;
};

function configuredMaxAgeMs(): number {
  const value = Number(process.env.MATTERHORN_HOST_BACKUP_MAX_AGE_HOURS ?? "36");
  if (!Number.isFinite(value) || value < 1 || value > 168) return DEFAULT_HOST_BACKUP_MAX_AGE_MS;
  return value * 60 * 60 * 1_000;
}

export function hostBackupFresh(input: {
  dataRoot?: string;
  now?: number;
  maxAgeMs?: number;
} = {}): boolean {
  const dataRoot = resolve(input.dataRoot ?? process.env.MATTERHORN_WORK_DATA_DIR ?? ".");
  const now = input.now ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? configuredMaxAgeMs();
  try {
    const marker = JSON.parse(
      readFileSync(join(dataRoot, "backups", "last-success.json"), "utf8"),
    ) as HostBackupMarker;
    if (marker.version !== MATTERHORN_HOST_BACKUP_VERSION) return false;
    if (typeof marker.capturedAt !== "string") return false;
    if (typeof marker.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(marker.sha256)) return false;
    const capturedAt = Date.parse(marker.capturedAt);
    if (!Number.isFinite(capturedAt) || capturedAt > now + 5 * 60 * 1_000) return false;
    return now - capturedAt <= maxAgeMs;
  } catch {
    return false;
  }
}
