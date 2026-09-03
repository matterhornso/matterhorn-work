#!/usr/bin/env bun

import { isIP } from "node:net";

const ACCESS_ID_PATTERN = /^mhca_[A-Za-z0-9_-]{20,64}$/;
const MAX_RESPONSE_BYTES = 64 * 1_024;

export type CryptoCoworkerAccessAction = "list" | "revoke";

export type CryptoCoworkerAccessArguments = {
  action: CryptoCoworkerAccessAction | null;
  serverUrl?: string;
  accessId?: string;
  limit: number;
  json: boolean;
  help: boolean;
};

export type CryptoCoworkerAccessEntry = {
  accessId: string;
  state: "active" | "revoked";
  grantedAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

type FetchLike = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized === "127.0.0.1"
    || normalized === "::1";
}

function canonicalOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Server URL must be a valid URL");
  }
  const loopback = isLoopback(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== "/" && url.pathname !== "")
    || (isIP(url.hostname) !== 0 && !loopback)
    || (!loopback && url.port)) {
    throw new Error("Server URL must be a public HTTPS origin or a loopback development origin");
  }
  return url.origin;
}

function requireTimestamp(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("Coworker access response was invalid");
  }
  return value;
}

function accessEntry(value: unknown): CryptoCoworkerAccessEntry {
  if (!isRecord(value)
    || Object.keys(value).some((key) => !["accessId", "state", "grantedAt", "updatedAt", "revokedAt"].includes(key))
    || !ACCESS_ID_PATTERN.test(String(value.accessId ?? ""))
    || (value.state !== "active" && value.state !== "revoked")
    || (value.revokedAt !== null && value.revokedAt !== undefined && typeof value.revokedAt !== "string")) {
    throw new Error("Coworker access response was invalid");
  }
  const revokedAt = value.revokedAt === null || value.revokedAt === undefined
    ? null
    : requireTimestamp(value.revokedAt);
  if ((value.state === "active" && revokedAt !== null) || (value.state === "revoked" && revokedAt === null)) {
    throw new Error("Coworker access response was invalid");
  }
  return {
    accessId: String(value.accessId),
    state: value.state,
    grantedAt: requireTimestamp(value.grantedAt),
    updatedAt: requireTimestamp(value.updatedAt),
    revokedAt,
  };
}

export function parseCryptoCoworkerAccessArguments(argv: string[]): CryptoCoworkerAccessArguments {
  const parsed: CryptoCoworkerAccessArguments = {
    action: null,
    limit: 100,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
      continue;
    }
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    if ((argument === "list" || argument === "revoke") && parsed.action === null) {
      parsed.action = argument;
      continue;
    }
    if (!["--server-url", "--access-id", "--limit"].includes(argument)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    if (argument === "--server-url") parsed.serverUrl = value;
    else if (argument === "--access-id") parsed.accessId = value;
    else {
      const limit = Number(value);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
        throw new Error("--limit must be an integer from 1 to 500");
      }
      parsed.limit = limit;
    }
    index += 1;
  }
  if (!parsed.help && parsed.action === null) throw new Error("Choose list or revoke");
  if (!parsed.help && parsed.action === "revoke" && !ACCESS_ID_PATTERN.test(parsed.accessId ?? "")) {
    throw new Error("revoke requires a valid --access-id");
  }
  if (!parsed.help && parsed.action === "list" && parsed.accessId !== undefined) {
    throw new Error("--access-id is only valid with revoke");
  }
  return parsed;
}

async function responseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("Coworker access response was too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Coworker access response was invalid");
  }
}

export async function listCryptoCoworkerAccess(input: {
  serverOrigin: string;
  hostToken: string;
  limit: number;
  fetch?: FetchLike;
}): Promise<CryptoCoworkerAccessEntry[]> {
  const serverOrigin = canonicalOrigin(input.serverOrigin);
  if (!input.hostToken.trim()) throw new Error("MATTERHORN_WORK_HOST_TOKEN is required");
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 500) {
    throw new Error("Access list limit must be from 1 to 500");
  }
  const url = new URL("/operator/coworker-access", serverOrigin);
  url.searchParams.set("limit", String(input.limit));
  let response: Response;
  try {
    response = await (input.fetch ?? fetch)(url, {
      redirect: "error",
      headers: { "x-matterhorn-host-token": input.hostToken },
    });
  } catch {
    throw new Error("Matterhorn could not list coworker access");
  }
  const payload = await responseJson(response);
  if (!response.ok) throw new Error("Matterhorn could not list coworker access");
  if (!isRecord(payload)
    || Object.keys(payload).some((key) => key !== "mode" && key !== "accounts")
    || payload.mode !== "invite"
    || !Array.isArray(payload.accounts)) {
    throw new Error("Coworker access response was invalid");
  }
  return payload.accounts.map(accessEntry);
}

export async function revokeCryptoCoworkerAccess(input: {
  serverOrigin: string;
  hostToken: string;
  accessId: string;
  fetch?: FetchLike;
}): Promise<{ allowed: false; acceptedAt: null }> {
  const serverOrigin = canonicalOrigin(input.serverOrigin);
  if (!input.hostToken.trim()) throw new Error("MATTERHORN_WORK_HOST_TOKEN is required");
  if (!ACCESS_ID_PATTERN.test(input.accessId)) throw new Error("Coworker access ID is invalid");
  let response: Response;
  try {
    response = await (input.fetch ?? fetch)(`${serverOrigin}/operator/coworker-access/revoke`, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        "x-matterhorn-host-token": input.hostToken,
      },
      body: JSON.stringify({ accessId: input.accessId }),
    });
  } catch {
    throw new Error("Matterhorn could not revoke coworker access");
  }
  const payload = await responseJson(response);
  if (!response.ok) throw new Error("Matterhorn could not revoke coworker access");
  if (!isRecord(payload)
    || Object.keys(payload).some((key) => key !== "status")
    || !isRecord(payload.status)
    || Object.keys(payload.status).some((key) => !["version", "allowed", "acceptedAt"].includes(key))
    || payload.status.version !== "matterhorn.coworker-access-status.v1"
    || payload.status.allowed !== false
    || payload.status.acceptedAt !== null) {
    throw new Error("Coworker access response was invalid");
  }
  return { allowed: false, acceptedAt: null };
}

function usage(): string {
  return `List or revoke invite-only Crypto Coworker access.

Usage:
  MATTERHORN_WORK_HOST_TOKEN=<server-only-token> \\
  pnpm manage:crypto-coworkers -- list --server-url https://control-plane.example

  MATTERHORN_WORK_HOST_TOKEN=<server-only-token> \\
  pnpm manage:crypto-coworkers -- revoke \\
    --server-url https://control-plane.example \\
    --access-id mhca_<opaque-id>

Options:
  --server-url <origin>   Defaults to MATTERHORN_WORK_SERVER_URL
  --access-id <id>        Opaque ID returned by list; required for revoke
  --limit <n>             1-500; default 100
  --json

The host token is read only from the environment and is never printed. List
results contain opaque access IDs and timestamps only, never account IDs,
emails, wallet addresses, or invite tokens.
`;
}

async function main(): Promise<void> {
  try {
    const args = parseCryptoCoworkerAccessArguments(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      return;
    }
    const serverOrigin = args.serverUrl ?? process.env.MATTERHORN_WORK_SERVER_URL ?? "";
    const hostToken = process.env.MATTERHORN_WORK_HOST_TOKEN ?? process.env.OPENWORK_HOST_TOKEN ?? "";
    if (args.action === "list") {
      const accounts = await listCryptoCoworkerAccess({ serverOrigin, hostToken, limit: args.limit });
      if (args.json) console.log(JSON.stringify({ accounts }));
      else if (accounts.length === 0) console.log("No coworker access records.");
      else {
        for (const account of accounts) {
          console.log(`${account.accessId}  ${account.state}  updated ${account.updatedAt}`);
        }
      }
      return;
    }
    await revokeCryptoCoworkerAccess({
      serverOrigin,
      hostToken,
      accessId: args.accessId ?? "",
    });
    console.log(args.json
      ? JSON.stringify({ accessId: args.accessId, state: "revoked" })
      : `Coworker access revoked: ${args.accessId}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Coworker access operation failed");
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
