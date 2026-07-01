# Longevity Creator Pilot — Artifact Fixtures

These are **reproducible reference outputs** for the Longevity Creator Pilot. Each file is the artifact the agent produces for one canonical demo prompt, generated for a single worked example: a **4-week beginner fat-loss program, 3 sessions/week, minimal equipment.**

They exist so the demo is concrete and repeatable: an operator can compare a live run against these references, and the go-live gate (`pnpm test:wellness-creator-pilot`) validates that every artifact carries its mandatory non-medical disclaimer and contains no medical or guarantee claim.

| Prompt | Artifact |
|---|---|
| `Create a 4-week fat-loss plan for a beginner` | [`01-training-plan.md`](./01-training-plan.md) |
| `Turn this plan into client handouts` | [`02-client-handouts.md`](./02-client-handouts.md) |
| `Create a general healthy-eating guide to go with this plan` | [`03-nutrition-guide.md`](./03-nutrition-guide.md) |
| `Create scripts for 10 short training videos` | [`04-video-scripts.md`](./04-video-scripts.md) |
| `Create a client-facing artifact I can share` | [`05-client-artifact.md`](./05-client-artifact.md) |
| `Prepare a paid program landing packet` | [`06-landing-packet.md`](./06-landing-packet.md) |

See [`../wellness-creator-pilot.md`](../wellness-creator-pilot.md) for the full pilot spec and go-live runbook.

> All content here is for general fitness and longevity education only. It is not medical advice, diagnosis, or treatment.
