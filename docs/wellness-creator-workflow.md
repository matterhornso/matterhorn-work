# Wellness Creator Workflow

A **full Matterhorn Work workflow** — **not a pilot and not a custom vertical UI.** A personal trainer, gym instructor, yoga instructor, or dietician uses Matterhorn Work entirely through chat to design a program, generate client artifacts, package a sellable service, plan delivery, manage customers, and export the whole thing as a Matterhorn / MCP artifact.

This is a use case on the universal chat-first platform. It deliberately blurs the Web2/Web3 boundary: the creator gets full value on day one with zero crypto setup, and the Web3-shaped capabilities (storage, payments, identity/access, email) attach later as planned hooks — never as a requirement, never described as live.

> **Status note (read first):** The artifacts this workflow produces are live today as chat-generated Matterhorn artifacts. The delivery-stage service hooks — storage/hosting, email updates, payments, identity/access — are **planned, not live.** Nothing here takes a payment, sends an email, hosts on a live storage service, or enforces token-gated access. Fitness and nutrition content is **educational only** — never medical advice, diagnosis, treatment, prescription, or a guaranteed result.

## Why This Is a Full Workflow, Not a Pilot

The earlier Wellness Creator *Pilot* proved a handful of canonical prompts end-to-end. This workflow is the productised version: a complete, seven-stage operating flow a creator runs from first idea to a packaged, exportable service. It is framed as a first-class Matterhorn Work workflow — the same shape the platform uses for any other use case — not a one-off demo and not a bespoke wellness app.

## Reusable Matterhorn Workflow Pattern

This is a **reusable workflow pattern**, not a custom vertical app. It conforms to the shared [Matterhorn Workflow Contract](./matterhorn-workflow-contract.md) (`matterhorn.workflow.manifest.v1`), is registered in the workflow catalog as `wellness_creator_workflow` (category `wellness`), and **runs through the same Matterhorn chat/operator system as every other workflow** — Bittensor playbooks, market previews, decentralized-services planners, and future verticals. There is no bespoke wellness UI.

The same pattern serves a range of **client-facing service professionals**, not just one role:

- Personal trainers
- Yoga instructors
- Dieticians / nutrition coaches
- Gym / group-class instructors
- Other client-facing service professionals

The workflow's core artifacts are generated locally today (`live_local`); every external service hook (storage/hosting, email, payments, identity/access) is `planned_not_live`. The helper at [`scripts/wellness-creator-workflow.mjs`](../scripts/wellness-creator-workflow.mjs) emits the manifest-aligned fields (`category`, `manifestStatus`, `reusablePattern`, `serviceProfessionals`) so the workflow can be discovered, validated, and tested without custom UI.

## Personas

1. **Personal trainer (independent).**
2. **Gym instructor / group-class coach.**
3. **Yoga instructor.**
4. **Dietician / nutrition coach** (general, educational guidance — not clinical care).

## The Seven-Stage Workflow

Each stage has one canonical chat prompt and the client-safe artifacts it produces.

### 1. Intake
The creator describes their **audience, goal, constraints, session type, duration, equipment, and level.**
- Prompt: `Start a new wellness program — here is my audience, goal, constraints, session type, duration, equipment, and level`
- Artifact: intake summary.

### 2. Program design
A workout, yoga, or nutrition **education** plan, with mandatory non-medical safety disclaimers attached automatically.
- Prompt: `Design the program with safety disclaimers`
- Artifact: program design plan.

### 3. Client artifact generation
- Prompt: `Generate the client artifacts: weekly plan, video script, checklist, FAQ, and progress tracker`
- Artifacts: **weekly plan, video script, checklist, FAQ, progress tracker.**

### 4. Service packaging
Package the program as a sellable service. **No live payment is taken** — pricing is a draft only.
- Prompt: `Package this as a service: offer page copy, pricing-package draft, onboarding questionnaire, and terms/disclaimer text`
- Artifacts: **offer page copy, pricing-package draft, onboarding questionnaire, terms / disclaimer text.**

### 5. Delivery plan (planned hooks only)
How the program *would* be delivered through Matterhorn services. **Every hook is planned, not live.**
- Prompt: `Draft the delivery plan: storage/hosting, email updates, payments, and client access`
- Artifact: delivery plan describing the four planned hooks (see "Planned-Not-Live Service Hooks" below).

### 6. Customer management
- Prompt: `Set up customer management: follow-up cadence, feedback form, and renewal/up-sell prompts`
- Artifacts: **follow-up cadence, feedback form, renewal / up-sell prompts.**

### 7. MCP / artifact export
How the workflow runs through **Matterhorn Work, Claude Code, Codex, or a shared artifact output**, so the creator re-runs it for the next client.
- Prompt: `Export this as a Matterhorn workflow / MCP artifact`
- Artifact: Matterhorn workflow / MCP export.

## Canonical Prompts

These are validated by the workflow gate; keep them stable. The seven stage prompts above are the canonical set:

1. `Start a new wellness program — here is my audience, goal, constraints, session type, duration, equipment, and level`
2. `Design the program with safety disclaimers`
3. `Generate the client artifacts: weekly plan, video script, checklist, FAQ, and progress tracker`
4. `Package this as a service: offer page copy, pricing-package draft, onboarding questionnaire, and terms/disclaimer text`
5. `Draft the delivery plan: storage/hosting, email updates, payments, and client access`
6. `Set up customer management: follow-up cadence, feedback form, and renewal/up-sell prompts`
7. `Export this as a Matterhorn workflow / MCP artifact`

## Example Prompts (Reusable Variants)

Beyond the seven stage prompts, the same pattern handles ad-hoc, role-specific requests. These are the reusable variants the QA pass exercises — each produces useful, client-safe content with an explicit caveat, and none triggers a live payment, email, hosting, storage, or access action:

| Prompt | Expected artifact | Safety caveat |
|---|---|---|
| `Create a 4-week beginner strength plan` | Structured 4-week beginner strength plan | General fitness education only. Not medical advice, diagnosis, or treatment. |
| `Turn this into a client PDF packet` | Client-facing program packet ready to export | Standard Matterhorn artifact. Storage / hosting is planned, not live. |
| `Draft a yoga class plan for lower-back mobility` | General mobility-focused yoga class plan | General wellness education only, not medical care. Refer pain or injury to a qualified professional. |
| `Create a dietician-safe meal planning template without medical claims` | General healthy-eating meal-planning template | General healthy-eating information, not a clinical or therapeutic diet. Not medical advice, diagnosis, or treatment. |
| `Prepare a future paid program page, but do not process payment` | Draft paid program page with placeholder pricing only | Payments are planned, not live; no payment is processed and no funds move. |

## Safety Disclaimers (Mandatory)

- **General educational disclaimer** (on every program, nutrition, and client artifact):
  > This content is for general fitness and wellness education only. It is not medical advice, diagnosis, or treatment. Consult a qualified healthcare professional before starting any exercise or nutrition program, especially if you have an existing health condition, are pregnant, or take medication.
- **Nutrition-specific note** (on every nutrition artifact):
  > This guidance is general healthy-eating information, not a clinical or therapeutic diet. It is not a substitute for care from a registered dietitian or doctor.
- **No-guarantee note** (on every service/packaging artifact):
  > Results vary between individuals. No specific outcome, weight change, or fitness result is guaranteed.

The workflow is **educational, not medical care.** When a request crosses into clinical territory (injury rehab, disordered eating, medication, pregnancy-specific programming, a named diagnosis), the agent refers the user to a qualified healthcare professional instead of answering.

## Planned-Not-Live Service Hooks

The delivery stage maps each need to a future Matterhorn service. **All are planned, not live.**

| Need | Future Matterhorn service | Status |
|---|---|---|
| Durable, creator-owned artifact hosting | **Storage / hosting** | Planned — not live |
| Program updates / newsletters to clients | **Email updates** | Planned — not live |
| Client pays the creator | **Payments** | Planned — not live |
| Gate a premium program or community | **Identity / access** | Planned — not live |

Explicit guarantees, enforced by the workflow gate:

- Storage / hosting is planned, not live.
- Email sending is planned, not live.
- Payments are planned, not live.
- Identity / access gating is planned, not live.
- No funds move.
- No email is sent.
- No token gating is enforced.
- No live decentralized storage publish happens.

## What This Workflow Never Does

The workflow never diagnoses conditions, never prescribes diets or medication, never treats injuries or diseases, and never promises a guaranteed weight-loss or fitness outcome. It never claims live payments, live email sending, live storage/hosting, or live identity/access gating. It never asks for — or accepts — secrets, private keys, API keys, raw signatures, signed payloads, or wallet exports.

## Offline Contract & Gate

The workflow ships a machine-readable, offline contract at [`scripts/wellness-creator-workflow.mjs`](../scripts/wellness-creator-workflow.mjs). It needs no network, wallet, key, or payment account.

Print the full workflow contract (version, personas, prompts, stages, expected artifact types, disclaimers, planned-not-live service hooks, demo checklist, Hermes QA checklist, forbidden claims):

```bash
node scripts/wellness-creator-workflow.mjs --json
```

Run the self-check (validates every hook planned-not-live, every prompt mapped to a safe artifact, and no affirmative live-service or medical claim; exits non-zero on any violation):

```bash
node scripts/wellness-creator-workflow.mjs --check
```

The helper **rejects credential-shaped CLI flags** (`--private-key`, `--api-secret`, `--seed-phrase`, etc.).

## QA

See [`docs/handoffs/hermes-wellness-creator-workflow-qa.md`](./handoffs/hermes-wellness-creator-workflow-qa.md) for the black-box QA and safety pass.

Verify with:

```bash
pnpm test:wellness-creator-workflow
```
