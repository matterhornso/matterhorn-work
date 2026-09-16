# Post-1017 build packet: chat request diagnostics

Date: 16 September 2026. Branch: `codex/post-1017-runtime-diagnostics`.
Base: merged `dev`, `a491821502ee6e631759630037b997a29d868c82`.

## Delivered locally

- Add content-free preflight/hosted-dispatch timing and fixed failure categories to the existing in-memory inspector.
- Preserve the accepted gateway run ID in diagnostic metadata instead of discarding it.
- Correlate request stages and the existing first-observed-output timing event with a per-submission attempt ID.
- Keep identifiers bounded; exclude raw errors, response/request bodies, hashes, credentials, prompt and memory content.
- Preserve API payloads, original results/errors, consent rules and retry behavior. A failing event recorder cannot block or repeat a request.
- Document a scoped operator reproduction procedure and the limits of browser timing.

No visual UI, model selection, provider configuration, timeout, secret, wallet or signup changes. No subagents were used.

## Verification

- 16 new diagnostic regressions, including two real HTTP-client tests against disposable localhost fixtures: pass.
- Complete app suite: **1,144 pass, 0 fail**.
- Existing isolated Chromium composer/auth suite: **6 pass, 0 fail**.
- App typecheck: pass.
- Production web build: pass; pre-existing large-chunk warnings remain.
- Full platform safety gate: pass using the previously checksum-verified OpenCode 1.18.31 binary.
- Release secret scan: 1,188 source files, **0 findings**, 0 oversized skips.
- Git whitespace check: pass.

One initial full-suite failure was a source contract that expected a direct awaited send call. It now asserts the awaited diagnostic wrapper still calls the same hosted client path. The complete suite passed after that update. No test was disabled.

Logs: `/tmp/mh-post1017-diagnostics-{tests,http,app,browser,typecheck,build,safety,secret-scan}.log`. These are local temporary files, not hosted acceptance artifacts.

## Fresh release observations

Post-merge #1017 workflows: main tests, security, i18n and macOS alpha completed successfully. Auxiliary Daytona image and Download Stats jobs were still queued/pending when checked. New changes in this branch have not run remote CI.

Read-only hosted checks still report backend commit `ed3ee445e4cb572d65da041dab59c1f413502f50` at the Vercel canonical origin:

- `/health/ready`: HTTP 200, `ready`.
- `/health/launch`: HTTP 503, `not_ready`.
- False launch checks: emailDelivery, emailEvents, emailTransport, passwordReset, backupConfiguration, backupFresh and backup.

These endpoints do not prove live model responses or successful restores. No hosted inference failure is claimed fixed by adding diagnostics. #1017 has not been demonstrated deployed at this origin by these checks.

## Next release steps

1. Review/push this scoped branch and run remote CI before considering a merge.
2. Deploy a specifically approved, exact release commit with rollback targets recorded and frontend/backend commit matching.
3. Use the scoped diagnostic procedure during real authenticated desk/model acceptance, then fix the observed failing stage if one remains.
4. Complete SES delivery/events/reset and verified S3/KMS recovery, followed by two-account isolation and owner-operated wallet acceptance.

Production deployment and launch activation were not performed. The work is local and does not mark the public beta ready.
