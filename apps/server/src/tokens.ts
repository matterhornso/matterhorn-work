import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { readFile, rename, rm, writeFile } from "node:fs/promises";

import type { ServerConfig, TokenScope } from "./types.js";
import { ensureDir, hashToken, shortId, timingSafeTokenEqual } from "./utils.js";

export type TokenRecord = {
  id: string;
  hash: string;
  scope: TokenScope;
  createdAt: number;
  label?: string;
};

type TokenStoreFile = {
  schemaVersion: number;
  updatedAt: number;
  tokens: TokenRecord[];
};

function normalizeScope(value: unknown): TokenScope | null {
  if (value === "owner" || value === "collaborator" || value === "viewer") return value;
  return null;
}

function resolveTokenStorePath(config: ServerConfig): string {
  const override = (process.env.MATTERHORN_WORK_TOKEN_STORE ?? process.env.OPENWORK_TOKEN_STORE ?? "").trim();
  if (override) return resolve(override);

  const configPath = config.configPath?.trim();
  const configDir = configPath ? dirname(configPath) : join(homedir(), ".config", "openwork");
  return join(configDir, "tokens.json");
}

async function readTokenStore(path: string): Promise<TokenStoreFile> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return { schemaVersion: 1, updatedAt: Date.now(), tokens: [] };
    }
    throw new Error("Token store is unreadable; refusing to discard durable access state.");
  }
  try {
    const parsed = JSON.parse(raw) as Partial<TokenStoreFile>;
    const tokens = Array.isArray(parsed.tokens)
      ? parsed.tokens
        .map((token) => {
          const record = token as Partial<TokenRecord>;
          const id = typeof record.id === "string" ? record.id : "";
          const hash = typeof record.hash === "string" ? record.hash : "";
          const scope = normalizeScope(record.scope);
          const createdAt = typeof record.createdAt === "number" ? record.createdAt : Date.now();
          const label = typeof record.label === "string" ? record.label : undefined;
          if (!id || !hash || !scope) return null;
          const parsedRecord: TokenRecord = {
            id,
            hash,
            scope,
            createdAt,
            ...(label ? { label } : {}),
          };
          return parsedRecord;
        })
        .filter((token): token is TokenRecord => Boolean(token))
      : [];
    return {
      schemaVersion: typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : 1,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
      tokens,
    };
  } catch {
    throw new Error("Token store is invalid; refusing to discard durable access state.");
  }
}

async function writeTokenStore(path: string, tokens: TokenRecord[]): Promise<void> {
  await ensureDir(dirname(path));
  const payload: TokenStoreFile = {
    schemaVersion: 1,
    updatedAt: Date.now(),
    tokens,
  };
  const tempPath = join(
    dirname(path),
    `.tokens.${process.pid}.${Date.now()}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(tempPath, JSON.stringify(payload, null, 2) + "\n", {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export class TokenService {
  private config: ServerConfig;
  private path: string;
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();
  private tokens: TokenRecord[] = [];
  private byHash = new Map<string, TokenRecord>();

  constructor(config: ServerConfig) {
    this.config = config;
    this.path = resolveTokenStorePath(config);
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (!this.loadPromise) {
      this.loadPromise = readTokenStore(this.path).then((store) => {
        this.tokens = store.tokens;
        this.byHash = new Map(store.tokens.map((token) => [token.hash, token]));
        this.loaded = true;
      });
    }
    await this.loadPromise;
  }

  private runMutation<T>(task: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(task, task);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async list(): Promise<Array<Omit<TokenRecord, "hash">>> {
    await this.mutationQueue;
    await this.ensureLoaded();
    return this.tokens.map(({ hash: _hash, ...rest }) => rest);
  }

  async create(scope: TokenScope, options?: { label?: string }): Promise<{ id: string; token: string; scope: TokenScope; createdAt: number; label?: string }> {
    return this.runMutation(async () => {
      await this.ensureLoaded();

      const id = shortId();
      const token = `owt_${shortId().replace(/-/g, "")}`;
      const createdAt = Date.now();
      const record: TokenRecord = {
        id,
        hash: hashToken(token),
        scope,
        createdAt,
        label: options?.label?.trim() || undefined,
      };

      const nextTokens = [record, ...this.tokens];
      await writeTokenStore(this.path, nextTokens);
      this.tokens = nextTokens;
      this.byHash = new Map(nextTokens.map((entry) => [entry.hash, entry]));
      return { id, token, scope, createdAt, label: record.label };
    });
  }

  async revoke(id: string): Promise<boolean> {
    return this.runMutation(async () => {
      await this.ensureLoaded();
      const index = this.tokens.findIndex((token) => token.id === id);
      if (index === -1) return false;
      const nextTokens = this.tokens.filter((token) => token.id !== id);
      await writeTokenStore(this.path, nextTokens);
      this.tokens = nextTokens;
      this.byHash = new Map(nextTokens.map((entry) => [entry.hash, entry]));
      return true;
    });
  }

  async scopeForToken(token: string): Promise<TokenScope | null> {
    const trimmed = token.trim();
    if (!trimmed) return null;
    if (timingSafeTokenEqual(trimmed, this.config.token)) return "collaborator";
    await this.mutationQueue;
    await this.ensureLoaded();
    const found = this.byHash.get(hashToken(trimmed));
    return found?.scope ?? null;
  }
}
