#!/usr/bin/env bun

import { isIP } from "node:net";

const INVITE_TOKEN_PATTERN = /^mhdi_[A-Za-z0-9_-]{40,96}$/;
const DEFAULT_TTL_MINUTES = 24 * 60;
const MAX_TTL_MINUTES = 7 * 24 * 60;
const MAX_RESPONSE_BYTES = 8_192;

export type CryptoDeveloperInviteArguments = {
  serverUrl?: string;
  appUrl?: string;
  ttlMinutes: number;
  json: boolean;
  help: boolean;
};

export type CryptoDeveloperInviteResult = {
  version: "matterhorn.crypto-developer-invite-link.v1";
  inviteUrl: string;
  expiresAt: string;
  safety: {
    oneTime: true;
    tokenInFragmentOnly: true;
    hostTokenIncluded: false;
    walletAuthorityIncluded: false;
  };
};

type FetchLike = typeof fetch;

function isLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized === "127.0.0.1"
    || normalized === "::1";
}

function canonicalOrigin(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
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
    throw new Error(`${label} must be a public HTTPS origin or a loopback development origin`);
  }
  return url.origin;
}

export function parseCryptoDeveloperInviteArguments(argv: string[]): CryptoDeveloperInviteArguments {
  const parsed: CryptoDeveloperInviteArguments = {
    ttlMinutes: DEFAULT_TTL_MINUTES,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
      continue;
    }
    if (!["--server-url", "--app-url", "--ttl-minutes"].includes(argument)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    if (argument === "--server-url") parsed.serverUrl = value;
    else if (argument === "--app-url") parsed.appUrl = value;
    else {
      const ttl = Number(value);
      if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > MAX_TTL_MINUTES) {
        throw new Error(`--ttl-minutes must be an integer from 1 to ${MAX_TTL_MINUTES}`);
      }
      parsed.ttlMinutes = ttl;
    }
    index += 1;
  }
  return parsed;
}

export function buildCryptoDeveloperInviteUrl(appOrigin: string, token: string): string {
  if (!INVITE_TOKEN_PATTERN.test(token)) throw new Error("Developer invite response was invalid");
  const url = new URL("/developer/crypto-apps", canonicalOrigin(appOrigin, "App URL"));
  url.hash = new URLSearchParams({ invite: token }).toString();
  return url.toString();
}

export async function issueCryptoDeveloperInvite(input: {
  serverOrigin: string;
  appOrigin: string;
  hostToken: string;
  ttlMinutes: number;
  fetch?: FetchLike;
  timeoutMs?: number;
}): Promise<CryptoDeveloperInviteResult> {
  const serverOrigin = canonicalOrigin(input.serverOrigin, "Server URL");
  const appOrigin = canonicalOrigin(input.appOrigin, "App URL");
  if (!input.hostToken.trim()) throw new Error("MATTERHORN_WORK_HOST_TOKEN is required");
  if (!Number.isSafeInteger(input.ttlMinutes) || input.ttlMinutes < 1 || input.ttlMinutes > MAX_TTL_MINUTES) {
    throw new Error(`Invite lifetime must be from 1 to ${MAX_TTL_MINUTES} minutes`);
  }
  const timeoutMs = input.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new Error("Invite request timeout is invalid");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await (input.fetch ?? fetch)(`${serverOrigin}/operator/crypto-developers/invites`, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        "x-matterhorn-host-token": input.hostToken,
      },
      body: JSON.stringify({ ttlMinutes: input.ttlMinutes }),
      signal: controller.signal,
    });
  } catch {
    throw new Error("Matterhorn could not issue the developer invite");
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("Developer invite response was too large");
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Developer invite response was invalid");
  }
  if (!response.ok) {
    const code = payload && typeof payload === "object" && "code" in payload
      ? String((payload as { code?: unknown }).code ?? "")
      : "";
    throw new Error(code === "crypto_app_gateway_disabled"
      ? "The invite-only crypto app gateway is disabled"
      : "Matterhorn could not issue the developer invite");
  }
  const invite = payload && typeof payload === "object" && "invite" in payload
    ? (payload as { invite?: unknown }).invite
    : null;
  if (!invite || typeof invite !== "object") throw new Error("Developer invite response was invalid");
  const token = "token" in invite ? String((invite as { token?: unknown }).token ?? "") : "";
  const expiresAt = "expiresAt" in invite ? String((invite as { expiresAt?: unknown }).expiresAt ?? "") : "";
  if (!INVITE_TOKEN_PATTERN.test(token)
    || !Number.isFinite(Date.parse(expiresAt))
    || Date.parse(expiresAt) <= Date.now()) {
    throw new Error("Developer invite response was invalid");
  }
  return {
    version: "matterhorn.crypto-developer-invite-link.v1",
    inviteUrl: buildCryptoDeveloperInviteUrl(appOrigin, token),
    expiresAt,
    safety: {
      oneTime: true,
      tokenInFragmentOnly: true,
      hostTokenIncluded: false,
      walletAuthorityIncluded: false,
    },
  };
}

function usage(): string {
  return `Issue one invite-only Matterhorn crypto developer link.

Usage:
  MATTERHORN_WORK_HOST_TOKEN=<server-only-token> \\
  pnpm invite:crypto-developer -- \\
    --server-url https://control-plane.example \\
    --app-url https://matterhorn.example

Options:
  --server-url <origin>   Defaults to MATTERHORN_WORK_SERVER_URL
  --app-url <origin>      Defaults to MATTERHORN_APP_URL
  --ttl-minutes <n>       1-${MAX_TTL_MINUTES}; default ${DEFAULT_TTL_MINUTES}
  --json

The host token is read only from the environment and is never printed. The
one-time developer token is placed in the URL fragment, which browsers do not
send in HTTP requests. Share the link with one intended developer only.
`;
}

async function main(): Promise<void> {
  try {
    const args = parseCryptoDeveloperInviteArguments(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      return;
    }
    const result = await issueCryptoDeveloperInvite({
      serverOrigin: args.serverUrl ?? process.env.MATTERHORN_WORK_SERVER_URL ?? "",
      appOrigin: args.appUrl ?? process.env.MATTERHORN_APP_URL ?? "",
      hostToken: process.env.MATTERHORN_WORK_HOST_TOKEN ?? process.env.OPENWORK_HOST_TOKEN ?? "",
      ttlMinutes: args.ttlMinutes,
    });
    if (args.json) console.log(JSON.stringify(result));
    else {
      console.log("Developer invite created. Share this once:");
      console.log(result.inviteUrl);
      console.log(`Expires: ${result.expiresAt}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Developer invite failed");
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
