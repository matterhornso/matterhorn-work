import { posix, win32 } from "node:path";

export function normalizeScopedDirectoryPath(input: string, platform = process.platform) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const withoutVerbatim = /^\\\\\?\\UNC[\\/]/i.test(trimmed)
    ? `\\${trimmed.slice(8)}`
    : /^\\\\\?\\[a-zA-Z]:[\\/]/.test(trimmed)
      ? trimmed.slice(4)
      : trimmed;
  const unified = withoutVerbatim.replace(/\\/g, "/");
  const withoutTrailing = unified.replace(/\/+$/, "");
  const normalized = withoutTrailing || "/";
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function isWithinWorkspaceRootPath(input: {
  workspaceRoot: string;
  candidate: string;
  platform?: NodeJS.Platform;
}) {
  const platform = input.platform ?? process.platform;
  const pathApi = platform === "win32" ? win32 : posix;
  const rootForComparison =
    platform === "win32"
      ? normalizeScopedDirectoryPath(input.workspaceRoot, platform)
      : input.workspaceRoot;
  const candidate =
    platform === "win32"
      ? normalizeScopedDirectoryPath(input.candidate || input.workspaceRoot, platform)
      : input.candidate || input.workspaceRoot;
  const resolved = pathApi.resolve(candidate);
  const resolvedForComparison =
    platform === "win32"
      ? normalizeScopedDirectoryPath(resolved, platform)
      : resolved;
  const relativePath = pathApi.relative(rootForComparison, resolvedForComparison);
  if (!relativePath || relativePath === ".") return true;
  if (relativePath.startsWith("..") || pathApi.isAbsolute(relativePath)) return false;
  const boundary = rootForComparison.endsWith("/")
    ? rootForComparison
    : `${rootForComparison}/`;
  return (
    resolvedForComparison === rootForComparison ||
    resolvedForComparison.startsWith(boundary)
  );
}
