import { createHash } from "node:crypto";
import { posix } from "node:path";
import { gunzipSync } from "node:zlib";

export const MAX_TENANT_ARCHIVE_BYTES = 256 * 1024 * 1024;

// Verifies an export's structure/integrity, not its provenance or completeness
// against a live tenant. A hash inside the export is not an authorization proof.
export function validateTenantArchive(bytes, maxBytes = MAX_TENANT_ARCHIVE_BYTES) {
  if (bytes.length > maxBytes) throw new Error("Tenant archive exceeds the size limit.");
  let archive;
  try {
    archive = JSON.parse(gunzipSync(bytes, { maxOutputLength: maxBytes }).toString("utf8"));
  } catch {
    throw new Error("Tenant archive must be bounded gzip containing valid JSON.");
  }
  const invalid = (reason) => { throw new Error(`Invalid tenant archive: ${reason}.`); };
  if (archive?.version !== "matterhorn.workspace-data-archive.v1") invalid("unsupported version");
  if (typeof archive.workspace?.id !== "string" || !archive.workspace.id.trim()) invalid("missing workspace identity");
  const data = archive.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) invalid("missing data");
  for (const field of ["notes", "chats", "receipts", "files"]) {
    if (!Array.isArray(data[field])) invalid(`missing ${field}`);
  }
  if (!Array.isArray(data.memory?.records) || !Array.isArray(data.memory?.suggestions)) invalid("missing memory records or review inbox");
  if (!("configuration" in data) || !("activity" in data) || !("mission" in data)) invalid("missing workspace context");
  for (const chat of data.chats) {
    if (!chat?.session || !Array.isArray(chat.messages) || !Array.isArray(chat.todos)) invalid("incomplete chat");
  }
  const integrity = archive.manifest?.integrity;
  const digest = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  if (integrity?.algorithm !== "sha256" || integrity.dataSha256 !== digest) invalid("data digest mismatch");
  const counts = {
    notes: data.notes.length, memoryRecords: data.memory.records.length,
    memorySuggestions: data.memory.suggestions.length, chats: data.chats.length,
    messages: data.chats.reduce((total, chat) => total + chat.messages.length, 0),
    receipts: data.receipts.length, files: data.files.length,
  };
  for (const [field, count] of Object.entries(counts)) {
    if (archive.manifest?.counts?.[field] !== count) invalid(`incorrect ${field} count`);
  }
  const paths = new Set();
  for (const file of data.files) {
    const path = file?.path;
    if (typeof path !== "string" || path.includes("\\") || path.includes("\0") ||
        posix.normalize(path) !== path || path.split("/").some(part => !part || part === "." || part === "..") ||
        !["notes/", "outputs/", ".matterhorn-work/outputs/"].some(prefix => path.startsWith(prefix))) {
      invalid("unsafe file path");
    }
    if (paths.has(path)) invalid("duplicate file path");
    paths.add(path);
    if (typeof file.content !== "string" || !["utf8", "base64"].includes(file.encoding)) invalid("unsupported file encoding");
    const content = Buffer.from(file.content, file.encoding);
    if (!Number.isSafeInteger(file.size) || file.size !== content.length) invalid("file size mismatch");
    if (file.encoding === "base64" && content.toString("base64") !== file.content) invalid("invalid base64");
  }
  return { workspaceId: archive.workspace.id, counts, dataDigestVerified: true };
}
