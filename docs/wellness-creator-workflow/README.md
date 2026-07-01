# Longevity Creator Workflow — Artifact Fixtures

Reproducible reference artifacts for the [Longevity Creator Workflow](../wellness-creator-workflow.md). An operator can compare a live chat run against these known-good references, and the workflow gate (`pnpm test:wellness-creator-workflow`) validates that each carries its non-medical disclaimer and contains no medical, live-service, or secret string.

| Stage | Artifact |
|---|---|
| Customer management | [`progress-check-in.md`](./progress-check-in.md) — weekly client progress check-in |

## Customer Demo Pack

The test-customer showcase set lives in [`demo-pack/`](./demo-pack/) — seven reusable, client-ready artifacts (service offer page, onboarding questionnaire, 4-week program, weekly check-in form, progress summary, renewal/follow-up message, client handoff packet). Inspect with `node scripts/wellness-creator-workflow.mjs --demo-pack --json`.

> All content here is for general fitness and longevity education only. It is not medical advice, diagnosis, or treatment.
