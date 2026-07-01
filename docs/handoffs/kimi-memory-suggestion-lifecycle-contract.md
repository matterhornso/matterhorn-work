# Matterhorn Memory Suggestion Lifecycle Contract

## Owner

Kimi — `packages/types/src/memory.ts`, `scripts/matterhorn-memory-suggestion-lifecycle-contract.test.mjs`

## Goal

Provide Codex and Minimax with a typed, validated, safe runtime contract for the Memory Suggestion lifecycle so the app UI can be implemented without guessing at states, actions, or safety rules.

## Core types

```ts
MatterhornMemorySuggestionStatus =
  | "pending"
  | "confirmed"
  | "edited"
  | "dismissed"
  | "expired"
  | "blocked";

MatterhornMemorySuggestionAction =
  | "confirm"
  | "edit"
  | "dismiss"
  | "restore"
  | "regenerate";
```

## Lifecycle shape

```ts
interface MatterhornMemorySuggestionLifecycle {
  suggestionId: string;
  dedupeKey: string;
  source: MatterhornMemorySource;
  kind: MatterhornMemoryKind;
  scope: MatterhornMemoryScope;
  sensitivity: MatterhornMemorySensitivity;
  confidence: number; // 0..1
  reason: string; // max MAX_MEMORY_SUGGESTION_REASON_LENGTH (240)
  whySuggested?: MatterhornMemorySuggestionWhySuggested; // visible "why" copy + source label
  visibleProvenance?: MatterhornMemoryProvenance; // source/trace the user can see
  proposedRecord: MatterhornMemoryRecord;
  createdAt: string;
  expiresAt?: string; // default 14 days from createdAt
  dismissedUntil?: string; // required when status === "dismissed"
  dismissalWindowDays: number; // default 30 days
  actorConfirmationRequired: true; // never auto-save
  status: MatterhornMemorySuggestionStatus;
  policyWarnings?: string[];
  localOnly?: boolean; // required true for wellness/health/clinical suggestions
  nonClinical?: boolean; // required true for wellness/health/clinical suggestions
}

interface MatterhornMemorySuggestionWhySuggested {
  summary: string;
  sourceLabel: string;
  maxLength: number; // must not exceed MAX_MEMORY_SUGGESTION_REASON_LENGTH
}
```

## State/action matrix

| Current state | confirm | edit | dismiss | restore | regenerate |
|---------------|---------|------|---------|---------|------------|
| pending       | confirmed | edited | dismissed | blocked | blocked |
| confirmed     | blocked | blocked | dismissed | blocked | blocked |
| edited        | blocked | blocked | dismissed | blocked | blocked |
| dismissed     | blocked during window, otherwise blocked* | blocked during window | no-op / remains dismissed | pending after window expires | blocked |
| expired       | blocked | blocked | blocked | blocked | pending |
| blocked       | blocked | blocked | dismissed** | blocked | blocked |

\* `confirm` and `edit` on a dismissed entry are blocked by the transition guard while the dismissal window is active. Use `restore` after the window to return the entry to `pending`, then `confirm`/`edit` as normal.  
\*\* `dismiss` is intentionally allowed on a blocked entry so the user can remove it from the inbox.

A `confirmed` or `edited` result can only become a saved memory record when `canMemorySuggestionActionProduceMemoryRecord(result)` is `true`:

```ts
result.status === "confirmed" || result.status === "edited"
result.redaction === false
result.blockedReasons.length === 0
result.memoryRecordId is a string
```

## Safety invariants (hard-coded in validators)

1. **No hidden memory saves** — `actorConfirmationRequired` must be `true`.
2. **No auto-capture** — the older `MatterhornMemorySuggestion` contract enforces `canAutoCapture: false` and `captureMode: "user_confirmed_only"`; the lifecycle validator requires actor confirmation.
3. **No secret capture** — `validateMemorySafety` runs on `proposedRecord`. Any forbidden secret field or pattern blocks the action and sets `redaction: true`.
4. **Blocked suggestions never reveal forbidden content** — `sanitizeMemorySuggestionLifecycleForDisplay` replaces the body with a redaction stub and forces `status: "blocked"`.
5. **Dismissed suggestions suppress for 30 days** — `DEFAULT_MEMORY_SUGGESTION_DISMISSAL_WINDOW_DAYS = 30`; `isMemorySuggestionDismissalActive` checks `dismissedUntil > now`.
6. **Expired suggestions are 14-day stale by default** — `DEFAULT_MEMORY_SUGGESTION_EXPIRATION_DAYS = 14`; use `computeMemorySuggestionExpiresAt(createdAt)`.
7. **Wellness suggestions require local-only and non-clinical boundaries** — if `proposedRecord.tags` include `wellness`, `health`, or `clinical`, the lifecycle validator requires `localOnly: true` and `nonClinical: true`.
8. **Why-suggested copy is bounded** — `reason` and `whySuggested.summary` are capped at `MAX_MEMORY_SUGGESTION_REASON_LENGTH = 240` characters.

## Downstream integration points

### Codex (app UI)

- Render a suggestion card using `whySuggested.summary` + `visibleProvenance.sourceLabel`.
- Show action buttons based on `status`:
  - `pending`: Confirm, Edit, Dismiss
  - `confirmed` / `edited`: Dismiss only (already saved)
  - `dismissed`: Show "Restore" only when `!isMemorySuggestionDismissalActive(entry)`
  - `expired`: Show "Regenerate"
  - `blocked`: Show Dismiss + a redacted warning; never render `proposedRecord.body` directly.
- Use `MAX_MEMORY_SUGGESTION_REASON_LENGTH` for any reason input or truncation logic.
- For wellness suggestions, surface the `localOnly` and `nonClinical` badges and require opt-in copy.

### Minimax (persistence / server)

- Call `validateMemorySuggestionLifecycle(entry)` before writing to any store.
- Call `applyMemorySuggestionAction(entry, action, { memoryRecordId, now })` to transition state.
- Only persist a memory record when `canMemorySuggestionActionProduceMemoryRecord(result)` returns `true`.
- Store `dismissedUntil` using `computeMemorySuggestionDismissedUntil(dismissedAt)`.
- Compute `expiresAt` using `computeMemorySuggestionExpiresAt(createdAt)` (14-day default).
- Before returning a blocked suggestion to the client, pass it through `sanitizeMemorySuggestionLifecycleForDisplay`.

## Fixtures

Use the exported helpers to generate valid examples for each state:

- `createMemorySuggestionLifecycleFixture(status)`
- `createWellnessMemorySuggestionLifecycleFixture(status)`
- `createBittensorMemorySuggestionLifecycleFixture(status)`
- `createMarketMemorySuggestionLifecycleFixture(status)`

All fixtures set `actorConfirmationRequired: true`, safe bodies, and the correct default windows.

## Verification

```bash
pnpm --dir packages/types build
node scripts/matterhorn-memory-contract.test.mjs
node scripts/matterhorn-memory-suggestion-lifecycle-contract.test.mjs
node scripts/market-execution-safety-gate.test.mjs
```

## Change rules

- Do **not** add a transition that creates a memory record without actor confirmation.
- Do **not** widen `MATTERHORN_MEMORY_SUGGESTION_ACTIONS` to include auto-accept.
- Do **not** reduce `MAX_MEMORY_SUGGESTION_REASON_LENGTH` without updating UI truncation logic.
- Any new status must be added to `MATTERHORN_MEMORY_SUGGESTION_STATUSES`, `isMemorySuggestionTransitionAllowed`, and the dedicated lifecycle contract test.
