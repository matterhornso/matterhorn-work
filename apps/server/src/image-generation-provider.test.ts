import { describe, expect, test } from "bun:test";

import {
  createImageGenerationProvider,
  resolveImageGenerationProviderFromEnv,
} from "./image-generation-provider.js";

describe("image generation provider config", () => {
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
