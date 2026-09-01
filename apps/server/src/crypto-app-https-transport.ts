import { request as requestHttps, type RequestOptions } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";

import type { MatterhornCryptoAppConnectionCredential } from "@matterhorn-work/types/crypto-coworkers";

import type {
  MatterhornCryptoAppAdapterExecution,
  MatterhornCryptoAppTransportExecutor,
} from "./crypto-app-adapter-router.js";
import { assertCryptoAdapterConnectedAddress } from "./crypto-app-egress.js";

type JsonObject = Record<string, unknown>;

export type MatterhornCryptoAppCredentialResolver = (input: {
  appId: string;
  manifestRevision: string;
  credential: MatterhornCryptoAppConnectionCredential;
}) => Promise<Record<string, string>>;

export type MatterhornCryptoAppCostEstimator = (input: {
  appId: string;
  manifestRevision: string;
  actionId: string;
  requestBytes: number;
  responseBytes: number;
}) => number;

type HttpsRequest = (
  options: RequestOptions,
  callback: (response: IncomingMessage) => void,
) => ClientRequest;

type TransportOptions = {
  resolveCredentialHeaders?: MatterhornCryptoAppCredentialResolver;
  estimateCostMicros?: MatterhornCryptoAppCostEstimator;
  request?: HttpsRequest;
  maxResponseBytes?: number;
};

const DEFAULT_MAX_RESPONSE_BYTES = 512 * 1024;
const FORBIDDEN_HEADERS = new Set([
  "accept",
  "connection",
  "content-type",
  "content-length",
  "expect",
  "forwarded",
  "host",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "user-agent",
  "via",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
]);
const ENVELOPE_KEYS = new Set(["data", "source", "observedAt", "blockOrVersion"]);

function record(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function safeCredentialHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.trim().toLowerCase();
    if (!/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(name)
      || FORBIDDEN_HEADERS.has(name)
      || name.startsWith("sec-")
      || name.startsWith("x-forwarded-")) throw new Error("crypto_app_credential_header_forbidden");
    if (typeof rawValue !== "string" || /[\r\n\0]/.test(rawValue) || rawValue.length > 16_384) {
      throw new Error("crypto_app_credential_header_invalid");
    }
    result[name] = rawValue;
  }
  return result;
}

function parseEnvelope(value: unknown): {
  data: unknown;
  source: string;
  observedAt: string | null;
  blockOrVersion: string | null;
} {
  const envelope = record(value);
  if (!envelope || Object.keys(envelope).some((key) => !ENVELOPE_KEYS.has(key)) || !("data" in envelope)) {
    throw new Error("crypto_app_transport_envelope_invalid");
  }
  if (typeof envelope.source !== "string" || envelope.source.length < 1 || envelope.source.length > 200) {
    throw new Error("crypto_app_transport_source_invalid");
  }
  if (envelope.observedAt !== null && typeof envelope.observedAt !== "string") {
    throw new Error("crypto_app_transport_observed_at_invalid");
  }
  if (envelope.blockOrVersion !== null
    && (typeof envelope.blockOrVersion !== "string" || envelope.blockOrVersion.length > 200)) {
    throw new Error("crypto_app_transport_block_invalid");
  }
  return {
    data: envelope.data,
    source: envelope.source,
    observedAt: envelope.observedAt,
    blockOrVersion: envelope.blockOrVersion,
  };
}

function finiteCost(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("crypto_app_transport_cost_invalid");
  return value;
}

export function createPinnedJsonCryptoAppTransport(
  options: TransportOptions = {},
): MatterhornCryptoAppTransportExecutor {
  const request = options.request ?? requestHttps;
  const maxResponseBytes = Math.max(1_024, options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES);

  return async (input): Promise<MatterhornCryptoAppAdapterExecution> => {
    if (input.signal.aborted) throw new Error("crypto_app_transport_aborted");
    if (input.approvedAddresses.length < 1) throw new Error("crypto_app_transport_address_required");
    const pinnedAddress = input.approvedAddresses[0]!;
    assertCryptoAdapterConnectedAddress(input.approvedAddresses, pinnedAddress);

    const credentialHeaders = input.credential.type === "none"
      ? {}
      : safeCredentialHeaders(await (options.resolveCredentialHeaders
        ? options.resolveCredentialHeaders({
          appId: input.appId,
          manifestRevision: input.manifestRevision,
          credential: input.credential,
        })
        : Promise.reject(new Error("crypto_app_credential_resolver_unavailable"))));

    const body = JSON.stringify({
      version: "matterhorn.crypto-app-call.v1",
      appId: input.appId,
      manifestRevision: input.manifestRevision,
      actionId: input.action.id,
      network: input.network,
      arguments: input.arguments,
    });
    const requestBytes = Buffer.byteLength(body, "utf8");

    return new Promise<MatterhornCryptoAppAdapterExecution>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        input.signal.removeEventListener("abort", abort);
        callback();
      };
      const abort = () => {
        client.destroy(new Error("crypto_app_transport_aborted"));
        finish(() => reject(new Error("crypto_app_transport_aborted")));
      };
      const client = request({
        protocol: "https:",
        hostname: input.endpoint.hostname,
        port: input.endpoint.port || 443,
        method: "POST",
        path: `${input.endpoint.pathname}${input.endpoint.search}`,
        servername: input.endpoint.hostname,
        rejectUnauthorized: true,
        agent: false,
        lookup: (_hostname, lookupOptions, callback) => {
          if (typeof lookupOptions === "object" && lookupOptions.all) {
            callback(null, [{ address: pinnedAddress, family: 4 }]);
            return;
          }
          callback(null, pinnedAddress, 4);
        },
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "content-length": String(requestBytes),
          "user-agent": "Matterhorn-Crypto-App-Gateway/1",
          ...credentialHeaders,
        },
        signal: input.signal,
      }, (response) => {
        const connectedAddress = response.socket.remoteAddress ?? "";
        try {
          assertCryptoAdapterConnectedAddress(input.approvedAddresses, connectedAddress);
        } catch (error) {
          response.destroy();
          finish(() => reject(error));
          return;
        }
        const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
        if (!contentType.startsWith("application/json")) {
          response.destroy();
          finish(() => reject(new Error("crypto_app_transport_content_type_invalid")));
          return;
        }
        if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
          response.resume();
          finish(() => reject(new Error("crypto_app_transport_status_invalid")));
          return;
        }
        const chunks: Buffer[] = [];
        let responseBytes = 0;
        response.on("data", (chunk: Buffer | string) => {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          responseBytes += bytes.length;
          if (responseBytes > maxResponseBytes) {
            response.destroy(new Error("crypto_app_transport_response_too_large"));
            return;
          }
          chunks.push(bytes);
        });
        response.on("error", (error) => finish(() => reject(error)));
        response.on("end", () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            const envelope = parseEnvelope(parsed);
            const costMicros = finiteCost(options.estimateCostMicros?.({
              appId: input.appId,
              manifestRevision: input.manifestRevision,
              actionId: input.action.id,
              requestBytes,
              responseBytes,
            }) ?? 0);
            finish(() => resolve({ ...envelope, costMicros, connectedAddress }));
          } catch (error) {
            finish(() => reject(error));
          }
        });
      });
      client.on("error", (error) => finish(() => reject(error)));
      if (input.signal.aborted) {
        abort();
        return;
      }
      input.signal.addEventListener("abort", abort, { once: true });
      client.end(body);
    });
  };
}
