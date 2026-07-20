# Matterhorn Desks Brand Migration

**Decision date:** 2026-07-18
**Status:** Approved for customer-facing migration

## Brand Architecture

- **Matterhorn** is the parent brand.
- **Matterhorn Desks** is the full product name.
- **Desks** is the compact label used only where the Matterhorn context is already unmistakable, such as an installed web app name or a navigation group.
- A **desk** is a focused product surface such as Bittensor, Hyperliquid, Polymarket, Sui, or Longevity.

Use **Matterhorn Desks** on first mention, in browser and desktop titles, onboarding, public pages, installer metadata, release notes, support material, and screenshots. Do not use `Matterhorn-Desks`, `Matterhorn desks`, or plain `Desks` as the full public brand.

## Product Copy

The preferred short description is:

> Matterhorn Desks is a desk-first AI workspace for focused protocol and workflow operations.

Keep copy calm and concrete. Lead with what a desk helps the customer do. Explain safety boundaries at the moment they matter. Do not use internal runtime, package, route, or storage names as marketing language.

Existing modules keep their names:

- Matterhorn Wallet
- Matterhorn Cloud
- Matterhorn Memory
- Matterhorn MCPs

## Visual Identity

The existing Matterhorn mountain mark remains the primary icon. The favicon, PWA icons, desktop icons, and product avatars use the same mark. The wordmark or adjacent title uses **Matterhorn Desks**. Avoid adding a second desk-shaped logo or changing desk icons into brand marks.

## Compatibility Boundary

This launch changes customer-facing branding only. The following identifiers remain unchanged until a separately planned compatibility migration:

- npm package names and scopes such as `@matterhornso/matterhorn-work`
- CLI commands such as `matterhorn-work`
- API routes and JSON field names
- environment variables beginning with `MATTERHORN_WORK_` or `OPENWORK_`
- deep-link schemes `matterhorn-work://` and `openwork://`
- macOS application identifier `com.differentai.openwork`
- local data paths such as `.matterhorn-work/` and `~/.config/matterhorn-work/`
- MCP server, tool, and package identifiers
- repository and release URLs

These names are implementation contracts, not public brand copy. Keeping them stable protects existing workspaces, stored credentials, automation, deep links, updater state, and external integrations.

## Desktop Release Requirement

The desktop product and bundle filename changes from `Matterhorn.app` to `Matterhorn Desks.app`, while the application identifier remains unchanged. Before signing a public build:

1. Install the new build over a previously released `Matterhorn.app`.
2. Confirm the existing workspace list, preferences, credentials, and local data remain available.
3. Confirm Finder, Launchpad, notifications, menus, About, updater prompts, and deep links show **Matterhorn Desks**.
4. Confirm `matterhorn-work://` and legacy `openwork://` links still open the new app.
5. Confirm the update leaves one usable application entry rather than duplicate old and new bundles.
6. Rehearse rollback and verify that the preserved application identifier and data paths keep customer state intact.

Do not publish the renamed desktop artifact until this in-place upgrade rehearsal passes.

## Historical Material

Historical handoffs, generated QA reports, signed evidence, and archived release records are not rewritten. They describe the product name at the time the evidence was produced. New reports and release artifacts use **Matterhorn Desks**.

## Acceptance Checks

- Browser title, metadata, manifest, onboarding, and public sign-in use **Matterhorn Desks**.
- The PWA compact name is **Desks**.
- Desktop product metadata and runtime app name use **Matterhorn Desks**.
- Current customer-facing source contains no standalone **Matterhorn Work** product name.
- Workflow labels remain **Matterhorn Workflow**, not a brand-name fusion.
- Compatibility identifiers listed above remain unchanged.
- Brand contract tests, typechecks, production build, platform safety gate, and desktop upgrade rehearsal pass.
