import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
    const path = billingAccountPath(this.workspaceRoot);
    if (!(await exists(path))) return null;
    try {
      return parseSnapshot(JSON.parse(await readFile(path, "utf8")), this.workspaceId);
    } catch {
      return null;
    }
  }

  async save(snapshot: MatterhornBillingAccountSnapshot): Promise<void> {
    await this.ensureDir();
    await writeFile(billingAccountPath(this.workspaceRoot), JSON.stringify(snapshot, null, 2), "utf8");
  }

  async delete(): Promise<boolean> {
    const path = billingAccountPath(this.workspaceRoot);
    const existed = await exists(path);
    await rm(path, { force: true });
    return existed;
  }
}
