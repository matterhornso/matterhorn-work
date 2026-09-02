import { afterEach, describe, expect, test } from "bun:test";

import {
  buildManagedVeniceProviderConfig,
  configureVenicePrivateModelRegistry,
  discoverVenicePrivateModels,
  hasRegisteredVenicePrivateModels,
  isRegisteredVenicePrivateModel,
  parseVenicePrivateModels,
  startManagedVenicePrivateModelRegistryRefresh,
  venicePrivateModelRegistryStatus,
  VENICE_MODELS_URL,
} from "./venice-provider.js";

afterEach(() => {
  configureVenicePrivateModelRegistry([]);
});

function model(input: {
  id: string;
  privacy?: string;
  type?: string;
  tools?: boolean;
  offline?: boolean;
  name?: string;
}) {
  return {
    id: input.id,
    type: input.type ?? "text",
    model_spec: {
      name: input.name ?? input.id,
      privacy: input.privacy ?? "private",
      offline: input.offline ?? false,
      capabilities: {
        supportsFunctionCalling: input.tools ?? true,
      },
    },
  };
}

describe("Venice private provider", () => {
  test("admits only current private, text, tool-capable models", () => {
    const models = parseVenicePrivateModels({
      data: [
        model({ id: "z-ai-glm-5-3", name: "GLM 5.3" }),
        model({ id: "anonymized", privacy: "anonymized" }),
        model({ id: "image", type: "image" }),
        model({ id: "no-tools", tools: false }),
        model({ id: "offline", offline: true }),
        model({ id: "bad id with spaces" }),
      ],
    });

    expect(models).toEqual([{ id: "z-ai-glm-5-3", name: "GLM 5.3" }]);
  });

  test("places a recommended private model first without accepting anonymized models", () => {
    const models = parseVenicePrivateModels({
      data: [
        model({ id: "alpha-private", name: "Alpha Private" }),
        model({ id: "z-ai-glm-5-3-flash", name: "GLM 5.3 Flash" }),
        model({ id: "openai-gpt-56-sol", privacy: "anonymized" }),
      ],
    });

    expect(models.map((entry) => entry.id)).toEqual([
      "z-ai-glm-5-3-flash",
      "alpha-private",
    ]);
  });

  test("discovers the public catalog only through the exact pinned endpoint without a credential", async () => {
    let requested = false;
    const models = await discoverVenicePrivateModels({
      resolveEndpoint: async (value) => {
        expect(value).toBe(VENICE_MODELS_URL);
        return {
          endpoint: new URL(VENICE_MODELS_URL),
          hostname: "api.venice.ai",
          approvedAddresses: ["93.184.216.34"],
        };
      },
      requestJson: async (input) => {
        requested = true;
        expect(input).toMatchObject({
          endpoint: new URL(VENICE_MODELS_URL),
          approvedAddresses: ["93.184.216.34"],
          method: "GET",
        });
        expect(input.headers).toBeUndefined();
        expect(input.body).toBeUndefined();
        return {
          value: { data: [model({ id: "private-tools" })] },
          connectedAddress: "93.184.216.34",
          requestBytes: 0,
          responseBytes: 256,
        };
      },
    });

    expect(requested).toBe(true);
    expect(models).toEqual([{ id: "private-tools", name: "private-tools" }]);
  });

  test("rejects endpoint substitution and invalid timeout bounds before provider contact", async () => {
    let requested = false;
    await expect(discoverVenicePrivateModels({
      resolveEndpoint: async () => ({
        endpoint: new URL("https://attacker.example/models"),
        hostname: "attacker.example",
        approvedAddresses: ["93.184.216.34"],
      }),
      requestJson: async () => {
        requested = true;
        throw new Error("must not request");
      },
    })).rejects.toThrow("venice_private_model_discovery_endpoint_invalid");
    await expect(discoverVenicePrivateModels({ timeoutMs: 0 })).rejects
      .toThrow("venice_private_model_discovery_timeout_invalid");
    expect(requested).toBe(false);
  });

  test("keeps API keys out of the generated OpenCode config", () => {
    const config = buildManagedVeniceProviderConfig([
      { id: "private-tools", name: "Private Tools" },
    ]);
    const serialized = JSON.stringify(config);

    expect(config.env).toEqual(["VENICE_API_KEY"]);
    expect(config.options.baseURL).toBe("https://api.venice.ai/api/v1");
    expect(config.models).toEqual({ "private-tools": { name: "Private Tools" } });
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("Bearer");
  });

  test("tracks the exact runtime-verified model ids", () => {
    const verifiedAt = new Date("2026-09-02T12:00:00.000Z");
    configureVenicePrivateModelRegistry(
      [{ id: "private-tools", name: "Private Tools" }],
      { now: verifiedAt, ttlMs: 60_000 },
    );

    expect(hasRegisteredVenicePrivateModels(new Date("2026-09-02T12:00:59.999Z"))).toBe(true);
    expect(isRegisteredVenicePrivateModel("private-tools", new Date("2026-09-02T12:00:59.999Z"))).toBe(true);
    expect(isRegisteredVenicePrivateModel("anonymized-tools", new Date("2026-09-02T12:00:59.999Z"))).toBe(false);
    expect(hasRegisteredVenicePrivateModels(new Date("2026-09-02T12:01:00.000Z"))).toBe(false);
    expect(isRegisteredVenicePrivateModel("private-tools", new Date("2026-09-02T12:01:00.000Z"))).toBe(false);
    expect(venicePrivateModelRegistryStatus(new Date("2026-09-02T12:01:00.000Z"))).toEqual({
      active: false,
      verifiedAt: "2026-09-02T12:00:00.000Z",
      expiresAt: "2026-09-02T12:01:00.000Z",
    });
  });

  test("refreshes the private-model proof before expiry and stops cleanly", async () => {
    let scheduled: (() => void) | undefined;
    let scheduledInterval = 0;
    let refreshes = 0;
    let cancelled = false;
    const refresh = startManagedVenicePrivateModelRegistryRefresh({
      env: { VENICE_API_KEY: "present-but-never-read-by-the-refresh-test" },
      refresh: async () => { refreshes += 1; },
      schedule: (callback, intervalMs) => {
        scheduled = callback;
        scheduledInterval = intervalMs;
        return {
          cancel: () => { cancelled = true; },
          unref: () => undefined,
        };
      },
    });
    expect(scheduledInterval).toBe(12 * 60 * 60 * 1_000);
    if (!scheduled) throw new Error("missing_refresh_callback");
    scheduled();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(refreshes).toBe(1);
    refresh.stop();
    expect(cancelled).toBe(true);
  });
});
