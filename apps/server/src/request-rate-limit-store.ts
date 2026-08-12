import type {
  RequestRateLimitConsumeInput,
  RequestRateLimitConsumeResult,
  RequestRateLimitStore,
} from "./types.js";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

type SqliteRunResult = {
  changes?: number;
};

type SqliteStatement = {
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => SqliteRunResult;
};

type SqliteDatabase = {
  exec: (sql: string) => unknown;
  close: () => unknown;
  prepare?: (sql: string) => SqliteStatement;
  query?: (sql: string) => SqliteStatement;
};

type SqliteConstructor = new (path: string) => SqliteDatabase;

const require = createRequire(import.meta.url);

function durableBucketKey(key: string): string {
  return createHash("sha256")
    .update("matterhorn-rate-limit\0")
    .update(key)
    .digest("hex");
}

function openSqliteDatabase(path: string): SqliteDatabase {
  if (process.versions.bun) {
    const bunSqlite = require("bun:sqlite") as {
      Database: new (path: string) => SqliteDatabase;
    };
    return new bunSqlite.Database(path);
  }
  const betterSqlite = require("better-sqlite3") as
    | { default?: SqliteConstructor }
    | SqliteConstructor;
  const DatabaseCtor = (
    typeof betterSqlite === "function" ? betterSqlite : betterSqlite.default
  ) as SqliteConstructor;
  return new DatabaseCtor(path);
}

function statement(db: SqliteDatabase, sql: string): SqliteStatement {
  if (db.prepare) return db.prepare(sql);
  if (db.query) return db.query(sql);
  throw new Error("SQLite database does not support prepare/query.");
}

export function resolveMatterhornRateLimitDatabasePath(): string {
  const override = process.env.MATTERHORN_WORK_RATE_LIMIT_DB?.trim();
  if (override) return resolve(override);
  const dataRoot =
    process.env.MATTERHORN_WORK_DATA_DIR?.trim() ||
    process.env.OPENWORK_DATA_DIR?.trim() ||
    join(homedir(), ".matterhorn-work");
  return join(resolve(dataRoot), "auth", "rate-limits.db");
}

export function createInMemoryRequestRateLimitStore(): RequestRateLimitStore {
  const buckets = new Map<string, { resetAt: number; count: number }>();
  let lastSweepAt = 0;

  return {
    consume(input: RequestRateLimitConsumeInput): RequestRateLimitConsumeResult {
      if (input.now - lastSweepAt >= input.windowMs) {
        for (const [key, bucket] of buckets.entries()) {
          if (input.now >= bucket.resetAt) buckets.delete(key);
        }
        lastSweepAt = input.now;
      }

      let bucket = buckets.get(input.key);
      if (!bucket || input.now >= bucket.resetAt) {
        bucket = { resetAt: input.now + input.windowMs, count: 0 };
        buckets.set(input.key, bucket);
      }
      bucket.count += 1;
      return { allowed: bucket.count <= input.maxRequests, resetAt: bucket.resetAt };
    },
    reset(key: string) {
      buckets.delete(key);
    },
    close() {
      buckets.clear();
    },
  };
}

/**
 * Durable, cross-process rate-limit storage for hosted deployments. SQLite's
 * BEGIN IMMEDIATE transaction makes the read/increment/write decision atomic
 * across server processes sharing the same persistent data volume.
 */
export function createSqliteRequestRateLimitStore(
  path = resolveMatterhornRateLimitDatabasePath(),
): RequestRateLimitStore {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = openSqliteDatabase(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS request_rate_limits (
      key TEXT PRIMARY KEY,
      reset_at INTEGER NOT NULL,
      count INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS request_rate_limits_reset_at_idx
      ON request_rate_limits(reset_at);
  `);
  if (path !== ":memory:") {
    try {
      chmodSync(path, 0o600);
    } catch {
      // The private parent directory still protects a lazily created file.
    }
  }

  const selectBucket = statement(
    db,
    "SELECT reset_at, count FROM request_rate_limits WHERE key = ? LIMIT 1",
  );
  const upsertBucket = statement(
    db,
    `INSERT INTO request_rate_limits (key, reset_at, count)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        reset_at = excluded.reset_at,
        count = excluded.count`,
  );
  const deleteBucket = statement(
    db,
    "DELETE FROM request_rate_limits WHERE key = ?",
  );
  const deleteExpired = statement(
    db,
    "DELETE FROM request_rate_limits WHERE reset_at <= ?",
  );
  let lastSweepAt = 0;

  return {
    consume(input: RequestRateLimitConsumeInput): RequestRateLimitConsumeResult {
      db.exec("BEGIN IMMEDIATE");
      try {
        if (input.now - lastSweepAt >= input.windowMs) {
          deleteExpired.run(input.now);
          lastSweepAt = input.now;
        }
        const storageKey = durableBucketKey(input.key);
        const current = selectBucket.get(storageKey) as
          | { reset_at: number; count: number }
          | undefined;
        const resetAt = !current || input.now >= current.reset_at
          ? input.now + input.windowMs
          : current.reset_at;
        const count = !current || input.now >= current.reset_at
          ? 1
          : current.count + 1;
        upsertBucket.run(storageKey, resetAt, count);
        db.exec("COMMIT");
        return { allowed: count <= input.maxRequests, resetAt };
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // Preserve the original storage failure.
        }
        throw error;
      }
    },
    reset(key: string) {
      deleteBucket.run(durableBucketKey(key));
    },
    close() {
      db.close();
    },
  };
}

export function createDefaultRequestRateLimitStore(): RequestRateLimitStore {
  return process.env.NODE_ENV === "production"
    ? createSqliteRequestRateLimitStore()
    : createInMemoryRequestRateLimitStore();
}
