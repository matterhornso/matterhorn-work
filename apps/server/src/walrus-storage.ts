import { createHash } from "node:crypto";

export interface WalrusUploadResult {
  blobId: string;
  objectId?: string;
  transactionDigest?: string;
  endEpoch?: number;
  url?: string;
  responseKind: "newly_created" | "already_certified";
  uploadedAt: string;
}

export interface WalrusUploadOptions {
  publisherUrl: string;
  aggregatorUrl?: string;
  bytes: Uint8Array;
  contentType: string;
  epochs?: number;
  bearerToken?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  maxBytes?: number;
  expectedSha256?: string;
}

export class WalrusUploadError extends Error {
  readonly status?: number;
  readonly code: string;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "WalrusUploadError";
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_WALRUS_UPLOAD_TIMEOUT_MS = 30_000;
const DEFAULT_WALRUS_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const WALRUS_ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_WALRUS_ERROR_BODY_CHARS = 4096;

export async function uploadBlobToWalrus(options: WalrusUploadOptions): Promise<WalrusUploadResult> {
  validateWalrusUploadOptions(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const uploadUrl = buildWalrusBlobUploadUrl(options.publisherUrl, options.epochs);
  const body = new ArrayBuffer(options.bytes.byteLength);
  new Uint8Array(body).set(options.bytes);
  const controller = new AbortController();
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? DEFAULT_WALRUS_UPLOAD_TIMEOUT_MS));
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  let text: string;
  try {
    response = await fetchImpl(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": options.contentType,
        ...(options.bearerToken ? { Authorization: `Bearer ${options.bearerToken}` } : {}),
      },
      body,
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    if (isAbortError(error)) {
      throw new WalrusUploadError("walrus_upload_timeout", "Walrus upload timed out.", 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const payload = parseWalrusJson(response.ok ? text : text.slice(0, MAX_WALRUS_ERROR_BODY_CHARS));
  if (!response.ok) {
    throw new WalrusUploadError(
      "walrus_upload_failed",
      walrusFailureMessage(payload, response.statusText),
      response.status,
    );
  }

  const parsed = parseWalrusStoreResponse(payload);
  return {
    ...parsed,
    url: options.aggregatorUrl ? buildWalrusBlobReadUrl(options.aggregatorUrl, parsed.blobId) : undefined,
    uploadedAt: (options.now?.() ?? new Date()).toISOString(),
  };
}

function validateWalrusUploadOptions(options: WalrusUploadOptions): void {
  if (!options.bytes.byteLength) {
    throw new WalrusUploadError("walrus_empty_blob", "Walrus upload requires non-empty image bytes.", 400);
  }
  const maxBytes = Math.max(1, Math.floor(options.maxBytes ?? DEFAULT_WALRUS_UPLOAD_MAX_BYTES));
  if (options.bytes.byteLength > maxBytes) {
    throw new WalrusUploadError("walrus_blob_too_large", `Walrus upload is limited to ${maxBytes} bytes.`, 413);
  }
  if (!WALRUS_ALLOWED_CONTENT_TYPES.has(options.contentType)) {
    throw new WalrusUploadError("walrus_unsupported_content_type", "Walrus NFT media upload supports PNG, JPEG, and WebP images.", 415);
  }
  const expectedSha256 = options.expectedSha256?.trim();
  if (expectedSha256) {
    const actual = sha256Hex(options.bytes);
    if (actual !== expectedSha256.toLowerCase()) {
      throw new WalrusUploadError("walrus_blob_integrity_mismatch", "Walrus upload image bytes do not match the generated image checksum.", 409);
    }
  }
}

export function buildWalrusBlobUploadUrl(publisherUrl: string, epochs = 1): string {
  const url = appendWalrusPath(publisherUrl, "/v1/blobs");
  if (Number.isFinite(epochs) && epochs > 0) {
    url.searchParams.set("epochs", String(Math.floor(epochs)));
  }
  return url.toString();
}

export function buildWalrusBlobReadUrl(aggregatorUrl: string, blobId: string): string {
  return appendWalrusPath(aggregatorUrl, `/v1/blobs/${encodeURIComponent(blobId)}`).toString();
}

function appendWalrusPath(baseUrl: string, path: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new WalrusUploadError("walrus_endpoint_invalid", "Walrus endpoint URL is invalid.");
  }
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}${path}`;
  return url;
}

function parseWalrusJson(text: string): unknown {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new WalrusUploadError("walrus_invalid_response", "Walrus publisher returned invalid JSON.");
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
    || error instanceof Error && error.name === "AbortError";
}

function parseWalrusStoreResponse(payload: unknown): Omit<WalrusUploadResult, "url" | "uploadedAt"> {
  if (!payload || typeof payload !== "object") {
    throw new WalrusUploadError("walrus_invalid_response", "Walrus publisher returned an unexpected response.");
  }

  const record = payload as Record<string, unknown>;
  const newlyCreated = record.newlyCreated;
  if (newlyCreated && typeof newlyCreated === "object") {
    const created = newlyCreated as Record<string, unknown>;
    const blobObject = created.blobObject;
    if (blobObject && typeof blobObject === "object") {
      const object = blobObject as Record<string, unknown>;
      const blobId = stringField(object.blobId);
      if (!blobId) throw new WalrusUploadError("walrus_invalid_response", "Walrus response did not include a blob id.");
      const storage = object.storage && typeof object.storage === "object"
        ? object.storage as Record<string, unknown>
        : {};
      return {
        responseKind: "newly_created",
        blobId,
        objectId: stringField(object.id),
        endEpoch: numberField(storage.endEpoch),
      };
    }
  }

  const alreadyCertified = record.alreadyCertified;
  if (alreadyCertified && typeof alreadyCertified === "object") {
    const certified = alreadyCertified as Record<string, unknown>;
    const blobId = stringField(certified.blobId);
    if (!blobId) throw new WalrusUploadError("walrus_invalid_response", "Walrus response did not include a blob id.");
    const event = certified.event && typeof certified.event === "object"
      ? certified.event as Record<string, unknown>
      : {};
    return {
      responseKind: "already_certified",
      blobId,
      transactionDigest: stringField(event.txDigest),
      endEpoch: numberField(certified.endEpoch),
    };
  }

  throw new WalrusUploadError("walrus_invalid_response", "Walrus publisher response did not include a stored blob.");
}

function walrusFailureMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message = stringField(record.message) ?? stringField(record.error);
    if (message) return message;
  }
  return fallback || "Walrus upload failed.";
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberField(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}
