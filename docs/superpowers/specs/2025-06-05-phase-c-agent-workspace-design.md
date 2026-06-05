# Phase C: "Agent Workspace" — Design Spec

> **Goal:** Let users describe financial goals in natural language. Agent turns them into scheduled jobs. Jobs queue locally and execute via the existing approval flow when the app is open.

**Architecture:** Server parses natural language intent into structured jobs. Client stores jobs in localStorage. On app open, pending jobs build calldata via existing server tools, then propose TXs through `requestApproval()`. User approves each execution.

**Tech Stack:** TypeScript, React 19, Vite, wagmi v2, viem, shadcn/ui, Tailwind, pnpm

---

## 1. What We Are Building

Three features:

| Feature | What | User Sees |
|---------|------|-----------|
| **C.1 Natural Language Job Creation** | User types "sweep USDC to Aave daily" → server parses intent → structured job | Chat-style input, job preview card |
| **C.2 Job Queue + Execution** | Jobs stored in localStorage. App checks on open. Pending jobs propose TXs via approval flow. | Job list with status, next run time, last execution |
| **C.3 Job History + Management** | Pause, resume, delete jobs. View execution history (approvals, rejections, TX hashes). | Simple job management UI |

---

## 2. UX Flows

### Flow C.1: Create a Job
1. User opens Agent Workspace panel
2. Types: "sweep idle USDC to Aave every day at 9am"
3. Server parses intent → returns structured job preview
4. User sees: "Job: Sweep USDC → Aave • Daily at 9:00 AM • Estimated gas: $0.50"
5. User confirms → job saved to queue

### Flow C.2: Job Execution
1. User opens app (or app was already open)
2. `useJobQueue` hook checks all active jobs
3. Job "Sweep USDC" has nextRun <= now
4. Hook calls existing server API to build calldata (e.g., `/api/aave/deposit`)
5. Calls `store.requestApproval(..., proposedBy: "agent_job:sweep-usdc")`
6. User sees TransactionApproval: "Agent job 'Sweep USDC' proposes: Deposit 50 USDC to Aave"
7. User approves → TX signs + broadcasts → job.lastRun updated → nextRun computed
8. If user rejects → job.status = "paused" (manual resume required)

### Flow C.3: Job Management
1. Agent Workspace shows all jobs in a list
2. Active jobs show next run time with countdown
3. Paused jobs show "Resume" button
4. Each job shows execution history (last 5 runs)
5. User can delete a job permanently

---

## 3. Technical Approach

### Server
- **New:** `apps/server/src/tools/scheduler.ts` — Simple natural language intent parser
  - Pattern: "{action} {token} {target} {frequency}"
  - Actions: sweep, deposit, send, bridge, swap
  - Frequency: every N minutes/hours/days, daily at HH:MM
- **New:** `POST /api/schedule/parse` — `{intent: string}` → `{success: true, job: JobIntent}`

### Client
- **New:** `useJobQueue()` hook — localStorage CRUD + execution loop
- **New:** `AgentWorkspace.tsx` — Job list + creation + management UI
- **Modified:** `WalletPanel.tsx` — Add "Agent" nav button

### Job Data Model
```typescript
interface Job {
  id: string;
  name: string;           // e.g. "Sweep USDC to Aave"
  intent: string;         // original natural language
  type: "recurring" | "oneshot";
  schedule: {
    intervalMs: number;    // e.g. 86400000 for daily
    nextRun: number;       // timestamp
  };
  action: {
    type: "aave_supply" | "transfer" | "bridge" | "cow_swap";
    params: Record<string, unknown>;
  };
  status: "active" | "paused" | "completed" | "failed";
  lastRun: number | null;
  runCount: number;
  history: { ts: number; status: "approved" | "rejected" | "failed"; txHash?: string; error?: string }[];
  createdAt: number;
}
```

### Execution Flow
```
App opens / heartbeat
  → useJobQueue() iterates jobs
  → For each active job where schedule.nextRun <= Date.now():
    1. Build calldata via existing server API:
       - aave_supply → POST /api/aave/deposit
       - transfer → POST /api/transfer/build
       - bridge → GET /api/bridge/quote + POST /api/bridge/deposit
    2. Get calldata → store.requestApproval(to, value, data, chainId, `agent_job:${job.id}`, "low")
    3. User sees TransactionApproval modal
    4. On approval: TX executes, job.lastRun = now, job.schedule.nextRun = now + intervalMs
    5. On rejection: job.status = "paused"
    6. On failure: job.status = "failed", log error in history
```

---

## 4. Scope Boundaries

**In Phase C:**
- Natural language intent parsing (simple regex/pattern matching, not LLM)
- Recurring jobs with fixed intervals (every N minutes/hours/days)
- One-shot jobs (execute once when conditions met)
- Job queue in localStorage
- Job execution via existing approval flow
- Job UI: list, create, pause/resume, delete, history

**Out of Phase C:**
- Complex cron expressions (e.g., "every Monday at 9am")
- Server-side job execution or persistent queue
- Push notifications for job completion
- Conditional triggers (e.g., "when ETH > $3000")
- LLM-based intent parsing (uses simple patterns for speed)
- Cross-device job sync

---

## 5. UI Components

| Component | Type | Notes |
|-----------|------|-------|
| `AgentWorkspace` | New lazy panel | Main job UI: list, create, history |
| `JobCreateForm` | Inline | Natural language input + preview card |
| `JobList` | Reusable | Active/paused/failed jobs with status |
| `JobCard` | Reusable | Single job: name, next run, actions |
| `JobHistory` | Reusable | Execution log for a job |
| `useJobQueue` | Hook | localStorage CRUD + execution loop |

---

## 6. API Changes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/schedule/parse` | `POST` | `{intent}` → `{job: JobIntent}` |

No new transaction-building APIs — reuse all existing endpoints from Phases A and B.

---

## 7. Acceptance Criteria

- [ ] User can type natural language intent and get a job preview
- [ ] Job is saved to localStorage and persists across sessions
- [ ] Active jobs check execution time on app open
- [ ] Pending jobs propose TXs via TransactionApproval flow
- [ ] User approves → job executes, history updated, next run scheduled
- [ ] User rejects → job pauses, manual resume required
- [ ] Job list shows all jobs with status and next run time
- [ ] Jobs can be paused, resumed, and deleted
- [ ] No `alert()` calls anywhere
- [ ] `pnpm run -r build` passes with 0 errors
- [ ] E2E tests verify job parsing + queue + execution

---

**Spec complete. Ready for implementation plan.**
