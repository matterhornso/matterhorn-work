export type ArtifactNoteContext = {
  path: string;
  fileName: string;
  desk?: string;
  sessionSlug?: string;
};

export function getArtifactNoteContext(artifactPath: string): ArtifactNoteContext {
  const path = artifactPath.trim().replace(/^\.\//, "").replace(/^[/\\]+/, "");
  const parts = path.split(/[\\/]+/).filter(Boolean);
  const fileName = parts.at(-1) ?? path;
  const isOutputPath = parts[0] === "outputs";

  return {
    path,
    fileName,
    desk: isOutputPath ? parts[1] : undefined,
    sessionSlug: isOutputPath ? parts[2] : undefined,
  };
}
