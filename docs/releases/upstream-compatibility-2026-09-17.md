# Upstream compatibility review — 17 September 2026

## Scope

Reviewed during the overnight public-beta QA block against Matterhorn release
`b055ceeb034d357d2ce627fb4bfe4a2f7060639f`. Changes are local and not deployed.

OpenCode's current published stable release is **1.18.31**, commit
`014614d35b397775e5d397a490fc72368c894ec2`. Matterhorn's runtime and SDK already
match it; no version bump is necessary. The official Darwin ARM64 binary was
installed in an isolated temporary QA directory after checking the repository
SHA-256 pin against the GitHub release asset digest. No global install changed.

OpenWork's current published stable release is **v0.18.48**, tag commit
`c67ba51eda99ae6cfba1ff75b31e84f915c47be5`. The previous compatibility baseline
remains **v0.18.44**, not a claim that the full newer release was merged.

## Selective port

Upstream `7d3693981fe276f9d90a0ea24b5fb05b02e22d7c` fixes a background session
refresh failure disabling the Send button for an already-rendered chat.

Matterhorn reproduced this defect with a failing regression, then ported the
same-session/snapshot recovery condition. A failed navigation to a different
chat, or a failed initial load without a matching snapshot, remains blocked.
No runtime permissions, privacy checks, authentication or wallet controls changed.

Validation: four transition tests passed (ten assertions); the wider targeted
session, routing, provider-recovery and consent suite passed 46 tests with 160
assertions. Full post-change regression results are recorded in the overnight QA
worklog rather than inferred from the baseline run.

The remaining upstream delta is not automatically adopted. Provider configuration,
desktop-only features and permission behavior need separate relevance and security
review before porting into Matterhorn's hosted architecture.

### Additional recovery changes screened

The comparison also includes `faee79d6aaf8fdfb96deda5aa707601d4143667b`
(retrying an observed `ensureFullSnapshot` read after StrictMode cancellation),
`d6c62b1360dd164de6d24e82c2717d225f0c577e`, and
`e388189257f856d40af9ad8d598cebef777d55d5` (queued-composer recovery).
The reviewed Matterhorn session source has no corresponding `ensureFullSnapshot`,
prompt-admission reader, or queued-composer implementation; its draft store remains
v1. These are not drop-in fixes for this checkout. No queue/recovery architecture
was introduced merely to adopt a newer upstream patch. This screening does not
claim an exhaustive review of all 297 commits or live streaming acceptance.

Sources:

- [OpenCode 1.18.31](https://github.com/anomalyco/opencode/releases/tag/v1.18.31)
- [OpenWork v0.18.48](https://github.com/different-ai/openwork/releases/tag/v0.18.48)
- [Session-refresh recovery fix](https://github.com/different-ai/openwork/commit/7d3693981fe276f9d90a0ea24b5fb05b02e22d7c)
