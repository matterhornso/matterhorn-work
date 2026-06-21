# Settings — Overview Page

The **Overview** is the first thing a user sees when they open Settings (the gear/menu affordance and the bare `/settings` path both land here). It turns Settings into a clear product surface rather than a debug panel, answering the common beta questions in one place.

Source: [`apps/app/src/react-app/domains/settings/pages/overview-view.tsx`](../apps/app/src/react-app/domains/settings/pages/overview-view.tsx). It is registered as the `overview` tab (`SettingsTab`) and rendered by the existing settings shell.

## Sections

1. **Profile** — signed-in/signed-out status; links to account settings (does not implement auth).
2. **Appearance** — light/dark/system theme (live), Matterhorn accent preview, comfortable/compact text density; link to full Appearance.
3. **Safety & Wallets** — non-custodial explanation; Bittensor external-signer language; Hyperliquid/Polymarket preview-only with live submission off; no seed phrase / private key / API secret storage.
4. **Protocols** — Bittensor / Hyperliquid / Polymarket status (read & preview); points to the protocol workspaces.
5. **Extensions & MCP** — connected apps + MCP servers, add-a-custom-app path, note that some tools are unavailable until connected.
6. **Workspaces** — local vs remote/shared explanation; authorized folders + diagnostics links.
7. **Beta Diagnostics** — app version / dev build, a copyable doctor command, pointer to evidence docs.
8. **Privacy & Data** — chats/artifacts/receipts stored locally; secrets never stored.
9. **About** — Matterhorn Work version, updates, docs & support.

## Safety invariants (gate-enforced)

`pnpm test:settings-overview-ui` asserts: all nine sections present; the non-custodial / external-signer / preview-only / no-secret-storage copy is present; **no** affirmative live-submission/custody/secret-storage claims; and **no** OpenWork/OpenCode visible copy (the `VITE_OPENWORK_APP_VERSION` env identifier is not user-visible).

## Wiring

- `SettingsTab` (in `app/types.ts`) gains `"overview"`; it is the first global tab.
- `settings-page.tsx` provides its icon (`Sparkles`), label ("Overview"), and description.
- `settings-route.tsx` routes/renders it; the empty `/settings` path redirects to `overview`.
- `app-menu.tsx`'s Settings affordance opens `/settings/overview`.

Theme is read/written through the existing `app/theme` API; the page implements no auth, no protocol desk, and no backend.
