import type { MatterhornCryptoAppConnectionCredential } from "@matterhorn-work/types/crypto-coworkers";

const CONFIG_ENV = "MATTERHORN_CRYPTO_APP_MANAGED_CREDENTIALS_JSON";
const SECRET_ENV_PREFIX = "MATTERHORN_CRYPTO_APP_SECRET_";
const REFERENCE_PREFIX = "vault://managed-crypto-app/";
const MAX_CONFIG_BYTES = 128 * 1_024;
const MAX_SECRET_BYTES = 16 * 1_024;
const SAFE_HEADERS = new Set(["authorization", "api-key", "x-api-key", "x-access-token"]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SECRET_ID = /^[A-Z][A-Z0-9_]{2,63}$/;

type ManagedCredentialBinding = {
  id: string;
  appId: string;
  manifestRevision: string;
  header: string;
  scheme: "bearer" | "raw";
};

export class MatterhornManagedCryptoAppCredentialError extends Error {
  constructor(readonly code:
    | "managed_credential_configuration_invalid"
    | "managed_credential_duplicate"
    | "managed_credential_unavailable"
    | "managed_credential_binding_mismatch"
    | "managed_credential_value_invalid") {
    super(code);
    this.name = "MatterhornManagedCryptoAppCredentialError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseBinding(value: unknown): ManagedCredentialBinding {
  if (!isRecord(value)
    || Object.keys(value).some((key) => !["id", "appId", "manifestRevision", "header", "scheme"].includes(key))
    || typeof value.id !== "string"
    || !SECRET_ID.test(value.id)
    || typeof value.appId !== "string"
    || !IDENTIFIER.test(value.appId)
    || typeof value.manifestRevision !== "string"
    || !IDENTIFIER.test(value.manifestRevision)
    || typeof value.header !== "string"
    || !SAFE_HEADERS.has(value.header.trim().toLowerCase())
    || (value.scheme !== "bearer" && value.scheme !== "raw")) {
    throw new MatterhornManagedCryptoAppCredentialError("managed_credential_configuration_invalid");
  }
  const header = value.header.trim().toLowerCase();
  if (header === "authorization" && value.scheme !== "bearer") {
    throw new MatterhornManagedCryptoAppCredentialError("managed_credential_configuration_invalid");
  }
  return {
    id: value.id,
    appId: value.appId,
    manifestRevision: value.manifestRevision,
    header,
    scheme: value.scheme,
  };
}

function parseBindings(value: string | undefined): ManagedCredentialBinding[] {
  if (!value?.trim()) return [];
  if (Buffer.byteLength(value, "utf8") > MAX_CONFIG_BYTES) {
    throw new MatterhornManagedCryptoAppCredentialError("managed_credential_configuration_invalid");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    throw new MatterhornManagedCryptoAppCredentialError("managed_credential_configuration_invalid");
  }
  if (!Array.isArray(decoded) || decoded.length > 256) {
    throw new MatterhornManagedCryptoAppCredentialError("managed_credential_configuration_invalid");
  }
  const bindings = decoded.map(parseBinding);
  const ids = new Set<string>();
  const apps = new Set<string>();
  for (const binding of bindings) {
    const appKey = `${binding.appId}\u0000${binding.manifestRevision}`;
    if (ids.has(binding.id) || apps.has(appKey)) {
      throw new MatterhornManagedCryptoAppCredentialError("managed_credential_duplicate");
    }
    ids.add(binding.id);
    apps.add(appKey);
  }
  return bindings;
}

function secretEnvironmentName(id: string): string {
  return `${SECRET_ENV_PREFIX}${id}`;
}

function credentialReference(id: string): string {
  return `${REFERENCE_PREFIX}${id}`;
}

function validSecret(value: string | undefined): value is string {
  if (!value || /[\r\n\0]/.test(value)) return false;
  const bytes = Buffer.byteLength(value, "utf8");
  return bytes >= 8 && bytes <= MAX_SECRET_BYTES;
}

/**
 * Resolves deployment-managed API credentials without copying their values
 * into connection rows, account responses, manifests, prompts, or receipts.
 * The JSON configuration contains only safe bindings; each actual secret lives
 * in the deployment secret store under MATTERHORN_CRYPTO_APP_SECRET_<ID>.
 */
export class MatterhornManagedCryptoAppCredentials {
  readonly #env: NodeJS.ProcessEnv;
  readonly #bindings: ManagedCredentialBinding[];

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.#env = env;
    this.#bindings = parseBindings(env[CONFIG_ENV]);
  }

  credentialFor(input: {
    appId: string;
    manifestRevision: string;
  }): MatterhornCryptoAppConnectionCredential | null {
    const binding = this.#bindings.find((candidate) => (
      candidate.appId === input.appId && candidate.manifestRevision === input.manifestRevision
    ));
    if (!binding || !validSecret(this.#env[secretEnvironmentName(binding.id)])) return null;
    return { type: "api_key_vault", secretReference: credentialReference(binding.id) };
  }

  async resolveHeaders(input: {
    appId: string;
    manifestRevision: string;
    credential: MatterhornCryptoAppConnectionCredential;
  }): Promise<Record<string, string>> {
    if (input.credential.type === "none") return {};
    if (input.credential.type !== "api_key_vault") {
      throw new MatterhornManagedCryptoAppCredentialError("managed_credential_unavailable");
    }
    const secretReference = input.credential.secretReference;
    const binding = this.#bindings.find((candidate) => (
      candidate.appId === input.appId
      && candidate.manifestRevision === input.manifestRevision
      && credentialReference(candidate.id) === secretReference
    ));
    if (!binding) {
      throw new MatterhornManagedCryptoAppCredentialError("managed_credential_binding_mismatch");
    }
    const secret = this.#env[secretEnvironmentName(binding.id)];
    if (!validSecret(secret)) {
      throw new MatterhornManagedCryptoAppCredentialError("managed_credential_value_invalid");
    }
    return {
      [binding.header]: binding.scheme === "bearer" ? `Bearer ${secret}` : secret,
    };
  }

  configuredBindings(): number {
    return this.#bindings.length;
  }
}
