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
    expect(listSource).toContain("output.receiptStatus");
    expect(listSource).toContain("Receipt:");
    expect(listSource).toContain("output.nftReceipt");
    expect(listSource).toContain("nftReceiptKindLabel");
    expect(listSource).toContain("compactNftReceiptValue");
  });

  test("workflow output receipts feed the Outputs rail and panel", () => {
    const sessionSource = readAppSource("domains/session/chat/session-page.tsx");
    const artifactSource = readAppSource("domains/session/artifacts/artifact-panel.tsx");
    const receiptSource = readAppSource("domains/session/artifacts/output-receipts.ts");

    expect(sessionSource).toContain("workflowOutputReceiptsFromEvidence");
    expect(sessionSource).toContain("mergeOpenTargetsWithWorkflowOutputReceipts");
    expect(sessionSource).toContain("listProjectEvidence(outputReceiptWorkspaceId, { limit: 200 })");
    expect(artifactSource).toContain("outputReceipts?: WorkflowOutputReceipt[]");
    expect(artifactSource).toContain("outputReceiptKindLabel");
    expect(artifactSource).toContain("Image receipt");
    expect(artifactSource).toContain("NFT receipt");
    expect(artifactSource).toContain("Workflow receipt");
    expect(artifactSource).toContain("selectedOutput?.nftReceipt");
    expect(artifactSource).toContain("nftReceiptKindLabel");
    expect(receiptSource).toContain('"task.output_saved"');
    expect(receiptSource).toContain('"task.completed"');
    expect(receiptSource).toContain('"image.generated"');
    expect(receiptSource).toContain('"nft.minted"');
    expect(receiptSource).toContain('"nft.listed"');
    expect(receiptSource).toContain("openTargetFromWorkflowOutputReceipt");
  });

  test("output actions include copy path, add note, reveal, open, and delete", () => {
    const sessionSource = readAppSource("domains/session/chat/session-page.tsx");
    const artifactSource = readAppSource("domains/session/artifacts/artifact-panel.tsx");
    const listSource = readAppSource("domains/session/artifacts/output-list.tsx");

    expect(artifactSource).toContain('aria-label="Copy path"');
    expect(artifactSource).toContain('aria-label="Add note about this output"');
    expect(artifactSource).toContain('aria-label="Reveal in folder"');
    expect(artifactSource).toContain('aria-label="Delete output"');
    expect(artifactSource).toContain("client.deleteWorkspaceOutput");
    expect(artifactSource).toContain("matterhorn:project-evidence-updated");
    expect(artifactSource).toContain('aria-label={isRemoteWorkspace ? "Download output" : "Open externally"}');
    expect(sessionSource).toContain("onRevealPath={props.onRevealPath}");
    expect(sessionSource).toContain("onDeletedTarget={removeAccessibleTarget}");

    expect(listSource).toContain("onCopyPath");
    expect(listSource).toContain("onAddNote");
    expect(listSource).toContain("onReveal");
    expect(listSource).toContain("onOpen");
    expect(listSource).toContain("onDelete");
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

  test("command palette uses Outputs terminology for accessible targets", () => {
    const paletteSource = readAppSource("shell/command-palette.tsx");

    expect(paletteSource).toContain('title: "Outputs & servers"');
    expect(paletteSource).toContain("outputs and servers detected in this session");
    expect(paletteSource).toContain('"Search outputs and servers..."');
    expect(paletteSource).toContain('meta: target.kind === "url" ? "Server" : "Output"');
    expect(paletteSource).not.toContain('"servers and artifacts"');
    expect(paletteSource).not.toContain('"Search servers and artifacts..."');
    expect(paletteSource).not.toContain('"Accessible items"');
  });
});
