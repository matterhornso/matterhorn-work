import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  agentFileSelectionSummary,
  agentFileExpiry,
  formatAgentFileSize,
  resolveAgentFileMimeType,
} from "../src/react-app/domains/agent-files/agent-files-panel";
import {
  readSessionPanelFromSearch,
  resolveSessionPanelNavigation,
} from "../src/react-app/shell/session-panel-route";

function appSource(path: string): string {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

describe("coworker files UI", () => {
  test("accepts only the server-supported data formats", () => {
    expect(resolveAgentFileMimeType({ name: "notes.md", type: "" })).toBe("text/markdown");
    expect(resolveAgentFileMimeType({ name: "data.csv", type: "" })).toBe("text/csv");
    expect(resolveAgentFileMimeType({ name: "state.bin", type: "application/json" })).toBe("application/json");
    expect(resolveAgentFileMimeType({ name: "script.js", type: "text/javascript" })).toBeNull();
  });

  test("uses clear file sizes and deterministic retention", () => {
    expect(formatAgentFileSize(900)).toBe("900 B");
    expect(formatAgentFileSize(2_048)).toBe("2 KB");
    expect(formatAgentFileSize(1_572_864)).toBe("1.5 MB");
    expect(agentFileExpiry("until_deleted", new Date("2026-09-02T00:00:00.000Z"))).toBeNull();
    expect(agentFileExpiry("30_days", new Date("2026-09-02T00:00:00.000Z"))).toBe("2026-10-02T00:00:00.000Z");
  });

  test("explains file selection without exposing implementation language", () => {
    expect(agentFileSelectionSummary(0)).toBe("No files selected");
    expect(agentFileSelectionSummary(1)).toBe("1 file selected · 8 maximum");
    expect(agentFileSelectionSummary(3)).toBe("3 files selected · 8 maximum");
  });

  test("makes the Files panel a shareable, reversible workspace destination", () => {
    expect(readSessionPanelFromSearch("?panel=files")).toBe("files");
    expect(resolveSessionPanelNavigation("", "files")).toEqual({ search: "?panel=files", replace: false });
    expect(resolveSessionPanelNavigation("?panel=files", null)).toEqual({ search: "", replace: true });
  });

  test("keeps the primary flow plain while requiring explicit public-backup consent", () => {
    const panel = appSource("react-app/domains/agent-files/agent-files-panel.tsx");
    const serverClient = appSource("app/lib/matterhorn-server.ts");
    expect(panel).toContain('<h2 className="text-base font-semibold text-dls-text">Files</h2>');
    expect(panel).toContain("Files stay read-only and never grant wallet access.");
    expect(panel).toContain("Who can read them");
    expect(panel).toContain("Use in chat");
    expect(panel).toContain("No files selected");
    expect(panel).toContain("Only the encrypted copy is uploaded.");
    expect(panel).toContain("Encrypted bytes may remain after deletion");
    expect(panel).toContain("Backup expires soon");
    expect(panel).toContain("Backup details");
    expect(panel).toContain("An encrypted copy is stored on Walrus's public Sui test network");
    expect(panel).not.toContain("remainingEpochs} remaining");
    expect(panel).toContain("Renew backup");
    expect(panel).toContain("The storage fee is paid in WAL on Sui testnet.");
    expect(panel).toContain("Only your connected wallet can approve, sign, and send it.");
    expect(panel).toContain("Review renewal in wallet");
    expect(panel).toContain("The encrypted backup matches the file in your workspace.");
    expect(panel).toContain("Sui confirmed the renewed encrypted backup.");
    expect(panel).toContain("This backup has expired.");
    expect(panel).toContain("This file is being updated. Try again shortly.");
    expect(panel).toContain("This backup request expired or changed. Start it again.");
    expect(panel).toContain('className="flex size-11 shrink-0 cursor-pointer items-start justify-center pt-1 sm:size-6"');
    expect(panel).toContain('className="min-h-11 sm:min-h-6" size="xs"');
    expect(panel).toContain("h-11 w-full");
    expect(panel).toContain("Download");
    expect(panel).toContain("Matterhorn decrypted this copy only for your download.");
    expect(serverClient).toContain("acknowledgePublicCiphertext: true");
    expect(serverClient).toContain("acknowledgeWalletPayment: true");
    expect(serverClient).toContain("confirmAgentFileRenewal:");
    expect(serverClient).toContain("recoverAgentFile:");
    expect(panel).toContain("Transaction.from(prepared.preview.transactionBytesBase64)");
    expect(panel).toContain("localDigest !== prepared.preview.transactionDigest");
    expect(panel).toContain('network: "testnet"');
    expect(panel).not.toContain('type="password"');
    expect(panel).not.toContain("privateKey");
    expect(panel).not.toContain("seedPhrase");
  });

  test("sends only selected file ids and coworker identity through authoritative preflight", () => {
    const route = appSource("react-app/shell/session-route.tsx");
    const surface = appSource("react-app/domains/session/surface/session-surface.tsx");
    const contextStore = appSource("react-app/domains/session/surface/agent-file-context-store.ts");

    expect(route.match(/agentFileIds: draft\.privacy\.agentFileIds/g)).toHaveLength(2);
    expect(route.match(/coworkerId: draft\.privacy\.coworkerId/g)).toHaveLength(2);
    expect(surface).toContain("...(agentFileIds.length > 0 ? { agentFileIds } : {})");
    expect(surface).toContain("const coworkerId = agentFileContext?.coworker.id ?? coworkerContext?.id");
    expect(contextStore).not.toContain("contentBase64");
    expect(contextStore).not.toContain("contentSha256:");
  });
});
