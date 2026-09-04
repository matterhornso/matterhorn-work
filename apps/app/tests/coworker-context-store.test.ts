import { describe, expect, test } from "bun:test";

import {
  readStoredMatterhornCoworkerContexts,
  sanitizeMatterhornCoworkerContext,
  writeStoredMatterhornCoworkerContexts,
} from "../src/react-app/domains/session/surface/coworker-context-store";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("coworker chat context", () => {
  test("stores only bounded display metadata for one chat", () => {
    const context = sanitizeMatterhornCoworkerContext("ses_1", {
      id: "coworker_1",
      name: "Market analyst",
      role: "Research",
      revision: 3,
      updatedAt: "2026-09-02T12:00:00.000Z",
      ownerId: "must-not-persist",
      mission: "must-not-persist",
      limits: { dailyUsd: 50 },
    });

    expect(context).toEqual({
      id: "coworker_1",
      name: "Market analyst",
      role: "Research",
      revision: 3,
      updatedAt: "2026-09-02T12:00:00.000Z",
    });
    expect(JSON.stringify(context)).not.toContain("must-not-persist");
  });

  test("rejects unsafe ids and incomplete profiles", () => {
    expect(sanitizeMatterhornCoworkerContext("ses_1", {
      id: "bad/id",
      name: "Analyst",
      role: "Research",
      revision: 1,
    })).toBeNull();
    expect(sanitizeMatterhornCoworkerContext("ses_1", {
      id: "coworker_1",
      name: "Analyst",
      role: "",
      revision: 1,
    })).toBeNull();
  });

  test("round-trips tab-scoped context without private profile fields", () => {
    const storage = new MemoryStorage();
    const context = sanitizeMatterhornCoworkerContext("ses_1", {
      id: "coworker_1",
      name: "Risk monitor",
      role: "Monitoring",
      revision: 2,
      updatedAt: "2026-09-02T12:00:00.000Z",
    });
    expect(context).not.toBeNull();
    if (!context) return;

    writeStoredMatterhornCoworkerContexts({ ses_1: context }, storage);
    expect(readStoredMatterhornCoworkerContexts(storage)).toEqual({ ses_1: context });
  });
});
