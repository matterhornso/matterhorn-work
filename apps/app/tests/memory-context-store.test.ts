import { describe, expect, test } from "bun:test";

import type { MatterhornMemoryRecord } from "@matterhorn-work/types";
import {
  readStoredMatterhornMemoryContexts,
  useMatterhornSessionMemoryContextStore,
  writeStoredMatterhornMemoryContexts,
} from "../src/react-app/domains/session/surface/memory-context-store";

class TestStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const record: MatterhornMemoryRecord = {
  id: "mem_qa",
  kind: "project_fact",
  scope: "workspace",
  title: "QA memory",
  summary: "Selected, visible project context.",
  body: { note: "Keep review boundaries visible." },
  tags: ["qa"],
  links: [],
  provenance: {
    source: "user_confirmed",
    capturedAt: "2026-08-15T00:00:00.000Z",
    capturedBy: "user",
    confidence: 1,
    reasonRemembered: "The user explicitly selected this memory.",
  },
  sensitivity: "private",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
  canUseInChat: true,
  canExport: false,
  canDelete: true,
};

describe("session Memory context persistence", () => {
  test("restores only valid, explicitly usable records from tab-scoped storage", () => {
    const storage = new TestStorage();
    storage.setItem("matterhorn.session-memory-context.v1", JSON.stringify({
      ses_qa: {
        id: "ctx_qa",
        records: [record, { ...record, id: "mem_secret", sensitivity: "forbidden_secret" }],
        updatedAt: "2026-08-15T00:00:00.000Z",
      },
    }));

    const restored = readStoredMatterhornMemoryContexts(storage);

    expect(restored.ses_qa?.id).toBe("ctx_qa");
    expect(restored.ses_qa?.records.map((item) => item.id)).toEqual(["mem_qa"]);
  });

  test("keeps the live store API compatible with session-scoped contexts", () => {
    useMatterhornSessionMemoryContextStore.getState().setContext("ses_live", {
      id: "ctx_live",
      records: [record],
      updatedAt: "2026-08-15T00:00:00.000Z",
    });
    expect(useMatterhornSessionMemoryContextStore.getState().contexts.ses_live?.records).toHaveLength(1);
    useMatterhornSessionMemoryContextStore.getState().clearContext("ses_live");
    expect(useMatterhornSessionMemoryContextStore.getState().contexts.ses_live).toBeUndefined();
  });

  test("never writes blocked or secret-bearing records to tab storage", () => {
    const storage = new TestStorage();
    writeStoredMatterhornMemoryContexts({
      ses_qa: {
        id: "ctx_qa",
        records: [
          record,
          { ...record, id: "mem_blocked", sensitivity: "forbidden_secret" },
          { ...record, id: "mem_key", body: { privateKey: "0x0123456789abcdef" } },
        ],
        updatedAt: "2026-08-15T00:00:00.000Z",
      },
    }, storage);

    const raw = storage.getItem("matterhorn.session-memory-context.v1") ?? "";
    expect(raw).toContain("mem_qa");
    expect(raw).not.toContain("mem_blocked");
    expect(raw).not.toContain("mem_key");
    expect(raw).not.toContain("privateKey");
  });
});
