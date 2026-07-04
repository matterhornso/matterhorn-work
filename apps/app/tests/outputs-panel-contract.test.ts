import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Outputs panel contract", () => {
  test("user-facing labels say Outputs, not Artifacts", () => {
    const sessionSource = readAppSource("domains/session/chat/session-page.tsx");
    const artifactSource = readAppSource("domains/session/artifacts/artifact-panel.tsx");

    expect(sessionSource).toContain('<span className={RAIL_LABEL_CLASS}>Outputs</span>');
    expect(sessionSource).toContain('title={hasArtifactTargets ? `Outputs (${artifactTargetCount})` : "Outputs"}');
    expect(sessionSource).not.toContain('"Artifacts and files"');
    expect(sessionSource).not.toContain('"Artifacts"');

    expect(artifactSource).toContain("No outputs yet");
    expect(artifactSource).toContain("Outputs appear here after Matterhorn creates files in this project.");
    expect(artifactSource).toContain("outputs/&lt;desk&gt;/&lt;session-slug&gt;/");
    expect(artifactSource).not.toContain("Edit artifact");
    expect(artifactSource).not.toContain("Download artifact");
    expect(artifactSource).not.toContain("Close artifact");
  });

  test("output rows surface path, desk, session, time, size, and origin", () => {
    const listSource = readAppSource("domains/session/artifacts/output-list.tsx");

    expect(listSource).toContain("output.path");
    expect(listSource).toContain("output.desk");
    expect(listSource).toContain("output.sessionSlug");
    expect(listSource).toContain("formatRelativeTime");
    expect(listSource).toContain("formatFileSize");
    expect(listSource).toContain("output.originLabel");
    expect(listSource).toContain("output.isLegacy");
  });

  test("output actions include copy path, add note, reveal, and open", () => {
    const sessionSource = readAppSource("domains/session/chat/session-page.tsx");
    const artifactSource = readAppSource("domains/session/artifacts/artifact-panel.tsx");
    const listSource = readAppSource("domains/session/artifacts/output-list.tsx");

    expect(artifactSource).toContain('aria-label="Copy path"');
    expect(artifactSource).toContain('aria-label="Add note about this output"');
    expect(artifactSource).toContain('aria-label="Reveal in folder"');
    expect(artifactSource).toContain('aria-label={isRemoteWorkspace ? "Download output" : "Open externally"}');
    expect(sessionSource).toContain("onRevealPath={props.onRevealPath}");

    expect(listSource).toContain("onCopyPath");
    expect(listSource).toContain("onAddNote");
    expect(listSource).toContain("onReveal");
    expect(listSource).toContain("onOpen");
  });

  test("legacy paths are flagged instead of presented as primary", () => {
    const artifactSource = readAppSource("domains/session/artifacts/artifact-panel.tsx");
    const contextSource = readAppSource("domains/session/artifacts/artifact-note-context.ts");

    expect(artifactSource).toContain("Legacy location");
    expect(artifactSource).toContain("noteContext.isLegacy");
    expect(contextSource).toContain("isLegacy");
    expect(contextSource).toContain("legacyKind");
    expect(contextSource).toContain('".opencode"');
    expect(contextSource).toContain('"openwork"');
    expect(contextSource).toContain('"outbox"');
  });
});
