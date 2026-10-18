import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MATTERHORN_IMAGE_FORMATS } from "@matterhorn-work/types/generated-media";

import {
  createImageGenerationProvider,
  resolveImageGenerationProviderFromEnv,
} from "./image-generation-provider.js";

describe("image generation provider config", () => {
  test("unsupported request formats are rejected before provider requests or file writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "matterhorn-image-format-"));
    const priorFetch = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = Object.assign(async () => {
      requests += 1;
      return Response.json({ data: [{ b64_json: Buffer.from("synthetic image").toString("base64") }] });
    }, { preconnect() {} });
    try {
      for (const providerName of ["mock", "openai"] as const) {
        const provider = createImageGenerationProvider({ provider: providerName, apiKey: "synthetic-test-key" });
        for (const format of ["gif", "jpg", "PNG", " png", "png ", "", "../outside", "png/../../outside", "png\\..\\outside", "/absolute", "C:\\outside", "png%2f..%2foutside", "png\0suffix", null, 7, {}, ["png"]]) {
          const input = { prompt: "a careful mountain workspace", workspaceId: "ws_test", storageDir: root };
          // Exercise a runtime caller without weakening the production input type.
          Object.defineProperty(input, "format", { value: format });
          const result = await provider.generate(input);
          expect(result.success).toBe(false);
          if (!result.success) expect(result.code).toBe("invalid_image_format");
          expect(await readdir(root)).toEqual([]);
        }
      }
      expect(requests).toBe(0);
      expect(await readdir(root)).toEqual([]);
    } finally {
      globalThis.fetch = priorFetch;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("the public image formats and omitted default retain fixed output extensions", async () => {
    const root = await mkdtemp(join(tmpdir(), "matterhorn-image-valid-format-"));
    const priorFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(async () => Response.json({ data: [{ b64_json: Buffer.from("synthetic image").toString("base64") }] }), { preconnect() {} });
    try {
      for (const providerName of ["mock", "openai"] as const) {
        const provider = createImageGenerationProvider({ provider: providerName, apiKey: "synthetic-test-key" });
        for (const format of [undefined, ...MATTERHORN_IMAGE_FORMATS]) {
          const result = await provider.generate({ prompt: "a careful mountain workspace", workspaceId: "ws_test", storageDir: root, format });
          expect(result.success).toBe(true);
          if (!result.success) continue;
          const expectedFormat = format ?? "png";
          const expectedExtension = expectedFormat === "jpeg" ? "jpg" : expectedFormat;
          expect(result.image.format).toBe(expectedFormat);
          expect(result.image.fileName).toBe(`${result.image.id}.${expectedExtension}`);
          expect(result.image.relativePath).toBe(`.matterhorn-work/outputs/images/${result.image.fileName}`);
          expect(result.image.contentType).toBe(`image/${expectedFormat}`);
        }
      }
      expect((await readdir(join(root, ".matterhorn-work", "outputs", "images"))).length).toBe(8);
    } finally {
      globalThis.fetch = priorFetch;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("invalid MATTERHORN_IMAGE_PROVIDER reports error instead of falling back to mock", async () => {
    const config = resolveImageGenerationProviderFromEnv({
      MATTERHORN_IMAGE_PROVIDER: "banana",
    } as typeof process.env);
    const provider = createImageGenerationProvider(config);

    const status = await provider.status();
    expect(status.status).toBe("error");
    expect(status.message).toContain("MATTERHORN_IMAGE_PROVIDER");

    const generated = await provider.generate({
      prompt: "a careful mountain workspace",
      workspaceId: "ws_test",
      storageDir: "/tmp/matterhorn-no-write",
    });
    expect(generated.success).toBe(false);
    if (!generated.success) {
      expect(generated.code).toBe("image_provider_invalid_config");
    }
  });

  test("invalid image defaults report the exact setup field", async () => {
    const config = resolveImageGenerationProviderFromEnv({
      MATTERHORN_IMAGE_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test-not-real",
      MATTERHORN_IMAGE_SIZE: "2048x2048",
    } as typeof process.env);
    const status = await createImageGenerationProvider(config).status();

    expect(status.status).toBe("error");
    expect(status.message).toContain("MATTERHORN_IMAGE_SIZE");
  });

  test("OpenAI image generation uses a bounded provider timeout", async () => {
    const priorFetch = globalThis.fetch;
    let observedSignal: AbortSignal | null = null;
    globalThis.fetch = (async (_input, init) => {
      observedSignal = init?.signal instanceof AbortSignal ? init.signal : null;
      return Response.json({ error: { message: "provider temporarily unavailable" } }, { status: 503 });
    }) as typeof fetch;
    try {
      const provider = createImageGenerationProvider({
        provider: "openai",
        apiKey: "sk-test-not-real",
      });
      const result = await provider.generate({
        prompt: "a calm mountain workspace",
        workspaceId: "ws_test",
        storageDir: "/tmp/matterhorn-no-write",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("image_provider_error");
      }
      const signal = observedSignal as AbortSignal | null;
      expect(signal).toBeInstanceOf(AbortSignal);
      if (signal) expect(signal.aborted).toBe(false);
    } finally {
      globalThis.fetch = priorFetch;
    }
  });
});
