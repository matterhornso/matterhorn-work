import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MatterhornBillingSubscription } from "@matterhorn-work/types/billing";
import { exists } from "./utils.js";

export interface MatterhornBillingAccountSnapshot {
  version: "matterhorn.billing.account.v1";
  workspaceId: string;
  subscription: MatterhornBillingSubscription;
  updatedAt: string;
  source: "mock_checkout" | "stripe_test_checkout" | "stripe_test_webhook";
}

export interface BillingAccountStoreOptions {
  workspaceRoot: string;
  workspaceId: string;
}

function billingDir(workspaceRoot: string): string {
  return join(workspaceRoot, ".matterhorn-work", "billing");
}

function billingAccountPath(workspaceRoot: string): string {
  return join(billingDir(workspaceRoot), "subscription.json");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSnapshot(value: unknown, workspaceId: string): MatterhornBillingAccountSnapshot | null {
  if (!isObject(value)) return null;
  if (value.version !== "matterhorn.billing.account.v1") return null;
  if (value.workspaceId !== workspaceId) return null;
  if (!isObject(value.subscription)) return null;
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
}
