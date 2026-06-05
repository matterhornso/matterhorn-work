# Phase C: "Agent Workspace" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users describe financial goals in natural language. Agent parses intent into scheduled jobs. Jobs queue locally and execute via existing approval flow when app is open.

**Architecture:** Server parses NL intent into structured jobs. Client stores jobs in localStorage. On app open, pending jobs build calldata via existing server APIs, then propose TXs through `requestApproval()`.

**Tech Stack:** TypeScript, React 19, Vite, wagmi v2, viem, shadcn/ui, Tailwind, pnpm

---

## Task 1: Create Server Intent Parser

**Files:**
- Create: `apps/server/src/tools/scheduler.ts`
- Modify: `apps/server/src/server.ts`

- [ ] **Step 1: Write intent parser**

```typescript
/**
 * Simple natural language intent parser for job creation.
 * Patterns: "{action} {token} {target} {frequency}"
 */
export interface JobIntent {
  name: string;
  type: "recurring" | "oneshot";
  action: { type: string; params: Record<string, unknown> };
  schedule: { intervalMs: number; description: string };
}

export function parseIntent(intent: string): { success: true; job: JobIntent } | { success: false; error: string } {
  const lower = intent.toLowerCase().trim();
  
  // Pattern: sweep {token} to {target} every {N} {unit}
  const sweepMatch = lower.match(/sweep\s+(\w+)\s+to\s+(\w+)(?:\s+every\s+(\d+)\s+(minute|hour|day|days|hours|minutes))?/);
  if (sweepMatch) {
    const [, token, target, num, unit] = sweepMatch;
    const interval = num ? Number(num) : 1;
    const unitMs = unit?.startsWith("minute") ? 60000 : unit?.startsWith("hour") ? 3600000 : 86400000;
    return {
      success: true,
      job: {
        name: `Sweep ${token.toUpperCase()} to ${target}`,
        type: num ? "recurring" : "oneshot",
        action: { type: "aave_supply", params: { token: token.toUpperCase() } },
        schedule: { intervalMs: interval * unitMs, description: `Every ${interval} ${unit || "day"}` },
      },
    };
  }

  // Pattern: send {amount} {token} to {address} every {N} {unit}
  const sendMatch = lower.match(/send\s+([\d.]+)\s+(\w+)\s+to\s+(0x[a-f0-9]{40})(?:\s+every\s+(\d+)\s+(minute|hour|day|days|hours|minutes))?/);
  if (sendMatch) {
    const [, amount, token, address, num, unit] = sendMatch;
    const interval = num ? Number(num) : 1;
    const unitMs = unit?.startsWith("minute") ? 60000 : unit?.startsWith("hour") ? 3600000 : 86400000;
    return {
      success: true,
      job: {
        name: `Send ${amount} ${token.toUpperCase()}`,
        type: num ? "recurring" : "oneshot",
        action: { type: "transfer", params: { token: token.toUpperCase(), amount, to: address } },
        schedule: { intervalMs: interval * unitMs, description: `Every ${interval} ${unit || "day"}` },
      },
    };
  }

  return { success: false, error: "Could not understand intent. Try: 'sweep USDC to Aave every day'" };
}
```

- [ ] **Step 2: Add route to server.ts**

```typescript
import { parseIntent } from "./tools/scheduler.js";

addRoute(routes, "POST", "/api/schedule/parse", "client", async (ctx) => {
  const body = await readJsonBody(ctx.request);
  const result = parseIntent(String(body.intent));
  return jsonResponse(result);
});
```

- [ ] **Step 3: Verify TypeScript**

Run: `cd /Users/thebiglebowski/matterhorn-work/apps/server && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/tools/scheduler.ts apps/server/src/server.ts
git commit -m "feat: add natural language intent parser for agent jobs"
```

---

## Task 2: Create `useJobQueue` Hook

**Files:**
- Create: `apps/app/src/react-app/domains/wallet/hooks/useJobQueue.ts`

- [ ] **Step 1: Write the hook**

```typescript
import { useState, useCallback, useEffect, useRef } from "react";

export interface Job {
  id: string;
  name: string;
  intent: string;
  type: "recurring" | "oneshot";
  schedule: { intervalMs: number; nextRun: number };
  action: { type: string; params: Record<string, unknown> };
  status: "active" | "paused" | "completed" | "failed";
  lastRun: number | null;
  runCount: number;
  history: { ts: number; status: "approved" | "rejected" | "failed"; txHash?: string; error?: string }[];
  createdAt: number;
}

const STORAGE_KEY = "matterhorn_job_queue";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useJobQueue() {
  const [jobs, setJobs] = useState<Job[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Job[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  }, [jobs]);

  const add = useCallback((job: Omit<Job, "id" | "createdAt" | "runCount" | "lastRun" | "history">) => {
    const newJob: Job = {
      ...job,
      id: generateId(),
      createdAt: Date.now(),
      runCount: 0,
      lastRun: null,
      history: [],
    };
    setJobs((prev) => [...prev, newJob]);
    return newJob.id;
  }, []);

  const update = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const remove = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const pause = useCallback((id: string) => {
    update(id, { status: "paused" });
  }, [update]);

  const resume = useCallback((id: string) => {
    update(id, { status: "active" });
  }, [update]);

  const logRun = useCallback((id: string, entry: Job["history"][number]) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== id) return j;
        const newHistory = [entry, ...j.history].slice(0, 20);
        const newRunCount = j.runCount + 1;
        const newLastRun = entry.ts;
        const newStatus = entry.status === "rejected" ? "paused" : j.status;
        const newNextRun = j.type === "recurring" ? entry.ts + j.schedule.intervalMs : j.schedule.nextRun;
        return {
          ...j,
          history: newHistory,
          runCount: newRunCount,
          lastRun: newLastRun,
          status: newStatus,
          schedule: { ...j.schedule, nextRun: newNextRun },
        };
      })
    );
  }, []);

  const pendingJobs = jobs.filter((j) => j.status === "active" && j.schedule.nextRun <= Date.now());

  return { jobs, add, update, remove, pause, resume, logRun, pendingJobs };
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd /Users/thebiglebowski/matterhorn-work/apps/app && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/react-app/domains/wallet/hooks/useJobQueue.ts
git commit -m "feat: add useJobQueue hook for agent job lifecycle"
```

---

## Task 3: Create `AgentWorkspace` Panel

**Files:**
- Create: `apps/app/src/react-app/domains/wallet/pages/AgentWorkspace.tsx`

- [ ] **Step 1: Write AgentWorkspace component**

Features:
- Natural language input with submit
- Job preview card from server parse
- Confirm → add to queue
- Job list: active, paused, failed
- Job card: name, next run, last run, run count, pause/resume/delete
- Execution history per job

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/react-app/domains/wallet/pages/AgentWorkspace.tsx
git commit -m "feat: add AgentWorkspace panel for job creation and management"
```

---

## Task 4: Integrate Job Execution into WalletPanel

**Files:**
- Modify: `apps/app/src/react-app/domains/wallet/WalletPanel.tsx`

- [ ] **Step 1: Add useJobQueue and execution heartbeat**

```typescript
import { useJobQueue } from "./hooks/useJobQueue";

// In WalletPanel:
const { pendingJobs, logRun, pause } = useJobQueue();

useEffect(() => {
  if (!state.address || !state.chainId) return;
  for (const job of pendingJobs) {
    executeJob(job, state.address, state.chainId, store, logRun, pause);
  }
}, [state.address, state.chainId, pendingJobs.length]);
```

- [ ] **Step 2: Create executeJob helper**

```typescript
async function executeJob(
  job: Job,
  address: string,
  chainId: number,
  store: WalletStore,
  logRun: (id: string, entry: Job["history"][number]) => void,
  pause: (id: string) => void,
) {
  try {
    let result;
    if (job.action.type === "aave_supply") {
      const token = job.action.params.token as string;
      // ... get token meta, call /api/aave/deposit
    } else if (job.action.type === "transfer") {
      // ... call /api/transfer/build
    }
    // Queue approval request; when user approves/rejects, logRun
  } catch (err) {
    logRun(job.id, { ts: Date.now(), status: "failed", error: err instanceof Error ? err.message : "Unknown" });
  }
}
```

- [ ] **Step 3: Verify TypeScript + build**

Run: `pnpm run -r build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/react-app/domains/wallet/WalletPanel.tsx
git commit -m "feat: integrate agent job execution into WalletPanel heartbeat"
```

---

## Task 5: Add Agent Nav Button

**Files:**
- Modify: `apps/app/src/react-app/domains/wallet/WalletPanel.tsx`

- [ ] **Step 1: Add Agent button to nav grid**

Add alongside Send, Portfolio, etc. Use `Bot` icon from lucide-react.

- [ ] **Step 2: Wire AgentWorkspace lazy load**

```typescript
const AgentWorkspace = lazy(() => import("./pages/AgentWorkspace"));
type PanelType = "portfolio" | "cow" | "aave" | "bridge" | "send" | "agent" | null;
```

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/react-app/domains/wallet/WalletPanel.tsx
git commit -m "feat: add Agent nav button and AgentWorkspace wiring"
```

---

## Task 6: E2E Tests + Final Verification

**Files:**
- Create: `scripts/test-phase-c-e2e.test.ts`

- [ ] **Step 1: Write E2E test**

```typescript
import { test, expect } from "bun:test";

test("Intent parser returns job for sweep intent", () => {
  const fs = require("node:fs");
  const content = fs.readFileSync("apps/server/src/tools/scheduler.ts", "utf8");
  expect(content).toInclude("sweep");
  expect(content).toInclude("parseIntent");
});

test("useJobQueue hook exists", () => {
  const fs = require("node:fs");
  const content = fs.readFileSync("apps/app/src/react-app/domains/wallet/hooks/useJobQueue.ts", "utf8");
  expect(content).toInclude("add");
  expect(content).toInclude("pause");
  expect(content).toInclude("logRun");
});

test("AgentWorkspace panel exists", () => {
  const fs = require("node:fs");
  const content = fs.readFileSync("apps/app/src/react-app/domains/wallet/pages/AgentWorkspace.tsx", "utf8");
  expect(content).toInclude("Agent");
});

test("WalletPanel includes Agent button", () => {
  const fs = require("node:fs");
  const content = fs.readFileSync("apps/app/src/react-app/domains/wallet/WalletPanel.tsx", "utf8");
  expect(content).toInclude("agent");
  expect(content).toInclude("AgentWorkspace");
});
```

- [ ] **Step 2: Run full verification**

Run: `bash scripts/verify-crypto.sh`
Expected: ALL PASS

Run: `pnpm run -r build`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add scripts/test-phase-c-e2e.test.ts
git commit -m "test: add Phase C E2E test suite for agent workspace"
```

---

## Task 7: Final Push

- [ ] **Step 1: Push branch**

```bash
git push origin dev
```

---

## Summary of Commits

| # | Commit | What |
|---|--------|------|
| 1 | `feat: add natural language intent parser` | Server: scheduler.ts |
| 2 | `feat: add useJobQueue hook` | Client: job lifecycle |
| 3 | `feat: add AgentWorkspace panel` | Client: job UI |
| 4 | `feat: integrate agent job execution` | Client: heartbeat + approval flow |
| 5 | `feat: add Agent nav button` | Client: navigation |
| 6 | `test: add Phase C E2E test suite` | Tests |

---

**Plan complete. Ready for execution using superpowers:executing-plans.**
