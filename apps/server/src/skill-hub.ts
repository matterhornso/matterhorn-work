import { link, lstat, mkdir, mkdtemp, open, realpath, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { HubSkillItem } from "./types.js";
import { ApiError } from "./errors.js";
import { parseFrontmatter } from "./frontmatter.js";
import { validateSkillName } from "./validators.js";
import { projectSkillsDir } from "./workspace-files.js";

type HubRepo = { owner: string; repo: string; ref: string };
type HubSkillInstallInput = { name: string; overwrite?: boolean; repo?: Partial<HubRepo> };
type HubFetch = (url: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_HUB_REPO: HubRepo = {
  owner: "different-ai",
  repo: "openwork-hub",
  ref: "main",
};

const CATALOG_TTL_MS = 5 * 60 * 1000;
const cachedCatalogByRepo = new Map<string, { at: number; items: HubSkillItem[] }>();

export function normalizeHubSkillInstallInput(input: HubSkillInstallInput) {
  const name = input.name.trim();
  validateSkillName(name);
  return Object.freeze({
    name,
    overwrite: input.overwrite === true,
    repo: Object.freeze({
      owner: input.repo?.owner?.trim() || DEFAULT_HUB_REPO.owner,
      repo: input.repo?.repo?.trim() || DEFAULT_HUB_REPO.repo,
      ref: input.repo?.ref?.trim() || DEFAULT_HUB_REPO.ref,
    }),
  });
}

export function hubSkillInstallApprovalSummary(input: ReturnType<typeof normalizeHubSkillInstallInput>): string {
  return `Install hub skill ${JSON.stringify(input.name)} from owner=${JSON.stringify(input.repo.owner)}, repo=${JSON.stringify(input.repo.repo)}, ref=${JSON.stringify(input.repo.ref)}; overwrite=${input.overwrite}. Downloaded instructions and executable scripts require trust in this source.`;
}

function hubRepoKey(repo: HubRepo) {
  return `${repo.owner}/${repo.repo}@${repo.ref}`;
}

function hubApiBase(repo: HubRepo) {
  return `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;
}

function hubRawBase(repo: HubRepo) {
  return `https://raw.githubusercontent.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/${encodeURIComponent(repo.ref)}`;
}

async function fetchJson(url: string, fetchImpl: HubFetch = fetch): Promise<any> {
  const res = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "matterhorn-work-server",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(502, "hub_fetch_failed", `Failed to fetch hub data (${res.status}): ${text || url}`);
  }
  return res.json();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: "text/plain",
      "User-Agent": "matterhorn-work-server",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(502, "hub_fetch_failed", `Failed to fetch hub data (${res.status}): ${text || url}`);
  }
  return res.text();
}

function extractTriggerFromBody(body: string) {
  const lines = body.split(/\r?\n/);
  let inWhenSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^#{1,6}\s+/.test(trimmed)) {
      const heading = trimmed.replace(/^#{1,6}\s+/, "").trim();
      inWhenSection = /^when to use$/i.test(heading);
      continue;
    }

    if (!inWhenSection) continue;

    const cleaned = trimmed
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .trim();
    if (cleaned) return cleaned;
  }
  return "";
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current]!, current);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function listHubSkills(repo: HubRepo = DEFAULT_HUB_REPO): Promise<HubSkillItem[]> {
  const now = Date.now();
  const repoKey = hubRepoKey(repo);
  const cachedCatalog = cachedCatalogByRepo.get(repoKey);
  if (cachedCatalog && now - cachedCatalog.at < CATALOG_TTL_MS) {
    return cachedCatalog.items;
  }

  const listing = await fetchJson(`${hubApiBase(repo)}/contents/skills?ref=${encodeURIComponent(repo.ref)}`);
  const dirs = Array.isArray(listing)
    ? listing
        .filter((entry) => entry && typeof entry === "object" && entry.type === "dir" && typeof entry.name === "string")
        .map((entry) => String(entry.name))
    : [];

  const rawBase = hubRawBase(repo);
  const items = await mapWithConcurrency<string, HubSkillItem | null>(dirs, 6, async (dirName) => {
    try {
      const skillName = dirName.trim();
      validateSkillName(skillName);
      const skillMd = await fetchText(`${rawBase}/skills/${encodeURIComponent(skillName)}/SKILL.md`);
      const { data, body } = parseFrontmatter(skillMd);
      const name = typeof data.name === "string" ? data.name : skillName;
      const descriptionRaw = typeof data.description === "string" ? data.description : "";
      const triggerRaw =
        typeof data.trigger === "string"
          ? data.trigger
          : typeof data.when === "string"
            ? data.when
            : extractTriggerFromBody(body);

      if (name !== skillName) {
        return null;
      }

      const description = descriptionRaw.replace(/\s+/g, " ").trim().slice(0, 1024);
      const trigger = triggerRaw?.trim() || "";
      const item: HubSkillItem = {
        name,
        description,
        ...(trigger ? { trigger } : {}),
        source: {
          owner: repo.owner,
          repo: repo.repo,
          ref: repo.ref,
          path: `skills/${skillName}`,
        },
      };
      return item;
    } catch {
      return null;
    }
  });

  const sorted = items
    .filter((item): item is HubSkillItem => item != null)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  cachedCatalogByRepo.set(repoKey, { at: now, items: sorted });
  return sorted;
}

type HubTreeEntry = {
  path?: string;
  mode?: string;
  type?: string;
};

function resolveSafeChild(baseDir: string, child: string): string {
  const base = resolve(baseDir);
  const target = resolve(baseDir, child);
  if (target === base) return target;
  if (!target.startsWith(base + "/") && !target.startsWith(base + "\\")) {
    throw new ApiError(400, "invalid_path", "Invalid file path");
  }
  return target;
}

function hasFsCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function hubPathStat(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (hasFsCode(error, "ENOENT")) return null;
    throw error;
  }
}

function unsafeHubPath(): ApiError {
  return new ApiError(409, "unsafe_hub_destination", "Hub skill destination must not contain symbolic links or non-regular files.");
}

// The canonical workspace root is trusted. Reject existing links below it;
// this is not a guarantee against a hostile same-user process swapping parents.
async function ensureSafeHubDirectory(root: string, directory: string): Promise<void> {
  const child = relative(root, directory);
  if (isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`)) throw unsafeHubPath();
  let current = root;
  for (const part of child.split(sep).filter(Boolean)) {
    current = join(current, part);
    let entry = await hubPathStat(current);
    if (!entry) {
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (error) {
        if (!hasFsCode(error, "EEXIST")) throw error;
      }
      entry = await hubPathStat(current);
    }
    if (!entry?.isDirectory() || entry.isSymbolicLink()) throw unsafeHubPath();
  }
  if (await realpath(directory) !== directory) throw unsafeHubPath();
}

async function hubDestinationStat(path: string) {
  const entry = await hubPathStat(path);
  if (entry && (!entry.isFile() || entry.isSymbolicLink())) throw unsafeHubPath();
  return entry;
}

async function publishHubFile(root: string, destination: string, bytes: Uint8Array, executable: boolean, overwrite: boolean): Promise<boolean> {
  const parent = dirname(destination);
  await ensureSafeHubDirectory(root, parent);
  const existing = await hubDestinationStat(destination);
  if (existing && !overwrite) return false;

  // Stage privately and replace the directory entry, never truncate an existing
  // inode (which may also be hardlinked outside this skill).
  const stage = await mkdtemp(join(parent, ".hub-install-"));
  const stagedFile = join(stage, "content");
  try {
    const handle = await open(stagedFile, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.chmod(executable ? 0o755 : existing ? existing.mode & 0o777 : 0o644);
    } finally {
      await handle.close();
    }
    await ensureSafeHubDirectory(root, parent);
    await hubDestinationStat(destination);
    if (overwrite) {
      await rename(stagedFile, destination);
    } else {
      try {
        // Atomic no-replace publication preserves overwrite=false on collision.
        await link(stagedFile, destination);
      } catch (error) {
        if (!hasFsCode(error, "EEXIST")) throw error;
        await hubDestinationStat(destination);
        return false;
      }
    }
    return true;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

export async function installHubSkill(
  workspaceRoot: string,
  input: HubSkillInstallInput,
  options: { fetchImpl?: HubFetch } = {},
): Promise<{ name: string; path: string; action: "added" | "updated"; written: number; skipped: number }> {
  const { name, overwrite, repo } = normalizeHubSkillInstallInput(input);
  const fetchImpl = options.fetchImpl ?? fetch;

  const prefix = `skills/${name}/`;
  const root = await realpath(workspaceRoot);
  const baseDir = join(projectSkillsDir(root), name);
  const skillMdPath = join(baseDir, "SKILL.md");
  await ensureSafeHubDirectory(root, baseDir);
  const existedBefore = Boolean(await hubDestinationStat(skillMdPath));

  const tree = await fetchJson(`${hubApiBase(repo)}/git/trees/${encodeURIComponent(repo.ref)}?recursive=1`, fetchImpl);
  const entries: HubTreeEntry[] = Array.isArray(tree?.tree) ? tree.tree : [];
  const files = entries
    .filter((entry) => entry && entry.type === "blob" && typeof entry.path === "string" && entry.path.startsWith(prefix))
    .map((entry) => ({
      path: String(entry.path),
      mode: typeof entry.mode === "string" ? entry.mode : "100644",
    }));

  if (!files.length) {
    throw new ApiError(404, "hub_skill_not_found", `Hub skill not found: ${name}`);
  }

  let written = 0;
  let skipped = 0;
  const rawBase = hubRawBase(repo);

  for (const file of files) {
    const rel = file.path.slice(prefix.length);
    if (!rel || rel.startsWith("/") || rel.includes("..")) {
      continue;
    }

    const destPath = resolveSafeChild(baseDir, rel);
    await ensureSafeHubDirectory(root, dirname(destPath));
    if (await hubDestinationStat(destPath) && !overwrite) {
      skipped += 1;
      continue;
    }

    const res = await fetchImpl(`${rawBase}/${file.path.split("/").map(encodeURIComponent).join("/")}`, {
      headers: { "User-Agent": "matterhorn-work-server" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError(502, "hub_fetch_failed", `Failed to fetch hub file (${res.status}): ${text || file.path}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (await publishHubFile(root, destPath, buf, file.mode === "100755", overwrite)) written += 1;
    else skipped += 1;
  }

  // Ensure the canonical entrypoint exists.
  await ensureSafeHubDirectory(root, baseDir);
  if (!(await hubDestinationStat(skillMdPath))) {
    throw new ApiError(502, "hub_install_failed", `Hub skill install failed (missing SKILL.md): ${name}`);
  }

  return {
    name,
    path: baseDir,
    action: existedBefore ? "updated" : "added",
    written,
    skipped,
  };
}
