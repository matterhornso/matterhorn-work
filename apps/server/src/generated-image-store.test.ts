import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import { MATTERHORN_IMAGE_FORMATS, type MatterhornGeneratedImage } from "@matterhorn-work/types/generated-media";
import { imageFilePath, MatterhornGeneratedImageStore, readGeneratedImageFile } from "./generated-image-store.js";

const roots: string[] = [];
const WORKSPACE_ID = "ws_fixture";

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "generated-image-store-"));
  roots.push(root);
  const workspace = join(root, "workspace");
  const dir = join(workspace, ".matterhorn-work", "outputs", "images");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return { root, workspace, dir, store: new MatterhornGeneratedImageStore({ workspaceRoot: workspace, workspaceId: WORKSPACE_ID }) };
}

function image(id = "img_legacy_fixture"): MatterhornGeneratedImage {
  return {
    id, workspaceId: WORKSPACE_ID, outputId: `out_${id}`, provider: "mock", model: "fixture-model", prompt: "synthetic fixture",
    size: "1024x1024", quality: "auto", format: "png", fileName: `${id}.png`, relativePath: `.matterhorn-work/outputs/images/${id}.png`,
    contentType: "image/png", byteLength: 5, sha256: "0".repeat(64), createdAt: "2026-10-18T00:00:00.000Z", status: "generated", safety: { secretsRejected: false },
  };
}

test("valid current and legacy records preserve supported filename, MIME and format relationships", async () => {
  const { workspace, store } = await fixture();
  for (const format of MATTERHORN_IMAGE_FORMATS) {
    const id = format === "png" ? "img_0123456789abcdef0123456789abcdef" : `legacy_${format}-1`;
    const extension = format === "jpeg" ? "jpg" : format;
    const value: MatterhornGeneratedImage = { ...image(id), format, fileName: `${id}.${extension}`, relativePath: `.matterhorn-work/outputs/images/${id}.${extension}`, contentType: `image/${format}` };
    await store.save(value);
    await writeFile(imageFilePath(workspace, value.fileName), "bytes", { flag: "wx", mode: 0o600 });
    expect(await store.get(id)).toEqual(value);
    expect((await readGeneratedImageFile(workspace, value)).toString()).toBe("bytes");
  }
  expect(await store.list()).toHaveLength(3);
});

test("get and list reject forged identity, path, MIME, format and malformed record fields", async () => {
  const { dir, store } = await fixture();
  const valid = image();
  const patches: Record<string, unknown>[] = [
    { id: "img_other" }, { workspaceId: "ws_other" }, { outputId: "../out" },
    { fileName: "../../../outside.txt" }, { fileName: "/outside.png" }, { fileName: `${valid.id}.png\n` }, { fileName: `${valid.id}\\outside.png` },
    { fileName: "other.png" }, { relativePath: "../../../outside.png" }, { format: "svg" }, { format: "PNG" },
    { contentType: "text/html" }, { contentType: "image/svg+xml" }, { contentType: "image/jpeg" }, { contentType: "image/png\r\nX-Test: value" },
    { byteLength: -1 }, { byteLength: 1.5 }, { byteLength: Number.MAX_SAFE_INTEGER + 1 }, { byteLength: "5" },
    { provider: "other" }, { prompt: null }, { model: 3 }, { promptRevised: {} }, { promptRedacted: "true" },
    { sha256: "0".repeat(63) + "\n" }, { createdAt: "not-a-date" }, { status: "unknown" }, { safety: {} },
    { safety: { secretsRejected: false, copyrightWarning: "true" } },
  ];
  for (const patch of patches) {
    await writeFile(join(dir, `${valid.id}.metadata.json`), JSON.stringify({ ...valid, ...patch }));
    expect(await store.get(valid.id)).toBeNull();
    expect(await store.list()).toEqual([]);
  }
});

test("invalid IDs and file names cannot escape the flat storage namespace, including newline suffixes", async () => {
  const { workspace, store } = await fixture();
  for (const id of ["", ".", "..", "../outside", "/absolute", "a/b", "a\\b", "img\n", "img\r", "img\0", "%2e%2e", "x".repeat(129)]) {
    expect(await store.get(id)).toBeNull();
    expect(await store.delete(id)).toBeNull();
    await expect(store.save(image(id))).rejects.toThrow("Invalid generated image metadata");
  }
  for (const name of ["png", "../outside.png", "/absolute.png", "img.png\n", "img.png/other", "img.svg", "img..png", "img\\other.png"]) {
    expect(() => imageFilePath(workspace, name)).toThrow("Invalid generated image filename");
  }
});

test("malformed, oversized and linked metadata are ignored without reading their target", async () => {
  const { root, dir, store } = await fixture();
  const value = image();
  const path = join(dir, `${value.id}.metadata.json`);
  for (const content of ["{", "null", "[]", JSON.stringify({ ...value, prompt: "x".repeat(256 * 1024) })]) {
    await writeFile(path, content);
    expect(await store.get(value.id)).toBeNull();
    expect(await store.list()).toEqual([]);
  }
  await expect(store.save({ ...value, prompt: "x".repeat(256 * 1024) })).rejects.toThrow("size limit");
  await rm(path);
  const target = join(root, "synthetic-metadata.json");
  await writeFile(target, JSON.stringify(value));
  await symlink(target, path);
  expect(await store.get(value.id)).toBeNull();
  expect(await store.delete(value.id)).toBeNull();
  expect(JSON.parse(await readFile(target, "utf8"))).toEqual(value);
  await rm(path);
  await link(target, path);
  expect(await store.get(value.id)).toBeNull();
  expect(await store.delete(value.id)).toBeNull();
  expect(JSON.parse(await readFile(target, "utf8"))).toEqual(value);
});

test("image reads refuse symlinks, hardlinks, nonregular files and mismatched byte lengths", async () => {
  const { root, workspace, store } = await fixture();
  const value = image();
  await store.save(value);
  const path = imageFilePath(workspace, value.fileName);
  const target = join(root, "synthetic-outside.txt");
  await writeFile(target, "bytes");
  await symlink(target, path);
  await expect(readGeneratedImageFile(workspace, value)).rejects.toThrow();
  await store.delete(value.id);
  expect(await readFile(target, "utf8")).toBe("bytes");
  await link(target, path);
  await expect(readGeneratedImageFile(workspace, value)).rejects.toThrow();
  await rm(path);
  await mkdir(path);
  await expect(readGeneratedImageFile(workspace, value)).rejects.toThrow();
  await rm(path, { recursive: true });
  for (const content of ["tiny", "longer"]) {
    await writeFile(path, content);
    await expect(readGeneratedImageFile(workspace, value)).rejects.toThrow("size or type");
  }
});

test("forged deletion metadata never removes a file outside image outputs", async () => {
  const { root, dir, store } = await fixture();
  const target = join(root, "synthetic-outside.txt");
  await writeFile(target, "preserve synthetic owner bytes");
  const value = image();
  await writeFile(join(dir, `${value.id}.metadata.json`), JSON.stringify({ ...value, fileName: "../../../../synthetic-outside.txt" }));
  expect(await store.delete(value.id)).toBeNull();
  expect(await readFile(target, "utf8")).toBe("preserve synthetic owner bytes");
});
