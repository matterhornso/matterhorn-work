# STM local MCP launch recovery

Development-only, default off. These host-control operations are not model tools
or hosted-user APIs. They do not resolve, export, migrate or revoke credentials.
Use only the trusted local host control plane; never paste tokens into chat or
URLs. Do not enable the feature for production based on this runbook alone.

## Known, stopped process

1. Finish or cancel affected work using its normal runtime. Recovery is not a
   stop button and will not terminate a live process.
2. Read `GET /env/stm/mcp-grants` with existing host-token authentication. The
   response exposes grant ID, tool name, revoked state and active launch ID/PID;
   it omits command arguments, STM tokens and credential values.
3. Explicitly confirm recovery with
   `POST /env/stm/mcp-grants/<grant-id>/recover`, body:
   `{ "expectedLaunchId": "<active-launch-id>", "consent": true }`.
4. Success returns `{ "ok": true, "started": false }`. Only that active launch
   record is cleared, under the registry lock. Credential bindings and revoked
   status remain unchanged. A later explicit runtime reconnect still needs the
   current grant, workspace/configuration and credential-resolution checks.

The OS process probe sends signal **0**, not a termination signal. Only ESRCH
(PID absent) permits recovery. A live or reused PID blocks it; EPERM and other
uncertainty also block it. A stale expected launch ID cannot clear a newer launch.
The check covers the recorded direct tool process, not all descendants or copies
of a key. It does not promise erasure from process memory or provider revocation.

## Refused recovery

- `consumer_still_running`: inspect the runtime and finish/stop the correct tool
  normally. Do not kill an arbitrary PID just because it matches an old record.
- `launch_recovery_conflict`: re-read status; the record changed or was already
  cleared. Do not automatically retry against a newly observed launch ID.
- `launch_recovery_uncertain`: a durable launch intent exists but no child PID was
  published before failure. The child may have started; no automatic recovery is
  safe. An operator must stop all relevant launch owners, inspect their tools and
  descendants, and establish that no old credential-bearing consumer remains.
- `process_state_unavailable`: process absence could not be established. Resolve
  the OS inspection problem; do not treat it as an exited process.
- `registry_busy`: another writer or a crash-left lock exists. The implementation
  never steals it. Stop all relevant writers and inspect the exact registry and
  lock before an operator removes only a positively identified stale lock.

Unknown-PID/manual registry repair has no automated endpoint in this version.
Escalate to an operator familiar with the local runtime; after verified shutdown,
repair only the affected metadata record while writers remain stopped. Preserve
bindings, consent and revocation, and never restore plaintext values into env.json.
If absence cannot be established, leave the launch blocked. This is an explicit
limit, not a completed automatic recovery path for every possible crash window.

## Evidence and remaining gates

Disposable tests cover a killed source/compiled wrapper with its MCP still alive,
live-process refusal, explicit recovery after the test-owned MCP exits, stale IDs,
revoked-grant preservation, unknown PID refusal, durable pre-spawn intent, confirmed
spawn failure and transient/exhausted lock contention. Host-only and read-only
checks are exercised through server routes. No real credentials or developer
processes are killed. Signed OS packaging, real keystore and broader failure-path
acceptance remain separate gates recorded in the STM worklog.
