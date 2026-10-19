import { describe, expect, test } from "bun:test";
import { chmod, link, mkdir, mkdtemp, open, readFile, readdir, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MATTERHORN_IMAGE_FORMATS } from "@matterhorn-work/types/generated-media";

import {
  createImageGenerationProvider,
  resolveImageGenerationProviderFromEnv,
  writeGeneratedImageFile,
} from "./image-generation-provider.js";

describe("image generation provider config", () => {
  test("new image output files and directories use owner-only permissions", async () => {
    const root = await mkdtemp(join(tmpdir(), "matterhorn-image-permissions-"));
    try {
      const bytes = Buffer.from("synthetic generated image");
      const image = await writeGeneratedImageFile(root, "img_permissions", "png", bytes);
      expect(image.fileName).toBe("img_permissions.png");
      expect(image.relativePath).toBe(".matterhorn-work/outputs/images/img_permissions.png");
      expect(image.byteLength).toBe(bytes.length);
      const handle = await open(join(root, image.relativePath), "r");
      try {
        if (process.platform !== "win32") expect((await handle.stat()).mode & 0o777).toBe(0o600);
        expect(await handle.readFile()).toEqual(bytes);
      } finally {
        await handle.close();
      }
      if (process.platform !== "win32") {
        for (const relativePath of [".matterhorn-work", ".matterhorn-work/outputs", ".matterhorn-work/outputs/images"]) {
          expect((await stat(join(root, relativePath))).mode & 0o777).toBe(0o700);
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("exclusive image creation preserves existing files, symlinks and hard links", async () => {
    const root = await mkdtemp(join(tmpdir(), "matterhorn-image-exclusive-"));
    try {
      const dir = join(root, ".matterhorn-work", "outputs", "images");
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const ownerPath = join(root, "synthetic-owner-content.txt");
      await writeFile(ownerPath, "owner content", { mode: 0o600 });
      for (const kind of ["regular", "symlink", "hardlink"]) {
        const imageId = `img_existing_${kind}`;
        const outputPath = join(dir, `${imageId}.png`);
        if (kind === "regular") await writeFile(outputPath, "owner content", { mode: 0o600 });
        else if (kind === "symlink") await symlink(ownerPath, outputPath);
        else await link(ownerPath, outputPath);

        await expect(writeGeneratedImageFile(root, imageId, "png", Buffer.from("replacement bytes"))).rejects.toMatchObject({ code: "EEXIST" });
        expect(await readFile(outputPath, "utf8")).toBe("owner content");
        expect(await readFile(ownerPath, "utf8")).toBe("owner content");
        if (kind === "symlink") expect(await readlink(outputPath)).toBe(ownerPath);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("image creation leaves existing ancestor permissions and unrelated data unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "matterhorn-image-existing-dirs-"));
    const directories = [".matterhorn-work", ".matterhorn-work/outputs", ".matterhorn-work/outputs/images"];
    try {
      for (const relativePath of directories) {
        const dir = join(root, relativePath);
        await mkdir(dir);
        if (process.platform !== "win32") await chmod(dir, 0o750);
      }
      const marker = join(root, ".matterhorn-work", "synthetic-owner-marker.txt");
      await writeFile(marker, "unchanged owner data", { mode: 0o600 });
      const image = await writeGeneratedImageFile(root, "img_existing_dirs", "jpeg", Buffer.from("synthetic image"));
      expect(image.fileName).toBe("img_existing_dirs.jpg");
      expect(await readFile(marker, "utf8")).toBe("unchanged owner data");
      if (process.platform !== "win32") {
        for (const relativePath of directories) {
          expect((await stat(join(root, relativePath))).mode & 0o777).toBe(0o750);
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

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
