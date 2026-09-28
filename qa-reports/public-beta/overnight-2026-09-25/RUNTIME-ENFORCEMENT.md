# Enforced runtime acceptance — 25 September 2026

## Scope

Actual local Matterhorn HTTP gateway, pinned OpenCode **1.18.31**, and real
Matterhorn guard plugin, with `MATTERHORN_GUARDED_RUNTIME_MODE=enforce`.
Inference is a **synthetic loopback provider**. No external model calls, chain
reads, wallet signatures, production accounts or production configuration changes.
Temporary credentials are generated and never included in the report.

This extends the existing runtime probe with `--guarded-enforce`; default mode
remains unchanged. Fixture approval mode is explicitly `auto` on a disposable
server. It does **not** resolve the hosted manual-approval/user-journey blocker.

## Results

Every run exercised `matterhorn`, `matterhorn-bittensor`,
`matterhorn-hyperliquid`, `matterhorn-polymarket`, `matterhorn-sui`.
Each agent's preflight allowed the synthetic public prompt, dispatch returned
202, completion was `stop`, prompt content appeared once, and provider usage
was 1,000 tokens for its baseline response.

| Scenario | Outcome | Settled tokens | Pending holds |
| --- | --- | ---: | ---: |
| Five-agent baseline | Five responses, five inference calls | 5,000 | 0 |
| Lost acknowledgements + fresh retry | 15 HTTP attempts, only five inference calls; retry added neither message nor inference | 5,000 | 0 |
| In-flight stop + recovery | Provider disconnected; hold released; next request completed | 6,000 | 0 |
| Denied write tool in Plan mode | Tool absent from advertised tools; error returned; no file created | 7,000 | 0 |

All four commands exited 0. In each run:

- Synthetic secret attachment was denied with 422 `agent_privacy_blocked`, with
  no additional inference or secret content in the public error.
- A direct runtime request without a bound gateway run was blocked before
  inference. Internal authorization endpoints returned 409; the runtime surfaced
  a generic error. This is a negative control, not an ordinary-user success flow.
- Final used/charged totals matched; pending reservations were zero.
- Test data was removed. Runtime shutdown required the harness's bounded SIGKILL
  fallback after graceful termination in these runs; this is not proof of
  graceful production shutdown.
- Cancellation reported `partialTextPersisted=false`. Stop/recovery and usage
  settlement passed, but retaining a partially streamed answer is not proved.

## Reproduce

Use an isolated, verified OpenCode executable; the script checks its SHA-256
against `16c960ba77421da11b53e785f359b73f328a86118b48feb4af143db5d9afb198`.
The tested local path was
`/private/tmp/matterhorn-overnight-runtime.ddJMOU/bin/opencode`.

```sh
export MATTERHORN_QA_OPENCODE_BIN=/path/to/verified/opencode
bun scripts/matterhorn-runtime-regression-probe.ts --guarded-enforce
bun scripts/matterhorn-runtime-regression-probe.ts --guarded-enforce --lost-ack --retry-after-lost-ack
bun scripts/matterhorn-runtime-regression-probe.ts --guarded-enforce --abort-in-flight
bun scripts/matterhorn-runtime-regression-probe.ts --guarded-enforce --denied-write-tool
```

## Not covered

Real hosted account session, normal-user approvals, CUDOS inference, public-chain
results, wallet execution, browser rendering, hosted persistence, emails, backup
upload/restore and performance. Earlier local real-provider results remain
separate, operator-assisted evidence. Do not present this fixture as live
five-desk release acceptance.
