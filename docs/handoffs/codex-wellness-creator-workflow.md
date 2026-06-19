# Handoff → Codex Build Coordinator: Wellness Creator Workflow Pack

**From:** Claude (Wellness Creator owner)
**Date:** 2026-06-19
**Repo:** `matterhornso/matterhorn-work` (default branch `dev`)

Describes **exactly what was built** in this change. Descriptive only.

## 1. PR / merge state

- **PR #405 — MERGED to `dev`** (squash, 2026-06-19 16:16 UTC; branch `claude/wellness-workflow-pack` deleted). CI was green before merge: `customer-crypto-gates`, `i18n-audit`, `openwork-tests (blacksmith-4vcpu-ubuntu-2204)`, `openwork-tests (macos-14)`.
- Branched from latest `dev` after #395 (go-live pack), #400 (Services Bridge), and #402 (demo packet) had merged.
- Docs/test/helper only — **no runtime routes, no payments, no provider execution, no medical-advice expansion.** 5 files, 799 insertions.

## 2. What it is

Promotes the wellness creator use case from a **pilot** to a **full, first-class Matterhorn Work workflow** — chat-first, **not** a custom vertical UI. It is a standalone pack (new files); it does **not** modify the earlier pilot files. The product framing: a personal trainer, gym instructor, yoga instructor, or dietician runs a complete seven-stage flow through chat, fully usable on day one with zero crypto setup, with Web3-shaped capabilities attached as **planned-not-live** hooks.

## 3. Files added/changed (5)

| File | Status | Purpose |
|---|---|---|
| `scripts/wellness-creator-workflow.mjs` | new | Offline workflow contract + self-check helper. |
| `docs/wellness-creator-workflow.md` | new | Full workflow spec, framed as a workflow not a pilot. |
| `docs/handoffs/hermes-wellness-creator-workflow-qa.md` | new | Black-box QA + safety handoff. |
| `scripts/wellness-creator-workflow.test.mjs` | new | The `test:wellness-creator-workflow` gate. |
| `package.json` | +1 line | Adds `"test:wellness-creator-workflow": "node scripts/wellness-creator-workflow.test.mjs"`. |

The earlier `wellness-creator-pilot.*` files (helper, test, doc, handoff, fixtures) are **untouched** and still pass `pnpm test:wellness-creator-pilot`.

## 4. The helper — `scripts/wellness-creator-workflow.mjs`

Pure offline (no network, wallet, key, or payment). Contract version: **`matterhorn.wellness.creator-workflow.v1`**.

Modes:
- `--json` → emits the full workflow contract (shape below).
- `--check` → self-validates the contract's safety invariants (every stage maps a prompt to ≥1 safe artifact; every service hook `planned, not live`; all `safety.*Live`/`movesFunds`/`acceptsSecrets`/`givesMedicalAdvice` false; **no affirmative medical or live-service claim in the emitted content, scanning everything except the forbidden-claims allowlist**). Exits non-zero on any violation.
- Rejects credential-shaped flags (`--private-key`, `--api-secret`, `--seed-phrase`, `--mnemonic`, etc.) with a non-zero exit.

`--json` contract shape:
```
{
  version: "matterhorn.wellness.creator-workflow.v1",
  ok: true,
  workflow: "Wellness Creator Workflow",
  framing: "A full Matterhorn Work workflow, not a pilot and not a custom vertical UI.",
  fullWorkflow: true,
  isPilot: false,
  nonTrading: true,
  personas: [ ...4 ],                 // personal trainer, gym instructor, yoga instructor, dietician
  canonicalPrompts: [ ...7 strings ],
  stages: [ {id,name,description,prompt,artifacts[]}, ...7 ],
  promptArtifacts: [ {stage,prompt,artifacts[],safe:true}, ...7 ],
  expectedArtifactTypes: [ ...16 unique ],
  disclaimers: { general, nutrition, noGuarantee },
  serviceHooks: [ {id,name,status:"planned, not live",statement}, ...4 ],
  deliveryGuarantees: [ ...8 strings ],
  demoChecklist: [ ...7 ],
  hermesQaChecklist: [ ...8 ],
  forbiddenClaims: [ ...7 prohibitions ],
  safety: { fullWorkflow:true, isPilot:false, acceptsSecrets:false,
            givesMedicalAdvice:false, paymentsLive:false, emailLive:false,
            storageLive:false, identityAccessLive:false, movesFunds:false }
}
```

The **seven stages** (ids, in order): `intake`, `program-design`, `client-artifacts`, `service-packaging`, `delivery-plan`, `customer-management`, `export`.

The **seven canonical prompts** (one per stage, kept stable — the gate pins them):
1. `Start a new wellness program — here is my audience, goal, constraints, session type, duration, equipment, and level`
2. `Design the program with safety disclaimers`
3. `Generate the client artifacts: weekly plan, video script, checklist, FAQ, and progress tracker`
4. `Package this as a service: offer page copy, pricing-package draft, onboarding questionnaire, and terms/disclaimer text`
5. `Draft the delivery plan: storage/hosting, email updates, payments, and client access`
6. `Set up customer management: follow-up cadence, feedback form, and renewal/up-sell prompts`
7. `Export this as a Matterhorn workflow / MCP artifact`

The **four delivery service hooks** (all `planned, not live`): Storage / hosting, Email updates, Payments, Identity / access. The eight `deliveryGuarantees` state verbatim: each of the four is "planned, not live", plus "No funds move." / "No email is sent." / "No token gating is enforced." / "No live decentralized storage publish happens."

The **disclaimers** reuse the same three strings as the pilot (general non-medical, nutrition-specific, no-guarantee) so the workflow can't drift from the rest of the wellness surface.

## 5. The doc — `docs/wellness-creator-workflow.md`

Full spec: explicit "**full Matterhorn Work workflow … not a pilot**" framing (with a "Why This Is a Full Workflow, Not a Pilot" section), the four personas, all seven stages with their prompt and artifacts, the canonical prompt list, mandatory disclaimers, a planned-not-live service-hook table + the eight guarantees, a "What This Workflow Never Does" section, and the offline contract/gate commands.

## 6. The QA handoff — `docs/handoffs/hermes-wellness-creator-workflow-qa.md`

Black-box pass: "Run This Workflow (Customer Quick Start)", stage-by-stage happy path, "Planned-Not-Live Honesty Prompts" (storage/email/payments/identity), "Safety Tests (Medical Boundary)" (refuse + refer), "Secret-Safety Tests" (refuse seed phrase / private key / API secret / signature / wallet export, incl. the `--private-key` flag rejection), P0–P3 issue ledger, red lines, and sign-off.

## 7. The gate — `scripts/wellness-creator-workflow.test.mjs` (`pnpm test:wellness-creator-workflow`)

Spawns the helper and asserts, proving the required guarantees:
- **Full workflow, not a pilot:** `fullWorkflow === true`, `isPilot === false`, framing strings, and doc strings.
- **Seven stages** with exact ids; **seven canonical prompts**, each in `promptArtifacts` with `safe: true` and ≥1 artifact, each present in the doc → *all canonical prompts produce safe expected artifacts*.
- **Expected artifact types** include weekly plan, video script, checklist, FAQ, progress tracker, offer page copy, pricing-package draft, onboarding questionnaire, terms/disclaimer text, follow-up cadence, feedback form, renewal/up-sell prompts, MCP export.
- **Disclaimers** present in both contract and doc.
- **Every service hook `planned, not live`**; all `safety.*Live`/`movesFunds`/`acceptsSecrets`/`givesMedicalAdvice` false; `fullWorkflow`/`isPilot` correct.
- **Planned-not-live guarantees** (all 8) present in contract and doc.
- **Forbidden-claims allowlist** present and covers diagnosis, prescription/medication, secrets, and live-service prohibitions.
- **No affirmative live-service / medical / secret-example phrases** in the doc or emitted content (scans everything except the `forbiddenClaims` allowlist, so the allowlist itself never trips the scan).
- **Self-check** (`--check`) exits 0; **credential rejection** exits non-zero with the expected message.
- Handoff carries its QA/safety sections.

## 8. Verification performed (all green)

```bash
pnpm test:wellness-creator-workflow          # "Wellness Creator Workflow gate passed."
pnpm test:wellness-creator-pilot             # "Wellness Creator Pilot go-live gate passed." (pilot untouched)
pnpm test:market-execution-safety-gate       # "Market execution safety gate passed."
node scripts/wellness-creator-workflow.mjs --json    # valid contract
node scripts/wellness-creator-workflow.mjs --check   # "Wellness Creator Workflow check passed."
```

## 9. Boundaries respected

Untouched: `apps/server/src/server.ts`, `packages/matterhorn-work-mcp/index.mjs`, `packages/types/src/decentralized-services.ts`, `scripts/decentralized-services-contract.test.mjs`, `apps/orchestrator/src/cli.ts`, stale PR #2. No Kimi generic workflow-contract files exist on `dev`; none touched. `package.json` received exactly one new script line. Existing wellness pilot files unchanged.

## 10. Note for the coordinator

This workflow pack and the earlier pilot now coexist on `dev` as two separate, independently-gated surfaces (`test:wellness-creator-workflow` and `test:wellness-creator-pilot`). If you want them consolidated (workflow supersedes pilot) or the pilot retired, that's a follow-up decision — it was not assumed here.
