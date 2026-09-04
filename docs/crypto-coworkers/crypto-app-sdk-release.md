# Crypto App SDK release runbook

The public SDK release is deliberately separate from application deployment. It
is manual, approval-gated, tag-bound, commit-bound, and uses npm trusted
publishing. No long-lived npm token belongs in GitHub, the repository, a local
environment file, or the workflow.

Publishing a package version is irreversible. Complete every precondition and
review the exact version, commit, and artifact before approving the GitHub
environment deployment.

## One-time control-plane setup

1. In GitHub, create an environment named `npm-crypto-app-sdk`.
2. Require at least one reviewer who did not prepare the release. Limit the
   environment to the protected `dev` branch.
3. Add a repository tag ruleset for `crypto-app-sdk-v*` that prevents tag
   updates and deletions after creation and restricts who may create a release
   tag.
4. In the npm settings for `@matterhorn-work/crypto-app-sdk`, configure a
   GitHub Actions trusted publisher with:
   - Organization: `matterhornso`
   - Repository: `matterhorn-work`
   - Workflow filename: `publish-crypto-app-sdk.yml`
   - Environment: `npm-crypto-app-sdk`
   - Allowed action: `npm publish` only
5. Do not add `NPM_TOKEN` or `NODE_AUTH_TOKEN`. The workflow refuses to publish
   if either value is present.

The publisher must use the public npm registry and the GitHub-hosted runner in
the checked-in workflow. The repository must remain public for npm provenance
generation. Treat a mismatch in any configured name as a failed release, not as
a reason to weaken the workflow.

## Release preparation

1. Update `packages/crypto-app-sdk/package.json` to a new exact SemVer version.
2. Merge that change and all relevant tests to `dev`.
3. Confirm every required check is green for the exact `dev` head.
4. Run locally from a clean checkout of that commit:

   ```bash
   pnpm install --frozen-lockfile --ignore-scripts
   pnpm test:crypto-app-sdk-package
   pnpm test:crypto-app-sdk-provenance
   pnpm test:crypto-app-sdk-publish-workflow
   pnpm test:matterhorn-platform-safety
   ```

5. Create the immutable tag `crypto-app-sdk-v<version>` at that exact commit and
   push only that tag. Re-resolve the remote tag and confirm that it equals the
   reviewed 40-character commit.

## Approval and publication

Open **Actions → Publish Crypto App SDK → Run workflow** on `dev` and enter:

- `version`: the exact package version
- `source_commit`: the exact lowercase 40-character `dev` head
- `confirmation`: `publish @matterhorn-work/crypto-app-sdk@<version>`

The job cannot begin until the `npm-crypto-app-sdk` environment reviewer
approves it. It then:

1. Confirms the dispatch, checkout, package metadata, and release tag all bind
   to the same commit and version.
2. Uses pinned third-party actions and minimal read/OIDC permissions.
3. Installs dependencies without lifecycle scripts and runs the clean-package,
   provenance, and workflow-policy tests.
4. Packs exactly one archive and publishes that archive with lifecycle scripts
   disabled.
5. Uses npm OIDC trusted publishing on a GitHub-hosted runner; it does not read a
   long-lived registry token.
6. Reinstalls the immutable public version with scripts disabled, verifies npm
   registry signatures and transparency-backed publish/SLSA attestations, and
   binds the result to the exact repository, workflow, and commit.
7. Uploads only the bounded `matterhorn.crypto-app-sdk-provenance.v1` report.

If publication succeeds but registry evidence has not propagated yet, rerunning
the same exact request does not republish or overwrite the version. It recognizes
the existing version and performs verification only.

## Acceptance evidence

Download the `crypto-app-sdk-provenance-<version>` artifact from the workflow
run. Verify that its report says `decision: GO`, calculate its SHA-256, and copy
the unchanged file to `reports/crypto-app-sdk-provenance.json` in the private
acceptance-evidence workspace. Record that relative path and SHA-256 in the
Phase 1–5 acceptance input.

Do not commit live evidence to the repository. Do not use a local tarball, an
alternate registry, a similarly named package, or a report from another commit.

## Failure handling

- Before publication: fix the issue through a reviewed PR, keep the package
  version unpublished, move the release tag only as part of that reviewed
  correction, and rerun the full gate.
- After publication with delayed verification: rerun the exact same workflow
  request. It is verification-only once the version exists.
- After publication with mismatched provenance or contents: mark that version
  unusable, investigate, and publish a new version only after correction. npm
  versions cannot be overwritten.
- Never add a registry token, skip the environment approval, disable
  provenance, weaken the commit/tag checks, or publish from a local machine as
  a workaround.

This workflow does not list or promote a crypto app, enable the gateway, enable
mainnet, grant a developer invite, or give an agent transaction-submission
authority.
