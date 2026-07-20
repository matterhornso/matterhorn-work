# Matterhorn Desks Bittensor Live QA

Use this harness after the general [Agent Control Live QA](./agent-control-live-qa.md) passes and you want a Bittensor-specific operator check for chat-first TAO workflows.

The harness calls the same non-custodial server routes used by MCP and CLI agents:

- `GET /api/bittensor/readiness`
- `GET /api/bittensor/capabilities`
- `GET /api/bittensor/capabilities/:netuid`
- `POST /api/bittensor/chat/execute`
- `POST /api/bittensor/extrinsics/prepare`
- `POST /api/bittensor/extrinsics/handoff`
- `POST /api/bittensor/subnets/:netuid/preview`
- `GET/POST /api/bittensor/monitoring/watchlist`
- `GET /api/bittensor/monitoring/check`

It validates the Bittensor product behavior that matters most for operators:

- beginner Bittensor explanation succeeds through chat;
- subnet capability manifests are available for discovery and selected-netuid inspection;
- `show my TAO` asks for an SS58 public address when one is missing;
- optional watch-only wallet reads return wallet cards when a public address is supplied;
- optional follow-up stake-position reads reuse public Bittensor context;
- optional wallet intelligence returns an explainable risk/exposure report when a public address is supplied;
- optional wallet change-baseline checks compare current public exposure against the last in-memory public baseline;
- image-generation subnet discovery returns subnet comparison cards;
- subnet intelligence returns an explainable report for the selected subnet;
- validator comparison returns validator selection cards;
- incomplete staking prompts ask for a validator hotkey instead of guessing;
- complete staking prompts return unsigned previews that require external signing;
- lower-level extrinsic prepare and signing handoff routes return unsigned previews plus checksumed handoff payloads;
- unsupported subnet service calls explain that no adapter is configured yet;
- direct subnet adapter previews return a request SHA-256 and require confirmation without invoking the adapter;
- monitoring watch create/list/check paths return watch IDs, evaluation counts, alert counts, and alert-routing hints;
- no request or report contains secret-shaped fields.

## Basic Run

```bash
node scripts/bittensor-live-qa.mjs \
  --server-url http://127.0.0.1:8787 \
  --token <client-token> \
  --json
```

This basic run does not need a wallet address. It checks readiness, subnet capability registry reads, beginner explanation, missing-address clarification, discovery, subnet intelligence, validator comparison, staking clarification, unsupported-adapter behavior, direct subnet adapter preview safety, and monitoring watch create/list/check behavior.

## Full Wallet And Preview Run

Pass a public SS58 coldkey address and a validator hotkey to test the wallet/stake-position and unsigned staking-preview paths:

```bash
node scripts/bittensor-live-qa.mjs \
  --server-url http://127.0.0.1:8787 \
  --token <client-token> \
  --ss58-address <public-coldkey-ss58> \
  --validator-hotkey <validator-hotkey-ss58> \
  --netuid 14 \
  --amount-tao 1 \
  --rate-tolerance 0.01 \
  --json
```

The full run still does not sign or broadcast anything. It adds watch-only wallet snapshot, stake-position, wallet-intelligence, wallet-change baseline, lower-level unsigned extrinsic preview, and external-signing handoff checks. The expected staking result is `unsigned_preview` with `requiresExternalSignature: true`.

## Useful Options

| Option | Purpose |
| --- | --- |
| `--server-url <url>` | Matterhorn Desks server URL. Defaults to `MATTERHORN_WORK_SERVER_URL` or `http://127.0.0.1:8787`. |
| `--token <token>` | Client bearer token. Defaults to `MATTERHORN_WORK_TOKEN`. |
| `--ss58-address <address>` | Public coldkey address for watch-only wallet and stake-position reads. |
| `--coldkey <address>` | Public coldkey label for staking preview context. Defaults to `--ss58-address` when omitted. |
| `--validator-hotkey <hotkey>` | Validator hotkey for the complete unsigned staking preview check. |
| `--netuid <id>` | Subnet used by validator comparison, staking preview, and service-call checks. Defaults to `14`. |
| `--amount-tao <amount>` | TAO amount used for staking preview checks. Defaults to `1`. |
| `--strategy <balanced\|yield\|safety>` | Validator comparison strategy. Defaults to `balanced`. |
| `--rate-tolerance <number>` | Rate tolerance passed to unsigned staking previews. Defaults to `0.01`. |
| `--require-ready` | Treat a non-ready Bittensor readiness report as a failure instead of a warning. |
| `--strict` | Exit nonzero when any stage fails. |

## Expected Output

The JSON report is intentionally compact:

```json
{
  "ready": true,
  "summary": { "pass": 12, "warn": 0, "fail": 0, "skip": 2 },
  "stages": [],
  "artifacts": {
    "readinessStatus": "ready",
    "capabilityCount": 10,
    "selectedCapabilityLevel": "adapter_required",
    "bittensorContextId": "bt-chat-...",
    "signingHandoffPayloadSha256": "...",
    "subnetPreviewRequestSha256": "...",
    "watchId": "watch-...",
    "watchAlertCount": 0
  },
  "nextSteps": []
}
```

Skipped wallet or staking-preview stages usually mean the run did not receive public SS58 or validator-hotkey context. Failures mean the Bittensor chat workflow is not safe enough for operators yet.

## Generate A Markdown Report

Save the JSON output, then render it into a shareable readiness report:

```bash
node scripts/bittensor-live-qa.mjs \
  --server-url http://127.0.0.1:8787 \
  --token <client-token> \
  --json > /tmp/bittensor-live-qa.json

node scripts/bittensor-live-report.mjs \
  --input /tmp/bittensor-live-qa.json \
  --output docs/bittensor-live-readiness-report.local.md
```

Or pipe directly:

```bash
node scripts/bittensor-live-qa.mjs \
  --server-url http://127.0.0.1:8787 \
  --token <client-token> \
  --json | node scripts/bittensor-live-report.mjs \
    --output docs/bittensor-live-readiness-report.local.md
```

Do not commit `docs/bittensor-live-readiness-report.local.md` if it contains wallet-specific public addresses you do not want in the repo. For handoff PRs, redact addresses or summarize them before committing.

## Required Check

```bash
pnpm test:bittensor-live-qa
pnpm test:bittensor-live-report
```

The QA test binds a mock local server, so it may need to run outside restricted sandboxes.
