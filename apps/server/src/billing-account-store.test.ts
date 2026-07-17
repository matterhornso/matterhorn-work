import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MatterhornBillingAccountStore,
  type MatterhornBillingAccountSnapshot,
} from "./billing-account-store.js";
import { buildMatterhornBillingSubscription } from "./billing.js";

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-billing-store-"));
  roots.push(root);
  const store = new MatterhornBillingAccountStore({
    workspaceRoot: root,
    workspaceId: "ws_billing_store",
  });
  const now = new Date().toISOString();
  const snapshot: MatterhornBillingAccountSnapshot = {
    version: "matterhorn.billing.account.v1",
    workspaceId: "ws_billing_store",
    subscription: buildMatterhornBillingSubscription("free"),
    updatedAt: now,
    source: "stripe_test_checkout",
    processedProviderEventIds: [],
  };
  await store.save(snapshot);
  return { root, store };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("MatterhornBillingAccountStore", () => {
  test("serializes concurrent mutations without dropping provider event ids", async () => {
    const { store } = await fixture();

    await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        store.mutate((current) => ({
          snapshot: current
            ? {
                ...current,
                updatedAt: new Date().toISOString(),
                processedProviderEventIds: [
                  ...(current.processedProviderEventIds ?? []),
                  `evt_${index}`,
                ],
              }
            : undefined,
          result: undefined,
        })),
      ),
    );

    const saved = await store.get();
    expect(saved?.processedProviderEventIds).toHaveLength(30);
    expect(new Set(saved?.processedProviderEventIds).size).toBe(30);
  });

  test("writes subscription state atomically with owner-only permissions", async () => {
    const { root, store } = await fixture();
    const saved = await store.get();

    expect(saved?.workspaceId).toBe("ws_billing_store");
    if (process.platform === "win32") return;
    expect(
      (await stat(join(root, ".matterhorn-work", "billing", "subscription.json"))).mode & 0o777,
    ).toBe(0o600);
  });
});
