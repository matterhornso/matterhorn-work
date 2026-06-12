# Matterhorn Work Agent Control Live QA

Use this harness after `matterhorn-work doctor` is ready and you want one end-to-end pass/fail report for the local agent-control surface.

```bash
node scripts/agent-control-live-qa.mjs \
  --server-url http://127.0.0.1:8787 \
  --token <client-token> \
  --host-token <host-token> \
  --expect-event session.snapshot \
  --expect-event session.status \
  --json
```

The harness checks:

- public server health;
- `/status`, `/capabilities`, `/workspaces`, and Bittensor readiness;
- temporary chat session creation;
- harmless prompt submission;
- session status and bounded session events;
- read-only file-session creation;
- file catalog and one file read;
- optional host approval listing;
- cleanup for the temporary chat and file sessions.

By default, the prompt asks Matterhorn Work to reply. Add `--skip-reply` when you only want to test the stable prompt route without asking the engine to continue. Add `--keep-session` to preserve the temporary chat session for manual inspection.

Useful options:

| Option | Purpose |
| --- | --- |
| `--workspace-id <id>` | Use a specific workspace instead of the active/first workspace. |
| `--session-id <id>` | Reuse an existing session instead of creating and deleting a temporary QA session. |
| `--path <file>` | Read a specific workspace-relative file during the file-session probe. |
| `--max-events <n>` | Bound the session event stream. |
| `--expect-event <type>` | Require an event type in the bounded session event stream. Repeat it or pass comma-separated values. |
| `--ttl-seconds <n>` | Set the temporary file-session TTL. |
| `--strict` | Exit nonzero when any required stage fails. |

The report intentionally excludes seed phrases, mnemonics, private keys, and wallet export fields.
