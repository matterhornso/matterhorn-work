import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  MATTERHORN_NOTE_DESKS,
  MATTERHORN_NOTE_LINK_KINDS,
  MATTERHORN_NOTE_SOURCES,
  MATTERHORN_NOTE_VERSION,
  type MatterhornNote,
  type MatterhornNoteCreateRequest,
  type MatterhornNoteDesk,
  type MatterhornNoteLink,
  type MatterhornNoteListOptions,
  type MatterhornNoteSource,
  type MatterhornNoteUpdateRequest,
} from "@matterhorn-work/types/notes";

const MATTERHORN_NOTES_INDEX_VERSION = "matterhorn.notes.index.v1" as const;
const MAX_NOTE_BODY_BYTES = 500_000;
const MAX_NOTE_TITLE_LENGTH = 160;
const MAX_NOTE_TAGS = 24;
const MAX_NOTE_LINKS = 24;
const noteMutationQueues = new Map<string, Promise<void>>();

async function withNoteMutationLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = noteMutationQueues.get(key) ?? Promise.resolve();
  let release = () => {};
  const ticket = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => ticket);
  noteMutationQueues.set(key, queued);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (noteMutationQueues.get(key) === queued) noteMutationQueues.delete(key);
  }
}

interface MatterhornNoteIndex {
  version: typeof MATTERHORN_NOTES_INDEX_VERSION;
  updatedAt: string;
  entries: Record<string, MatterhornNote>;
}

export class MatterhornNotesStore {
  readonly workspaceRoot: string;
  readonly workspaceId: string;
  readonly notesDir: string;
  readonly indexDir: string;
  readonly indexPath: string;

  constructor(options: { workspaceRoot: string; workspaceId: string }) {
    this.workspaceRoot = options.workspaceRoot;
    this.workspaceId = options.workspaceId;
    this.notesDir = path.join(this.workspaceRoot, "notes");
    this.indexDir = path.join(this.workspaceRoot, ".matterhorn-work", "notes");
    this.indexPath = path.join(this.indexDir, "index.json");
  }

  async initialize(): Promise<void> {
    await withNoteMutationLock(this.indexPath, () => this.initializeUnlocked());
  }

  private async initializeUnlocked(): Promise<void> {
    await mkdir(this.notesDir, { recursive: true });
    await mkdir(this.indexDir, { recursive: true });
    try {
      await readFile(this.indexPath, "utf8");
    } catch {
      await this.writeIndex(emptyNotesIndex());
    }
  }

  async listNotes(options: MatterhornNoteListOptions = {}): Promise<MatterhornNote[]> {
    await this.initialize();
    const limit = Math.max(1, Math.min(options.limit ?? 100, 500));
    const query = options.query?.trim().toLowerCase();
    const tags = (options.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean);
    const desk = normalizeDesk(options.desk);
    const notes = Object.values((await this.readIndex()).entries)
      .filter((note) => options.includeDeleted ? true : !note.deletedAt)
      .filter((note) => desk ? normalizeDesk(note.desk) === desk : true)
      .filter((note) => options.sessionId ? note.sessionId === options.sessionId : true)
      .filter((note) => options.taskId ? note.taskId === options.taskId : true)
      .filter((note) => options.outputPath ? note.outputPath === normalizePathLike(options.outputPath) : true)
      .filter((note) => {
        if (!tags.length) return true;
        const noteTags = new Set(note.tags.map((tag) => tag.toLowerCase()));
        return tags.every((tag) => noteTags.has(tag));
      })
      .filter((note) => {
        if (!query) return true;
        return noteSearchText(note).includes(query);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return notes.slice(0, limit);
  }

  async getNote(id: string): Promise<MatterhornNote | null> {
    await this.initialize();
    return (await this.readIndex()).entries[id] ?? null;
  }

  async createNote(input: MatterhornNoteCreateRequest): Promise<MatterhornNote> {
    return withNoteMutationLock(this.indexPath, async () => {
      await this.initializeUnlocked();
      const now = new Date().toISOString();
      const body = normalizeBody(input.body);
      const title = normalizeTitle(input.title, body);
      if (!title && !body) {
        throw new Error("A note needs a title or body.");
      }
      const note: MatterhornNote = {
        version: MATTERHORN_NOTE_VERSION,
        id: `note_${randomUUID().replace(/-/g, "").slice(0, 18)}`,
        workspaceId: this.workspaceId,
        title: title || "Untitled note",
        body,
        tags: normalizeTags(input.tags),
        links: normalizeLinks(input.links),
        ...(normalizeDesk(input.desk) ? { desk: normalizeDesk(input.desk)! } : {}),
        ...(normalizeOptionalId(input.sessionId) ? { sessionId: normalizeOptionalId(input.sessionId)! } : {}),
        ...(normalizeOptionalId(input.taskId) ? { taskId: normalizeOptionalId(input.taskId)! } : {}),
        ...(input.outputPath ? { outputPath: normalizePathLike(input.outputPath) } : {}),
        source: normalizeSource(input.source),
        filePath: noteFilePathForDay(dayFromIso(now)),
        createdAt: now,
        updatedAt: now,
      };
      const withDerivedLinks = { ...note, links: deriveLinks(note) };
      const index = await this.readIndex();
      index.entries[withDerivedLinks.id] = withDerivedLinks;
      await this.writeIndex(index);
      await this.renderDay(dayFromIso(withDerivedLinks.createdAt));
      return withDerivedLinks;
    });
  }

  async updateNote(id: string, patch: MatterhornNoteUpdateRequest): Promise<MatterhornNote> {
    return withNoteMutationLock(this.indexPath, async () => {
    await this.initializeUnlocked();
    const index = await this.readIndex();
    const existing = index.entries[id];
    if (!existing || existing.deletedAt) {
      throw new Error(`Note not found: ${id}`);
    }

    const body = Object.prototype.hasOwnProperty.call(patch, "body")
      ? normalizeBody(patch.body)
      : existing.body;
    const title = Object.prototype.hasOwnProperty.call(patch, "title")
      ? normalizeTitle(patch.title, body)
      : existing.title;
    if (!title && !body) {
      throw new Error("A note needs a title or body.");
    }

    const next: MatterhornNote = {
      ...existing,
      title: title || "Untitled note",
      body,
      tags: Object.prototype.hasOwnProperty.call(patch, "tags") ? normalizeTags(patch.tags) : existing.tags,
      links: Object.prototype.hasOwnProperty.call(patch, "links") ? normalizeLinks(patch.links) : existing.links,
      updatedAt: new Date().toISOString(),
    };

    if (Object.prototype.hasOwnProperty.call(patch, "desk")) {
      const desk = normalizeDesk(patch.desk);
      if (desk) next.desk = desk;
      else delete next.desk;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "sessionId")) {
      const sessionId = normalizeOptionalId(patch.sessionId);
      if (sessionId) next.sessionId = sessionId;
      else delete next.sessionId;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "taskId")) {
      const taskId = normalizeOptionalId(patch.taskId);
      if (taskId) next.taskId = taskId;
      else delete next.taskId;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "outputPath")) {
      if (patch.outputPath) next.outputPath = normalizePathLike(patch.outputPath);
      else delete next.outputPath;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "source")) {
      next.source = normalizeSource(patch.source);
    }

    const withDerivedLinks = { ...next, links: deriveLinks(next) };
    index.entries[id] = withDerivedLinks;
    await this.writeIndex(index);
    await this.renderDay(dayFromIso(withDerivedLinks.createdAt));
    return withDerivedLinks;
    });
  }

  async markMemorySuggestion(
    id: string,
    suggestion: { id: string; status?: MatterhornNote["memorySuggestionStatus"] },
  ): Promise<MatterhornNote> {
    return withNoteMutationLock(this.indexPath, async () => {
    await this.initializeUnlocked();
    const index = await this.readIndex();
    const existing = index.entries[id];
    if (!existing || existing.deletedAt) {
      throw new Error(`Note not found: ${id}`);
    }
    const next: MatterhornNote = {
      ...existing,
      memorySuggestionId: suggestion.id,
      memorySuggestionStatus: suggestion.status ?? "pending",
      updatedAt: new Date().toISOString(),
    };
    index.entries[id] = next;
    await this.writeIndex(index);
    await this.renderDay(dayFromIso(next.createdAt));
    return next;
    });
  }

  async deleteNote(id: string): Promise<MatterhornNote> {
    return withNoteMutationLock(this.indexPath, async () => {
    await this.initializeUnlocked();
    const index = await this.readIndex();
    const existing = index.entries[id];
    if (!existing || existing.deletedAt) {
      throw new Error(`Note not found: ${id}`);
    }
    const next = { ...existing, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    index.entries[id] = next;
    await this.writeIndex(index);
    await this.renderDay(dayFromIso(next.createdAt));
    return next;
    });
  }

  private async renderDay(day: string): Promise<void> {
    const index = await this.readIndex();
    const notes = Object.values(index.entries)
      .filter((note) => !note.deletedAt && dayFromIso(note.createdAt) === day)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const target = path.join(this.workspaceRoot, noteFilePathForDay(day));
    if (!notes.length) {
      await rm(target, { force: true });
      return;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, renderDailyMarkdown(day, notes), "utf8");
  }

  private async readIndex(): Promise<MatterhornNoteIndex> {
    try {
      const parsed = JSON.parse(await readFile(this.indexPath, "utf8")) as MatterhornNoteIndex;
      return parsed.version === MATTERHORN_NOTES_INDEX_VERSION ? parsed : emptyNotesIndex();
    } catch {
      return emptyNotesIndex();
    }
  }

  private async writeIndex(index: MatterhornNoteIndex): Promise<void> {
    index.updatedAt = new Date().toISOString();
    await mkdir(path.dirname(this.indexPath), { recursive: true });
    const temporaryPath = `${this.indexPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
      await rename(temporaryPath, this.indexPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
}

export async function noteFileStat(workspaceRoot: string, note: MatterhornNote): Promise<{ exists: boolean; size?: number; updatedAt?: number }> {
  try {
    const info = await stat(path.join(workspaceRoot, note.filePath));
    return { exists: info.isFile(), size: info.size, updatedAt: info.mtimeMs };
  } catch {
    return { exists: false };
  }
}

function emptyNotesIndex(): MatterhornNoteIndex {
  return {
    version: MATTERHORN_NOTES_INDEX_VERSION,
    updatedAt: new Date().toISOString(),
    entries: {},
  };
}

function normalizeBody(value: unknown): string {
  const body = typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
  if (Buffer.byteLength(body, "utf8") > MAX_NOTE_BODY_BYTES) {
    throw new Error(`Note body exceeds ${MAX_NOTE_BODY_BYTES} bytes.`);
  }
  return body;
}

function normalizeTitle(value: unknown, body: string): string {
  const raw = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  const title = raw || body.split("\n").find((line) => line.trim())?.trim() || "";
  return title.slice(0, MAX_NOTE_TITLE_LENGTH);
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags = value
    .map((tag) => typeof tag === "string" ? tag.trim().toLowerCase().replace(/\s+/g, "-") : "")
    .filter(Boolean)
    .filter((tag) => /^[a-z0-9][a-z0-9._-]{0,39}$/.test(tag));
  return Array.from(new Set(tags)).slice(0, MAX_NOTE_TAGS);
}

function normalizeLinks(value: unknown): MatterhornNoteLink[] {
  if (!Array.isArray(value)) return [];
  const links: MatterhornNoteLink[] = [];
  for (const item of value.slice(0, MAX_NOTE_LINKS)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const kind = typeof raw.kind === "string" && MATTERHORN_NOTE_LINK_KINDS.includes(raw.kind as MatterhornNoteLink["kind"])
      ? raw.kind as MatterhornNoteLink["kind"]
      : null;
    if (!kind) continue;
    const link: MatterhornNoteLink = { kind };
    if (typeof raw.id === "string" && raw.id.trim()) link.id = raw.id.trim().slice(0, 160);
    if (typeof raw.label === "string" && raw.label.trim()) link.label = raw.label.trim().slice(0, 160);
    if (typeof raw.path === "string" && raw.path.trim()) link.path = normalizePathLike(raw.path);
    if (typeof raw.url === "string" && raw.url.trim()) link.url = normalizeUrl(raw.url);
    links.push(link);
  }
  return dedupeLinks(links);
}

function normalizeDesk(value: unknown): MatterhornNoteDesk | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (MATTERHORN_NOTE_DESKS.includes(normalized as MatterhornNoteDesk)) {
    return normalized as MatterhornNoteDesk;
  }
  return undefined;
}

function normalizeSource(value: unknown): MatterhornNoteSource {
  if (typeof value === "string" && MATTERHORN_NOTE_SOURCES.includes(value as MatterhornNoteSource)) {
    return value as MatterhornNoteSource;
  }
  return "manual";
}

function normalizeOptionalId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : undefined;
}

function normalizePathLike(input: unknown): string {
  const raw = String(input ?? "").trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
  if (!raw || raw.includes("\u0000")) {
    throw new Error("Path is required.");
  }
  const parts = raw.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Path traversal is not allowed.");
  }
  return parts.join("/");
}

function normalizeUrl(input: string): string {
  const url = new URL(input.trim());
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https note links are supported.");
  }
  return url.toString();
}

function deriveLinks(note: MatterhornNote): MatterhornNoteLink[] {
  const links = [...note.links];
  if (note.desk) links.push({ kind: "desk", id: note.desk, label: deskLabel(note.desk) });
  if (note.sessionId) links.push({ kind: "session", id: note.sessionId, label: "Session" });
  if (note.taskId) links.push({ kind: "task", id: note.taskId, label: "Task" });
  if (note.outputPath) links.push({ kind: "output", path: note.outputPath, label: "Output" });
  if (note.memorySuggestionId) links.push({ kind: "memory_suggestion", id: note.memorySuggestionId, label: "Memory suggestion" });
  links.push({ kind: "project", label: "Project notes", path: note.filePath });
  return dedupeLinks(links);
}

function dedupeLinks(links: MatterhornNoteLink[]): MatterhornNoteLink[] {
  const seen = new Set<string>();
  const result: MatterhornNoteLink[] = [];
  for (const link of links) {
    const key = [link.kind, link.id ?? "", link.path ?? "", link.url ?? ""].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(link);
  }
  return result.slice(0, MAX_NOTE_LINKS);
}

function noteSearchText(note: MatterhornNote): string {
  return [
    note.title,
    note.body,
    note.tags.join(" "),
    note.desk ?? "",
    note.sessionId ?? "",
    note.taskId ?? "",
    note.outputPath ?? "",
    note.links.map((link) => [link.kind, link.id, link.label, link.path, link.url].filter(Boolean).join(" ")).join(" "),
  ].join(" ").toLowerCase();
}

function noteFilePathForDay(day: string): string {
  return `notes/${day}.md`;
}

function dayFromIso(value: string): string {
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : new Date().toISOString().slice(0, 10);
}

function deskLabel(desk: MatterhornNoteDesk): string {
  if (desk === "wellness" || desk === "longevity") return "Longevity";
  if (desk === "generic_workspace") return "Project";
  if (desk === "mcp") return "MCPs";
  return desk.charAt(0).toUpperCase() + desk.slice(1);
}

function renderDailyMarkdown(day: string, notes: MatterhornNote[]): string {
  const lines = [
    `# Matterhorn Notes - ${day}`,
    "",
    "These are project notes. Nothing here becomes Matterhorn Memory unless you explicitly send a note to Memory review.",
    "",
  ];
  for (const note of notes) {
    lines.push(`## ${note.title || "Untitled note"}`);
    lines.push("");
    lines.push(`- Note ID: ${note.id}`);
    lines.push(`- Created: ${note.createdAt}`);
    lines.push(`- Updated: ${note.updatedAt}`);
    lines.push(`- Source: ${note.source}`);
    if (note.desk) lines.push(`- Desk: ${deskLabel(note.desk)}`);
    if (note.sessionId) lines.push(`- Session: ${note.sessionId}`);
    if (note.taskId) lines.push(`- Task: ${note.taskId}`);
    if (note.outputPath) lines.push(`- Output: ${note.outputPath}`);
    if (note.memorySuggestionId) {
      lines.push(`- Memory suggestion: ${note.memorySuggestionId} (${note.memorySuggestionStatus ?? "pending"})`);
    }
    if (note.tags.length) lines.push(`- Tags: ${note.tags.map((tag) => `#${tag}`).join(" ")}`);
    const visibleLinks = note.links.filter((link) => link.kind !== "project");
    if (visibleLinks.length) {
      lines.push("- Links:");
      for (const link of visibleLinks) {
        const target = link.path ?? link.url ?? link.id ?? "";
        lines.push(`  - ${link.kind}: ${link.label ?? target}${target ? ` (${target})` : ""}`);
      }
    }
    lines.push("");
    lines.push(note.body || "_No body._");
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
