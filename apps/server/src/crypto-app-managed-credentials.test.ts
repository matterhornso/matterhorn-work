import { describe, expect, test } from "bun:test";

import {
  MatterhornManagedCryptoAppCredentialError,
  MatterhornManagedCryptoAppCredentials,
} from "./crypto-app-managed-credentials.js";

function environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    MATTERHORN_CRYPTO_APP_MANAGED_CREDENTIALS_JSON: JSON.stringify([{
      id: "VENUE_ALPHA",
      appId: "partner.venue-alpha",
      manifestRevision: "2026-09-01",
      header: "Authorization",
      scheme: "bearer",
    }]),
    MATTERHORN_CRYPTO_APP_SECRET_VENUE_ALPHA: "deployment-secret-value",
    ...overrides,
  };
}

describe("managed crypto app credentials", () => {
  test("creates only an opaque reference and resolves the secret at the transport boundary", async () => {
    const credentials = new MatterhornManagedCryptoAppCredentials(environment());
    const credential = credentials.credentialFor({
      appId: "partner.venue-alpha",
      manifestRevision: "2026-09-01",
    });
    expect(credential).toEqual({
      type: "api_key_vault",
      secretReference: "vault://managed-crypto-app/VENUE_ALPHA",
    });
    if (!credential) throw new Error("expected managed credential");
    expect(JSON.stringify(credential)).not.toContain("deployment-secret-value");
    expect(await credentials.resolveHeaders({
      appId: "partner.venue-alpha",
      manifestRevision: "2026-09-01",
      credential,
    })).toEqual({ authorization: "Bearer deployment-secret-value" });
  });

  test("returns unavailable without exposing the configured secret name or value", () => {
    const env = environment();
    delete env.MATTERHORN_CRYPTO_APP_SECRET_VENUE_ALPHA;
    const credentials = new MatterhornManagedCryptoAppCredentials(env);
    expect(credentials.credentialFor({
      appId: "partner.venue-alpha",
      manifestRevision: "2026-09-01",
    })).toBeNull();
    expect(JSON.stringify(credentials)).not.toContain("VENUE_ALPHA");
    expect(JSON.stringify(credentials)).not.toContain("deployment-secret-value");
  });

  test("rejects app, revision, and opaque-reference substitution", async () => {
    const credentials = new MatterhornManagedCryptoAppCredentials(environment());
    const credential = {
      type: "api_key_vault" as const,
      secretReference: "vault://managed-crypto-app/VENUE_ALPHA",
    };
    for (const input of [
      { appId: "partner.other", manifestRevision: "2026-09-01", credential },
      { appId: "partner.venue-alpha", manifestRevision: "2026-09-02", credential },
      {
        appId: "partner.venue-alpha",
        manifestRevision: "2026-09-01",
        credential: { ...credential, secretReference: "vault://managed-crypto-app/OTHER" },
      },
    ]) {
      await expect(credentials.resolveHeaders(input)).rejects.toEqual(expect.objectContaining({
        code: "managed_credential_binding_mismatch",
      }));
    }
  });

  test("accepts only a closed, duplicate-free header binding configuration", () => {
    for (const value of [
      "not-json",
      JSON.stringify({}),
      JSON.stringify([{ id: "bad-id", appId: "app", manifestRevision: "v1", header: "x-api-key", scheme: "raw" }]),
      JSON.stringify([{ id: "VENUE_ALPHA", appId: "app", manifestRevision: "v1", header: "cookie", scheme: "raw" }]),
      JSON.stringify([{ id: "VENUE_ALPHA", appId: "app", manifestRevision: "v1", header: "authorization", scheme: "raw" }]),
      JSON.stringify([{ id: "VENUE_ALPHA", appId: "app", manifestRevision: "v1", header: "x-api-key", scheme: "raw", secret: "forbidden" }]),
    ]) {
      expect(() => new MatterhornManagedCryptoAppCredentials({
        MATTERHORN_CRYPTO_APP_MANAGED_CREDENTIALS_JSON: value,
      })).toThrow(MatterhornManagedCryptoAppCredentialError);
    }

    const duplicate = environment({
      MATTERHORN_CRYPTO_APP_MANAGED_CREDENTIALS_JSON: JSON.stringify([
        { id: "VENUE_ALPHA", appId: "app", manifestRevision: "v1", header: "x-api-key", scheme: "raw" },
        { id: "VENUE_BETA", appId: "app", manifestRevision: "v1", header: "x-api-key", scheme: "raw" },
      ]),
    });
    expect(() => new MatterhornManagedCryptoAppCredentials(duplicate)).toThrowError(
      expect.objectContaining({ code: "managed_credential_duplicate" }),
    );
  });

  test("rejects malformed secret values at resolution without echoing them", async () => {
    const credentials = new MatterhornManagedCryptoAppCredentials(environment({
      MATTERHORN_CRYPTO_APP_SECRET_VENUE_ALPHA: "bad\nsecret",
    }));
    await expect(credentials.resolveHeaders({
      appId: "partner.venue-alpha",
      manifestRevision: "2026-09-01",
      credential: {
        type: "api_key_vault",
        secretReference: "vault://managed-crypto-app/VENUE_ALPHA",
      },
    })).rejects.toEqual(expect.objectContaining({ code: "managed_credential_value_invalid" }));
  });
});
