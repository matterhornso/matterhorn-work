import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

import type { WorkspaceInfo } from "./types.js";

const gzipAsync = promisify(gzip);
const DEFAULT_MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_BYTES_UPPER_BOUND = 256 * 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_FILE_COUNT = 5_000;

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
  const workspacePart =
    (workspace.name || workspace.id)
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "workspace";
  return `matterhorn-workspace-${workspacePart}-${generatedAt.slice(0, 10)}.json.gz`;
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
    rootInfo = await stat(rootPath);
  } catch {
    return;
  }
  if (!rootInfo.isDirectory()) return;

  const visit = async (directory: string): Promise<void> => {
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
        throw new Error(
          `Workspace archive exceeds the ${input.limits.fileCount}-file safety limit. Remove old outputs or raise MATTERHORN_WORKSPACE_ARCHIVE_MAX_FILES.`,
        );
      }
      const info = await stat(absolutePath);
      if (info.size > input.limits.fileBytes) {
        throw new Error(
          `Workspace archive file ${relative(input.workspaceRoot, absolutePath)} exceeds the ${input.limits.fileBytes}-byte per-file safety limit.`,
        );
      }
      input.state.rawBytes += info.size;
      if (input.state.rawBytes > input.limits.totalBytes) {
        throw new Error(
          `Workspace archive files exceed the ${input.limits.totalBytes}-byte safety limit. Remove old outputs or raise MATTERHORN_WORKSPACE_ARCHIVE_MAX_BYTES.`,
        );
      }
      const bytes = await readFile(absolutePath);
      input.files.push({
        path: relative(input.workspaceRoot, absolutePath).replaceAll("\\", "/"),
        size: info.size,
        updatedAt: info.mtime.toISOString(),
        ...encodeFileContent(bytes),
      });
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
    files: files.length,
  };
  const data = {
    configuration: input.configuration,
    notes: input.notes,
    memory: input.memory,
    chats: input.chats,
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
        "chat sessions with full message bodies and todos",
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
          "Chat, note, memory, and output content is exported as stored for the workspace owner.",
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
    throw new Error(
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
