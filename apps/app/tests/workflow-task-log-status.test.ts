import { describe, expect, test } from "bun:test";

import { getTaskLogStatusLabel } from "../src/react-app/domains/settings/pages/use-workflow-task-log";

describe("workflow task log status labels", () => {
  test("keeps backend workflow lifecycle states distinct", () => {
    expect(getTaskLogStatusLabel({ source: "backend", status: "staged" })).toBe("Prepared");
    expect(getTaskLogStatusLabel({ source: "backend", status: "running" })).toBe("Running");
    expect(getTaskLogStatusLabel({ source: "backend", status: "waiting" })).toBe("Waiting");
    expect(getTaskLogStatusLabel({ source: "backend", status: "completed" })).toBe("Completed");
    expect(getTaskLogStatusLabel({ source: "backend", status: "failed" })).toBe("Failed");
    expect(getTaskLogStatusLabel({ source: "backend", status: "cancelled" })).toBe("Cancelled");
  });

  test("retains chat activity labels for local session records", () => {
    expect(getTaskLogStatusLabel({ source: "local", status: "thinking" })).toBe("Thinking");
    expect(getTaskLogStatusLabel({ source: "local", status: "responding" })).toBe("Responding");
    expect(getTaskLogStatusLabel({ source: "local", status: "idle" })).toBe("Idle");
  });
});
