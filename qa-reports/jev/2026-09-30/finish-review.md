# Jev control — independent finish review

Date: 2026-09-30. Disposition: **ship, within the limited local control/hook scope below**.

## 1. Direction and fidelity

Reviewed the Jev direction contract, PRODUCT.md, DESIGN.md, Impeccable craft floor, real `jev-chat-control.tsx` and `use-jev-chat.ts`, the composer injection in `session-surface.tsx`, shared Button/Dialog primitives, fixture/test source, and the relevant server classification boundary.

This is an ordinary Operate extension, not a redesign or a new visual world. The small, explicitly labelled on/off control remains subordinate to the composer and Send. The selected model retains its separate identity. Consent uses the incumbent Base UI dialog; no competing navigation, palette, typeface, decorative icons, or new raster assets were introduced. Hard offset shadows and compact geometry are justified by the pinned retro contract, not treated as generic craft-floor defects. No comp was required for this preservation task.

## 2. Craft

Independently inspected all twelve supplied full-page captures under `.impeccable/review/jev/`: `composer` and `consent`, each in `light` and `dark`, each at widths `390`, `650`, and `1280` (900px viewport height). These show the real Jev control, hook, and shared primitives mounted in the explicitly labelled synthetic local fixture. They do not show the full production session surface.

The control/status row is readable and contained at every supplied width. Consent copy, close affordance, policy link, Cancel, and Enable Jev remain visible without overlap or clipped text. Mobile consent actions stack cleanly, while wider layouts preserve the normal trailing action row. Both themes retain their established text/surface hierarchy. The captures show clear keyboard focus on the control and policy link. No visual defect requiring another capture round was found.

The builder reports one mechanical detector pass with `[]`; this review did not repeat it. A clean detector result is supplementary evidence, not the basis of the disposition.

## 3. Usability and accessibility

The control exposes its state through text and `aria-pressed`, rather than color alone. An enable action first opens explicit consent; disabling is direct. The inline `role="status"` supports classification, skip, unavailable, and fallback messages. The component uses the existing dialog title/description, labelled close control, Escape behavior, and explicit final-focus target. Its height is viewport-bounded with vertical overflow available for constrained screens.

Consent copy agrees with the inspected data flow: eligible composer text is submitted for topic/task classification, not a replacement answer; files, saved-memory selections, and conversation history are not included in the Jev request. Private/structured sensitive contexts are excluded by the client, with additional server eligibility checks. The instruction not to include secrets remains necessary; this review does not certify perfect sensitive-text detection. The preference uses a consent-versioned browser key and a server-derived account/workspace scope. Turning it off cannot retract an already sent provider request, matching the disclosure. A storage failure has an explicit session-only notice.

The builder reports five passing browser tests covering explicit consent/cancel, default off, selected-model preservation, new-chat/reload persistence, account isolation, private-mode skipping, provider fallback, stop/disabling during classification, and keyboard/overflow checks. This reviewer inspected that test implementation but did not independently rerun it. The supplied capture loop requests reduced motion; still images cannot establish animation behavior. Shared motion-reduction styles are retained, with no new authored motion in this control.

## 4. Material findings

No material finish blocker found in the reviewed control/consent scope. No source edits, recapture, or rebuild requested.

Evidence limitations are explicit: supplied captures cover the default-off control and open consent state in retro light/dark, not every runtime status or legacy visual variant. Browser interaction coverage uses mocked availability, classification, preflight, and answer endpoints. No live TypeSafe call, provider policy validation, installed-app acceptance, full session-layout QA, screen-reader audit, or global WCAG certification is implied.

The context loader reports existing project metadata drift (legacy PRODUCT schema/register and brief path resolution). The named target files and direction contract exist and were read directly. No unrelated metadata repair was made as part of this review.

## 5. Disposition and scope

**Ship** the scoped Jev control/consent extension from a finish-review perspective. Preserve the limited evidence statement when handing it off. The builder remains responsible for final tests, integration/security review, updated design documentation, and any deployment or live-provider acceptance outside this review. The twelve PNGs are synthetic QA evidence, not shipping visual assets or evidence of live provider execution.
