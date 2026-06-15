# Hermes Test Issues Found

Live Bittensor end-to-end test run, 2026-06-12.
Repo: `matterhornso/matterhorn-work` @ `1cff5e79` (origin/dev).
Run by: Hermes agent (CLI session) on behalf of the Matterhorn Work team.
Sidecar mode: Python SDK (live Finney public reads, no signing).
Working tree: `~/Downloads/matterhorn-work` (fresh clone, not the local
`session-event-deltas` worktree referenced in the operator playbook).

## Scope

This doc captures everything Hermes observed while executing the
chat-first Bittensor flow described in
`hermes-bittensor-live-test-commands.md` (the operator's copy-paste
sheet). It is meant to be handed to the coding agent that owns the
Bittensor sidecar and the orchestrator server.

The full QA report is at `/tmp/bittensor-live-readiness-basic.md`
and the raw JSON at `/tmp/bittensor-live-qa-basic.json` (both
generated on the operator's machine, not committed).

## TL;DR

Four real issues. Two are one-line fixes. All four are blockers for
the basic QA passing in strict mode, and one (Issue #1) also blocks
the full metagraph path that the operator playbook step 10/11
exercise.

| # | Issue | Severity | Type | Fix size |
| - | ----- | -------- | ---- | -------- |
| 1 | numpy 2.x truth-value bug in `python_bridge.py:287` | High | Sidecar bug | 1 line |
| 2 | `/health` and `/subnets/14/dynamic` re-fetch the chain head on every call (~14–15s each) | High | Sidecar perf | Small |
| 3 | QA harness expects `subnet_result` card on the unsupported-adapter path; chat returns `unsupported_adapter` | Medium | Test contract mismatch | 1 line |
| 4 | `/subnets` list endpoint times out in Python mode (~30s+) | Medium | Sidecar perf | Medium |

## Environment and command deltas

The operator's command sheet assumes a specific local environment
that did not match this fresh clone. The differences are not bugs in
Matterhorn, but the playbook and the test doc should reflect them so
the next operator does not hit the same friction.

- The sheet's `cd` path (`/Users/abhinavramesh/Documents/Matterhorn-work/session-event-deltas`)
  is a local worktree, not on origin. The relevant code is on `dev`
  and was used as-is from a fresh clone.
- The orchestrator's bundled Matterhorn server binary download fails
  in this environment. Workaround that works:
  ```
  pnpm --filter matterhorn-work-orchestrator dev -- start \
    --workspace "$PWD" \
    --approval manual \
    --allow-external \
    --matterhorn-work-server-bin "$PWD/apps/server/bin/matterhorn-work-server.mjs" \
    --json
  ```
  Without `--allow-external` the start fails with:
  `Bundled Matterhorn Work server binary missing and download failed. Use --allow-external or --sidecar-source external.`
- The orchestrator picks a random free port for the Matterhorn server
  (saw 50498 in this run; 50287 in an earlier one). The doc assumes
  `8787`. Capture the actual port from the `--json` startup output.
- Tokens are deliberately suppressed in the pretty startup output.
  Use `--json` to get the collaborator/owner/host tokens as raw
  values, or rely on the persisted token store at
  `~/.config/openwork/tokens.json` (hashes only — plaintext is
  generated fresh per session).

## Static checks and unit tests

All green on `1cff5e79`:

```
node --check scripts/bittensor-live-qa.mjs           OK
node --check scripts/bittensor-live-report.mjs       OK
node --check scripts/bittensor-live-report.test.mjs  OK
pnpm test:bittensor-live-report                      PASS
pnpm test:bittensor-operator-playbook                PASS
pnpm test:agent-control-coverage-matrix              PASS
```

`pnpm test:bittensor-live-qa` and `pnpm test:bittensor-cli-fallback`
were not run — they bind `127.0.0.1` and the operator's note in the
playbook says to re-run them in a normal terminal if a sandbox
denies `listen EPERM`.

## Sidecar observations (Python SDK mode, Finney)

`/health` works, returns `ok: true`, `mode: python`, `network: finney`,
`block: 8389942` (live at the time of the test), `canSubmit: false`.

| Endpoint | Result | Latency | Notes |
| -------- | ------ | ------- | ----- |
| `GET /health` | 200 OK | ~14–15s | Re-fetches chain head on every call. See Issue #2. |
| `GET /subnets/14/dynamic` | 200 OK | ~1s after warmup | Subnet 14 = "Cacheon", `priceTao` 0.0130, `alphaIn` 2.26M, `alphaOut` 2.91M, `taoIn` 29.4k, block 8389605. |
| `GET /subnets/14/metagraph` | 500 | n/a | numpy truth-value bug. See Issue #1. |
| `GET /subnets` | timeout | >30s | Lists all subnets via a single substrate call. See Issue #4. |

## Basic live QA result

`scripts/bittensor-live-qa.mjs --require-ready --strict --json`:

- Pass: 3 (`bittensor.learn`, `bittensor.wallet.clarification`, `bittensor.discover.image`)
- Warn: 0
- Fail: 4 (see below)
- Skip: 3 (no `--ss58-address` provided — full wallet flow was out of scope)
- Overall: `ready: false`, exits non-zero in strict mode.

| Stage | Status | Detail |
| ----- | ------ | ------ |
| `bittensor.readiness` | fail | `This operation was aborted` — root cause Issue #2. |
| `bittensor.learn` | pass | `subnet_result` card. |
| `bittensor.wallet.clarification` | pass | `clarification_required`, asks for SS58 coldkey. |
| `bittensor.wallet.snapshot` | skip | No `--ss58-address` provided. |
| `bittensor.wallet.stake_positions` | skip | No `--ss58-address` provided. |
| `bittensor.discover.image` | pass | 3 `subnet_comparison` cards. |
| `bittensor.validators.compare` | fail | `This operation was aborted` — root cause Issue #1. |
| `bittensor.stake.clarification` | fail | `This operation was aborted` — chained failure from validators.compare. |
| `bittensor.stake.unsigned_preview` | skip | No `--ss58-address` + `--validator-hotkey` provided. |
| `bittensor.subnet.unsupported_adapter` | fail | `expected card kind subnet_result, received unsupported_adapter` — Issue #3. |

## Manual CLI chat probes

All six prompts from the operator's step 12 ran end-to-end via
`matterhorn-work bittensor chat --json`. The CLI path is more
resilient than the QA harness — it falls back to curated metadata
when the sidecar is slow or returns nothing, so the
`validators.compare` and `unsupported_adapter` prompts returned
`answered` / `unsupported` rather than aborting.

| Prompt | Intent | Execution | Notes |
| ------ | ------ | --------- | ----- |
| "Explain TAO, subnets, coldkeys, hotkeys, staking, validators" | `learn` | `answered` | OK |
| "show my TAO" | `wallet` | `clarification_required` | Asks for SS58. |
| "which Bittensor subnet is useful for image generation?" | `discover` | `answered` | Returns 5 fallback subnets; warns "Some matches use fallback metadata because live provider data was unavailable." |
| "compare validators on subnet 14" (strategy=balanced) | `stake_plan` | `answered` | Returns fallback warning: "No validator sample was available for this subnet." |
| "prepare staking 1 TAO on subnet 14" | `stake_plan` | `clarification_required` | Asks for validator hotkey. |
| "Use subnet 14 for this task: summarize a prompt through its service adapter." | `subnet_use` | `unsupported` | "No compute service adapter is configured yet." |

## Issues

### Issue #1 — numpy 2.x truth-value bug breaks metagraph endpoint

**Severity:** High. Blocks the full metagraph path, including
validator comparison, the wallet /stake flow that depends on it, and
any chat flow that wants a real validator sample.

**File:** `packages/bittensor-subtensor-sidecar/python_bridge.py:287`

**Code:**
```python
"validator_permit": bool(validator_permit[index]) if index < len(validator_permit) else None,
```

`validator_permit` is a numpy array. `bool(numpy_array)` raises
`ValueError: The truth value of an array with more than one element
is ambiguous` in numpy 2.x (the bridge now ships with numpy 2.0+,
see `requirements` via `pip install bittensor`).

**Error seen on the wire:**
```json
{"ok":false,"error":"sidecar_error","message":"/.../urllib3/__init__.py:35: NotOpenSSLWarning: ...\n  warnings.warn(\nThe truth value of an array with more than o"}
```

**Suggested fix:**
```python
"validator_permit": bool(validator_permit[index].item()) if index < len(validator_permit) else None,
```

`.item()` unwraps a 0-d numpy scalar to a Python scalar so `bool()`
is well-defined. Apply the same pattern to any other field that does
`bool(numpy_array[index])` if the bridge touches more of them
(`hotkeys`, `coldkeys`, `uids` are lists of strings/ints so they are
fine; `stake`, `trust`, `validator_trust`, `dividends`, `emission`
already use `float(...)` which works on numpy scalars).

**Test plan:**
- `curl -s http://127.0.0.1:9876/subnets/14/metagraph | python -m json.tool` should return
  a JSON with a `neurons` array, no `sidecar_error`.
- Re-run `pnpm test:bittensor-live-qa` (this should still pass on
  mock mode; add a Python-mode test if not present).
- Re-run the basic live QA — `bittensor.validators.compare` should
  flip to `pass` once Issue #2 is also fixed.

### Issue #2 — `/health` and `/subnets/14/dynamic` re-fetch the chain head on every call

**Severity:** High. The server's sidecar probe is
`AbortSignal.timeout(12_000)` in
`apps/server/src/tools/bittensor.ts:670`. Each `/health` call takes
~14–15s in this environment because the Python bridge does a fresh
substrate RPC round-trip to fetch the current block on every
request. The probe times out, the readiness check returns
`sidecar_status: "unreachable"` even though the sidecar is up, and
every QA stage that depends on a ready sidecar aborts with
`This operation was aborted`.

**Suggested fixes (pick one or combine):**

a) Cache the chain head in the bridge and refresh it on a timer
   (e.g. every 5s). `/health` returns the cached head; the timer
   updates the cache. This is the right answer for production.

b) Add a dedicated `/liveness` endpoint that returns 200 with
   `{ok: true, mode: <mode>, sdkAvailable: <bool>}` without doing
   any RPC. Server probes `/liveness` first and falls back to
   `/health` only when it needs live data.

c) Bump the server's probe timeout from 12s to 25–30s. This is a
   band-aid and will not help once the chain is under load.

**Test plan:**
- After fix, `curl -m 5 http://127.0.0.1:9876/health` returns in
  under 1s on a warm sidecar.
- `bittensor.readiness` in the basic QA flips to `pass`.
- Readiness card's `sidecar_status` flips from
  `"unreachable"` (or `warning`) to `"healthy"`.

### Issue #3 — QA harness expects wrong card kind on the unsupported-adapter path

**Severity:** Medium. Pure test contract mismatch — the chat layer
is behaving as designed.

**File:** `scripts/bittensor-live-qa.mjs:300`

**Code:**
```js
expectCard(result.body, "subnet_result");
```

**Actual behavior:** for the prompt
`"Use subnet 14 for this task: summarize a prompt through its service adapter."`
the chat returns `execution: "unsupported"` and a card of kind
`unsupported_adapter`, not `subnet_result`.

**Suggested fix:** change the assertion to accept
`unsupported_adapter` as the expected card kind for the
unsupported-adapter path:
```js
expectCard(result.body, "unsupported_adapter");
```

Alternatively, gate the check on `execution === "unsupported"` and
not require a specific card kind — the existing
`status: result.body?.execution === "unsupported" || invocation.supported === false ? "pass" : "warn"`
already treats `unsupported` as pass.

**Test plan:**
- Re-run the basic QA. `bittensor.subnet.unsupported_adapter`
  should flip to `pass`.
- Confirm the curated-fallback message about adapters is still
  surfaced as a `warning` card in the chat response (read-only,
  not asserted by the harness).

### Issue #4 — `/subnets` list endpoint times out in Python mode

**Severity:** Medium. Affects the curated-fallback path in the
readiness report ("Subnet discovery is available, but only fallback
metadata is loaded."). The server's readiness card already falls
back to curated metadata when `/subnets` fails, so user-visible
behavior is degraded, not broken.

**Root cause:** the bridge tries to enumerate every subnet via a
single substrate call, which exceeds the 30s probe window.

**Suggested fixes:**

a) Cache the subnet list (refresh every 60–300s) and serve it from
   the cache for `/subnets`.

b) Add pagination / limit support (e.g. `/subnets?limit=20`) and
   have the server fetch only what it needs for the current
   readiness/chat flow.

c) Increase the server's probe timeout for `/subnets` specifically
   (still a band-aid).

**Test plan:**
- After fix, `curl -m 10 http://127.0.0.1:9876/subnets` returns a
  populated JSON array in under 5s on a warm sidecar.
- `subnet_discovery` in the readiness report flips from
  `curated-fallback` to a provider-backed source.

## Recommended PR sequencing

If the team wants to land these in a single PR or split them, the
ordering that minimizes risk is:

1. Issue #1 first — one-line fix, fully isolated to
   `python_bridge.py`, unblocks the metagraph endpoint. Pair with a
   test that hits `/subnets/14/metagraph` in Python mode and
   asserts `neurons[0].validator_permit` is a boolean.
2. Issue #3 next — one-line fix in the QA harness, unblocks the
   basic QA in strict mode once Issue #1 is in.
3. Issue #2 as its own PR — the cache or `/liveness` endpoint
   change has wider surface area. Coordinate with whoever owns the
   sidecar's RPC lifecycle.
4. Issue #4 last or as a follow-up — perf work, not a correctness
   fix.

## Safety notes

- All probes in this run used public coldkey/hotkey inputs only
  (none were provided for this run). No seed phrases, mnemonics,
  private keys, keyfiles, SURI strings, wallet exports, or signed
  payloads appeared in any command, log, or report.
- The sidecar's `canSubmit` is `false` for the duration of the run.
  No signed extrinsic was ever produced.
- Public Finney reads (subnet 14 dynamic info, chain head) are
  inherently non-private and acceptable to log.

## Repro for the next run

From a fresh clone:

```
cd ~/Downloads/matterhorn-work
pnpm install --frozen-lockfile
python3 -m venv .venv-bittensor
source .venv-bittensor/bin/activate
python -m pip install --upgrade pip bittensor
deactivate

# Terminal 1 — sidecar in Python SDK mode
export BITTENSOR_SIDECAR_MODE=python
export BITTENSOR_PYTHON="$PWD/.venv-bittensor/bin/python"
export BITTENSOR_SUBTENSOR_SIDECAR_URL=http://127.0.0.1:9876
pnpm --dir packages/bittensor-subtensor-sidecar start

# Terminal 2 — orchestrator + server
export BITTENSOR_SUBTENSOR_SIDECAR_URL=http://127.0.0.1:9876
export MATTERHORN_WORK_WORKSPACE="$PWD"
pnpm --filter matterhorn-work-orchestrator dev -- start \
  --workspace "$PWD" \
  --approval manual \
  --allow-external \
  --matterhorn-work-server-bin "$PWD/apps/server/bin/matterhorn-work-server.mjs" \
  --json
# (read server URL, collaborator token, host token from the --json output)

# Terminal 3 — basic QA + report
node scripts/bittensor-live-qa.mjs \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --require-ready --strict --json > /tmp/bittensor-live-qa-basic.json

node scripts/bittensor-live-report.mjs \
  --input /tmp/bittensor-live-qa-basic.json \
  --output /tmp/bittensor-live-readiness-basic.md
```
