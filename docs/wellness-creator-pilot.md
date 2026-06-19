# Wellness Creator Pilot

A chat-first use case that shows Matterhorn Work doing real creator work — not trading. A personal trainer, gym instructor, dietician, or yoga instructor opens Matterhorn Work, describes the program they want, and the agent produces shareable, sellable client artifacts. Web3 capabilities (decentralized storage, payments, client access, creator subscriptions) attach later as optional rails, never as a requirement to get value on day one.

This pilot exists to demonstrate Matterhorn Work beyond crypto markets: chat-first work creation, artifact generation, and agent/MCP usability for non-technical users.

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
  > This content is for general fitness and wellness education only. It is not medical advice, diagnosis, or treatment. Consult a qualified healthcare professional before starting any exercise or nutrition program, especially if you have an existing health condition, are pregnant, or take medication.
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

The pilot is deliberately useful with **zero** Web3 setup. Web3 is the upgrade path, not the entry fee — consistent with Matterhorn Work's goal of letting normal users do Web3-shaped work through chat without needing to understand wallets, chains, or payments first.

## How This Demonstrates Matterhorn Work

- **Chat-first work creation:** a non-technical creator gets professional output from plain-language prompts.
- **Artifact generation:** every step produces a reusable, shareable Matterhorn artifact.
- **Agent / MCP usability:** the final step packages the whole flow as a re-runnable Matterhorn artifact / MCP workflow.
- **Web3-aware, not Web3-gated:** payments and storage are optional future rails, clearly labeled as planned, so the day-one experience needs no wallet.

## QA

See [`docs/handoffs/hermes-wellness-creator-qa.md`](./handoffs/hermes-wellness-creator-qa.md) for the black-box QA and safety pass.

Verify wiring with:

```bash
pnpm test:wellness-creator-pilot
```
