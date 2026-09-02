import { afterEach, describe, expect, test } from "bun:test";

import {
  buildManagedVeniceProviderConfig,
  configureVenicePrivateModelRegistry,
  discoverVenicePrivateModels,
  hasRegisteredVenicePrivateModels,
  isRegisteredVenicePrivateModel,
  parseVenicePrivateModels,
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

  test("discovers the public catalog without sending a provider credential", async () => {
    let requestInit: RequestInit | undefined;
    const models = await discoverVenicePrivateModels({
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe(VENICE_MODELS_URL);
        requestInit = init;
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [model({ id: "private-tools" })] }),
        };
      },
    });

    expect(models).toEqual([{ id: "private-tools", name: "private-tools" }]);
    expect(requestInit?.headers).toEqual({ Accept: "application/json" });
    expect(JSON.stringify(requestInit)).not.toContain("Authorization");
    expect(JSON.stringify(requestInit)).not.toContain("VENICE_API_KEY");
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
    configureVenicePrivateModelRegistry([{ id: "private-tools", name: "Private Tools" }]);

    expect(hasRegisteredVenicePrivateModels()).toBe(true);
    expect(isRegisteredVenicePrivateModel("private-tools")).toBe(true);
    expect(isRegisteredVenicePrivateModel("anonymized-tools")).toBe(false);
  });
});
