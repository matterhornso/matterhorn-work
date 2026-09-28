# STM integration into Matterhorn Desks

Status: engineering phases 1–4 implemented and locally verified on 28 September;
phase 5 local regression/native-fixture verification completed, but real Keychain,
signed-desktop acceptance, independent security review and CI remain release gates.
Not release-ready. Latest settings/migration evidence and operator handoff:
`qa-reports/stm/2026-09-28/PHASE-4-5-REVIEW.md`. Earlier phase evidence:
`qa-reports/stm/2026-09-28/PHASE-1-3-AUDIT.md`; chronological progress:
`qa-reports/stm/2026-09-28/WORKLOG.md`. This is not completion of three product
slices. The source review below describes the pre-implementation baseline.
Original planning baseline, prepared 28 September 2026: no secret values, real keychain records or daemon
descriptors were opened. No STM installation, pairing, migration or key writes
were performed. PR #1026 remains a separate release concern; this feature must
not be mixed into that PR.

## 1. Recommendation

Start with an **opt-in Matterhorn Desktop credential integration for MCP/tool
environment variables**, followed by brokered HTTP tool execution. Keep hosted
web credentials and OpenCode's AI-provider authentication as separate later
slices. A local STM daemon does not automatically provide credential storage to
users of `desks.matterhorn.so`.

Keep STM independently installed/running for the first release. Use a small
privileged adapter, not a fourth orchestrator-managed sidecar and not a direct
renderer-to-STM connection. Reuse existing environment editing and restart flows
where possible, but do not promise identical raw-value APIs while also promising
that values never enter UI state.

The first slice improves storage at rest and controls secret distribution. It
does **not** prove that an arbitrary agent shell or MCP process cannot read a key
inherited in its environment. Stronger per-request isolation requires the second,
brokered-execution slice.

## 2. Source reconciliation: the attachment is a starting brief, not proof

Read-only review used Matterhorn `dac794dfbfb71348861b8c4ccd99cc4adc14e45f` and the
local STM checkout `/Users/abhinavramesh/subscribetome`, HEAD
`a7c5d7aac8893761ea17684998b0a429aebea443` (package version 1.9.0).
STM has existing uncommitted changes in `src/broker.ts`, `src/catalog.ts` and
`test/catalog.test.ts`; preserve these and establish a clean reviewed baseline
before implementation. These local revisions are not claims about the latest
published releases. This pass inspected source, not STM binary behavior/tests.

| Brief assumption | Current source evidence | Plan consequence |
| --- | --- | --- |
| Bulk resolution must be added | STM `src/daemon.ts` already has `GET /api/inject/env`, returning `{values}`; `test/broker-daemon.test.ts` covers it | Review and extend, do not duplicate |
| Environment UI only receives names | Matterhorn `GET /env` returns `key`, raw `value`, `updatedAt`; React Query calls `listUserEnv()` and the table reveals/edits values | Add a metadata-only STM path; masking is not isolation |
| Three environment read sites | There is also an active `loadUserEnvFile()` in `apps/orchestrator/src/cli.ts` | Inventory all execution paths; sidecar registration and environment adaptation are distinct work |
| Rust/Tauri file is an available legacy implementation | Referenced `apps/desktop/src-tauri/src/env_file.rs` is absent in this checkout | Confirm any separately maintained Tauri release; do not plan changes to a nonexistent file |
| All loaders share reserved prefixes | Electron blocks `OPENWORK_`/`OPENCODE_`; server/orchestrator also block `MATTERHORN_WORK_` | Establish one policy and parity tests |
| STM uses the same bearer shape | Daemon uses `x-stm-token` or URL query token, not the assumed generic bearer interface | Adapter must follow the actual protocol; use header only |
| Existing add route is an upsert | STM `Store.addKey()` rejects duplicate labels | Define replacement, conflict, batch and delete semantics explicitly |
| Bulk resolve is equivalent to a narrow launch grant | Existing route resolves all active keys with `cwd: ""`, with display-name aliases | Never import the user's whole vault just to obtain selected Matterhorn bindings |

Further observations: Electron builds child environments with stored values,
then inherited `process.env`, then explicit overrides. It also copies a built
environment into the Electron main process before starting the embedded server.
These paths must not make STM secret resolution a generic all-child operation.
The STM daemon currently emits a token-bearing startup URL to stderr; an
integration must not pipe that into application/support logs.

## 3. Product scope and supported platforms

### Slice 1 — Secure environment storage and explicit bindings

- Desktop, single OS user; initial supported pilot: macOS Electron.
- Existing MCP/tool credential environment names are preserved exactly.
- STM inventory is linked through explicit, user-approved bindings, not imported
  automatically when a daemon is found.
- Store metadata/references in Matterhorn; credential values remain in STM's
  actual configured keystore except transient entry/resolution/use.
- Cover local Electron, local server CLI and orchestrator paths that are enabled
  for the feature. Unsupported paths clearly refuse STM activation instead of
  silently using old plaintext values.
- Preserve the current hosted-web restriction on Environment settings.
- API-provider keys already in OpenCode auth storage, wallet keys, signing,
  cloud synchronization, billing/spend UI and STM Teams are out of scope.

### Slice 2 — Brokered tool calls

Supported HTTP tools ask a trusted backend to make a provider-bound request;
STM attaches the key on the outbound call. Raw values do not enter model/runtime
environment variables. Integrate with existing Matterhorn workspace/session/tool
permissions, SSRF controls and approval receipts; STM does not replace them.
Treat broker capabilities as sensitive authority, even though they contain no
provider key. Restrict hosts, methods, paths, allowed keys and response size;
test redirects, DNS rebinding, header injection and output leakage.

### Later slices — separate designs

- AI providers: design against the pinned OpenCode auth/transport contract,
  including streaming, token accounting and provider privacy; avoid a vendor fork
  unless a supported adapter cannot meet the requirements.
- Hosted Matterhorn: tenant-scoped encrypted storage, workload identity, managed
  key access, rotation, audit and recovery. Never read the server operator's
  personal STM vault for public users or connect arbitrary browser loopback URLs.
- Linux/Windows: actual keystore, locked-session, desktop-launch and compiled
  binary tests before claiming support. An encrypted-file backend must be named
  accurately; do not label every backend “OS Keychain.”

## 4. Recommended trust boundary

```text
Environment settings — metadata/status and explicit user actions
          |
          | authenticated existing host control plane / narrow trusted IPC
          v
Matterhorn privileged credential adapter
  - verifies daemon identity and connection
  - owns STM authentication; validates selected bindings
  - resolves only for an approved consumer at its launch/call boundary
          |
          | loopback, no redirects, x-stm-token, bounded request/response
          v
STM daemon --> configured keystore
          |
          +--> Slice 1: selected secret values to a trusted launch/call owner
          +--> Slice 2: broker attaches credentials to approved outbound HTTP
```

No STM dashboard token, broker token or daemon descriptor enters the renderer,
React Query, browser storage, chat, tool arguments/results, exported diagnostics
or sync. A new credential entered by the user necessarily exists briefly in an
input/transport buffer; clear that buffer on completion/cancel/unmount and never
persist/cache it. Consider opening STM's own trusted dashboard for entry as the
initial minimal option, then link metadata back in Matterhorn.

Dashboard authority may be used by the privileged local adapter in the initial
compatibility implementation; the broker token must never resolve raw values.
This grants the adapter broad local vault authority and must be explicitly
acknowledged during pairing. A separately scoped integration credential is a
preferred follow-up, not an existing feature to assume. Being on loopback or
having a live PID is not itself proof of identity or authorization.

Discovery requirements:

- Default to loopback literal `127.0.0.1`; other loopback forms only when validated
  end to end. No arbitrary remote URL, redirects, userinfo or query credentials.
- Validate descriptor schema/size, regular-file identity, ownership and private
  permissions using descriptor-based reads where supported; reject unsafe links
  and permission changes. Platform ACL checks need platform-specific tests.
- Health establishes reachability only. Verify authenticated version/capabilities
  before enabling; reject incompatible API versions or unsupported keystores.
- No secret-bearing URLs in logs. Use a secret-free status/quiet startup mode
  before Matterhorn ever manages daemon launch. Initially it only discovers it.
- Token rotation/stale descriptor: rediscover once, then show an actionable error;
  bounded timeouts/backoff, no infinite retry or plaintext downgrade.

## 5. Data/API design

### Shared adapter contracts

Create one small dependency-light implementation reusable from Node/Electron and
the local server/orchestrator, packaged as needed rather than copying loaders.
Separate operations: status, metadata list, explicit credential create/replace,
binding removal and privileged selected resolution. Do not overload `list()` to
read every secret or cache STM values for a process lifetime.

Persist a versioned binding registry containing only:

- exact `envName`;
- opaque binding ID and STM key identity/reference;
- storage backend, revision and update timestamp;
- approved consumer/runtime identity and restart-required state.

No value, token or value-derived hash in this registry. It remains machine/user
scoped in slice 1; optional consumer selections are not a multi-tenant boundary.
Environment aliases must not derive from editable tool display names. Reject
duplicate aliases, normalized-name collisions and reserved/process-control names
before writing or starting a consumer. Test injection controls such as loader,
proxy, `PATH` and `NODE_OPTIONS` separately from internal token namespaces.

### STM changes

Reuse existing inventory, key operations and injection helpers after verifying
semantics. Add a versioned **selected-resolution** contract (proposed POST route)
accepting explicit approved key references and exact output bindings, with limits
on key count/value sizes and collision rejection. Resolve only selected keys;
filtering after receiving all vault values is not sufficient isolation. Empty
selection returns empty, never “all active keys.”

Keep existing bulk endpoint compatible for existing STM consumers, but do not
use its all-active default as Matterhorn's production integration. Define stable
metadata listing, atomic/idempotent replacement or safe revisioned updates, and
conflict errors. Add/revoke alone does not preserve Matterhorn upsert/delete
semantics: STM revocation is not provider revocation and may retain keystore data.
Unlinking an existing shared STM key must not delete/revoke that key globally.

### Matterhorn REST compatibility

- Preserve existing `/env` behavior for users who remain on the legacy backend.
- Preserve `/env/keys` response shape, but service it from metadata without
  resolving values. Maintain the names-only model context.
- Add versioned metadata/status/binding operations for STM-backed settings.
  Existing raw-value `/env` clients must receive an explicit unsupported-action
  response for STM records, not fake masked values treated as actual secrets.
- Never return STM values just to preserve the old list/reveal contract.
- Keep host-only auth/read-only enforcement; ordinary hosted accounts and model
  tools must not gain access to these control-plane operations.
- Update realtime voice's current `env.list()` lookup to resolve only its needed
  key through a privileged helper. Preserve the current key-selection order and
  document this environment consumer without migrating OpenCode provider auth.

## 6. Startup, rotation and fallback semantics

Do not layer STM values into `process.env` globally or into every child by default.
Identify required consumers first; resolve a bounded snapshot for the specific
consumer and pass it directly to `spawn` or the server-side call. Main-process
environment mutation and stale inherited values need regression tests.

Define provenance and precedence: internal wiring always wins; an STM-bound name
must not silently be shadowed by an inherited/stale plaintext value. Show a
conflict and require a choice. Unbound legacy variables retain current behavior.
Rotation affects future calls/starts; existing child processes retain inherited
values until restarted. Mark “Restart required,” block unsafe mid-task restart,
and never claim revocation instantly erases another process's memory.

| State | Expected behavior |
| --- | --- |
| STM not enabled/not installed | Legacy behavior unchanged; no automatic migration |
| Daemon detected, not paired | Offer connection; do not resolve vault values |
| Connected, key available | Resolve only the chosen binding for its consumer |
| Migrated binding, daemon stopped/locked/unauthorized | Keep metadata usable; block affected new calls/starts; reconnect/unlock action |
| Unrelated legacy binding while STM unavailable | Continues normally; no false global outage |
| Key revoked/missing/collision | Explicit blocker; no stale fallback or wrong-key substitution |
| User wants to return to file storage | Explicit per-key security downgrade/export consent, never automatic |

This deliberately changes the brief's proposed “kill STM → silently use
plaintext” rule **for migrated keys only**. Automatic fallback after migration
undermines storage and revocation guarantees. Non-adopters retain compatibility.

## 7. Migration and rollback

1. Detect eligible entries and show names/counts only; do not migrate provider
   auth DBs, wallet secrets or all existing STM inventory.
2. User selects entries and consents to the target keystore and consumer scope.
3. Create/import with idempotency and conflict detection; verify resolution in
   privileged memory without printing/comparing values in logs.
4. Atomically publish references only after verification. Journal metadata-only
   states so interruption resumes without loss or duplicate/incorrect keys.
5. Remove selected plaintext entries only after explicit confirmation and
   verified commit; preserve untouched entries. Avoid persistent plaintext
   backup copies. Report that filesystem snapshots/backups may retain old values;
   secure deletion cannot be promised on SSDs. Recommend provider rotation.
6. Test crash points after every step, concurrent edits, disk-full, keystore
   failure, stale revisions and restart/recovery.

Roll back code via feature flag while retaining secret references and preserving
the explicit failure state. Do not rehydrate migrated values into `env.json` as
an automatic rollback. Downgrade/export requires a separate explicit operation.

## 8. User experience

Preserve Matterhorn branding/current Environment layout. Add a compact
“Secret storage — subscribetome” section, not another dashboard or primary desk.

- States: Not connected, Connecting, Connected, Locked, Reconnect required,
  Unsupported, and Restart required. Green means authenticated/capable, not merely
  a port answering health requests.
- Show actual backend (for example macOS Keychain) and per-entry storage badges;
  only verified STM-backed entries say “Stored in subscribetome.”
- Actions: Connect, Link existing secret, Add/Replace, Move selected secrets,
  Unlink, Reconnect, Apply/restart. Distinguish unlink from global STM revocation.
- Manual pairing is an advanced fallback in a trusted local flow; default URL is
  loopback and token goes directly to privileged handling, never persistent UI
  state. Do not ask for a token in chat or relax remote-URL checks.
- Existing STM entries are metadata-only. No routine Reveal control. Inputs have
  labels, keyboard focus, accessible status announcements and safe cancel/error
  behavior. Verify narrow settings-panel width, 390px, 200% zoom and both themes.
- Explain environment injection accurately: authorized processes receive the
  selected key. Do not claim the agent cannot ever see it until brokered execution
  and adversarial tests support that claim.

## 9. Delivery plan and estimates

Estimates are engineering effort, not a promised deadline; real OS acceptance
and external review can extend elapsed time. No background work is scheduled.

| Phase | Work / deliverable | Exit criterion | Indicative effort |
| --- | --- | --- | --- |
| 0. Freeze contract | Clean STM baseline, threat model, API compatibility, all consumer/spawn sites, supported shells | Written agreement on fallback, raw-value UI change, consumer scope, platform support | 0.5–1 day |
| 1. STM contract | Selected resolution, stable metadata, replacement semantics, sanitized errors/logs, fake-keystore tests | Missing/wrong/broker tokens cannot resolve; unrelated vault keys never resolved | 1–2 days |
| 2. Matterhorn adapter | Discovery, version handshake, metadata registry, host-only API, voice-specific resolution | No STM values/tokens in UI/model stores; legacy tests unchanged | 1–2 days |
| 3. Runtime paths | Electron embedded server and specific children; local server/orchestrator parity | Fake child gets only exact approved names; no global credential pollution; rotation/restart works | 1–2 days |
| 4. Settings/migration | Compact states/actions, opt-in migration, idempotency, failure recovery | Migration/restart/crash tests pass; no silent plaintext fallback | 1–2 days |
| 5. Acceptance/release | Real sandbox daemon, keystore/backend checks, hostile inputs, full regressions, evidence | Security review + OS acceptance + all CI green | 1–2 days |

Expected slice-1 effort: approximately **6–11 engineering days** for a credible
macOS desktop release, assuming repository access and timely decisions. A small
fake-keystore feasibility spike can be done first in 1–2 days but is not the
finished feature. Broker-only guarantees, cloud/Teams and provider-key migration
are separate estimates after their contracts are designed.

## 10. Test and release gates

### Contract/security

- No/wrong/stale token, broker token, remote origin, rebinding, redirect,
  untrusted descriptor, symlink swap, oversized/malformed bodies and timeouts.
- Selection isolation: empty selection, revoked/unknown keys, collisions,
  changed display names, duplicate labels, reserved prefixes and unsafe process
  control variables. Assert forbidden keys are not even resolved.
- Sentinel secret absent from logs, errors, telemetry, React Query/storage,
  prompts, tool outputs, exported reports and child command lines.
- A deliberately hostile tool tries `env`/printenv/file reads: document that
  inherited env values are readable to that consumer in slice 1; require the
  brokered path before asserting protection from the credential-holding process.
- Verify model tool access cannot reach STM control-plane tokens/descriptors or
  invoke selected resolution through an unguarded local-network path.

### Behavioral

- Legacy-no-STM operation; explicit opt-in; metadata load without resolution;
  exact name mapping and precedence; create/replace/unlink/revoke distinctions.
- Fake child spawn demonstrates selected injection without printing values;
  already-running child semantics and guarded restart are explicit.
- Daemon stop/restart, keychain lock, wrong token, replacement, revoked/missing
  key, network failure, concurrent editing and crash-safe migration/rollback.
- `/env/keys` and env-context shapes unchanged; host/owner/member separation;
  read-only and hosted environments do not acquire the local feature.

### Environments and regression evidence

Start with in-memory/fake keystores. Integration tests isolate `STM_DB`,
`STM_DAEMON_FILE`, keystore backend and service/account namespace in disposable
directories; never use the developer's real daemon descriptor, DB or vault.
An alternate service name is isolation, not a substitute for a mock backend.
Run a separately authorized real macOS Keychain test with a throwaway credential,
clean up only that test record and confirm compiled artifact behavior independently.

Run STM tests using its documented Bun harness in the isolated environment;
Matterhorn `pnpm --dir apps/server test`, `pnpm --dir apps/app test`,
`pnpm test:matterhorn-platform-safety`, app/server typechecks/builds, Electron
typecheck/bridge checks, new adapter/launch tests, source secret scan and CI.
Capture sanitized desktop recordings/screenshots for setup, failed daemon,
migration and restart. Pin STM API/release/artifact checksums after review; do
not infer release compatibility from a local source version or a prior FFI claim.

### Release sequencing

1. Keep #1026 CI/security remediation independent. Plan this on a new
   `codex/stm-tool-secrets-*` branch based on the eventual approved baseline.
2. STM contract PR first, then Matterhorn adapter/runtime PR, then settings and
   migration PR; all remain behind a default-off flag until jointly accepted.
3. Internal macOS opt-in pilot, failure/rotation/restart evidence, then limited
   desktop beta. Do not enable hosted web or unsupported shells incidentally.
4. Publish API/version matrix, threat-model limits, migration/recovery guide,
   support runbook and sanitized QA results in the open-source repositories.

## Decisions to confirm before implementation

Recommended defaults: macOS Desktop first; standalone daemon; backend-only STM
authentication; explicit selected bindings; legacy fallback only for unmigrated
entries; metadata-only STM UI; no automatic secret export/daemon install; no
provider-auth/cloud/wallet changes. These are proposed corrections to the brief,
not permissions inferred from its “confirmed by user” statements.

Confirm the STM owner/baseline, whether Environment's developer-only placement
should change for desktop users, and which MCP/tool consumers must work in the
first pilot. All security-sensitive integration/migration actions require a
subsequent implementation request and the relevant user consent.
