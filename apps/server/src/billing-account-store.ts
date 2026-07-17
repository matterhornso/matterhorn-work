import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  MatterhornBillingAccountSource,
  MatterhornBillingPendingCheckout,
  MatterhornBillingSubscription,
} from "@matterhorn-work/types/billing";
import { exists } from "./utils.js";

export interface MatterhornBillingAccountSnapshot {
  version: "matterhorn.billing.account.v1";
  workspaceId: string;
  subscription: MatterhornBillingSubscription;
  pendingCheckout?: MatterhornBillingPendingCheckout | null;
  updatedAt: string;
  source: Exclude<MatterhornBillingAccountSource, "env_default">;
  lastProviderEventId?: string | null;
  lastProviderEventType?: string | null;
  lastProviderEventCreatedAt?: string | null;
  lastProviderSyncedAt?: string | null;
  processedProviderEventIds?: string[];
}

export interface BillingAccountStoreOptions {
  workspaceRoot: string;
  workspaceId: string;
}

export interface BillingAccountMutation<T> {
  snapshot?: MatterhornBillingAccountSnapshot | null;
  result: T;
}

const billingMutationQueues = new Map<string, Promise<void>>();

async function withBillingMutationLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = billingMutationQueues.get(key) ?? Promise.resolve();
  let release = () => {};
  const ticket = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => ticket);
  billingMutationQueues.set(key, queued);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (billingMutationQueues.get(key) === queued) billingMutationQueues.delete(key);
  }
}

function billingDir(workspaceRoot: string): string {
  const overridePath = process.env.MATTERHORN_BILLING_ACCOUNT_PATH?.trim();
  if (overridePath) return dirname(resolve(overridePath));
  return join(workspaceRoot, ".matterhorn-work", "billing");
}

function billingAccountPath(workspaceRoot: string): string {
  const overridePath = process.env.MATTERHORN_BILLING_ACCOUNT_PATH?.trim();
  if (overridePath) return resolve(overridePath);
  return join(billingDir(workspaceRoot), "subscription.json");
}

export function matterhornBillingAccountPath(workspaceRoot: string): string {
  return billingAccountPath(workspaceRoot);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSnapshot(value: unknown, workspaceId: string): MatterhornBillingAccountSnapshot | null {
  if (!isObject(value)) return null;
  if (value.version !== "matterhorn.billing.account.v1") return null;
  if (value.workspaceId !== workspaceId) return null;
  if (!isObject(value.subscription)) return null;
  if (
    value.pendingCheckout !== undefined &&
    value.pendingCheckout !== null &&
    !isObject(value.pendingCheckout)
  ) {
    return null;
  }
  if (value.source !== "mock_checkout" && value.source !== "stripe_test_checkout" && value.source !== "stripe_test_webhook") return null;
  if (typeof value.updatedAt !== "string") return null;
  return value as unknown as MatterhornBillingAccountSnapshot;
}

export class MatterhornBillingAccountStore {
  private workspaceRoot: string;
  private workspaceId: string;

  constructor(options: BillingAccountStoreOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.workspaceId = options.workspaceId;
  }

  async ensureDir(): Promise<void> {
    await mkdir(billingDir(this.workspaceRoot), { recursive: true });
  }

  async get(): Promise<MatterhornBillingAccountSnapshot | null> {
    return this.getUnlocked();
  }

  async save(snapshot: MatterhornBillingAccountSnapshot): Promise<void> {
    const path = billingAccountPath(this.workspaceRoot);
    await withBillingMutationLock(path, () => this.saveUnlocked(snapshot));
  }

  async mutate<T>(
    mutation: (
      current: MatterhornBillingAccountSnapshot | null,
    ) => BillingAccountMutation<T> | Promise<BillingAccountMutation<T>>,
  ): Promise<T> {
    const path = billingAccountPath(this.workspaceRoot);
    return withBillingMutationLock(path, async () => {
      const current = await this.getUnlocked();
      const next = await mutation(current);
      if (next.snapshot === null) {
        await rm(path, { force: true });
      } else if (next.snapshot !== undefined) {
        await this.saveUnlocked(next.snapshot);
      }
      return next.result;
    });
  }

  async delete(): Promise<boolean> {
    const path = billingAccountPath(this.workspaceRoot);
    return withBillingMutationLock(path, async () => {
      const existed = await exists(path);
      await rm(path, { force: true });
      return existed;
    });
  }

  private async getUnlocked(): Promise<MatterhornBillingAccountSnapshot | null> {
    const path = billingAccountPath(this.workspaceRoot);
    if (!(await exists(path))) return null;
    try {
      return parseSnapshot(JSON.parse(await readFile(path, "utf8")), this.workspaceId);
    } catch {
      return null;
    }
  }

  private async saveUnlocked(snapshot: MatterhornBillingAccountSnapshot): Promise<void> {
    await this.ensureDir();
    const path = billingAccountPath(this.workspaceRoot);
    const tempPath = join(
      dirname(path),
      `.subscription.${process.pid}.${Date.now()}.${randomUUID()}.tmp`,
    );
    try {
      await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      await rename(tempPath, path);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }
  }
}
