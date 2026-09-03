import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  createMatterhornCryptoAppRuntime,
  cryptoAppRuntimeDatabaseFiles,
  MatterhornCryptoAppRuntimeConfigurationError,
} from "./crypto-app-runtime.js";

function environment(mode: "off" | "shadow" | "enforce" = "shadow") {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-crypto-runtime-"));
  const keys = generateKeyPairSync("ed25519");
  return {
    MATTERHORN_CRYPTO_APP_GATEWAY_MODE: mode,
    MATTERHORN_CRYPTO_APP_POLICY_VERSION: "policy-1",
    MATTERHORN_CRYPTO_APP_PUBLISHER_KEYS_JSON: JSON.stringify([{
      publisherId: "matterhorn",
      keyId: "publisher-1",
      algorithm: "ed25519",
      publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    }]),
    MATTERHORN_CRYPTO_APP_REGISTRY_DB: join(root, "registry.db"),
    MATTERHORN_CRYPTO_APP_CONNECTION_DB: join(root, "connections.db"),
    MATTERHORN_CRYPTO_APP_DEVELOPER_DB: join(root, "developer.db"),
    MATTERHORN_CRYPTO_APP_OPERATIONAL_DB: join(root, "operational.db"),
    ...(mode === "enforce" ? {
      MATTERHORN_CRYPTO_APP_WALLET_PROOF_SECRET: "wallet-proof-runtime-secret-with-at-least-32-characters",
    } : {}),
    ...(mode === "enforce" ? { MATTERHORN_GUARDED_RUNTIME_MODE: "enforce" } : {}),
  } as NodeJS.ProcessEnv;
}

describe("crypto app runtime startup", () => {
  test("performs no database access while the gateway is off", () => {
    const env = environment("off");
    env.MATTERHORN_CRYPTO_APP_MANAGED_CREDENTIALS_JSON = "malformed-but-inert-while-off";
    const runtime = createMatterhornCryptoAppRuntime(env);
    expect(runtime).toMatchObject({ mode: "off", catalog: null });
    expect(runtime.maintainDeveloperInviteMetadata()).toEqual({ invitesDeleted: 0 });
    expect(runtime.purgeAccount("account-missing")).toEqual({ developers: 0, keys: 0, submissions: 0 });
    expect(cryptoAppRuntimeDatabaseFiles(env)).toEqual({
      registryExists: false,
      connectionsExist: false,
      developerPortalExists: false,
    });
    runtime.close();
  });

  test("opens an empty fail-closed catalog in shadow mode with public keys only", () => {
    const env = environment("shadow");
    const runtime = createMatterhornCryptoAppRuntime(env);
    expect(runtime.mode).toBe("shadow");
    expect(runtime.catalog?.list()).toEqual([]);
    expect(runtime.purgeWorkspace("ws_missing")).toEqual({ connections: 0, usage: 0, circuits: 0 });
    expect(runtime.purgeAccount("account-missing")).toEqual({ developers: 0, keys: 0, submissions: 0 });
    expect(runtime.maintainDeveloperInviteMetadata()).toEqual({ invitesDeleted: 0 });
    expect(cryptoAppRuntimeDatabaseFiles(env)).toEqual({
      registryExists: true,
      connectionsExist: true,
      developerPortalExists: true,
    });
    runtime.close();
  });

  test("fails readiness and exposes no executable router when enforce lacks the guarded runtime", () => {
    const runtime = createMatterhornCryptoAppRuntime(environment("enforce"));
    expect(runtime).toMatchObject({ mode: "enforce", ready: false, router: null });
    expect(runtime.purgeWorkspace("ws_missing")).toEqual({ connections: 0, usage: 0, circuits: 0 });
    runtime.close();
  });

  test("requires an explicit policy version and trusted public keyring", () => {
    const missingPolicy = environment();
    delete missingPolicy.MATTERHORN_CRYPTO_APP_POLICY_VERSION;
    expect(() => createMatterhornCryptoAppRuntime(missingPolicy))
      .toThrowError(expect.objectContaining({ code: "crypto_app_policy_version_required" }));

    const missingKeys = environment();
    delete missingKeys.MATTERHORN_CRYPTO_APP_PUBLISHER_KEYS_JSON;
    expect(() => createMatterhornCryptoAppRuntime(missingKeys))
      .toThrowError(expect.objectContaining({ code: "crypto_app_publisher_keys_required" }));

    const missingWalletProofSecret = environment("enforce");
    delete missingWalletProofSecret.MATTERHORN_CRYPTO_APP_WALLET_PROOF_SECRET;
    expect(() => createMatterhornCryptoAppRuntime(missingWalletProofSecret))
      .toThrowError(expect.objectContaining({ code: "crypto_app_wallet_proof_secret_required" }));

    const missingOAuthKey = environment("enforce");
    missingOAuthKey.MATTERHORN_CRYPTO_APP_OAUTH_CLIENTS_JSON = JSON.stringify([{
      id: "TEST_OAUTH",
      appId: "certified.exchange",
      manifestRevision: "1.0.0",
      clientId: "matterhorn-client",
      redirectUri: "https://matterhorn.example/oauth/crypto-apps/callback",
      authorizationEndpoint: "https://auth.exchange.example/authorize",
      tokenEndpoint: "https://auth.exchange.example/token",
    }]);
    expect(() => createMatterhornCryptoAppRuntime(missingOAuthKey))
      .toThrowError(expect.objectContaining({ code: "crypto_app_oauth_encryption_key_required" }));
  });

  test("hydrates OAuth only with a dedicated server encryption key", () => {
    const env = environment("shadow");
    env.MATTERHORN_CRYPTO_APP_OAUTH_ENCRYPTION_KEY = "dedicated-oauth-encryption-key-with-at-least-32-characters";
    env.MATTERHORN_CRYPTO_APP_OAUTH_CLIENTS_JSON = JSON.stringify([{
      id: "TEST_OAUTH",
      appId: "certified.exchange",
      manifestRevision: "1.0.0",
      clientId: "matterhorn-client",
      redirectUri: "https://matterhorn.example/oauth/crypto-apps/callback",
      authorizationEndpoint: "https://auth.exchange.example/authorize",
      tokenEndpoint: "https://auth.exchange.example/token",
    }]);
    const runtime = createMatterhornCryptoAppRuntime(env);
    expect(runtime.oauthConnections?.configuredBindings()).toBe(1);
    runtime.close();
  });

  test("rejects private keys, malformed keyrings and duplicate publisher identities", () => {
    const privateKeys = generateKeyPairSync("ed25519");
    const privateEnv = environment();
    privateEnv.MATTERHORN_CRYPTO_APP_PUBLISHER_KEYS_JSON = JSON.stringify([{
      publisherId: "matterhorn",
      keyId: "publisher-1",
      algorithm: "ed25519",
      publicKeyPem: privateKeys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    }]);
    expect(() => createMatterhornCryptoAppRuntime(privateEnv))
      .toThrowError(expect.objectContaining({ code: "crypto_app_private_key_forbidden" }));

    const duplicateEnv = environment();
    const entry = JSON.parse(duplicateEnv.MATTERHORN_CRYPTO_APP_PUBLISHER_KEYS_JSON!)[0];
    duplicateEnv.MATTERHORN_CRYPTO_APP_PUBLISHER_KEYS_JSON = JSON.stringify([entry, entry]);
    expect(() => createMatterhornCryptoAppRuntime(duplicateEnv))
      .toThrowError(expect.objectContaining({ code: "crypto_app_publisher_key_duplicate" }));

    const malformedEnv = environment();
    malformedEnv.MATTERHORN_CRYPTO_APP_PUBLISHER_KEYS_JSON = "not-json";
    expect(() => createMatterhornCryptoAppRuntime(malformedEnv))
      .toThrowError(MatterhornCryptoAppRuntimeConfigurationError);
  });
});
