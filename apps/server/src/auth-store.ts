import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

type SqliteRunResult = {
  changes?: number;
};

type SqliteStatement = {
  all: (...params: unknown[]) => unknown[];
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => SqliteRunResult;
};

type SqliteDatabase = {
  exec: (sql: string) => unknown;
  close: () => unknown;
  prepare?: (sql: string) => SqliteStatement;
  query?: (sql: string) => SqliteStatement;
  transaction?: <T extends (...args: never[]) => unknown>(fn: T) => T;
};

type SqliteConstructor = new (path: string) => SqliteDatabase;

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  password_hash: string;
  password_salt: string;
};

type SessionRow = {
  token_hash: string;
  user_id: string;
  active_org_id: string | null;
  expires_at: number;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
};

export type MatterhornAuthUser = {
  id: string;
  email: string;
  name: string | null;
};

export type MatterhornAuthOrganization = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
};

export type MatterhornAuthSession = {
  token: string;
  user: MatterhornAuthUser;
  activeOrgId: string | null;
  activeOrgSlug: string | null;
  expiresAt: number;
};

export class MatterhornAuthError extends Error {
  constructor(
    readonly code:
      | "email_taken"
      | "invalid_credentials"
      | "invalid_email"
      | "invalid_name"
      | "invalid_password"
      | "invalid_organization"
      | "organization_slug_taken"
      | "unauthorized",
    message: string,
  ) {
    super(message);
    this.name = "MatterhornAuthError";
  }
}

const require = createRequire(import.meta.url);
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 256;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

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

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 254 ||
    !EMAIL_PATTERN.test(normalized)
  ) {
    throw new MatterhornAuthError(
      "invalid_email",
      "Enter a valid email address.",
    );
  }
  return normalized;
}

function validatePassword(password: string): void {
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new MatterhornAuthError(
      "invalid_password",
      `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters.`,
    );
  }
}

function normalizeName(name: string | null | undefined): string | null {
  const normalized = name?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > 100) {
    throw new MatterhornAuthError(
      "invalid_name",
      "Name must be 100 characters or fewer.",
    );
  }
  return normalized;
}

function normalizeOrganizationName(name: string): string {
  const normalized = name.trim();
  if (normalized.length < 2 || normalized.length > 100) {
    throw new MatterhornAuthError(
      "invalid_organization",
      "Workspace name must be 2-100 characters.",
    );
  }
  return normalized;
}

function normalizeOrganizationSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(normalized)) {
    throw new MatterhornAuthError(
      "invalid_organization",
      "Workspace slug must contain only lowercase letters, numbers, and hyphens.",
    );
  }
  return normalized;
}

function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 64);
}

const MISSING_USER_SALT = createHash("sha256")
  .update("matterhorn-auth-missing-user")
  .digest()
  .subarray(0, 16);
const MISSING_USER_HASH = hashPassword(
  "matterhorn-auth-missing-user-password",
  MISSING_USER_SALT,
);

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function userFromRow(row: UserRow): MatterhornAuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
  };
}

function personalWorkspaceName(
  email: string,
  name: string | null,
): string {
  const owner = name?.split(/\s+/)[0] || email.split("@")[0] || "Personal";
  return `${owner}'s workspace`;
}

export function resolveMatterhornDataRoot(): string {
  const dataRoot =
    process.env.MATTERHORN_WORK_DATA_DIR?.trim() ||
    process.env.OPENWORK_DATA_DIR?.trim() ||
    join(homedir(), ".matterhorn-work");
  return resolve(dataRoot);
}

export function resolveMatterhornAuthDatabasePath(): string {
  const override = process.env.MATTERHORN_AUTH_DB?.trim();
  if (override) return resolve(override);
  return join(resolveMatterhornDataRoot(), "auth", "accounts.db");
}

export class MatterhornAuthStore {
  private readonly db: SqliteDatabase;

  constructor(path = resolveMatterhornAuthDatabasePath()) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = openSqliteDatabase(path);
    if (path !== ":memory:") {
      try {
        chmodSync(path, 0o600);
      } catch {
        // Some SQLite backends create the file lazily; the private parent
        // directory still prevents access until the first write.
      }
    }
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS organization_members (
        organization_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (organization_id, user_id),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        active_org_id TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (active_org_id) REFERENCES organizations(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS organization_members_user_id_idx
        ON organization_members(user_id);
    `);
  }

  close(): void {
    this.db.close();
  }

  createAccount(input: {
    email: string;
    password: string;
    name?: string | null;
  }): MatterhornAuthSession {
    const email = normalizeEmail(input.email);
    validatePassword(input.password);
    const name = normalizeName(input.name);
    const existing = statement(
      this.db,
      "SELECT id FROM users WHERE email = ? LIMIT 1",
    ).get(email);
    if (existing) {
      throw new MatterhornAuthError(
        "email_taken",
        "An account already exists for this email.",
      );
    }

    const now = Date.now();
    const userId = `usr_${randomUUID().replaceAll("-", "")}`;
    const organizationId = `org_${randomUUID().replaceAll("-", "")}`;
    const organizationSlug = `personal-${userId.slice(-12)}`;
    const salt = randomBytes(16);
    const passwordHash = hashPassword(input.password, salt);

    this.withTransaction(() => {
      statement(
        this.db,
        `INSERT INTO users
          (id, email, name, password_hash, password_salt, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        userId,
        email,
        name,
        passwordHash.toString("hex"),
        salt.toString("hex"),
        now,
      );
      statement(
        this.db,
        `INSERT INTO organizations (id, name, slug, created_at)
          VALUES (?, ?, ?, ?)`,
      ).run(
        organizationId,
        personalWorkspaceName(email, name),
        organizationSlug,
        now,
      );
      statement(
        this.db,
        `INSERT INTO organization_members
          (organization_id, user_id, role, created_at)
          VALUES (?, ?, 'owner', ?)`,
      ).run(organizationId, userId, now);
    });

    return this.createSessionForUser(userId, organizationId);
  }

  signIn(emailInput: string, password: string): MatterhornAuthSession {
    const email = normalizeEmail(emailInput);
    const row = statement(
      this.db,
      `SELECT id, email, name, password_hash, password_salt
        FROM users WHERE email = ? LIMIT 1`,
    ).get(email) as UserRow | undefined;
    if (!row) {
      const actual = hashPassword(password, MISSING_USER_SALT);
      timingSafeEqual(actual, MISSING_USER_HASH);
      throw new MatterhornAuthError(
        "invalid_credentials",
        "Email or password is incorrect.",
      );
    }

    const actual = hashPassword(password, Buffer.from(row.password_salt, "hex"));
    const expected = Buffer.from(row.password_hash, "hex");
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new MatterhornAuthError(
        "invalid_credentials",
        "Email or password is incorrect.",
      );
    }

    const firstOrg = statement(
      this.db,
      `SELECT organization_id
        FROM organization_members
        WHERE user_id = ?
        ORDER BY created_at ASC
        LIMIT 1`,
    ).get(row.id) as { organization_id: string } | undefined;
    return this.createSessionForUser(
      row.id,
      firstOrg?.organization_id ?? null,
    );
  }

  getSession(token: string): MatterhornAuthSession | null {
    const tokenHash = hashSessionToken(token);
    const row = statement(
      this.db,
      `SELECT token_hash, user_id, active_org_id, expires_at
        FROM sessions WHERE token_hash = ? LIMIT 1`,
    ).get(tokenHash) as SessionRow | undefined;
    if (!row) return null;
    if (row.expires_at <= Date.now()) {
      statement(this.db, "DELETE FROM sessions WHERE token_hash = ?").run(
        tokenHash,
      );
      return null;
    }

    const user = statement(
      this.db,
      `SELECT id, email, name, password_hash, password_salt
        FROM users WHERE id = ? LIMIT 1`,
    ).get(row.user_id) as UserRow | undefined;
    if (!user) return null;

    const activeOrg = row.active_org_id
      ? (statement(
          this.db,
          `SELECT o.id, o.name, o.slug, m.role
            FROM organizations o
            JOIN organization_members m ON m.organization_id = o.id
            WHERE o.id = ? AND m.user_id = ?
            LIMIT 1`,
        ).get(row.active_org_id, row.user_id) as OrganizationRow | undefined)
      : undefined;

    return {
      token,
      user: userFromRow(user),
      activeOrgId: activeOrg?.id ?? null,
      activeOrgSlug: activeOrg?.slug ?? null,
      expiresAt: row.expires_at,
    };
  }

  signOut(token: string): void {
    statement(this.db, "DELETE FROM sessions WHERE token_hash = ?").run(
      hashSessionToken(token),
    );
  }

  listOrganizations(userId: string): MatterhornAuthOrganization[] {
    return statement(
      this.db,
      `SELECT o.id, o.name, o.slug, m.role
        FROM organizations o
        JOIN organization_members m ON m.organization_id = o.id
        WHERE m.user_id = ?
        ORDER BY o.created_at ASC`,
    ).all(userId) as MatterhornAuthOrganization[];
  }

  setActiveOrganization(
    token: string,
    input: { organizationId?: string | null; organizationSlug?: string | null },
  ): MatterhornAuthOrganization {
    const session = this.requireSession(token);
    const organizationId = input.organizationId?.trim() ?? "";
    const organizationSlug = input.organizationSlug?.trim() ?? "";
    const row = statement(
      this.db,
      `SELECT o.id, o.name, o.slug, m.role
        FROM organizations o
        JOIN organization_members m ON m.organization_id = o.id
        WHERE m.user_id = ?
          AND ((? <> '' AND o.id = ?) OR (? <> '' AND o.slug = ?))
        LIMIT 1`,
    ).get(
      session.user.id,
      organizationId,
      organizationId,
      organizationSlug,
      organizationSlug,
    ) as OrganizationRow | undefined;
    if (!row) {
      throw new MatterhornAuthError(
        "invalid_organization",
        "Workspace was not found for this account.",
      );
    }
    statement(
      this.db,
      "UPDATE sessions SET active_org_id = ? WHERE token_hash = ?",
    ).run(row.id, hashSessionToken(token));
    return row;
  }

  createOrganization(
    token: string,
    input: { name: string; slug: string },
  ): MatterhornAuthOrganization {
    const session = this.requireSession(token);
    const name = normalizeOrganizationName(input.name);
    const slug = normalizeOrganizationSlug(input.slug);
    const existing = statement(
      this.db,
      "SELECT id FROM organizations WHERE slug = ? LIMIT 1",
    ).get(slug);
    if (existing) {
      throw new MatterhornAuthError(
        "organization_slug_taken",
        "That workspace URL is already in use.",
      );
    }

    const organization: MatterhornAuthOrganization = {
      id: `org_${randomUUID().replaceAll("-", "")}`,
      name,
      slug,
      role: "owner",
    };
    const now = Date.now();
    this.withTransaction(() => {
      statement(
        this.db,
        `INSERT INTO organizations (id, name, slug, created_at)
          VALUES (?, ?, ?, ?)`,
      ).run(organization.id, name, slug, now);
      statement(
        this.db,
        `INSERT INTO organization_members
          (organization_id, user_id, role, created_at)
          VALUES (?, ?, 'owner', ?)`,
      ).run(organization.id, session.user.id, now);
      statement(
        this.db,
        "UPDATE sessions SET active_org_id = ? WHERE token_hash = ?",
      ).run(organization.id, hashSessionToken(token));
    });
    return organization;
  }

  private requireSession(token: string): MatterhornAuthSession {
    const session = this.getSession(token);
    if (!session) {
      throw new MatterhornAuthError(
        "unauthorized",
        "Sign in to continue.",
      );
    }
    return session;
  }

  private createSessionForUser(
    userId: string,
    activeOrgId: string | null,
  ): MatterhornAuthSession {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    statement(
      this.db,
      `INSERT INTO sessions
        (token_hash, user_id, active_org_id, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)`,
    ).run(hashSessionToken(token), userId, activeOrgId, expiresAt, now);
    const session = this.getSession(token);
    if (!session) throw new Error("Failed to create Matterhorn session.");
    return session;
  }

  private withTransaction<T>(callback: () => T): T {
    if (this.db.transaction) {
      return this.db.transaction(callback as (...args: never[]) => T)();
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
