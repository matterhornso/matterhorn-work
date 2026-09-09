import { describe, expect, test } from "bun:test";

import {
  CUDOS_INFERENCE_BASE_URL,
  CUDOS_MODELS,
  resolveManagedCudosModelCatalog,
} from "./cudos-provider.js";

describe("managed CUDOS model catalog", () => {
  test("loads every valid provider model without exposing the credential", async () => {
    let authorization = "";
    const catalog = await resolveManagedCudosModelCatalog({
      apiKey: "private-cudos-key",
      fetchImpl: Object.assign(async (url: string | URL | Request, init?: RequestInit) => {
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        expect(String(url)).toBe(`${CUDOS_INFERENCE_BASE_URL}/models`);
        return Response.json({
          object: "list",
          data: [
            { id: "provider/new-model", object: "model" },
            { id: "asi1-mini", name: "ASI1 Mini", object: "model" },
            { id: "provider/new-model", name: "Newest display name", object: "model" },
            { id: "__proto__", object: "model" },
            { id: "invalid model id", object: "model" },
          ],
        });
      }, { preconnect: fetch.preconnect }),
    });

    expect(authorization).toBe("Bearer private-cudos-key");
    expect(catalog).toEqual({
      source: "provider",
      models: [
        { id: "asi1-mini", name: "ASI1 Mini" },
        { id: "provider/new-model", name: "Newest display name" },
      ],
    });
    expect(JSON.stringify(catalog)).not.toContain("private-cudos-key");
  });

  test("fails safely to the reviewed catalog when discovery is unavailable", async () => {
    const catalog = await resolveManagedCudosModelCatalog({
      apiKey: "private-cudos-key",
      fetchImpl: Object.assign(async () => new Response("unavailable", { status: 503 }), {
        preconnect: fetch.preconnect,
      }),
    });

    expect(catalog).toEqual({ source: "fallback", models: CUDOS_MODELS });
  });

  test("does not contact the provider without a credential", async () => {
    let calls = 0;
    const catalog = await resolveManagedCudosModelCatalog({
      apiKey: "",
      fetchImpl: Object.assign(async () => {
        calls += 1;
        return Response.json({ data: [] });
      }, { preconnect: fetch.preconnect }),
    });

    expect(calls).toBe(0);
    expect(catalog).toEqual({ source: "fallback", models: CUDOS_MODELS });
  });
});
