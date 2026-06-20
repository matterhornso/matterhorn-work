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
Ongoing client retention, deepened with a recurring progress check-in.
- Prompt: `Set up customer management: follow-up cadence, feedback form, and renewal/up-sell prompts`
- Artifacts: **follow-up cadence, feedback form, renewal / up-sell prompts, client progress check-in.**

**Follow-up cadence** — Day 1 welcome → Week 1 first check-in → Week 2 adjust → Week 4 progress review and next-block options.

**Feedback form** — what went well, what was hard, energy (1–5), adherence (%), requests for next block. Collected as a standard artifact; no email is sent.

**Renewal / up-sell prompts** — offer a renewal at the end of the block; suggest an add-on (nutrition template, extra check-ins, a group class). All pricing is a draft only — payments are planned, not live, and no payment is processed.

**Client progress check-in** — a reusable weekly check-in, with a reproducible reference at [`docs/wellness-creator-workflow/progress-check-in.md`](./wellness-creator-workflow/progress-check-in.md). It tracks sessions, adherence, energy, sleep, soreness, optional self-reported bodyweight, wins, and blockers, with coach adjustments for the next week. It is **educational progress tracking only, not a medical assessment** — pain, injury, or health concerns are referred to a qualified professional.

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

## Exposed Through Generic Matterhorn Workflow Surfaces

**This is not a custom wellness app.** It is a chat-first Matterhorn workflow that creates artifacts, plans, packets, check-ins, and client deliverables — and it is discovered and run through the **same generic Matterhorn workflow surfaces as every other workflow**, with no bespoke UI:

- **Workflow catalog:** registered as `wellness_creator_workflow` in [`scripts/matterhorn-workflow-catalog.mjs`](../scripts/matterhorn-workflow-catalog.mjs).
- **Template registry:** registered as `wellness_creator_service_workflow` in [`packages/types/src/matterhorn-workflows.ts`](../packages/types/src/matterhorn-workflows.ts).
- **Shared contract:** conforms to [`docs/matterhorn-workflow-contract.md`](./matterhorn-workflow-contract.md) (`matterhorn.workflow.manifest.v1`).

The same surfaces serve Bittensor operator playbooks, market previews, and decentralized-service planners. Wellness is simply one reusable workflow among them — proof that Matterhorn Work can help **any professional service provider operate through chat.** The helper's `--json` output carries a `genericSurfaces` block with these identifiers.

### CLI / Operator Examples

Any of these runs through the same workflow — no custom screens:

```bash
node scripts/wellness-creator-workflow.mjs --route "create a 4-week fat loss plan for a beginner"
node scripts/wellness-creator-workflow.mjs --route "make a yoga mobility plan for an office worker"
node scripts/wellness-creator-workflow.mjs --route "create a client progress check-in"
node scripts/wellness-creator-workflow.mjs --route "package a paid 8-week coaching program"
```

| Operator prompt | Routed artifact |
|---|---|
| `create a 4-week fat loss plan for a beginner` | Training program artifact |
| `make a yoga mobility plan for an office worker` | Yoga / mobility class plan |
| `create a client progress check-in` | Client progress check-in |
| `package a paid 8-week coaching program` | Service packaging artifact (pricing draft only — payments planned, not live) |

Each returns `safe: true`, `disclaimerRequired: true`, `paymentProcessed: false`, `emailSent: false`. Clinical requests (diagnosis, prescription, treating a condition) are **redirected to educational/safety language** and a referral, never answered as medical advice.

## Any Prompt, One Workflow (Free-Form Support)

The canonical and example prompts are **starting points, not a closed list.** A creator can ask for **anything** in plain chat — a training plan, a diet plan, a custom strength block, a mobility routine, a habit or recovery plan, a client handout, "whatever they want to create" — and the workflow produces a client-safe artifact with the mandatory disclaimers. This is the Web2 / real-world use case of Matterhorn Work: ordinary service professionals doing real work through chat.

Any free-form request is routed to the closest artifact type and always handled within the same safety envelope:

- Every generated artifact carries the mandatory non-medical disclaimer.
- Educational only — no diagnosis, no prescription, no treatment, no guaranteed outcome.
- No live payment, email, hosting, storage, or access action; those hooks stay planned, not live.
- The workflow never requests or accepts secrets, keys, signatures, signed payloads, or wallet exports — secret-shaped input is refused and not echoed.
- Requests that cross into clinical care are refused and referred to a qualified professional.

The offline helper exposes this routing for review:

```bash
node scripts/wellness-creator-workflow.mjs --route "Build me a custom 6-week powerlifting peaking block"
node scripts/wellness-creator-workflow.mjs --route "Draft a vegetarian meal-planning template"
```

Each returns the routed artifact type plus `safe: true`, `disclaimerRequired: true`, `paymentProcessed: false`, `emailSent: false`, and `acceptsSecrets: false`. Secret-shaped input returns `refused: true` and never echoes the input.

## Service Builder & Artifact Contracts

The workflow is a **service builder**: a creator describes what they want and it produces one of a fixed set of client-safe **artifact contracts**. Named intents and arbitrary prompts both route into a contract; clinical prompts redirect to a professional; secret-shaped text is refused and not echoed.

| Intent | Artifact contract |
|---|---|
| `create a 4-week training plan` | Client plan |
| `create a yoga program` | Client plan |
| `create a dietician client packet` | Client plan |
| `create a client check-in` | Weekly progress check-in |
| `package a paid program` | Offer / landing packet |
| `create a client video script` | Video lesson script |
| *arbitrary wellness/business prompt* | routed to the closest contract |

**Artifact contracts** (all educational/general wellness only, `live_local`):

1. **Client plan** — a structured training, yoga, or nutrition-education program.
2. **Intake questionnaire** — onboarding questions (goals, experience, schedule, non-clinical context, consent).
3. **Weekly progress check-in** — adherence, energy, wins/blockers, coach adjustments (see [`progress-check-in.md`](./wellness-creator-workflow/progress-check-in.md)).
4. **Video lesson script** — hook, demo, coaching cues, call-to-action.
5. **Client tracker** — a simple self-reported log/template.
6. **Offer / landing packet** — placeholder pricing only; no payment is processed.
7. **Renewal / up-sell note** — a renewal/up-sell draft with placeholder pricing.

## Sample Prompts (Hermes / Customer Demos)

Realistic prompts and the artifact each produces. Every output is educational/general wellness only with the mandatory disclaimer:

| Prompt | Artifact | Summary |
|---|---|---|
| `create a 4-week training plan for a beginner` | Client plan | 4-week beginner program with weekly structure and progression notes. |
| `create a yoga program for office workers with tight hips` | Client plan | General mobility-focused yoga program; educational only. |
| `create a dietician client packet with a meal-planning template` | Client plan | General healthy-eating plan/template; not a clinical or therapeutic diet. |
| `create an intake questionnaire for a new coaching client` | Intake questionnaire | Goals, experience, schedule, non-clinical context. |
| `create a weekly client check-in` | Weekly progress check-in | Adherence, energy, wins/blockers, coach adjustments. |
| `create a client video script for a kettlebell swing tutorial` | Video lesson script | Hook, demo, cues, call-to-action. |
| `create a client habit tracker` | Client tracker | Simple self-reported tracker. |
| `package a paid 8-week coaching program` | Offer / landing packet | Landing packet with placeholder pricing only; no payment processed. |
| `write a renewal note for a client finishing their block` | Renewal / up-sell note | Progress recap + placeholder pricing. |
| `build a 12-week strength program with progressions` | Client plan | Structured strength program; educational only. |

**Clinical / sensitive prompts redirect** (no artifact): anything that asks to diagnose, prescribe, treat a condition/injury, or that is pregnancy- or eating-disorder-specific returns a referral to a qualified professional. **Secret-shaped text is refused** and never echoed.

## How This Demonstrates Matterhorn Beyond Web3

Wellness Creator is Matterhorn's **first Web2 / customer-business workflow**. A trainer, yoga instructor, dietician, or coach does real client work through the **same chat/workflow system** as the Web3 workspaces (Bittensor, Hyperliquid, Polymarket) — no crypto knowledge and no custom vertical app required.

Future Matterhorn service hooks are **planned, not live**:

- **Storage / hosting** — durable, creator-owned artifact hosting.
- **Payments** — a client pays the creator.
- **Email** — program updates / newsletters.
- **Identity / access** — gate a premium program or community.

Nothing here hosts, charges, emails, or gates access today.

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
