import {
  createHash,
  randomBytes,
  randomInt,
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
  email_verified_at: number | null;
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
  emailVerified: boolean;
};

export type MatterhornEmailVerificationChallenge = {
  email: string;
  verificationCode: string;
  expiresAt: number;
};

export type MatterhornPasswordResetChallenge = {
  email: string;
  resetToken: string;
  expiresAt: number;
};

export type MatterhornEmailOutboxTemplate = "verification" | "passwordReset";

export type MatterhornEmailOutboxItem = {
  id: string;
  recipient: string;
  template: MatterhornEmailOutboxTemplate;
  props: Record<string, string>;
  attempts: number;
};

export type MatterhornAuthMaintenanceResult = {
  expiredSessionsDeleted: number;
  expiredVerificationChallengesDeleted: number;
  expiredPasswordResetChallengesDeleted: number;
  expiredEmailsTerminalized: number;
  finalizedEmailsDeleted: number;
  completedDeletionJobsDeleted: number;
};

export type MatterhornVerificationRequired = {
  verificationRequired: true;
  email: string;
  expiresAt: number;
  accountCreated: boolean;
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

export type MatterhornAuthSecuritySummary = {
  sessionCount: number;
  organizations: MatterhornAuthOrganization[];
  sharedOrganizationsBlockingDeletion: MatterhornAuthOrganization[];
};

export type MatterhornAuthAccountDeletion = {
  userId: string;
  deletedOrganizationIds: string[];
};

export type MatterhornAuthAccountDeletionJob = MatterhornAuthAccountDeletion & {
  jobId: string;
  status: "pending" | "processing" | "failed" | "completed";
  steps: { memory: boolean; workspaces: boolean; identity: boolean };
  attempts: number;
  createdAt: number;
  updatedAt: number;
};

export type MatterhornAuthAccountExport = {
  version: "matterhorn.account-export.v1";
  generatedAt: string;
  filename: string;
  account: MatterhornAuthUser & { createdAt: string };
  legalAcceptance: {
    termsVersion: string;
    privacyVersion: string;
    acceptedAt: string;
  } | null;
  organizations: MatterhornAuthOrganization[];
  security: { activeSessionCount: number };
  includes: Array<
    | "account_profile"
    | "legal_acceptance"
    | "organization_memberships"
    | "session_count"
  >;
  excludes: string[];
};

export type MatterhornAuthLegalAcceptance = {
  termsVersion: string;
  privacyVersion: string;
};

export class MatterhornAuthError extends Error {
  constructor(
    readonly code:
      | "email_taken"
      | "invalid_credentials"
      | "invalid_email"
      | "invalid_name"
      | "invalid_password"
      | "email_unverified"
      | "invalid_verification_code"
      | "expired_verification_code"
      | "invalid_reset_token"
      | "expired_reset_token"
      | "invalid_organization"
      | "account_owns_shared_organization"
      | "account_deletion_pending"
      | "organization_slug_taken"
      | "signup_capacity_reached"
      | "unauthorized",
    message: string,
  ) {
    super(message);
    this.name = "MatterhornAuthError";
  }
}

const require = createRequire(import.meta.url);
const AUTH_SECURITY_METADATA_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
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

const PASSWORD_HASH_PREFIX = "scrypt-v2$32768$8$3$";
const PASSWORD_SCRYPT_OPTIONS = {
  N: 2 ** 15,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024,
} as const;

function deriveCurrentPasswordHash(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 64, PASSWORD_SCRYPT_OPTIONS);
}

function encodePasswordHash(password: string, salt: Buffer): string {
  return `${PASSWORD_HASH_PREFIX}${deriveCurrentPasswordHash(password, salt).toString("hex")}`;
}

function verifyStoredPassword(
  password: string,
  salt: Buffer,
  storedHash: string,
): { matches: boolean; needsUpgrade: boolean } {
  const current = storedHash.startsWith(PASSWORD_HASH_PREFIX);
  const encoded = current
    ? storedHash.slice(PASSWORD_HASH_PREFIX.length)
    : storedHash;
  const expected = /^[a-f0-9]{128}$/i.test(encoded)
    ? Buffer.from(encoded, "hex")
    : Buffer.alloc(64);
  let actual: Buffer;
  if (current) {
    actual = deriveCurrentPasswordHash(password, salt);
  } else {
    // This branch only verifies pre-v2 hashes. A successful sign-in rewrites
    // the row with the current OWASP-aligned profile before issuing a session.
    // codeql[js/insufficient-password-hash]
    actual = scryptSync(password, salt, 64);
  }
  return {
    matches: timingSafeEqual(actual, expected),
    needsUpgrade: !current,
  };
}

const MISSING_USER_SALT = createHash("sha256")
  .update("matterhorn-auth-missing-user")
  .digest()
  .subarray(0, 16);
const MISSING_USER_HASH = encodePasswordHash(
  "matterhorn-auth-missing-user-password",
  MISSING_USER_SALT,
);

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashPasswordResetToken(token: string): string {
  return createHash("sha256")
    .update("matterhorn-password-reset\0")
    .update(token)
    .digest("hex");
}

function hashVerificationCode(code: string, salt: Buffer): Buffer {
  return scryptSync(`matterhorn-email-verification\0${code}`, salt, 64);
}

function hashEmail(email: string): string {
  return createHash("sha256")
    .update("matterhorn-email-suppression\0")
    .update(normalizeEmail(email))
    .digest("hex");
}

function userFromRow(row: UserRow): MatterhornAuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    emailVerified: row.email_verified_at !== null,
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
        email_verified_at INTEGER,
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
    const userColumns = statement(this.db, "PRAGMA table_info(users)").all() as Array<{ name?: string }>;
    if (!userColumns.some((column) => column.name === "email_verified_at")) {
      this.db.exec("ALTER TABLE users ADD COLUMN email_verified_at INTEGER");
      this.db.exec("UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL");
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS email_verification_challenges (
        user_id TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL,
        code_salt TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS password_reset_challenges (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS account_legal_acceptances (
        user_id TEXT PRIMARY KEY,
        terms_version TEXT NOT NULL,
        privacy_version TEXT NOT NULL,
        accepted_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS email_verification_expires_at_idx
        ON email_verification_challenges(expires_at);
      CREATE INDEX IF NOT EXISTS password_reset_user_id_idx
        ON password_reset_challenges(user_id);
      CREATE INDEX IF NOT EXISTS password_reset_expires_at_idx
        ON password_reset_challenges(expires_at);

      CREATE TABLE IF NOT EXISTS account_deletion_jobs (
        job_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        organization_ids_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'failed', 'completed')),
        steps_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS account_deletion_jobs_status_idx
        ON account_deletion_jobs(status, updated_at);

      CREATE TABLE IF NOT EXISTS email_outbox (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        user_id TEXT,
        recipient TEXT NOT NULL,
        template TEXT NOT NULL CHECK (template IN ('verification', 'passwordReset')),
        props_json TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('pending', 'sending', 'retry', 'accepted', 'delivered', 'suppressed', 'terminal')),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        last_error_code TEXT,
        provider_message_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        delivered_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS email_outbox_due_idx
        ON email_outbox(state, next_attempt_at);
      CREATE INDEX IF NOT EXISTS email_outbox_provider_message_idx
        ON email_outbox(provider_message_id);

      CREATE TABLE IF NOT EXISTS email_suppressions (
        email_hash TEXT PRIMARY KEY,
        reason TEXT NOT NULL CHECK (reason IN ('bounce', 'complaint')),
        event_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  maintainEphemeralSecurityState(now = Date.now()): MatterhornAuthMaintenanceResult {
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new Error("auth_maintenance_time_invalid");
    }
    const finalizedBefore = now - AUTH_SECURITY_METADATA_RETENTION_MS;
    return this.withTransaction(() => {
      const expiredVerificationEmails = statement(this.db, `
        UPDATE email_outbox
        SET state = 'terminal', last_error_code = 'challenge_expired',
          props_json = '{}', updated_at = ?
        WHERE template = 'verification' AND state IN ('pending', 'retry', 'sending')
          AND user_id IN (
            SELECT user_id FROM email_verification_challenges WHERE expires_at <= ?
          )
      `).run(now, now).changes ?? 0;
      const expiredPasswordResetEmails = statement(this.db, `
        UPDATE email_outbox
        SET state = 'terminal', last_error_code = 'challenge_expired',
          props_json = '{}', updated_at = ?
        WHERE template = 'passwordReset' AND state IN ('pending', 'retry', 'sending')
          AND user_id IN (
            SELECT user_id FROM password_reset_challenges WHERE expires_at <= ?
          )
      `).run(now, now).changes ?? 0;
      const expiredSessionsDeleted = statement(
        this.db,
        "DELETE FROM sessions WHERE expires_at <= ?",
      ).run(now).changes ?? 0;
      const expiredVerificationChallengesDeleted = statement(
        this.db,
        "DELETE FROM email_verification_challenges WHERE expires_at <= ?",
      ).run(now).changes ?? 0;
      const expiredPasswordResetChallengesDeleted = statement(
        this.db,
        "DELETE FROM password_reset_challenges WHERE expires_at <= ?",
      ).run(now).changes ?? 0;
      const finalizedEmailsDeleted = statement(this.db, `
        DELETE FROM email_outbox
        WHERE state IN ('accepted', 'delivered', 'suppressed', 'terminal') AND updated_at < ?
      `).run(finalizedBefore).changes ?? 0;
      const completedDeletionJobsDeleted = statement(this.db, `
        DELETE FROM account_deletion_jobs
        WHERE status = 'completed' AND completed_at IS NOT NULL AND completed_at < ?
      `).run(finalizedBefore).changes ?? 0;
      return {
        expiredSessionsDeleted,
        expiredVerificationChallengesDeleted,
        expiredPasswordResetChallengesDeleted,
        expiredEmailsTerminalized: expiredVerificationEmails + expiredPasswordResetEmails,
        finalizedEmailsDeleted,
        completedDeletionJobsDeleted,
      };
    });
  }

  createAccount(input: {
    email: string;
    password: string;
    name?: string | null;
    maxAccounts?: number | null;
    emailVerified?: boolean;
    legalAcceptance?: MatterhornAuthLegalAcceptance | null;
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
    const passwordHash = encodePasswordHash(input.password, salt);

    this.withTransaction(() => {
      if (input.maxAccounts !== null && input.maxAccounts !== undefined) {
        const row = statement(this.db, "SELECT COUNT(*) AS count FROM users").get() as { count?: number } | undefined;
        if ((row?.count ?? 0) >= input.maxAccounts) {
          throw new MatterhornAuthError(
            "signup_capacity_reached",
            "The public beta is full for now. Try again after more places open.",
          );
        }
      }
      statement(
        this.db,
        `INSERT INTO users
          (id, email, name, password_hash, password_salt, email_verified_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        userId,
        email,
        name,
        passwordHash,
        salt.toString("hex"),
        input.emailVerified === false ? null : now,
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
      if (input.legalAcceptance) {
        statement(
          this.db,
          `INSERT INTO account_legal_acceptances
            (user_id, terms_version, privacy_version, accepted_at)
            VALUES (?, ?, ?, ?)`,
        ).run(
          userId,
          input.legalAcceptance.termsVersion,
          input.legalAcceptance.privacyVersion,
          now,
        );
      }
    });

    return this.createSessionForUser(userId, organizationId);
  }

  createAccountOrQueueVerification(input: {
    email: string;
    password: string;
    name?: string | null;
    maxAccounts?: number | null;
    legalAcceptance?: MatterhornAuthLegalAcceptance | null;
  }): MatterhornVerificationRequired {
    const email = normalizeEmail(input.email);
    validatePassword(input.password);
    const name = normalizeName(input.name);
    const now = Date.now();
    const existing = statement(this.db, `
      SELECT id, email, email_verified_at FROM users WHERE email = ? LIMIT 1
    `).get(email) as { id: string; email: string; email_verified_at: number | null } | undefined;

    if (existing?.email_verified_at !== null && existing) {
      return {
        verificationRequired: true,
        email,
        expiresAt: now + EMAIL_VERIFICATION_TTL_MS,
        accountCreated: false,
      };
    }

    if (existing) {
      const recent = statement(this.db, `
        SELECT created_at FROM email_outbox
        WHERE user_id = ? AND template = 'verification'
          AND created_at > ?
        ORDER BY created_at DESC LIMIT 1
      `).get(existing.id, now - 60_000) as { created_at: number } | undefined;
      if (recent) {
        const challenge = statement(this.db, `
          SELECT expires_at FROM email_verification_challenges
          WHERE user_id = ? LIMIT 1
        `).get(existing.id) as { expires_at: number } | undefined;
        return {
          verificationRequired: true,
          email,
          expiresAt: challenge?.expires_at ?? now + EMAIL_VERIFICATION_TTL_MS,
          accountCreated: false,
        };
      }
      const challenge = this.withTransaction(() =>
        this.queueVerificationForUser(existing.id, email, now),
      );
      return {
        verificationRequired: true,
        email: challenge.email,
        expiresAt: challenge.expiresAt,
        accountCreated: false,
      };
    }

    const userId = `usr_${randomUUID().replaceAll("-", "")}`;
    const organizationId = `org_${randomUUID().replaceAll("-", "")}`;
    const organizationSlug = `personal-${userId.slice(-12)}`;
    const salt = randomBytes(16);
    const passwordHash = encodePasswordHash(input.password, salt);
    let challenge!: MatterhornEmailVerificationChallenge;
    this.withTransaction(() => {
      if (input.maxAccounts !== null && input.maxAccounts !== undefined) {
        const row = statement(this.db, "SELECT COUNT(*) AS count FROM users").get() as { count?: number } | undefined;
        if ((row?.count ?? 0) >= input.maxAccounts) {
          throw new MatterhornAuthError(
            "signup_capacity_reached",
            "The public beta is full for now. Try again after more places open.",
          );
        }
      }
      statement(this.db, `
        INSERT INTO users
          (id, email, name, password_hash, password_salt, email_verified_at, created_at)
        VALUES (?, ?, ?, ?, ?, NULL, ?)
      `).run(userId, email, name, passwordHash, salt.toString("hex"), now);
      statement(this.db, `
        INSERT INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)
      `).run(organizationId, personalWorkspaceName(email, name), organizationSlug, now);
      statement(this.db, `
        INSERT INTO organization_members (organization_id, user_id, role, created_at)
        VALUES (?, ?, 'owner', ?)
      `).run(organizationId, userId, now);
      if (input.legalAcceptance) {
        statement(this.db, `
          INSERT INTO account_legal_acceptances
            (user_id, terms_version, privacy_version, accepted_at)
          VALUES (?, ?, ?, ?)
        `).run(
          userId,
          input.legalAcceptance.termsVersion,
          input.legalAcceptance.privacyVersion,
          now,
        );
      }
      challenge = this.queueVerificationForUser(userId, email, now);
    });
    return {
      verificationRequired: true,
      email: challenge.email,
      expiresAt: challenge.expiresAt,
      accountCreated: true,
    };
  }

  queueEmailVerification(emailInput: string): MatterhornEmailVerificationChallenge | null {
    const email = normalizeEmail(emailInput);
    const user = statement(this.db, `
      SELECT id, email, email_verified_at FROM users WHERE email = ? LIMIT 1
    `).get(email) as { id: string; email: string; email_verified_at: number | null } | undefined;
    if (!user || user.email_verified_at !== null) return null;
    return this.withTransaction(() => this.queueVerificationForUser(user.id, user.email, Date.now()));
  }

  queuePasswordReset(emailInput: string, appUrlInput: string): MatterhornPasswordResetChallenge | null {
    const email = normalizeEmail(emailInput);
    const user = statement(this.db, `
      SELECT id, email, email_verified_at FROM users WHERE email = ? LIMIT 1
    `).get(email) as { id: string; email: string; email_verified_at: number | null } | undefined;
    if (!user || user.email_verified_at === null || this.isEmailSuppressed(email)) return null;
    const resetToken = randomBytes(32).toString("base64url");
    const tokenHash = hashPasswordResetToken(resetToken);
    const now = Date.now();
    const expiresAt = now + PASSWORD_RESET_TTL_MS;
    const appUrl = new URL(appUrlInput);
    appUrl.pathname = "/";
    appUrl.search = "";
    appUrl.hash = new URLSearchParams({ mode: "reset-password", token: resetToken }).toString();
    this.withTransaction(() => {
      statement(this.db, "DELETE FROM password_reset_challenges WHERE user_id = ?").run(user.id);
      statement(this.db, `
        INSERT INTO password_reset_challenges (token_hash, user_id, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `).run(tokenHash, user.id, expiresAt, now);
      this.enqueueEmail({
        userId: user.id,
        recipient: user.email,
        template: "passwordReset",
        props: { resetLink: appUrl.toString() },
        idempotencyKey: `password-reset:${user.id}:${tokenHash}`,
        now,
      });
    });
    return { email: user.email, resetToken, expiresAt };
  }

  claimDueEmailOutbox(limit = 10, now = Date.now()): MatterhornEmailOutboxItem[] {
    const boundedLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
    return this.withTransaction(() => {
      statement(this.db, `
        UPDATE email_outbox SET state = 'retry', next_attempt_at = ?, updated_at = ?
        WHERE state = 'sending' AND updated_at < ?
      `).run(now, now, now - 5 * 60_000);
      const rows = statement(this.db, `
        SELECT id, recipient, template, props_json, attempts
        FROM email_outbox
        WHERE state IN ('pending', 'retry') AND next_attempt_at <= ?
        ORDER BY created_at ASC LIMIT ?
      `).all(now, boundedLimit) as Array<Record<string, unknown>>;
      const claimed: MatterhornEmailOutboxItem[] = [];
      for (const row of rows) {
        const result = statement(this.db, `
          UPDATE email_outbox SET state = 'sending', attempts = attempts + 1, updated_at = ?
          WHERE id = ? AND state IN ('pending', 'retry')
        `).run(now, String(row.id));
        if ((result.changes ?? 0) !== 1) continue;
        const props = JSON.parse(String(row.props_json)) as unknown;
        if (!props || typeof props !== "object" || Array.isArray(props)) {
          statement(this.db, `UPDATE email_outbox SET state = 'terminal', last_error_code = 'invalid_payload', updated_at = ? WHERE id = ?`).run(now, String(row.id));
          continue;
        }
        claimed.push({
          id: String(row.id),
          recipient: String(row.recipient),
          template: String(row.template) as MatterhornEmailOutboxTemplate,
          props: Object.fromEntries(Object.entries(props).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
          attempts: Number(row.attempts) + 1,
        });
      }
      return claimed;
    });
  }

  markEmailAccepted(id: string, providerMessageId?: string): void {
    const now = Date.now();
    statement(this.db, `
      UPDATE email_outbox SET state = ?, provider_message_id = ?,
        delivered_at = ?, updated_at = ?, last_error_code = NULL,
        props_json = '{}'
      WHERE id = ? AND state = 'sending'
    `).run(
      providerMessageId ? "accepted" : "delivered",
      providerMessageId ?? null,
      providerMessageId ? null : now,
      now,
      id,
    );
  }

  markEmailFailed(id: string, errorCode: string, attempts: number): void {
    const terminal = attempts >= 8;
    const backoff = Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1));
    const now = Date.now();
    statement(this.db, `
      UPDATE email_outbox SET state = ?, next_attempt_at = ?, last_error_code = ?, updated_at = ?,
        props_json = CASE WHEN ? THEN '{}' ELSE props_json END
      WHERE id = ? AND state = 'sending'
    `).run(terminal ? "terminal" : "retry", now + backoff, errorCode.slice(0, 64), now, terminal ? 1 : 0, id);
  }

  suppressEmail(
    emailInput: string,
    reason: "bounce" | "complaint",
    eventId: string,
    providerMessageId?: string,
  ): void {
    const email = normalizeEmail(emailInput);
    const emailHash = hashEmail(email);
    const now = Date.now();
    this.withTransaction(() => {
      statement(this.db, `
        INSERT INTO email_suppressions (email_hash, reason, event_id, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(email_hash) DO UPDATE SET
          reason = excluded.reason, event_id = excluded.event_id, created_at = excluded.created_at
      `).run(emailHash, reason, eventId.slice(0, 256), now);
      statement(this.db, `
        UPDATE email_outbox SET state = 'suppressed', last_error_code = ?, updated_at = ?, props_json = '{}'
        WHERE recipient = ? AND state IN ('pending', 'retry', 'sending')
      `).run(reason, now, email);
      if (providerMessageId) {
        statement(this.db, `
          UPDATE email_outbox SET state = 'suppressed', last_error_code = ?, updated_at = ?, props_json = '{}'
          WHERE recipient = ? AND provider_message_id = ?
            AND state IN ('accepted', 'delivered')
        `).run(reason, now, email, providerMessageId.slice(0, 256));
      }
    });
  }

  markSesDelivery(providerMessageId: string): void {
    const now = Date.now();
    statement(this.db, `
      UPDATE email_outbox SET state = 'delivered', delivered_at = COALESCE(delivered_at, ?), updated_at = ?
      WHERE provider_message_id = ? AND state NOT IN ('suppressed', 'terminal')
    `).run(now, now, providerMessageId.slice(0, 256));
  }

  emailOutboxStatus(): { pending: number; terminal: number; suppressed: number } {
    const count = (state: string) => Number((statement(this.db, `SELECT COUNT(*) AS count FROM email_outbox WHERE state = ?`).get(state) as { count?: number } | undefined)?.count ?? 0);
    return {
      pending: count("pending") + count("retry") + count("sending") + count("accepted"),
      terminal: count("terminal"),
      suppressed: count("suppressed"),
    };
  }

  accountCount(): number {
    return Number((statement(this.db, "SELECT COUNT(*) AS count FROM users").get() as { count?: number } | undefined)?.count ?? 0);
  }

  signIn(emailInput: string, password: string): MatterhornAuthSession {
    const email = normalizeEmail(emailInput);
    const row = statement(
      this.db,
      `SELECT id, email, name, password_hash, password_salt, email_verified_at
        FROM users WHERE email = ? LIMIT 1`,
    ).get(email) as UserRow | undefined;
    if (!row) {
      verifyStoredPassword(password, MISSING_USER_SALT, MISSING_USER_HASH);
      throw new MatterhornAuthError(
        "invalid_credentials",
        "Email or password is incorrect.",
      );
    }

    const passwordVerification = verifyStoredPassword(
      password,
      Buffer.from(row.password_salt, "hex"),
      row.password_hash,
    );
    if (!passwordVerification.matches) {
      throw new MatterhornAuthError(
        "invalid_credentials",
        "Email or password is incorrect.",
      );
    }
    if (row.email_verified_at === null) {
      throw new MatterhornAuthError(
        "email_unverified",
        "Verify your email before signing in.",
      );
    }
    if (this.hasPendingAccountDeletion(row.id)) {
      throw new MatterhornAuthError(
        "account_deletion_pending",
        "This account is being deleted and can no longer be used.",
      );
    }
    if (passwordVerification.needsUpgrade) {
      statement(
        this.db,
        "UPDATE users SET password_hash = ? WHERE id = ?",
      ).run(
        encodePasswordHash(password, Buffer.from(row.password_salt, "hex")),
        row.id,
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

  createEmailVerificationChallenge(
    emailInput: string,
  ): MatterhornEmailVerificationChallenge | null {
    const email = normalizeEmail(emailInput);
    const user = statement(
      this.db,
      `SELECT id, email, name, password_hash, password_salt, email_verified_at
        FROM users WHERE email = ? LIMIT 1`,
    ).get(email) as UserRow | undefined;
    if (!user || user.email_verified_at !== null) return null;

    const verificationCode = String(randomInt(100_000, 1_000_000));
    const salt = randomBytes(16);
    const now = Date.now();
    const expiresAt = now + EMAIL_VERIFICATION_TTL_MS;
    const codeHash = hashVerificationCode(verificationCode, salt);
    statement(
      this.db,
      `INSERT INTO email_verification_challenges
        (user_id, code_hash, code_salt, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          code_hash = excluded.code_hash,
          code_salt = excluded.code_salt,
          expires_at = excluded.expires_at,
          created_at = excluded.created_at`,
    ).run(
      user.id,
      codeHash.toString("hex"),
      salt.toString("hex"),
      expiresAt,
      now,
    );
    return { email: user.email, verificationCode, expiresAt };
  }

  verifyEmail(emailInput: string, codeInput: string): MatterhornAuthSession {
    const email = normalizeEmail(emailInput);
    const code = codeInput.trim();
    const user = statement(
      this.db,
      `SELECT id, email, name, password_hash, password_salt, email_verified_at
        FROM users WHERE email = ? LIMIT 1`,
    ).get(email) as UserRow | undefined;
    if (!user || user.email_verified_at !== null || !/^\d{6}$/.test(code)) {
      throw new MatterhornAuthError(
        "invalid_verification_code",
        "That verification code is invalid.",
      );
    }
    const challenge = statement(
      this.db,
      `SELECT code_hash, code_salt, expires_at
        FROM email_verification_challenges WHERE user_id = ? LIMIT 1`,
    ).get(user.id) as {
      code_hash: string;
      code_salt: string;
      expires_at: number;
    } | undefined;
    if (!challenge) {
      throw new MatterhornAuthError(
        "invalid_verification_code",
        "That verification code is invalid.",
      );
    }
    if (challenge.expires_at <= Date.now()) {
      statement(
        this.db,
        "DELETE FROM email_verification_challenges WHERE user_id = ?",
      ).run(user.id);
      throw new MatterhornAuthError(
        "expired_verification_code",
        "That verification code has expired. Request a new code.",
      );
    }
    const actual = hashVerificationCode(
      code,
      Buffer.from(challenge.code_salt, "hex"),
    );
    const expected = Buffer.from(challenge.code_hash, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new MatterhornAuthError(
        "invalid_verification_code",
        "That verification code is invalid.",
      );
    }

    const verifiedAt = Date.now();
    this.withTransaction(() => {
      statement(
        this.db,
        "UPDATE users SET email_verified_at = ? WHERE id = ?",
      ).run(verifiedAt, user.id);
      statement(
        this.db,
        "DELETE FROM email_verification_challenges WHERE user_id = ?",
      ).run(user.id);
    });
    const firstOrg = statement(
      this.db,
      `SELECT organization_id
        FROM organization_members
        WHERE user_id = ?
        ORDER BY created_at ASC
        LIMIT 1`,
    ).get(user.id) as { organization_id: string } | undefined;
    return this.createSessionForUser(
      user.id,
      firstOrg?.organization_id ?? null,
    );
  }

  createPasswordResetChallenge(
    emailInput: string,
  ): MatterhornPasswordResetChallenge | null {
    const email = normalizeEmail(emailInput);
    const user = statement(
      this.db,
      `SELECT id, email, name, password_hash, password_salt, email_verified_at
        FROM users WHERE email = ? LIMIT 1`,
    ).get(email) as UserRow | undefined;
    if (!user || user.email_verified_at === null) return null;

    const resetToken = randomBytes(32).toString("base64url");
    const tokenHash = hashPasswordResetToken(resetToken);
    const now = Date.now();
    const expiresAt = now + PASSWORD_RESET_TTL_MS;
    this.withTransaction(() => {
      statement(
        this.db,
        "DELETE FROM password_reset_challenges WHERE user_id = ?",
      ).run(user.id);
      statement(
        this.db,
        `INSERT INTO password_reset_challenges
          (token_hash, user_id, expires_at, created_at)
          VALUES (?, ?, ?, ?)`,
      ).run(tokenHash, user.id, expiresAt, now);
    });
    return { email: user.email, resetToken, expiresAt };
  }

  resetPassword(resetTokenInput: string, newPassword: string): void {
    validatePassword(newPassword);
    const resetToken = resetTokenInput.trim();
    if (!resetToken || resetToken.length > 256) {
      throw new MatterhornAuthError(
        "invalid_reset_token",
        "That password reset link is invalid.",
      );
    }
    const tokenHash = hashPasswordResetToken(resetToken);
    const challenge = statement(
      this.db,
      `SELECT token_hash, user_id, expires_at
        FROM password_reset_challenges WHERE token_hash = ? LIMIT 1`,
    ).get(tokenHash) as {
      token_hash: string;
      user_id: string;
      expires_at: number;
    } | undefined;
    if (!challenge) {
      throw new MatterhornAuthError(
        "invalid_reset_token",
        "That password reset link is invalid or has already been used.",
      );
    }
    if (challenge.expires_at <= Date.now()) {
      statement(
        this.db,
        "DELETE FROM password_reset_challenges WHERE token_hash = ?",
      ).run(tokenHash);
      throw new MatterhornAuthError(
        "expired_reset_token",
        "That password reset link has expired. Request a new one.",
      );
    }
    const salt = randomBytes(16);
    const passwordHash = encodePasswordHash(newPassword, salt);
    this.withTransaction(() => {
      statement(
        this.db,
        "UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?",
      ).run(
        passwordHash,
        salt.toString("hex"),
        challenge.user_id,
      );
      statement(this.db, "DELETE FROM sessions WHERE user_id = ?").run(
        challenge.user_id,
      );
      statement(
        this.db,
        "DELETE FROM password_reset_challenges WHERE user_id = ?",
      ).run(challenge.user_id);
    });
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
      `SELECT id, email, name, password_hash, password_salt, email_verified_at
        FROM users WHERE id = ? LIMIT 1`,
    ).get(row.user_id) as UserRow | undefined;
    if (!user) return null;
    if (this.hasPendingAccountDeletion(user.id)) {
      statement(this.db, "DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
      return null;
    }

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

  securitySummary(token: string): MatterhornAuthSecuritySummary {
    const session = this.requireSession(token);
    const organizations = this.listOrganizations(session.user.id);
    const sharedOrganizationIds = new Set(
      (statement(
        this.db,
        `SELECT owner.organization_id
          FROM organization_members owner
          JOIN organization_members other
            ON other.organization_id = owner.organization_id
            AND other.user_id <> owner.user_id
          WHERE owner.user_id = ? AND owner.role = 'owner'
          GROUP BY owner.organization_id`,
      ).all(session.user.id) as Array<{ organization_id: string }>).map(
        (row) => row.organization_id,
      ),
    );
    const count = statement(
      this.db,
      "SELECT COUNT(*) AS count FROM sessions WHERE user_id = ? AND expires_at > ?",
    ).get(session.user.id, Date.now()) as { count?: number } | undefined;
    return {
      sessionCount: count?.count ?? 0,
      organizations,
      sharedOrganizationsBlockingDeletion: organizations.filter(
        (organization) =>
          organization.role === "owner" &&
          sharedOrganizationIds.has(organization.id),
      ),
    };
  }

  exportAccount(token: string): MatterhornAuthAccountExport {
    const session = this.requireSession(token);
    const user = statement(
      this.db,
      `SELECT id, email, name, email_verified_at, created_at
        FROM users WHERE id = ? LIMIT 1`,
    ).get(session.user.id) as {
      id: string;
      email: string;
      name: string | null;
      email_verified_at: number | null;
      created_at: number;
    } | undefined;
    if (!user) {
      throw new MatterhornAuthError("unauthorized", "Session is no longer valid.");
    }
    const legalAcceptance = statement(
      this.db,
      `SELECT terms_version, privacy_version, accepted_at
        FROM account_legal_acceptances WHERE user_id = ? LIMIT 1`,
    ).get(session.user.id) as {
      terms_version: string;
      privacy_version: string;
      accepted_at: number;
    } | undefined;
    const activeSessions = statement(
      this.db,
      "SELECT COUNT(*) AS count FROM sessions WHERE user_id = ? AND expires_at > ?",
    ).get(session.user.id, Date.now()) as { count?: number } | undefined;
    const generatedAt = new Date().toISOString();

    return {
      version: "matterhorn.account-export.v1",
      generatedAt,
      filename: `matterhorn-account-${generatedAt.slice(0, 10)}.json`,
      account: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.email_verified_at !== null,
        createdAt: new Date(user.created_at).toISOString(),
      },
      legalAcceptance: legalAcceptance
        ? {
          termsVersion: legalAcceptance.terms_version,
          privacyVersion: legalAcceptance.privacy_version,
          acceptedAt: new Date(legalAcceptance.accepted_at).toISOString(),
        }
        : null,
      organizations: this.listOrganizations(session.user.id),
      security: { activeSessionCount: activeSessions?.count ?? 0 },
      includes: [
        "account_profile",
        "legal_acceptance",
        "organization_memberships",
        "session_count",
      ],
      excludes: [
        "Session tokens, password hashes, reset challenges, and verification codes are never exported.",
        "Workspace chats, files, notes, outputs, and memory are exported separately from each workspace.",
      ],
    };
  }

  revokeOtherSessions(token: string): number {
    const session = this.requireSession(token);
    const result = statement(
      this.db,
      "DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?",
    ).run(session.user.id, hashSessionToken(token));
    return result.changes ?? 0;
  }

  changePassword(
    token: string,
    input: { currentPassword: string; newPassword: string },
  ): void {
    const session = this.requireSession(token);
    validatePassword(input.newPassword);
    const row = statement(
      this.db,
      `SELECT id, email, name, password_hash, password_salt, email_verified_at
        FROM users WHERE id = ? LIMIT 1`,
    ).get(session.user.id) as UserRow | undefined;
    if (!row || !this.passwordMatches(row, input.currentPassword)) {
      throw new MatterhornAuthError(
        "invalid_credentials",
        "Current password is incorrect.",
      );
    }
    if (this.passwordMatches(row, input.newPassword)) {
      throw new MatterhornAuthError(
        "invalid_password",
        "Choose a new password that is different from the current password.",
      );
    }

    const salt = randomBytes(16);
    const passwordHash = encodePasswordHash(input.newPassword, salt);
    this.withTransaction(() => {
      statement(
        this.db,
        "UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?",
      ).run(passwordHash, salt.toString("hex"), session.user.id);
      statement(this.db, "DELETE FROM sessions WHERE user_id = ?").run(
        session.user.id,
      );
    });
  }

  deleteAccount(
    token: string,
    password: string,
  ): MatterhornAuthAccountDeletion {
    const job = this.beginAccountDeletion(token, password);
    this.markAccountDeletionStep(job.jobId, "memory");
    this.markAccountDeletionStep(job.jobId, "workspaces");
    this.finalizeAccountDeletion(job.jobId);
    return { userId: job.userId, deletedOrganizationIds: job.deletedOrganizationIds };
  }

  beginAccountDeletion(token: string, password: string): MatterhornAuthAccountDeletionJob {
    const deletion = this.prepareAccountDeletion(token, password);
    const now = Date.now();
    const jobId = `account_deletion_${randomUUID().replaceAll("-", "")}`;
    this.withTransaction(() => {
      statement(this.db, `
        INSERT INTO account_deletion_jobs(
          job_id, user_id, organization_ids_json, status, steps_json,
          attempts, last_error_code, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, 'pending', ?, 0, NULL, ?, ?, NULL)
        ON CONFLICT(user_id) DO NOTHING
      `).run(
        jobId,
        deletion.userId,
        JSON.stringify(deletion.deletedOrganizationIds),
        JSON.stringify({ memory: false, workspaces: false, identity: false }),
        now,
        now,
      );
      statement(this.db, "DELETE FROM sessions WHERE user_id = ?").run(deletion.userId);
    });
    const job = this.accountDeletionJobForUser(deletion.userId);
    if (!job) throw new Error("Failed to persist account deletion manifest.");
    return job;
  }

  listPendingAccountDeletionJobs(): MatterhornAuthAccountDeletionJob[] {
    return (statement(this.db, `
      SELECT job_id, user_id, organization_ids_json, status, steps_json,
        attempts, created_at, updated_at
      FROM account_deletion_jobs
      WHERE status <> 'completed'
      ORDER BY created_at ASC
    `).all() as Array<Record<string, unknown>>).map((row) => this.accountDeletionJobFromRow(row));
  }

  markAccountDeletionStep(
    jobId: string,
    step: "memory" | "workspaces",
  ): MatterhornAuthAccountDeletionJob {
    const job = this.accountDeletionJob(jobId);
    if (!job || job.status === "completed") throw new Error("account_deletion_job_not_found");
    const steps = { ...job.steps, [step]: true };
    statement(this.db, `
      UPDATE account_deletion_jobs
      SET status = 'processing', steps_json = ?, attempts = attempts + 1,
        last_error_code = NULL, updated_at = ?
      WHERE job_id = ?
    `).run(JSON.stringify(steps), Date.now(), jobId);
    return this.accountDeletionJob(jobId)!;
  }

  failAccountDeletionJob(jobId: string, safeErrorCode: string): MatterhornAuthAccountDeletionJob {
    statement(this.db, `
      UPDATE account_deletion_jobs
      SET status = 'failed', attempts = attempts + 1, last_error_code = ?, updated_at = ?
      WHERE job_id = ? AND status <> 'completed'
    `).run(safeErrorCode.slice(0, 80), Date.now(), jobId);
    const job = this.accountDeletionJob(jobId);
    if (!job) throw new Error("account_deletion_job_not_found");
    return job;
  }

  finalizeAccountDeletion(jobId: string): MatterhornAuthAccountDeletionJob {
    const job = this.accountDeletionJob(jobId);
    if (!job || job.status === "completed") {
      if (job) return job;
      throw new Error("account_deletion_job_not_found");
    }
    if (!job.steps.memory || !job.steps.workspaces) {
      throw new Error("account_deletion_purge_incomplete");
    }
    const completedAt = Date.now();
    this.withTransaction(() => {
      for (const organizationId of job.deletedOrganizationIds) {
        statement(this.db, "DELETE FROM organizations WHERE id = ?").run(organizationId);
      }
      statement(this.db, "DELETE FROM users WHERE id = ?").run(job.userId);
      statement(this.db, `
        UPDATE account_deletion_jobs
        SET status = 'completed', steps_json = ?, last_error_code = NULL,
          updated_at = ?, completed_at = ?
        WHERE job_id = ?
      `).run(JSON.stringify({ ...job.steps, identity: true }), completedAt, completedAt, jobId);
    });
    return this.accountDeletionJob(jobId)!;
  }

  prepareAccountDeletion(
    token: string,
    password: string,
  ): MatterhornAuthAccountDeletion {
    const session = this.requireSession(token);
    const row = statement(
      this.db,
      `SELECT id, email, name, password_hash, password_salt, email_verified_at
        FROM users WHERE id = ? LIMIT 1`,
    ).get(session.user.id) as UserRow | undefined;
    if (!row || !this.passwordMatches(row, password)) {
      throw new MatterhornAuthError(
        "invalid_credentials",
        "Password is incorrect.",
      );
    }

    const summary = this.securitySummary(token);
    if (summary.sharedOrganizationsBlockingDeletion.length > 0) {
      throw new MatterhornAuthError(
        "account_owns_shared_organization",
        "Transfer ownership or remove the other members from each owned workspace before deleting this account.",
      );
    }
    const deletedOrganizationIds = summary.organizations
      .filter((organization) => organization.role === "owner")
      .map((organization) => organization.id);
    return { userId: session.user.id, deletedOrganizationIds };
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

  private queueVerificationForUser(userId: string, email: string, now: number): MatterhornEmailVerificationChallenge {
    const verificationCode = String(randomInt(100_000, 1_000_000));
    const salt = randomBytes(16);
    const expiresAt = now + EMAIL_VERIFICATION_TTL_MS;
    const codeHash = hashVerificationCode(verificationCode, salt);
    statement(this.db, `
      INSERT INTO email_verification_challenges
        (user_id, code_hash, code_salt, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        code_hash = excluded.code_hash,
        code_salt = excluded.code_salt,
        expires_at = excluded.expires_at,
        created_at = excluded.created_at
    `).run(userId, codeHash.toString("hex"), salt.toString("hex"), expiresAt, now);
    this.enqueueEmail({
      userId,
      recipient: email,
      template: "verification",
      props: { verificationCode },
      idempotencyKey: `verification:${userId}:${codeHash.toString("hex")}`,
      now,
    });
    return { email, verificationCode, expiresAt };
  }

  private enqueueEmail(input: {
    userId: string | null;
    recipient: string;
    template: MatterhornEmailOutboxTemplate;
    props: Record<string, string>;
    idempotencyKey: string;
    now: number;
  }): void {
    const recipient = normalizeEmail(input.recipient);
    const suppressed = this.isEmailSuppressed(recipient);
    statement(this.db, `
      INSERT OR IGNORE INTO email_outbox
        (id, idempotency_key, user_id, recipient, template, props_json, state,
          attempts, next_attempt_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      `mail_${randomUUID().replaceAll("-", "")}`,
      input.idempotencyKey,
      input.userId,
      recipient,
      input.template,
      JSON.stringify(suppressed ? {} : input.props),
      suppressed ? "suppressed" : "pending",
      input.now,
      input.now,
      input.now,
    );
  }

  private isEmailSuppressed(email: string): boolean {
    return Boolean(statement(this.db, `
      SELECT 1 FROM email_suppressions WHERE email_hash = ? LIMIT 1
    `).get(hashEmail(email)));
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

  private passwordMatches(row: UserRow, password: string): boolean {
    return verifyStoredPassword(
      password,
      Buffer.from(row.password_salt, "hex"),
      row.password_hash,
    ).matches;
  }

  private createSessionForUser(
    userId: string,
    activeOrgId: string | null,
  ): MatterhornAuthSession {
    if (this.hasPendingAccountDeletion(userId)) {
      throw new MatterhornAuthError(
        "account_deletion_pending",
        "This account is being deleted and can no longer be used.",
      );
    }
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

  private hasPendingAccountDeletion(userId: string): boolean {
    return Boolean(statement(this.db, `
      SELECT 1 FROM account_deletion_jobs
      WHERE user_id = ? AND status <> 'completed'
      LIMIT 1
    `).get(userId));
  }

  private accountDeletionJobForUser(userId: string): MatterhornAuthAccountDeletionJob | null {
    const row = statement(this.db, `
      SELECT job_id, user_id, organization_ids_json, status, steps_json,
        attempts, created_at, updated_at
      FROM account_deletion_jobs WHERE user_id = ? LIMIT 1
    `).get(userId) as Record<string, unknown> | undefined;
    return row ? this.accountDeletionJobFromRow(row) : null;
  }

  private accountDeletionJob(jobId: string): MatterhornAuthAccountDeletionJob | null {
    const row = statement(this.db, `
      SELECT job_id, user_id, organization_ids_json, status, steps_json,
        attempts, created_at, updated_at
      FROM account_deletion_jobs WHERE job_id = ? LIMIT 1
    `).get(jobId) as Record<string, unknown> | undefined;
    return row ? this.accountDeletionJobFromRow(row) : null;
  }

  private accountDeletionJobFromRow(row: Record<string, unknown>): MatterhornAuthAccountDeletionJob {
    const organizations = JSON.parse(String(row.organization_ids_json)) as unknown;
    const steps = JSON.parse(String(row.steps_json)) as unknown;
    if (!Array.isArray(organizations) || !steps || typeof steps !== "object" || Array.isArray(steps)) {
      throw new Error("account_deletion_manifest_corrupt");
    }
    const status = String(row.status);
    if (status !== "pending" && status !== "processing" && status !== "failed" && status !== "completed") {
      throw new Error("account_deletion_manifest_corrupt");
    }
    const stepRecord = steps as Record<string, unknown>;
    return {
      jobId: String(row.job_id),
      userId: String(row.user_id),
      deletedOrganizationIds: organizations.map(String),
      status,
      steps: {
        memory: stepRecord.memory === true,
        workspaces: stepRecord.workspaces === true,
        identity: stepRecord.identity === true,
      },
      attempts: Number(row.attempts) || 0,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }
}
