export type ArtifactNoteContext = {
  path: string;
  fileName: string;
  desk?: string;
  sessionSlug?: string;
  /** True when the path is a legacy/internal location such as .opencode/openwork/outbox/. */
  isLegacy?: boolean;
  legacyKind?: "opencode" | "openwork" | "outbox" | null;
};

function detectLegacyPath(parts: string[]): Pick<ArtifactNoteContext, "isLegacy" | "legacyKind"> {
  if (parts.length === 0) return { isLegacy: false, legacyKind: null };
  const first = parts[0];
  if (first === ".opencode") return { isLegacy: true, legacyKind: "opencode" };
  if (first === "openwork") return { isLegacy: true, legacyKind: "openwork" };
  if (first === "outbox" || parts.includes("outbox")) return { isLegacy: true, legacyKind: "outbox" };
  return { isLegacy: false, legacyKind: null };
}

export function getArtifactNoteContext(artifactPath: string): ArtifactNoteContext {
  const path = artifactPath.trim().replace(/^\.\//, "").replace(/^[/\\]+/, "");
  const parts = path.split(/[\\/]+/).filter(Boolean);
  const fileName = parts.at(-1) ?? path;
  const isOutputPath = parts[0] === "outputs";
  const legacy = detectLegacyPath(parts);

  return {
    path,
    fileName,
    desk: isOutputPath ? parts[1] : undefined,
    sessionSlug: isOutputPath ? parts[2] : undefined,
    isLegacy: legacy.isLegacy,
    legacyKind: legacy.legacyKind,
  };
}
