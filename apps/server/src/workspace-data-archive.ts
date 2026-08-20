import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, type FileHandle } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

import type { WorkspaceInfo } from "./types.js";

const gzipAsync = promisify(gzip);
const DEFAULT_MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_BYTES_UPPER_BOUND = 256 * 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_FILE_COUNT = 5_000;
const ARCHIVE_READ_CHUNK_BYTES = 64 * 1024;

export class WorkspaceArchiveLimitError extends Error {
  readonly code = "workspace_archive_too_large";

  constructor(message: string) {
    super(message);
    this.name = "WorkspaceArchiveLimitError";
  }
}

export type MatterhornWorkspaceArchiveFile = {
  path: string;
  size: number;
  updatedAt: string;
  encoding: "utf8" | "base64";
  content: string;
};

export type MatterhornWorkspaceArchiveInput = {
  workspace: WorkspaceInfo;
  configuration: unknown;
  mission?: unknown;
  notes: unknown[];
  memory: {
    records: unknown[];
    suggestions: unknown[];
  };
  chats: Array<{
    session: unknown;
    messages: unknown[];
    todos: unknown[];
  }>;
  receipts?: unknown[];
  activity: unknown;
};

export type MatterhornWorkspaceArchiveResult = {
  filename: string;
  contentType: "application/gzip";
  compressed: Buffer;
  uncompressedBytes: number;
  sha256: string;
  counts: {
    notes: number;
    memoryRecords: number;
    memorySuggestions: number;
    chats: number;
    messages: number;
    receipts: number;
    files: number;
  };
};

function boundedEnvironmentInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(parsed, maximum));
}

function archiveLimits() {
  const totalBytes = boundedEnvironmentInteger(
    "MATTERHORN_WORKSPACE_ARCHIVE_MAX_BYTES",
    DEFAULT_MAX_ARCHIVE_BYTES,
    1024 * 1024,
    MAX_ARCHIVE_BYTES_UPPER_BOUND,
  );
  return {
    totalBytes,
    fileBytes: Math.min(
      totalBytes,
      boundedEnvironmentInteger(
        "MATTERHORN_WORKSPACE_ARCHIVE_MAX_FILE_BYTES",
        DEFAULT_MAX_FILE_BYTES,
        1024,
        MAX_ARCHIVE_BYTES_UPPER_BOUND,
      ),
    ),
    fileCount: boundedEnvironmentInteger(
      "MATTERHORN_WORKSPACE_ARCHIVE_MAX_FILES",
      DEFAULT_MAX_FILE_COUNT,
      1,
      25_000,
    ),
  };
}

function archiveFilename(
  workspace: WorkspaceInfo,
  generatedAt: string,
): string {
  const source = workspace.name || workspace.id;
  const normalized: string[] = [];
  let separatorPending = false;
  for (const character of source) {
    const code = character.codePointAt(0) ?? -1;
    const allowed =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      character === "." ||
      character === "_" ||
      character === "-";
    if (!allowed) {
      separatorPending = true;
      continue;
    }
    if (separatorPending) normalized.push("-");
    normalized.push(character);
    separatorPending = false;
  }
  let start = 0;
  let end = normalized.length;
  while (start < end && normalized[start] === "-") start += 1;
  while (end > start && normalized[end - 1] === "-") end -= 1;
  const workspacePart = normalized.slice(start, end).join("").slice(0, 80) || "workspace";
  return `matterhorn-workspace-${workspacePart}-${generatedAt.slice(0, 10)}.json.gz`;
}

async function readBoundedArchiveFile(
  handle: FileHandle,
  maximumBytes: number,
  displayPath: string,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (totalBytes <= maximumBytes) {
    const remaining = maximumBytes + 1 - totalBytes;
    const chunk = Buffer.allocUnsafe(Math.min(ARCHIVE_READ_CHUNK_BYTES, remaining));
    const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, totalBytes);
    if (bytesRead === 0) break;
    chunks.push(chunk.subarray(0, bytesRead));
    totalBytes += bytesRead;
  }
  if (totalBytes > maximumBytes) {
    throw new WorkspaceArchiveLimitError(
      `Workspace archive file ${displayPath} exceeds the ${maximumBytes}-byte per-file safety limit.`,
    );
  }
  return Buffer.concat(chunks, totalBytes);
}

function encodeFileContent(
  bytes: Buffer,
): Pick<MatterhornWorkspaceArchiveFile, "encoding" | "content"> {
  try {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!content.includes("\0")) return { encoding: "utf8", content };
  } catch {
    // Binary data is represented losslessly below.
  }
  return { encoding: "base64", content: bytes.toString("base64") };
}

async function collectDirectoryFiles(input: {
  workspaceRoot: string;
  rootRelativePath: string;
  files: MatterhornWorkspaceArchiveFile[];
  limits: ReturnType<typeof archiveLimits>;
  state: { rawBytes: number };
}): Promise<void> {
  const rootPath = join(input.workspaceRoot, input.rootRelativePath);
  let rootInfo;
  try {
    rootInfo = await lstat(rootPath);
  } catch {
    return;
  }
  if (!rootInfo.isDirectory()) return;

  const visit = async (directory: string): Promise<void> => {
    const directoryInfo = await lstat(directory);
    if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) return;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (input.files.length >= input.limits.fileCount) {
        throw new WorkspaceArchiveLimitError(
          `Workspace archive exceeds the ${input.limits.fileCount}-file safety limit. Remove old outputs or raise MATTERHORN_WORKSPACE_ARCHIVE_MAX_FILES.`,
        );
      }
      const displayPath = relative(input.workspaceRoot, absolutePath).replaceAll("\\", "/");
      let handle: FileHandle;
      try {
        handle = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
        if (code === "ENOENT" || code === "ELOOP") continue;
        throw error;
      }
      try {
        const before = await handle.stat();
        if (!before.isFile()) continue;
        if (before.size > input.limits.fileBytes) {
          throw new WorkspaceArchiveLimitError(
            `Workspace archive file ${displayPath} exceeds the ${input.limits.fileBytes}-byte per-file safety limit.`,
          );
        }
        const bytes = await readBoundedArchiveFile(
          handle,
          input.limits.fileBytes,
          displayPath,
        );
        const after = await handle.stat();
        if (
          before.dev !== after.dev ||
          before.ino !== after.ino ||
          before.size !== after.size ||
          before.mtimeMs !== after.mtimeMs ||
          after.size !== bytes.byteLength
        ) {
          throw new Error(
            `Workspace archive file ${displayPath} changed during export. Retry the download.`,
          );
        }
        input.state.rawBytes += bytes.byteLength;
        if (input.state.rawBytes > input.limits.totalBytes) {
          throw new WorkspaceArchiveLimitError(
            `Workspace archive files exceed the ${input.limits.totalBytes}-byte safety limit. Remove old outputs or raise MATTERHORN_WORKSPACE_ARCHIVE_MAX_BYTES.`,
          );
        }
        input.files.push({
          path: displayPath,
          size: bytes.byteLength,
          updatedAt: after.mtime.toISOString(),
          ...encodeFileContent(bytes),
        });
      } finally {
        await handle.close();
      }
    }
  };

  await visit(rootPath);
}

function messageCount(chats: MatterhornWorkspaceArchiveInput["chats"]): number {
  return chats.reduce((count, chat) => count + chat.messages.length, 0);
}

export async function buildMatterhornWorkspaceArchive(
  input: MatterhornWorkspaceArchiveInput,
): Promise<MatterhornWorkspaceArchiveResult> {
  const generatedAt = new Date().toISOString();
  const limits = archiveLimits();
  const files: MatterhornWorkspaceArchiveFile[] = [];
  const state = { rawBytes: 0 };
  for (const rootRelativePath of [
    "notes",
    "outputs",
    ".matterhorn-work/outputs",
  ]) {
    await collectDirectoryFiles({
      workspaceRoot: input.workspace.path,
      rootRelativePath,
      files,
      limits,
      state,
    });
  }

  const counts = {
    notes: input.notes.length,
    memoryRecords: input.memory.records.length,
    memorySuggestions: input.memory.suggestions.length,
    chats: input.chats.length,
    messages: messageCount(input.chats),
    receipts: input.receipts?.length ?? 0,
    files: files.length,
  };
  const data = {
    configuration: input.configuration,
    mission: input.mission ?? null,
    notes: input.notes,
    memory: input.memory,
    chats: input.chats,
    receipts: input.receipts ?? [],
    activity: input.activity,
    files,
  };
  const dataJson = JSON.stringify(data);
  const archive = {
    version: "matterhorn.workspace-data-archive.v1",
    generatedAt,
    workspace: {
      id: input.workspace.id,
      name: input.workspace.name,
      type: input.workspace.workspaceType,
      preset: input.workspace.preset,
    },
    manifest: {
      counts,
      includes: [
        "sanitized workspace configuration",
        "the current project mission and coordination context",
        "chat sessions with full message bodies and todos",
        "minimal guarded-agent security receipts without raw prompts or capability values",
        "active note records",
        "confirmed memory records and the complete memory review inbox",
        "rendered note files, outputs, and generated output files",
        "a redacted normalized activity snapshot",
      ],
      excludes: [
        "account credentials, authentication sessions, password and recovery material",
        "raw provider credentials and unsanitized workspace configuration",
        "provider-side logs and data retained outside Matterhorn",
        "symlinks and original inbox uploads stored outside the workspace",
      ],
      redaction: {
        configuration:
          "Secrets and sensitive provider configuration are excluded.",
        activity: "Known secret-shaped activity text is redacted.",
        userContent:
          "Mission, chat, note, memory, and output content is exported as stored for the workspace owner.",
      },
      limits: {
        maxUncompressedBytes: limits.totalBytes,
        maxFileBytes: limits.fileBytes,
        maxFileCount: limits.fileCount,
        behavior:
          "The export fails instead of truncating when a safety limit is exceeded.",
      },
      integrity: {
        algorithm: "sha256",
        dataSha256: createHash("sha256").update(dataJson).digest("hex"),
      },
    },
    data,
  };
  const archiveBytes = Buffer.from(
    `${JSON.stringify(archive, null, 2)}\n`,
    "utf8",
  );
  if (archiveBytes.byteLength > limits.totalBytes) {
    throw new WorkspaceArchiveLimitError(
      `Workspace archive is ${archiveBytes.byteLength} bytes before compression and exceeds the ${limits.totalBytes}-byte safety limit.`,
    );
  }
  const compressed = await gzipAsync(archiveBytes, { level: 9 });

  return {
    filename: archiveFilename(input.workspace, generatedAt),
    contentType: "application/gzip",
    compressed,
    uncompressedBytes: archiveBytes.byteLength,
    sha256: createHash("sha256").update(compressed).digest("hex"),
    counts,
  };
}
