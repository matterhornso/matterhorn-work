import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  BittensorWalletSnapshot,
  BittensorWalletTimelineExport,
  BittensorWalletTimelineSnapshot,
  BittensorWalletTimelineStoreStatus,
} from "./tools/bittensor.js";
import {
  buildBittensorWalletTimelineSnapshot,
  validateBittensorWalletTimelineSnapshot,
} from "./tools/bittensor.js";

type StoredTimeline = {
  version: "matterhorn.bittensor.workspace-wallet-timeline.v1";
  workspaceId: string;
  snapshots: BittensorWalletTimelineSnapshot[];
  updatedAt: string;
};

const mutationQueues = new Map<string, Promise<void>>();

export class BittensorWalletTimelineIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BittensorWalletTimelineIntegrityError";
  }
}

function retentionLimit(): number {
  const parsed = Number(process.env.BITTENSOR_WALLET_TIMELINE_RETENTION_LIMIT);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(365, Math.max(2, Math.floor(parsed))) : 24;
}

function emptyTimeline(workspaceId: string, now = new Date()): StoredTimeline {
  return {
    version: "matterhorn.bittensor.workspace-wallet-timeline.v1",
    workspaceId,
    snapshots: [],
    updatedAt: now.toISOString(),
  };
}

function storePath(workspacePath: string): string {
  return join(workspacePath, ".matterhorn-work", "bittensor", "wallet-timeline.json");
}

async function withTimelineMutation<T>(workspacePath: string, mutation: () => Promise<T>): Promise<T> {
  const key = storePath(workspacePath);
  const previous = mutationQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.catch(() => undefined).then(() => current);
  mutationQueues.set(key, queued);
  await previous.catch(() => undefined);
  try {
    return await mutation();
  } finally {
    release();
    if (mutationQueues.get(key) === queued) mutationQueues.delete(key);
  }
}

async function readTimeline(workspaceId: string, workspacePath: string): Promise<StoredTimeline> {
  const path = storePath(workspacePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyTimeline(workspaceId);
    throw new BittensorWalletTimelineIntegrityError("The workspace wallet timeline could not be read safely.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BittensorWalletTimelineIntegrityError("The workspace wallet timeline has an invalid envelope.");
  }
  const record = parsed as Partial<StoredTimeline>;
  if (
    record.version !== "matterhorn.bittensor.workspace-wallet-timeline.v1"
    || record.workspaceId !== workspaceId
    || !Array.isArray(record.snapshots)
  ) {
    throw new BittensorWalletTimelineIntegrityError("The workspace wallet timeline belongs to another workspace or version.");
  }
  const validSnapshots = record.snapshots.filter((snapshot): snapshot is BittensorWalletTimelineSnapshot => (
    Boolean(snapshot) && validateBittensorWalletTimelineSnapshot(snapshot as BittensorWalletTimelineSnapshot).ok
  ));
  if (validSnapshots.length !== record.snapshots.length) {
    throw new BittensorWalletTimelineIntegrityError("The workspace wallet timeline failed snapshot integrity validation.");
  }
  return {
    version: record.version,
    workspaceId,
    snapshots: validSnapshots,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
  };
}

async function writeTimeline(workspacePath: string, value: StoredTimeline): Promise<void> {
  const path = storePath(workspacePath);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

function publicStatus(value: StoredTimeline): BittensorWalletTimelineStoreStatus {
  return {
    kind: "wallet_timeline_store_status",
    enabled: true,
    path: null,
    walletCount: new Set(value.snapshots.map((snapshot) => snapshot.ss58Address)).size,
    snapshotCount: value.snapshots.length,
    retentionLimit: retentionLimit(),
    warnings: ["Wallet history is isolated to this workspace and contains public watch-only snapshots only."],
    updatedAt: value.updatedAt,
  };
}

export class MatterhornBittensorWalletTimelineStore {
  constructor(
    private readonly workspaceId: string,
    private readonly workspacePath: string,
  ) {}

  async status(): Promise<BittensorWalletTimelineStoreStatus> {
    return publicStatus(await readTimeline(this.workspaceId, this.workspacePath));
  }

  async capture(wallet: BittensorWalletSnapshot, now = new Date()): Promise<BittensorWalletTimelineSnapshot> {
    return withTimelineMutation(this.workspacePath, async () => {
      const current = await readTimeline(this.workspaceId, this.workspacePath);
      const snapshot = buildBittensorWalletTimelineSnapshot(wallet, now.toISOString());
      if (!validateBittensorWalletTimelineSnapshot(snapshot).ok) {
        throw new BittensorWalletTimelineIntegrityError("The public wallet snapshot failed validation.");
      }
      const otherWallets = current.snapshots.filter((item) => item.ss58Address !== snapshot.ss58Address);
      const sameWallet = current.snapshots
        .filter((item) => item.ss58Address === snapshot.ss58Address)
        .concat(snapshot)
        .slice(-retentionLimit());
      const next: StoredTimeline = {
        ...current,
        snapshots: [...otherWallets, ...sameWallet].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)),
        updatedAt: now.toISOString(),
      };
      await writeTimeline(this.workspacePath, next);
      return snapshot;
    });
  }

  async export(ss58Address?: string | null, now = new Date()): Promise<BittensorWalletTimelineExport> {
    const current = await readTimeline(this.workspaceId, this.workspacePath);
    const snapshots = ss58Address
      ? current.snapshots.filter((snapshot) => snapshot.ss58Address === ss58Address)
      : current.snapshots;
    return {
      kind: "wallet_timeline_export",
      generatedAt: now.toISOString(),
      ss58Address: ss58Address ?? null,
      status: publicStatus(current),
      snapshots,
      warnings: ["This export contains public watch-only wallet data from this workspace only."],
    };
  }

  async clear(ss58Address: string, now = new Date()): Promise<{ cleared: number; previousUpdatedAt: string | null }> {
    return withTimelineMutation(this.workspacePath, async () => {
      const current = await readTimeline(this.workspaceId, this.workspacePath);
      const matching = current.snapshots.filter((snapshot) => snapshot.ss58Address === ss58Address);
      const next: StoredTimeline = {
        ...current,
        snapshots: current.snapshots.filter((snapshot) => snapshot.ss58Address !== ss58Address),
        updatedAt: now.toISOString(),
      };
      await writeTimeline(this.workspacePath, next);
      return {
        cleared: matching.length,
        previousUpdatedAt: matching.at(-1)?.capturedAt ?? null,
      };
    });
  }

  async purge(): Promise<void> {
    await rm(storePath(this.workspacePath), { force: true });
  }
}
