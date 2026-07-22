import { applyEdits, modify, parse, printParseErrorCode } from "jsonc-parser";
import { dirname } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { ApiError } from "./errors.js";
import { ensureDir, exists } from "./utils.js";

interface ParseResult<T> {
  data: T;
  raw: string;
}

export async function readJsoncFile<T>(path: string, fallback: T): Promise<ParseResult<T>> {
  if (!(await exists(path))) {
    return { data: fallback, raw: "" };
  }
  const raw = await readFile(path, "utf8");
  const errors: { error: number; offset: number; length: number }[] = [];
  const data = parse(raw, errors, { allowTrailingComma: true }) as T;
  if (errors.length > 0) {
    const details = errors.map((error) => ({
      code: printParseErrorCode(error.error),
      offset: error.offset,
      length: error.length,
    }));
    throw new ApiError(422, "invalid_jsonc", "Failed to parse JSONC", details);
  }
  return { data, raw };
}

export async function updateJsoncTopLevel(path: string, updates: Record<string, unknown>): Promise<void> {
  const hasFile = await exists(path);
  if (!hasFile) {
    await ensureDir(dirname(path));
    const content = JSON.stringify(updates, null, 2) + "\n";
    await writeFile(path, content, "utf8");
    return;
  }

  let content = await readFile(path, "utf8");
  const formattingOptions = { insertSpaces: true, tabSize: 2, eol: "\n" };
  for (const [key, value] of Object.entries(updates)) {
    const edits = modify(content, [key], value, { formattingOptions });
    content = applyEdits(content, edits);
  }
  await writeFile(path, content.endsWith("\n") ? content : content + "\n", "utf8");
}

export async function updateJsoncPath(path: string, jsonPath: (string | number)[], value: unknown): Promise<void> {
  const formattingOptions = { insertSpaces: true, tabSize: 2, eol: "\n" };
  const hasFile = await exists(path);
  if (!hasFile) {
    await ensureDir(dirname(path));
    let content = "{}\n";
    const edits = modify(content, jsonPath, value, { formattingOptions });
    content = applyEdits(content, edits);
    await writeFile(path, content.endsWith("\n") ? content : content + "\n", "utf8");
    return;
  }

  let content = await readFile(path, "utf8");
  const edits = modify(content, jsonPath, value, { formattingOptions });
  content = applyEdits(content, edits);
  await writeFile(path, content.endsWith("\n") ? content : content + "\n", "utf8");
}

export async function updateJsoncExternalDirectoryPermission(
  path: string,
  existingPermission: unknown,
  nextExternalDirectory: unknown,
): Promise<void> {
  if (typeof existingPermission === "string") {
    if (typeof nextExternalDirectory === "undefined") return;
    await updateJsoncPath(path, ["permission"], {
      "*": existingPermission,
      external_directory: nextExternalDirectory,
    });
    return;
  }

  const existingPermissionObject =
    existingPermission && typeof existingPermission === "object" && !Array.isArray(existingPermission)
      ? (existingPermission as Record<string, unknown>)
      : {};
  const existingPermissionKeys = Object.keys(existingPermissionObject);
  const removePermissionParent =
    typeof nextExternalDirectory === "undefined" &&
    (existingPermissionKeys.length === 0 ||
      (existingPermissionKeys.length === 1 &&
        Object.prototype.hasOwnProperty.call(existingPermissionObject, "external_directory")));

  if (removePermissionParent) {
    await updateJsoncPath(path, ["permission"], undefined);
    return;
  }

  await updateJsoncPath(path, ["permission", "external_directory"], nextExternalDirectory);
}

export async function writeJsoncFile(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  const content = JSON.stringify(value, null, 2) + "\n";
  await writeFile(path, content, "utf8");
}
