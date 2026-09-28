## verdict

All 18 required captures were re-opened at the exact paths used in FINISH-REVIEW.md. Each remains nonblank, settled, correctly named and appropriately sized for the declared synthetic surface. This is a scoring pass on the four material fixes, not a new surface review.

1. **Resolved — selected-model contrast.** `picker-dark-390.png` and `picker-light-768.png` now visibly use ice selection with readable ink title, capability, identifier and checkmark. `apps/app/src/styles/retro.css:224–239` contains the coherent selection pair and inherited descendant foreground; the contradictory later selected-background override is removed. The regression test asserts ice `rgb(209, 242, 255)` and ink `rgb(24, 23, 28)` in both themes.
2. **Resolved — fixture font fidelity evidence.** The refreshed `auth-dark-1280.png` reflects the actual signed-out entry's type treatment, and `public-light-768.png` retains the main-app typography. The fixture now uses the critical entry style plus auth/retro CSS for auth, rather than injecting the main app stylesheet. `apps/app/scripts/fixtures/verify-bundled-fonts.ts` requires actual loaded Geist Variable and IBM Plex Sans Variable faces for non-auth captures. The recorded focused run at `/private/tmp/matterhorn-retro-font-proof-2026-09-28.log` passes with eight assertions and reports fixture/distribution auth equality: Avenir Next/system family stack, 54px, weight 750, line-height 57.24px. Its inspected test also compares main-body family declarations and loads both bundled faces on fixture and distribution Security. No production font-family replacement was introduced. This resolves local fixture/distribution fidelity, not per-glyph provenance or installed/native typography acceptance.
3. **Resolved — auth eyebrow.** `auth-dark-1280.png` now shows “Public beta” below the descriptive paragraph, not above the heading. Both `public-web-signin-page.tsx` and the first-paint shell in `vite.config.ts` apply that placement only when retro is enabled, retaining the truthful disclosure and flag-off placement. The same recorded focused run verifies the JavaScript-disabled first-paint disclosure follows the description.
4. **Resolved — scoped design persistence.** DESIGN.md and `.impeccable/design.json` now document actual light/dark retro tokens, selection pairing, hard depth, press/focus/reduced-motion behavior, inherited typography entry paths, and the default-off flag. The text distinguishes incumbent, minimal-only and retro behavior, preserves product/safety rules, and expressly limits synthetic/local evidence. It does not treat retro as an unscoped replacement or claim an unrelated PRODUCT metadata migration.

No material regression attributable to this correction batch was observed in the refreshed required captures.

## remaining

Clear for the four scored fixes. Ship covers the scored fixes, not the whole surface. The declared local, default-off, synthetic scope remains: no hosted/authenticated full-app acceptance, real provider/agent/chain execution certification, installed/native typography acceptance, or actual 200% browser-zoom approval is implied.

disposition: ship
