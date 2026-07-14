# Matterhorn Work Notes

**Status:** Current implementation guide
**Updated:** 2026-07-11

## Purpose

Notes are project-owned working context. They are separate from chat history and separate from Memory.

A note can contain:

- title and body;
- tags;
- a desk, session, task, or output attachment;
- source metadata;
- an optional Memory suggestion reference.

Nothing is remembered merely because it was written in Notes. The user must explicitly send the note to Memory review.

## Customer Workflow

### Notes Rail

The narrow rail uses one pane at a time:

1. **List:** search, one compact filter, note rows, and New Note.
2. **Editor:** back navigation, title/body editing, progressive tags, linked context, Memory suggestion, and delete.

This avoids rendering a desktop master-detail layout inside a 340-500px panel.

Available filters:

- All notes;
- Bittensor;
- Hyperliquid;
- Polymarket;
- Sui;
- Longevity;
- Outputs;
- Memory suggested.

### Autosave

The editor buffers changes for 650ms before saving. Healthy saves are silent; only an active `Saving` state or an error is shown.

Navigating back flushes pending edits. The backend serializes mutations, so overlapping PATCH requests cannot lose unrelated fields.

### Quick Jot

Quick Jot is a contained side composer, not a full-width bottom sheet. It supports title, body, tags, an optional attachment, Save Note, and Save & Suggest Memory.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/workspace/:id/notes` | List and filter active notes. |
| `GET` | `/workspace/:id/notes/:noteId` | Read one note. |
| `POST` | `/workspace/:id/notes` | Create a note. |
| `PATCH` | `/workspace/:id/notes/:noteId` | Update selected fields. |
| `DELETE` | `/workspace/:id/notes/:noteId` | Soft-delete a note and re-render its daily file. |
| `POST` | `/workspace/:id/notes/:noteId/memory-suggestion` | Create a workspace-scoped Memory suggestion for review. |

Writes require:

- a known workspace;
- a writable server;
- collaborator scope;
- valid bounded note fields.

Viewer tokens may read Notes but cannot create, edit, delete, or suggest Memory.

## Storage

Each workspace stores Notes in two forms:

```text
notes/YYYY-MM-DD.md
.matterhorn-work/notes/index.json
```

The index is the structured source used by the API. Daily Markdown is a readable project artifact derived from active notes.

The server:

- serializes index mutations per workspace;
- writes the index to a temporary file and atomically renames it;
- normalizes tags, links, IDs, paths, sources, and desks;
- blocks path traversal and unsupported URL schemes;
- removes the daily Markdown file when its last active note is deleted.

## Limits

- Body: 500,000 UTF-8 bytes.
- Title: 160 characters.
- Tags: 24, each normalized and bounded.
- Links: 24, deduplicated.
- List API: 1-500 records per request.

## Memory Boundary

Sending a note to Memory creates a suggestion, not a confirmed memory. The suggestion remains subject to:

- secret-shaped content checks;
- explicit consent;
- workspace scoping;
- confirm/edit/dismiss lifecycle;
- provenance and audit recording.

Private keys, seed phrases, mnemonics, wallet exports, raw signatures, signed payloads, API secrets, and similar material must never become Memory.

## Source Pointers

- UI: `apps/app/src/react-app/domains/notes/notes-page.tsx`
- Quick Jot: `apps/app/src/react-app/domains/notes/quick-jot-sheet.tsx`
- Client state: `apps/app/src/react-app/domains/notes/notes-store.ts`
- Shared contract: `packages/types/src/notes.ts`
- Server store: `apps/server/src/notes.ts`
- Routes: `apps/server/src/server.ts`

## Verification

```bash
pnpm --filter @matterhorn-work/app exec bun test tests/notes-integration-contract.test.ts
pnpm --filter matterhorn-work-server exec bun test src/notes-routes.e2e.test.ts
pnpm --filter @matterhorn-work/app exec tsc -p tsconfig.json --noEmit
pnpm --filter matterhorn-work-server exec tsc -p tsconfig.json --noEmit
```

The server test suite includes concurrent PATCH coverage to ensure title and body updates are both preserved.
