# Permanent restored UI — production PR

## Scope and baseline

- User approved the restored pre-retro interface and requested permanent removal of the redesign opt-in/code, a clean production PR, cleared security gates, and an operator deployment handoff.
- Implementation: `codex/permanent-restored-ui-2026-10-13`, based on `origin/dev` at `ff0fee42b375e3dc58cbc73918d0093fa2eded40` (merged #1033).
- Appearance reference: local approved #1034 preview, `7463336d3ccc36be246e0807a3184e8969ba099a`.
- Do not import unmerged #1032 wholesale (428-file difference). Preserve merged backend, authorization, accounting, consent, data and routing. Port only necessary UI parity corrections.
- Existing preview at restored-ui.localhost:54452 and its disposable account remain untouched.
- No merge, deployment, production setting/secret change, account reset, external integration access, or wallet signing.

## Work plan

1. Remove retro/minimal feature switches and unused layout components/styles; keep the approved legacy branch and meaningful model/desk helpers.
2. Preserve Account access independent of optional Cloud, model-picker accessibility and mobile settings navigation. Do not introduce a new visual direction.
3. Remediate current dependency advisories using patched artifacts without suppressing gates; record unfixable upstream limits if any.
4. Run frontend regressions, typecheck, build, focused browser desktop/mobile and theme/keyboard checks, dependency/security gates, and independent review.
5. Publish a focused PR against dev; verify new-head CI. Document exact commits, operator checks, build/deploy/rollback procedure, remaining hosted acceptance and production-branch uncertainty.

## Evidence boundaries

Visual and fixture evidence is not live inference or hosted acceptance. The approved local preview has no provider connected. Actual Vercel/Railway production branch bindings require operator verification; repository files alone do not prove them. Security findings and unavailable checks remain explicit.

## Progress

- Clean dev base verified; active preview checkout not changed.
- Read repository, Serena, Impeccable and Uncodixfy instructions. User-pinned restored UI overrides stale retro design direction; no new aesthetic selection.
- Parallel ownership: root session shell/composer/helpers/tests/release; secondary UI settings/bootstrap/styles; dependency remediation manifests/lockfiles.
- Fresh dev dependency audit reports 16 JS advisories (not the earlier #1034 count of 13); investigating patched updates and no-patch dependencies.
- Permanent source cleanup complete: both opt-ins, retired CSS/branches/components and unused props removed. No backend/data reset. Account access without Cloud and visible mobile navigation/selected-chat parity retained.
- Dependency remediation complete: full JS audit 16 -> 0, no new suppressions; Rust quinn-proto patched and verified. See DEPENDENCY-SECURITY.md.
- Final frontend 1,321/1,321 and composer Chromium 9/9 passed; full platform safety, app/server typechecks, public web build and strict secret scan passed. Detailed boundaries in RESULTS.md.
- Independent finish review inspected actual/synthetic captures and source/security compatibility: no introduced P1/P2 findings, scoped ship disposition.
- Fresh disposable normal-auth runtime tested at permanent-restored.localhost; original restored-ui.localhost preview/data untouched. No engine/provider calls in this local UI runtime.
- Implementation committed as `d688fdeed02c26f77cbc8008a9d0dba783e13f45`; production bundle built at that exact SHA with both retired UI flags deliberately set. Normal-auth Chromium confirmation passed /session entry, profile/model setup, five visible desks in both themes at390/1440px, no browser errors or retro marker.
- Published direct-to-dev PR #1035: https://github.com/matterhornso/matterhorn-work/pull/1035. Final evidence/handoff commit and new-head CI follow. No merge/deploy authorized.
- GitHub default-branch Dependabot #43 was inspected: http-cache-semantics <=4.2.0, candidate4.3.0. No alert dismissed; branch audit is zero and GitHub must reevaluate after merge.
- First new-head CI found CodeQL #224 in a fixture array-membership assertion and an existing wall-clock-dependent Polymarket policy test. Exact request-list assertion plus deterministic current/expired policy tests address both without any policy extension or suppression. Dependency/Rust17/17 and policy/runtime58/58 pass; full safety/new-head CI rerun follows.
- User approved replacing the obsolete design guide and examples with restored-UI-only documentation. Documentation refresh is now authorized; historical plans are superseded.
- Documentation refresh completed: source-backed DESIGN.md, sidecar with ten specimens, implementation companion and four historical-plan notices. JSON/YAML, token/narrative/link/command consistency validated. Independent reviewer also cleared both CI-only test fixes; 58/58 policy/runtime tests and the complete local safety gate passed after correction.
