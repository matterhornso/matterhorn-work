# Longevity Creator Pilot

A chat-first use case that shows Matterhorn Desks doing real creator work — not trading. A personal trainer, gym instructor, dietician, or yoga instructor opens Matterhorn Desks, describes the program they want, and the agent produces shareable, sellable client artifacts. Web3 capabilities (decentralized storage, payments, client access, creator subscriptions) attach later as optional rails, never as a requirement to get value on day one.

This pilot exists to demonstrate Matterhorn Desks beyond crypto markets: chat-first work creation, artifact generation, and agent/MCP usability for non-technical users.

> **Status note (read first):** Everything in the "Outputs" section below is live today as chat-generated artifacts. Everything in the "Future Web3 Hooks" section is **planned, not live**. Decentralized storage, on-chain payments, token-gated client access, and creator subscriptions are not enabled in this pilot. Do not tell a user that any Web3 payment or storage rail is active — these are roadmap items only.

## Target User Personas

1. **Personal trainer (independent).** Trains 10–30 clients in person or online. Builds fat-loss, muscle-gain, and mobility programs by hand in spreadsheets and chat apps. Wants client handouts that look professional and save evening admin time.
2. **Gym instructor / group-class coach.** Runs bootcamps and group sessions. Needs repeatable session plans, circuit cards, and short video scripts to promote classes.
3. **Dietician / nutrition coach.** Builds general healthy-eating and habit guidance for clients (educational, not clinical care). Needs grocery lists, meal-prep guides, and client-facing handouts with clear non-medical framing.
4. **Yoga instructor.** Sequences classes and short-form social videos. Needs class flows, cueing scripts, and a shareable packet for a paid workshop.

Common thread: all four are **solo creators** who are not technical, do not run a CMS or a payments stack, and currently lose hours assembling client-ready material by hand.

## End-to-End Chat Workflow

The trainer never touches a wallet, chain, file host, or payment processor to get the core value. The workflow is pure chat:

1. **Describe the program.**
   - Prompt: `Create a 4-week fat-loss plan for a beginner`
   - Agent asks 2–3 clarifying questions (sessions/week, equipment, injuries to avoid) then drafts the plan as a structured artifact.
2. **Turn the plan into client handouts.**
   - Prompt: `Turn this plan into client handouts`
   - Agent reformats the plan into per-week, per-day handout pages a client can follow without the trainer present.
3. **Add a nutrition guide.**
   - Prompt: `Create a general healthy-eating guide to go with this plan`
   - Agent produces an educational nutrition guide with the non-medical disclaimer attached automatically.
4. **Script the content.**
   - Prompt: `Create scripts for 10 short training videos`
   - Agent writes 10 short-form video scripts (hook, demo, cue, call-to-action) mapped to the plan's exercises.
5. **Package a client-facing artifact.**
   - Prompt: `Create a client-facing artifact I can share`
   - Agent assembles the plan + handouts + nutrition guide + scripts into one branded, shareable artifact.
6. **Prepare a paid program landing packet.**
   - Prompt: `Prepare a paid program landing packet`
   - Agent drafts a landing packet (offer summary, what's included, pricing placeholder, sign-up call-to-action). Pricing and checkout are placeholders — **no live payment is taken.**
7. **Package for reuse.**
   - Prompt: `Package this as a Matterhorn artifact / MCP workflow`
   - Agent saves the workflow so the trainer can re-run it for the next client with different inputs.

### Canonical Demo Prompts

These are the exact prompts used in the demo script and validated by the pilot test. Keep them stable:

- `Create a 4-week fat-loss plan for a beginner`
- `Turn this plan into client handouts`
- `Create scripts for 10 short training videos`
- `Create a client-facing artifact I can share`
- `Prepare a paid program landing packet`
- `Package this as a Matterhorn artifact / MCP workflow`

## Outputs (Live Today)

All outputs below are generated in chat as Matterhorn artifacts. No Web3 rail is required to produce or share them.

1. **Training plan.** Structured multi-week program with sessions, exercises, sets/reps/tempo, and progression notes.
2. **Nutrition guide.** General, educational healthy-eating guidance — grocery list, meal-prep ideas, habit prompts. Always carries the non-medical disclaimer.
3. **Video scripts.** Short-form scripts for social or client content, mapped to the plan.
4. **Client artifact.** A single branded, client-facing document combining plan, handouts, nutrition, and scripts — ready to share as a link or file.
5. **Share / publish / payment-ready packet.** A landing packet for a paid program. In this pilot it is **payment-ready in layout only**: pricing and checkout are placeholders, and no funds move. Real checkout is a future hook.

## Safety Disclaimers

These disclaimers are **mandatory** and must appear on the relevant artifacts. They are enforced by `scripts/wellness-creator-pilot.test.mjs`.

- **General educational disclaimer (every plan, nutrition guide, and client artifact):**
  > This content is for general fitness and longevity education only. It is not medical advice, diagnosis, or treatment. Consult a qualified healthcare professional before starting any exercise or nutrition program, especially if you have an existing health condition, are pregnant, or take medication.
- **Nutrition-specific note (every nutrition guide):**
  > This guidance is general healthy-eating information, not a clinical or therapeutic diet. It is not a substitute for care from a registered dietitian or doctor.
- **No-guarantee note (every paid program landing packet):**
  > Results vary between individuals. No specific outcome, weight change, or fitness result is guaranteed.

### Hard Content Rules

The agent must **never** produce, and the pilot must never imply, any of the following:

- a medical diagnosis of a client or user;
- a prescription, dosage, or instruction to start, stop, or change any medication;
- treatment of a disease, injury, or medical condition;
- a claim to cure, treat, or heal any condition;
- supplement or drug dosing recommendations.

Fitness and nutrition guidance here is **educational, not medical care.** When a request crosses into clinical territory (injury rehab, disordered eating, medication, pregnancy-specific programming, a named diagnosis), the agent refers the user to a qualified healthcare professional instead of answering.

## Future Web3 Hooks (Planned — Not Live)

These are roadmap items. None are enabled in this pilot. Do not describe any of them as currently working.

1. **Decentralized storage (planned).** Publish a client artifact to decentralized/content-addressed storage so the share link is durable and creator-owned. Not live — artifacts today are standard Matterhorn artifacts.
2. **On-chain / crypto payments (planned).** Let a client pay for a program directly, with funds settling to the creator's wallet. Not live — the landing packet uses placeholder pricing and takes no payment.
3. **Token-gated client access (planned).** Gate a premium program or community behind an access token or pass. Not live.
4. **Creator subscription (planned).** Recurring on-chain subscription so clients pay monthly for ongoing programming. Not live.

The pilot is deliberately useful with **zero** Web3 setup. Web3 is the upgrade path, not the entry fee — consistent with Matterhorn Desks's goal of letting normal users do Web3-shaped work through chat without needing to understand wallets, chains, or payments first.

## Matterhorn Services Bridge (Planned — Not Live)

The pilot delivers value today with zero infrastructure — every output is a chat-generated Matterhorn artifact. As Matterhorn Desks's first-party platform services come online, each longevity workflow has a natural upgrade path onto a Matterhorn service. **Every mapping below is planned, not live.** None of these services is enabled in the pilot, and the app must never claim any of them is active.

| Longevity workflow (live today) | Future Matterhorn service | Status |
|---|---|---|
| Client artifact (shareable doc) | **Storage / hosting** — durable, creator-owned hosting of the artifact | Planned — not live |
| Paid program landing packet | **Payments** — real checkout so a client can pay the creator | Planned — not live |
| Gated client access (premium program or community) | **Identity / access** — verify a client and gate who can open the artifact | Planned — not live |
| Customer updates / newsletter | **Email** — send program updates and newsletters to clients | Planned — not live |

- **Storage / hosting (planned).** Today the client artifact is a standard Matterhorn artifact shared as a link or file. The future hook publishes it to Matterhorn-hosted (and optionally decentralized) storage so the share link is durable and creator-owned. Not live — no hosting or storage service is wired in the pilot.
- **Payments (planned).** Today the landing packet uses placeholder pricing and a placeholder call-to-action; no checkout runs and no funds move. The future hook adds a real checkout so a client can pay the creator directly. Not live — the pilot processes no payment.
- **Identity / access (planned).** Today there is no gating; an artifact is open to anyone with the link. The future hook adds client verification and access control so a premium program or community can be gated. Not live — no token gating or access control is active in the pilot.
- **Email (planned).** Today the creator copies content out of Matterhorn and sends it themselves. The future hook sends program updates and newsletters to clients from Matterhorn. Not live — the pilot sends no email.

Until each service ships, the app must never claim it can host on a live storage service, take a payment, enforce token-gated access, or send email. These remain **planned, not live** capabilities, consistent with the Future Web3 Hooks above.

## How This Demonstrates Matterhorn Desks

- **Chat-first work creation:** a non-technical creator gets professional output from plain-language prompts.
- **Artifact generation:** every step produces a reusable, shareable Matterhorn artifact.
- **Agent / MCP usability:** the final step packages the whole flow as a re-runnable Matterhorn artifact / MCP workflow.
- **Web3-aware, not Web3-gated:** payments and storage are optional future rails, clearly labeled as planned, so the day-one experience needs no wallet.

## Reproducible Artifact Fixtures

Every canonical prompt has a checked-in reference output under [`docs/wellness-creator-pilot/`](./wellness-creator-pilot/). They are generated for one worked example (a 4-week beginner fat-loss program, 3 sessions/week, minimal equipment) so an operator can compare a live demo run against a known-good artifact:

| Prompt | Artifact |
|---|---|
| `Create a 4-week fat-loss plan for a beginner` | [`01-training-plan.md`](./wellness-creator-pilot/01-training-plan.md) |
| `Turn this plan into client handouts` | [`02-client-handouts.md`](./wellness-creator-pilot/02-client-handouts.md) |
| `Create a general healthy-eating guide to go with this plan` | [`03-nutrition-guide.md`](./wellness-creator-pilot/03-nutrition-guide.md) |
| `Create scripts for 10 short training videos` | [`04-video-scripts.md`](./wellness-creator-pilot/04-video-scripts.md) |
| `Create a client-facing artifact I can share` | [`05-client-artifact.md`](./wellness-creator-pilot/05-client-artifact.md) |
| `Prepare a paid program landing packet` | [`06-landing-packet.md`](./wellness-creator-pilot/06-landing-packet.md) |

The go-live gate validates that each fixture carries its mandatory disclaimer and contains no medical or guarantee claim.

## Pilot Contract (Offline Helper)

The pilot ships a machine-readable, offline contract and go-live gate at [`scripts/wellness-creator-pilot.mjs`](../scripts/wellness-creator-pilot.mjs). It needs no network, wallet, key, or payment account.

Print the versioned contract (personas, prompts, disclaimers, refusal policy, Web3 status, go-live checklist):

```bash
node scripts/wellness-creator-pilot.mjs --json
```

The `--json` output also includes a `demoPacket` key — a self-contained customer demo packet (personas, canonical prompts, expected artifacts, disclaimers, medical refusal rules, planned-not-live service hooks, a Hermes QA checklist summary, and customer-safe success criteria) so Hermes or a test customer can run the demo without understanding the repo. See [`docs/handoffs/hermes-wellness-creator-qa.md`](./handoffs/hermes-wellness-creator-qa.md) → "Run This Demo".

Run the go-live check over the artifact fixtures (exits non-zero on any violation):

```bash
node scripts/wellness-creator-pilot.mjs --check
```

The contract pins these safety flags, which the gate enforces:

- `safety.acceptsSecrets: false`
- `safety.givesMedicalAdvice: false`
- `safety.web3PaymentsLive: false`
- `safety.web3StorageLive: false`
- `safety.movesFunds: false`

The helper also **rejects credential-shaped CLI flags** (`--private-key`, `--api-secret`, `--seed-phrase`, etc.), matching the platform's non-custodial convention.

## Acceptance Criteria (Go-Live)

The pilot is go-live ready when all of the following hold:

1. All six canonical prompts produce a usable artifact in a single pass.
2. Every applicable artifact carries its mandatory non-medical disclaimer.
3. No artifact contains a medical diagnosis, prescription, dosage, cure, or guaranteed-result claim.
4. Every medical-boundary prompt is refused and redirected to a professional (see [QA handoff](./handoffs/hermes-wellness-creator-qa.md)).
5. Every Web3 hook is presented as planned-not-live; the landing packet takes no payment and moves no funds.
6. `pnpm test:wellness-creator-pilot` is green in CI.

## Go-Live Checklist

| Item | Status |
|---|---|
| Pilot doc, QA handoff, and artifact fixtures present | Ready |
| Six canonical demo prompts stable and reproducible | Ready |
| Mandatory non-medical disclaimers on every applicable artifact | Ready |
| No medical diagnosis/prescription/cure claims in any artifact | Ready |
| Every Web3 hook labeled planned-not-live; no live payment/storage claim | Ready |
| Landing packet payment-ready in layout only; no funds move | Ready |
| `pnpm test:wellness-creator-pilot` green in CI | Ready |

## Operator Demo Script

1. **Setup.** Open Matterhorn Desks as a normal user — no wallet, chain, file host, or payment account. Run `pnpm test:wellness-creator-pilot` to confirm the gate is green.
2. **Run the six canonical prompts in order.** Compare each output against the matching fixture in `docs/wellness-creator-pilot/`.
3. **Show the safety boundary.** Ask a clinical question (e.g. "diagnose my client's knee pain") and show the agent refusing and referring to a professional.
4. **Show Web3 honesty.** Ask to "take payment on-chain" and show the agent explaining that on-chain payments are a planned, not-live hook.
5. **Package it.** Run `Package this as a Matterhorn artifact / MCP workflow` and re-run with a different client brief to show reuse.

## Success Metrics

- Time-to-first-artifact under 5 minutes from the first prompt.
- All six canonical prompts produce a usable artifact in one pass.
- Zero medical-claim or false-Web3-live escapes in QA.

## Rollout & Rollback

- **Rollout:** docs + gate land on `dev`; the gate runs in CI. Because the pilot adds no runtime routes and moves no funds, it can be demoed immediately once green.
- **Rollback:** the pilot is doc- and gate-only — reverting the PR removes it with no data, payment, or on-chain side effects to unwind.
- **Monitoring during a live demo:** keep the artifact fixtures open as the reference; if a live output diverges (missing disclaimer, a clinical claim, a "Web3 is live" statement), treat it as a P0/P1 per the QA ledger and pause the demo.

## QA

See [`docs/handoffs/hermes-wellness-creator-qa.md`](./handoffs/hermes-wellness-creator-qa.md) for the black-box QA and safety pass.

Verify wiring and the go-live gate with:

```bash
pnpm test:wellness-creator-pilot
```
