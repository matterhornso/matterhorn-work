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

test("SES responses without message identity stay queued instead of being marked delivered", async () => {
  for (const messageId of [undefined, "", "   "]) {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-email-ack-"));
    roots.push(root);
    const store = new MatterhornAuthStore(join(root, "accounts.db"));
    try {
      store.createAccountOrQueueVerification({ email: "ack@example.com", password: "matterhorn-ack-password" });
      const result = await drainMatterhornEmailOutbox({
        authStore: store, config: {},
        deliver: async () => ({ provider: "ses", messageId }),
      });
      expect(result).toEqual({ accepted: 0, deferred: 1 });
      expect(store.emailOutboxStatus()).toEqual({ pending: 1, terminal: 0, suppressed: 0 });
      const [retry] = store.claimDueEmailOutbox(1, Date.now() + 120_000);
      expect(retry?.template).toBe("verification");
      expect(retry?.props.verificationCode).toMatch(/^\d{6}$/);
    } finally {
      store.close();
    }
  }
});

test("console delivery can finish locally without a provider message ID", async () => {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-email-console-"));
  roots.push(root);
  const store = new MatterhornAuthStore(join(root, "accounts.db"));
  try {
    store.createAccountOrQueueVerification({ email: "console@example.com", password: "matterhorn-console-password" });
    expect(await drainMatterhornEmailOutbox({
      authStore: store, config: { consoleMode: true },
      deliver: async () => ({ provider: "console" }),
    })).toEqual({ accepted: 1, deferred: 0 });
    expect(store.emailOutboxStatus()).toEqual({ pending: 0, terminal: 0, suppressed: 0 });
  } finally {
    store.close();
  }
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
