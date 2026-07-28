# Product Hunt Measurement And Trust - 2026-07-21

This document defines the minimum useful launch measurement without weakening
Matterhorn's privacy or wallet boundary.

## Current State

The existing app telemetry sends only lightweight event names to Matterhorn
Cloud after a user signs in. Matterhorn Cloud is excluded from the current
public scope, so the stable public app does **not** currently provide a complete
Product Hunt funnel. Do not claim otherwise and do not enable an unreviewed
analytics SDK the night before launch.

Production infrastructure monitoring is still mandatory: app/API health, 5xx
errors, p95 latency, provider failures, task completion, and wallet
reject/approve outcomes. Product Hunt and campaign traffic can be measured at
the public landing/deployment edge with the approved UTM campaign.

## Data-Minimized Event Plan

If first-party product analytics is approved after privacy review, implement
only these event shapes. Event payloads must not contain prompts, model output,
file paths, note text, memory content, wallet addresses, balances, order terms,
market IDs, signatures, signed payloads, IP addresses copied by the app, or
credentials.

| Event | Required properties |
|---|---|
| `app.opened` | release commit, runtime (`web` or `desktop`), launch channel |
| `project.opened` | new or existing project boolean |
| `chat.submitted` | desk type or general chat; no prompt content |
| `chat.completed` | success/failure category and bounded latency bucket |
| `desk.opened` | desk ID |
| `desk.task_started` | desk ID and task ID from the fixed catalog |
| `desk.task_completed` | desk ID, task ID, success/failure category |
| `wallet.connect_started` | wallet family and testnet/mainnet category |
| `wallet.connect_finished` | wallet family and success/reject/error category |
| `wallet.review_finished` | protocol and approve/reject category; no terms |
| `connector.connect_finished` | connector ID and success/reject/error category |
| `note.created` | source surface only |
| `memory.reviewed` | remember/save-edited/not-saved category |
| `output.opened` | public output type only |
| `feedback.submitted` | feedback category only; comment remains local unless explicitly sent |

Use a short-lived random installation ID only after legal approval and a
documented retention period. Never derive identity from a wallet address.

## Launch Funnel

The operating dashboard should answer five questions:

1. Did Product Hunt visitors reach the deployed app?
2. Did they open or create a project?
3. Did they submit and complete a chat or desk task?
4. Did they return to a note, memory item, or output?
5. Where did provider, wallet, or connector failures interrupt the journey?

Recommended launch metrics:

- deployed app availability and p95 latency;
- unique app opens from the Product Hunt UTM campaign;
- project-open to chat-submit conversion;
- chat/task completion rate and p95 completion latency;
- wallet connection success, rejection, and error rates by wallet family;
- provider failure rate by protocol desk;
- feedback and support issue counts by severity;
- next-day return rate, only if a privacy-approved anonymous identifier exists.

No metric is worth collecting prompt content or signing material.

## Public Trust Copy

Use these statements consistently in the app, listing, FAQ, privacy policy, and
support replies:

- Matterhorn never asks for seed phrases or private keys.
- Signing stays in the user's wallet.
- Memory is review-before-save.
- Unsupported integrations are disabled and marked `Coming soon`.
- Public support reports are redacted, but users should still inspect them and
  never attach credentials or signing material.
- Hyperliquid execution, if enabled after acceptance, is exact-term,
  short-lived, single-use, connected-wallet execution; agents and background
  tasks cannot submit orders.

## Required Public Surfaces

Before launch, verify all of the following resolve over HTTPS and describe the
final product accurately:

| Surface | Required owner | Status |
|---|---|---|
| Privacy policy URL | Product and legal | UNASSIGNED |
| Terms URL | Product and legal | UNASSIGNED |
| Support URL or staffed support email | Support | `updates@matterhorn.so` exists in product copy; staffing is UNASSIGNED |
| Security disclosure contact | Security | UNASSIGNED |
| Service status or incident update surface | Operations | UNASSIGNED |
| Data export/delete instructions | Product and engineering | Implemented in product; public help review is UNASSIGNED |

An `UNASSIGNED` public trust row blocks the Product Hunt
`product.public_copy_and_legal` or `support.launch_room` gate.

## Support Response Macros

**Wallet connection issue:** "Please share the wallet family, browser/app
version, network, and the visible error. Do not send a seed phrase, private key,
signature, signed payload, or wallet export."

**Unexpected wallet request:** "Reject the request in your wallet and stop the
flow. Tell us which desk and action produced it. We will treat an action that
does not match the reviewed terms as a stop-ship incident."

**Provider unavailable:** "Your project data remains local. Retry once, choose
another configured provider, or send a redacted support report. Matterhorn will
not fabricate live protocol data when a provider is unavailable."

**Data request:** "Use the project data controls to export or delete supported
local data. Contact support if the control is unavailable; do not attach private
project content unless it is necessary and explicitly reviewed."
