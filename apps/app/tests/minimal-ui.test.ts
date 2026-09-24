import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  isChatModelId,
  PRIMARY_DESKS,
  resolveMinimalUi,
} from "../src/app/lib/minimal-ui";

describe("minimal workspace release", () => {
  test("is default off and requires an explicit build flag", () => {
    for (const value of [undefined, "", "0", "false", false, true])
      expect(resolveMinimalUi({ VITE_MATTERHORN_MINIMAL_UI: value })).toBe(
        false,
      );
    expect(resolveMinimalUi(undefined)).toBe(false);
    for (const value of ["1", "true"])
      expect(resolveMinimalUi({ VITE_MATTERHORN_MINIMAL_UI: value })).toBe(
        true,
      );
  });
  test("keeps the five primary desks in the approved order", () => {
    expect(PRIMARY_DESKS.map((desk) => desk.id)).toEqual([
      "private_ai",
      "bittensor",
      "hyperliquid",
      "polymarket",
      "sui",
    ]);
  });
  test("excludes known embedding and reranking models", () => {
    for (const id of [
      "text-embedding-3",
      "BAAI/bge-m3",
      "WhereIsAI/UAE-Large-V1",
      "rerank-v3",
    ])
      expect(isChatModelId(id)).toBe(false);
    for (const id of ["asi1-mini", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"])
      expect(isChatModelId(id)).toBe(true);
  });
  test("desk entry opens an unsent session without a Home route transition", () => {
    const source = readFileSync(
      new URL(
        "../src/react-app/domains/session/chat/session-page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const minimalBranch =
      source
        .split("if (MINIMAL_UI && props.sidebar.onCreateTaskWithPrompt)")[1]
        ?.split("return;")[0] ?? "";
    expect(minimalBranch).toContain("sendImmediately: false");
    expect(minimalBranch).not.toContain("navigate(");
    expect(source).toContain("!MINIMAL_UI ? <aside");
  });
  test("starter buttons preserve an existing draft and never submit", () => {
    const source = readFileSync(
      new URL(
        "../src/react-app/domains/session/surface/session-surface.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const minimalBranch =
      source
        .split('aria-label="Conversation starters"')[1]
        ?.split(") : activeDeskMode ?")[0] ?? "";
    expect(minimalBranch).toContain("disabled={Boolean(draft.trim())}");
    expect(minimalBranch).toContain(
      "setComposerDraft(props.sessionId, starter.prompt)",
    );
    expect(minimalBranch).not.toContain("onSendDraft");
    expect(minimalBranch).not.toContain("startDeskTask(");
  });
});
