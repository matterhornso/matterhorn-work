import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import {
  BittensorWalletTimelineIntegrityError,
  MatterhornBittensorWalletTimelineStore,
} from "./bittensor-wallet-timeline-store.js";
import type { BittensorWalletSnapshot } from "./tools/bittensor.js";

function wallet(address: string, balance: number): BittensorWalletSnapshot {
  return {
    ss58Address: address,
    taoBalance: balance,
    stakePositions: [],
    estimatedValueTao: balance,
    providerStatus: "ok",
    updatedAt: "2026-08-20T10:00:00.000Z",
    source: "test",
    block: 42,
    freshness: "live",
    warnings: [],
  };
}

describe("workspace Bittensor wallet timeline", () => {
  test("isolates capture, export and clear by workspace and hides the filesystem path", async () => {
    const root = await mkdtemp(join(tmpdir(), "matterhorn-bittensor-timeline-"));
    const address = "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF";
    const first = new MatterhornBittensorWalletTimelineStore("ws_a", join(root, "a"));
    const second = new MatterhornBittensorWalletTimelineStore("ws_b", join(root, "b"));

    await first.capture(wallet(address, 1), new Date("2026-08-20T10:00:00.000Z"));
    await first.capture(wallet(address, 2), new Date("2026-08-20T10:01:00.000Z"));
    expect((await first.export()).snapshots).toHaveLength(2);
    expect((await second.export()).snapshots).toHaveLength(0);
    expect((await first.status()).path).toBeNull();

    expect(await first.clear(address)).toMatchObject({ cleared: 2 });
    expect((await first.export()).snapshots).toHaveLength(0);
  });

  test("rejects a copied store whose workspace binding does not match", async () => {
    const root = await mkdtemp(join(tmpdir(), "matterhorn-bittensor-timeline-copy-"));
    const address = "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF";
    const firstRoot = join(root, "a");
    const secondRoot = join(root, "b");
    const first = new MatterhornBittensorWalletTimelineStore("ws_a", firstRoot);
    await first.capture(wallet(address, 1));
    const relative = join(".matterhorn-work", "bittensor", "wallet-timeline.json");
    const source = await readFile(join(firstRoot, relative));
    await mkdir(dirname(join(secondRoot, relative)), { recursive: true });
    await writeFile(join(secondRoot, relative), source);

    const second = new MatterhornBittensorWalletTimelineStore("ws_b", secondRoot);
    await expect(second.export()).rejects.toBeInstanceOf(BittensorWalletTimelineIntegrityError);
  });

  test("serializes simultaneous captures without dropping workspace history", async () => {
    const root = await mkdtemp(join(tmpdir(), "matterhorn-bittensor-timeline-concurrent-"));
    const address = "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF";
    const store = new MatterhornBittensorWalletTimelineStore("ws_concurrent", root);
    await Promise.all([
      store.capture(wallet(address, 1), new Date("2026-08-20T10:00:00.000Z")),
      store.capture(wallet(address, 2), new Date("2026-08-20T10:00:01.000Z")),
    ]);
    expect((await store.export()).snapshots).toHaveLength(2);
  });
});
