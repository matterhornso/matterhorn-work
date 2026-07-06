import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";

type SeedMessage = {
  role: "assistant" | "user";
  text: string;
};

export type OpencodeSessionLedgerEntry = {
  sessionId: string;
  title?: string;
  slug?: string;
  createdAt?: string;
  updatedAt: string;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
};

type OpencodeSessionLedgerOptions = {
  workspaceRoot: string;
  dbPath?: string;
  limit?: number;
};

type SessionRow = {
  id?: unknown;
  title?: unknown;
  slug?: unknown;
  directory?: unknown;
  time_created?: unknown;
  time_updated?: unknown;
  data?: unknown;
};

type MessageRow = {
  session_id?: unknown;
  role?: unknown;
  time_created?: unknown;
  data?: unknown;
};

type SqliteStatement = {
  all: (...params: unknown[]) => unknown[];
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => unknown;
};

type SqliteDatabase = {
  exec: (sql: string) => unknown;
  close: () => unknown;
  prepare?: (sql: string) => SqliteStatement;
  query?: (sql: string) => SqliteStatement;
  transaction?: <T extends (...args: never[]) => unknown>(fn: T) => T;
};
type SqliteConstructor = new (path: string, options?: { readonly?: boolean }) => SqliteDatabase;

const require = createRequire(import.meta.url);

function openSqliteDatabase(path: string, options?: { readonly?: boolean }): SqliteDatabase {
  if (process.versions.bun) {
    const bunSqlite = require("bun:sqlite") as { Database: new (path: string, options?: { readonly?: boolean }) => SqliteDatabase };
    return new bunSqlite.Database(path, options);
  }
  const betterSqlite = require("better-sqlite3") as { default?: SqliteConstructor } | SqliteConstructor;
  const DatabaseCtor = (typeof betterSqlite === "function" ? betterSqlite : betterSqlite.default) as SqliteConstructor;
  return new DatabaseCtor(path, options);
}

function prepareStatement(db: SqliteDatabase, sql: string): SqliteStatement {
  if (db.prepare) return db.prepare(sql);
  if (db.query) return db.query(sql);
  throw new Error("SQLite database does not support prepare/query.");
}

const DEFAULT_AGENT = "openwork";
const DEFAULT_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-5.4";
const OPENWORK_DEV_DATA_DIRS = ["openwork-dev-data", "opencode-dev"];

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function opencodeOrchestratorDataDirs(): string[] {
  const root = process.env.OPENWORK_DATA_DIR?.trim();
  if (!root) return [];

  const dirs: string[] = [];
  const pushIfExists = (dir: string) => {
    if (existsSync(dir)) dirs.push(dir);
  };

  for (const name of OPENWORK_DEV_DATA_DIRS) {
    const base = join(root, name);
    pushIfExists(join(base, "xdg", "data", "opencode"));
    if (!existsSync(base)) continue;

    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      pushIfExists(join(base, entry.name, "xdg", "data", "opencode"));
    }
  }

  return dirs;
}

function opencodeDataDirs(): string[] {
  const dirs: string[] = [];
  dirs.push(...opencodeOrchestratorDataDirs());
  const xdg = process.env.XDG_DATA_HOME?.trim();
  if (xdg) dirs.push(join(xdg, "opencode"));
  dirs.push(join(homedir(), ".local", "share", "opencode"));
  if (process.platform === "darwin") dirs.push(join(homedir(), "Library", "Application Support", "opencode"));
  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim();
    if (appData) dirs.push(join(appData, "opencode"));
  }
  return Array.from(new Set(dirs));
}

function preferredDbNames(): string[] {
  const channel = process.env.OPENCODE_CHANNEL?.trim() || "local";
  return channel === "latest" || channel === "beta" || truthy(process.env.OPENCODE_DISABLE_CHANNEL_DB)
    ? ["opencode.db"]
    : [`opencode-${channel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`, "opencode.db"];
}

function candidateOpencodeDbPaths(): string[] {
  const override = process.env.OPENCODE_DB?.trim();
  if (override) {
    if (isAbsolute(override)) return [override];
    const candidates: string[] = [];
    for (const dir of opencodeDataDirs()) {
      candidates.push(join(dir, override));
    }
    candidates.push(join(opencodeDataDirs()[0] ?? join(homedir(), ".local", "share", "opencode"), override));
    return Array.from(new Set(candidates));
  }

  const candidates: string[] = [];
  for (const dir of opencodeDataDirs()) {
    for (const name of preferredDbNames()) {
      candidates.push(join(dir, name));
    }
  }

  return Array.from(new Set(candidates));
}

export function resolveOpencodeDbPath(): string {
  const candidates = candidateOpencodeDbPaths();
  const existing = candidates.find((candidate) => existsSync(candidate));
  if (existing) return existing;
  return candidates[0] ?? join(homedir(), ".local", "share", "opencode", preferredDbNames()[0] ?? "opencode.db");
}

function tableColumns(db: SqliteDatabase, table: "session" | "message"): Set<string> {
  try {
    const rows = prepareStatement(db, `pragma table_info(${table})`).all() as Array<{ name?: string }>;
    return new Set(rows.map((row) => row.name).filter((name): name is string => Boolean(name)));
  } catch {
    return new Set();
  }
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = stringValue(value);
    if (normalized) return normalized;
  }
  return undefined;
}

function timestampMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isoTimestamp(value: unknown): string | undefined {
  const timestamp = timestampMs(value);
  return timestamp === undefined ? undefined : new Date(timestamp).toISOString();
}

function pathMatchesWorkspace(candidate: string | undefined, workspaceRoot: string): boolean {
  if (!candidate) return false;
  const workspace = resolve(workspaceRoot);
  const target = resolve(candidate);
  return target === workspace || target.startsWith(`${workspace}${sep}`);
}

function sessionBelongsToWorkspace(row: SessionRow, data: Record<string, unknown>, workspaceRoot: string): boolean {
  const pathData = nestedRecord(data.path);
  const candidates = [
    stringValue(row.directory),
    stringValue(data.directory),
    stringValue(data.cwd),
    stringValue(pathData.cwd),
    stringValue(pathData.root),
  ].filter((value): value is string => Boolean(value));
  if (!candidates.length) return false;
  return candidates.some((candidate) => pathMatchesWorkspace(candidate, workspaceRoot));
}

function sessionTimestamp(data: Record<string, unknown>, row: SessionRow, key: "created" | "updated"): string | undefined {
  const time = nestedRecord(data.time);
  return isoTimestamp(key === "created" ? row.time_created ?? time.created : row.time_updated ?? time.updated);
}

function selectExistingColumns(columns: Set<string>, available: string[]): string {
  return available
    .map((column) => columns.has(column) ? column : `NULL as ${column}`)
    .join(", ");
}

function readMessageCounts(db: SqliteDatabase, sessionIds: string[]): Map<string, {
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  lastMessageAt?: string;
}> {
  const columns = tableColumns(db, "message");
  if (!columns.has("session_id") || !sessionIds.length) return new Map();
  const selected = selectExistingColumns(columns, ["session_id", "role", "time_created", "data"]);
  const placeholders = sessionIds.map(() => "?").join(",");
  const rows = prepareStatement(db, `select ${selected} from message where session_id in (${placeholders})`).all(...sessionIds) as MessageRow[];
  const counts = new Map<string, {
    messageCount: number;
    userMessageCount: number;
    assistantMessageCount: number;
    lastMessageAt?: string;
  }>();

  for (const row of rows) {
    const sessionId = stringValue(row.session_id);
    if (!sessionId) continue;
    const parsed = parseJsonRecord(row.data);
    const role = firstString(row.role, parsed.role);
    const next = counts.get(sessionId) ?? {
      messageCount: 0,
      userMessageCount: 0,
      assistantMessageCount: 0,
      lastMessageAt: undefined,
    };
    next.messageCount += 1;
    if (role === "user") next.userMessageCount += 1;
    if (role === "assistant") next.assistantMessageCount += 1;
    const messageAt = isoTimestamp(row.time_created ?? nestedRecord(parsed.time).created);
    if (messageAt && (!next.lastMessageAt || Date.parse(messageAt) > Date.parse(next.lastMessageAt))) {
      next.lastMessageAt = messageAt;
    }
    counts.set(sessionId, next);
  }

  return counts;
}

export function readOpencodeSessionLedgerEntries(options: OpencodeSessionLedgerOptions): OpencodeSessionLedgerEntry[] {
  const dbPath = options.dbPath?.trim() || resolveOpencodeDbPath();
  if (!existsSync(dbPath)) return [];
  const limit = Math.max(1, Math.min(options.limit ?? 300, 300));
  const db = openSqliteDatabase(dbPath, { readonly: true });
  try {
    const columns = tableColumns(db, "session");
    if (!columns.has("id")) return [];
    const selected = selectExistingColumns(columns, ["id", "title", "slug", "directory", "time_created", "time_updated", "data"]);
    const orderColumn = columns.has("time_updated") ? "time_updated" : "id";
    const rows = prepareStatement(db, `select ${selected} from session order by ${orderColumn} desc limit ?`).all(limit) as SessionRow[];
    const scoped = rows
      .map((row) => ({ row, data: parseJsonRecord(row.data), sessionId: stringValue(row.id) }))
      .filter((entry): entry is { row: SessionRow; data: Record<string, unknown>; sessionId: string } =>
        Boolean(entry.sessionId) && sessionBelongsToWorkspace(entry.row, entry.data, options.workspaceRoot),
      );
    const counts = readMessageCounts(db, scoped.map((entry) => entry.sessionId));

    const entries: OpencodeSessionLedgerEntry[] = [];
    for (const { row, data, sessionId } of scoped) {
      const count = counts.get(sessionId);
      const createdAt = sessionTimestamp(data, row, "created");
      const updatedAt = count?.lastMessageAt ?? sessionTimestamp(data, row, "updated") ?? createdAt;
      if (!updatedAt) continue;
      const title = firstString(row.title, data.title);
      const slug = firstString(row.slug, data.slug);
      entries.push({
        sessionId,
        ...(title ? { title } : {}),
        ...(slug ? { slug } : {}),
        ...(createdAt ? { createdAt } : {}),
        updatedAt,
        messageCount: count?.messageCount ?? 0,
        userMessageCount: count?.userMessageCount ?? 0,
        assistantMessageCount: count?.assistantMessageCount ?? 0,
      });
    }
    return entries;
  } catch {
    return [];
  } finally {
    db.close();
  }
}

function findOpencodeSessionDbPath(sessionId: string, inputPath?: string): string | null {
  const candidates = (inputPath ? [inputPath] : candidateOpencodeDbPaths()).filter((candidate) => existsSync(candidate));
  for (const dbPath of candidates) {
    const db = openSqliteDatabase(dbPath, { readonly: true });
    try {
      const session = prepareStatement(db, "select id from session where id = ?1").get(sessionId);
      if (session) return dbPath;
    } catch {
      // ignore non-matching dbs
    } finally {
      db.close();
    }
  }
  return null;
}

function randomBase62(length: number): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = randomBytes(length);
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += chars[bytes[index]! % 62];
  }
  return output;
}

function ascendingId(prefix: "msg" | "prt", timestamp: number, counter: number): string {
  const now = BigInt(timestamp) * 0x1000n + BigInt(counter);
  const bytes = Buffer.alloc(6);
  for (let index = 0; index < 6; index += 1) {
    bytes[index] = Number((now >> BigInt(40 - 8 * index)) & 0xffn);
  }
  return `${prefix}_${bytes.toString("hex")}${randomBase62(14)}`;
}

export function seedOpencodeSessionMessages(input: {
  sessionId: string;
  workspaceRoot: string;
  messages: SeedMessage[];
  dbPath?: string;
  now?: number;
}): { inserted: number; skipped: boolean } {
  const sessionId = input.sessionId.trim();
  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const messages = input.messages.filter((item) => item.text.trim());
  if (!messages.length) {
    return { inserted: 0, skipped: true };
  }

  const explicitDbPath = input.dbPath?.trim() || undefined;
  const dbPath = findOpencodeSessionDbPath(sessionId, explicitDbPath) || explicitDbPath || resolveOpencodeDbPath();
  if (!existsSync(dbPath)) {
    throw new Error(`OpenCode database not found at ${dbPath}`);
  }

  const db = openSqliteDatabase(dbPath);
  db.exec("PRAGMA foreign_keys = ON");

  try {
    const writeMessages = () => {
      const session = prepareStatement(db, "select id from session where id = ?1").get(sessionId);
      if (!session) {
        throw new Error(`OpenCode session not found: ${sessionId}`);
      }

      const existing = prepareStatement(db, "select count(1) as count from message where session_id = ?1").get(sessionId) as { count?: number } | null;
      if ((existing?.count ?? 0) > 0) {
        return { inserted: 0, skipped: true };
      }

      const insertMessage = prepareStatement(db,
        "insert into message (id, session_id, time_created, time_updated, data) values (?1, ?2, ?3, ?4, ?5)",
      );
      const insertPart = prepareStatement(db,
        "insert into part (id, message_id, session_id, time_created, time_updated, data) values (?1, ?2, ?3, ?4, ?5, ?6)",
      );
      const updateSession = prepareStatement(db, "update session set time_updated = ?2 where id = ?1");

      const startedAt = input.now ?? Date.now();
      let counter = 0;
      let lastUserId: string | null = null;

      messages.forEach((item, index) => {
        const createdAt = startedAt + index;
        counter += 1;
        const messageId = ascendingId("msg", createdAt, counter);
        counter += 1;
        const partId = ascendingId("prt", createdAt, counter);

        const messageData =
          item.role === "user"
            ? {
                role: "user",
                time: { created: createdAt },
                summary: { diffs: [] },
                agent: DEFAULT_AGENT,
                model: { providerID: DEFAULT_PROVIDER, modelID: DEFAULT_MODEL },
              }
            : {
                role: "assistant",
                time: { created: createdAt, completed: createdAt },
                parentID: lastUserId ?? messageId,
                modelID: DEFAULT_MODEL,
                providerID: DEFAULT_PROVIDER,
                mode: DEFAULT_AGENT,
                agent: DEFAULT_AGENT,
                path: { cwd: input.workspaceRoot, root: input.workspaceRoot },
                cost: 0,
                tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              };

        insertMessage.run(messageId, sessionId, createdAt, createdAt, JSON.stringify(messageData));
        insertPart.run(
          partId,
          messageId,
          sessionId,
          createdAt,
          createdAt,
          JSON.stringify({ type: "text", text: item.text.trim() }),
        );

        if (item.role === "user") {
          lastUserId = messageId;
        }
      });

      updateSession.run(sessionId, startedAt + messages.length);
      return { inserted: messages.length, skipped: false };
    };

    if (db.transaction) {
      const run = db.transaction(writeMessages as never) as () => { inserted: number; skipped: boolean };
      return run();
    }
    db.exec("BEGIN");
    try {
      const result = writeMessages();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
}
