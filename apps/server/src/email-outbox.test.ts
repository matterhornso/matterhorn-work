import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MatterhornAuthStore } from "./auth-store.js";
import { drainMatterhornEmailOutbox } from "./email-outbox.js";

const roots: string[] = [];

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

test("a simulated SES outage preserves the committed account and retries the same outbox item", async () => {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-email-outage-"));
  roots.push(root);
  const path = join(root, "accounts.db");
  const store = new MatterhornAuthStore(path);
  const signup = store.createAccountOrQueueVerification({
    email: "outage@example.com",
    password: "matterhorn-outage-password",
  });

  const outage = await drainMatterhornEmailOutbox({
    authStore: store,
    config: { from: "updates@example.com" },
    deliver: async () => {
      throw new Error("simulated outage");
    },
  });
  expect(outage).toEqual({ accepted: 0, deferred: 1 });
  expect(store.accountCount()).toBe(1);

  const db = new Database(path);
  db.query("UPDATE email_outbox SET next_attempt_at = 0").run();
  db.close();
  const accepted = await drainMatterhornEmailOutbox({
    authStore: store,
    config: { from: "updates@example.com" },
    deliver: async (input) => {
      expect(input.template).toBe("verification");
      expect(input.to).toBe("outage@example.com");
      return { provider: "ses", messageId: "ses-recovered" };
    },
  });
  expect(accepted).toEqual({ accepted: 1, deferred: 0 });
  expect(store.emailOutboxStatus().pending).toBe(1);
  store.markSesDelivery("ses-recovered");
  expect(store.emailOutboxStatus()).toEqual({ pending: 0, terminal: 0, suppressed: 0 });
  expect(signup).toMatchObject({ verificationRequired: true, accountCreated: true });
  store.close();
});
