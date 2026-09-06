export type HostedMcpAccessCredential = {
  id: string;
  label: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt: number | null;
};

export type HostedMcpAccessResponse = {
  mode: "off" | "invite";
  eligible: boolean;
  maxExpiresInDays: number;
  credentials: HostedMcpAccessCredential[];
};

export type IssuedHostedMcpAccessCredential = HostedMcpAccessCredential & {
  accessToken: string;
};

async function responseBody(response: Response): Promise<Record<string, unknown> | null> {
  const value = await response.json().catch(() => null);
  return recordFromUnknown(value);
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function parseCredential(value: unknown): HostedMcpAccessCredential | null {
  const credential = recordFromUnknown(value);
  if (
    !credential
    || typeof credential.id !== "string"
    || !credential.id.startsWith("mcp_")
    || typeof credential.label !== "string"
    || !credential.label.trim()
    || typeof credential.createdAt !== "number"
    || !Number.isSafeInteger(credential.createdAt)
    || typeof credential.expiresAt !== "number"
    || !Number.isSafeInteger(credential.expiresAt)
    || credential.expiresAt <= credential.createdAt
    || (
      credential.lastUsedAt !== null
      && (
        typeof credential.lastUsedAt !== "number"
        || !Number.isSafeInteger(credential.lastUsedAt)
      )
    )
  ) {
    return null;
  }
  return {
    id: credential.id,
    label: credential.label,
    createdAt: credential.createdAt,
    expiresAt: credential.expiresAt,
    lastUsedAt: credential.lastUsedAt,
  };
}

function parseAccessResponse(body: Record<string, unknown> | null): HostedMcpAccessResponse {
  const credentials = Array.isArray(body?.credentials)
    ? body.credentials.map(parseCredential)
    : null;
  if (
    !body
    || (body.mode !== "off" && body.mode !== "invite")
    || typeof body.eligible !== "boolean"
    || typeof body.maxExpiresInDays !== "number"
    || !Number.isSafeInteger(body.maxExpiresInDays)
    || body.maxExpiresInDays < 1
    || body.maxExpiresInDays > 30
    || !credentials
    || credentials.some((credential) => credential === null)
  ) {
    throw new Error("Matterhorn returned invalid external-access state.");
  }
  return {
    mode: body.mode,
    eligible: body.eligible,
    maxExpiresInDays: body.maxExpiresInDays,
    credentials: credentials.filter(
      (credential): credential is HostedMcpAccessCredential => credential !== null,
    ),
  };
}

function responseError(body: Record<string, unknown> | null): Error {
  const message = body?.message;
  return new Error(
    typeof message === "string" && message.trim()
      ? message.trim()
      : "Matterhorn could not update external access.",
  );
}

export async function readHostedMcpAccess(): Promise<HostedMcpAccessResponse> {
  const response = await globalThis.fetch("/api/auth/account/mcp-access", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const body = await responseBody(response);
  if (!response.ok) throw responseError(body);
  return parseAccessResponse(body);
}

export async function createHostedMcpAccess(input: {
  label: string;
  expiresInDays: number;
}): Promise<IssuedHostedMcpAccessCredential> {
  const response = await globalThis.fetch("/api/auth/account/mcp-access", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  const body = await responseBody(response);
  if (!response.ok) throw responseError(body);
  const credential = parseCredential(body?.credential);
  const issued = recordFromUnknown(body?.credential);
  if (
    !credential
    || !issued
    || typeof issued.accessToken !== "string"
    || !issued.accessToken.startsWith("mhmcp_")
  ) {
    throw new Error("Matterhorn did not return the new access key.");
  }
  return { ...credential, accessToken: issued.accessToken };
}

export async function revokeHostedMcpAccess(credentialId: string): Promise<void> {
  const response = await globalThis.fetch(
    `/api/auth/account/mcp-access/${encodeURIComponent(credentialId)}`,
    { method: "DELETE", credentials: "include", headers: { Accept: "application/json" } },
  );
  const body = await responseBody(response);
  if (!response.ok) throw responseError(body);
}
