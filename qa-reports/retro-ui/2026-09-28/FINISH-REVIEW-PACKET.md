# Independent finish review packet

Original request: apply a retro/neobrutalist UI across Matterhorn Desks, following
https://github.com/neobrutalism/neobrutalism, during an unattended four-hour build.
Preserve logo/type, truthful copy, themes, routing/drafts, all safety boundaries,
agent/model execution and default-off STM. Local only; no deployment or secrets.

Code-led assumption recorded while user slept; no comp or direction approval
fabricated. This is an Operate surface. The brief's explicit neobrutalism earns
hard shadows and ink borders; no new branding/fonts or dependency replacement.

Artifact: apps/app/src/styles/retro.css and changed React surfaces in
`git diff ad5b7298a1c53b4aff70ad9fd5b254ecaf4385ca`.
Default-off flag: VITE_MATTERHORN_RETRO_UI. Existing persisted data is unchanged.
Direction/quality bar: `qa-reports/retro-ui/2026-09-28/direction-contract.md`.
Plan: `docs/ui/retro-ui-plan-2026-09-28.md`.
Product/design context: root PRODUCT.md / DESIGN.md (legacy schema warnings;
do not repair context metadata as a side effect).
Craft floor: `/Users/abhinavramesh/Documents/Matterhorn-work/.agents/skills/impeccable/reference/craft-floor.md`.

## Evidence and scope

The main build thread used both allowed visual inspection rounds. Each file
below was opened and verified nonblank, correct surface and settled. They are
synthetic compositions of real components, NOT authenticated full-app screenshots.
Do not interpret fixture debug actions under the composer as product controls.
No provider, chain, account or real vault requests were used. Font fidelity in
fixture captures needs scrutiny: the actual signed-out dist preview uses the
existing bundled font, whereas fixture assets may fall back. Do not assume that
their text measurements prove installed-app typography acceptance.

All required files below are under `.impeccable/review/retro-2026-09-28/`:

- launcher-composer-light-1440.png (desktop)
- launcher-composer-dark-390.png (mobile)
- launcher-composer-light-1280.png (actual user viewport width)
- sidebar-light-1440.png
- sidebar-dark-390.png
- models-light-1280.png
- picker-dark-390.png
- picker-light-768.png
- settings-light-390.png
- settings-privacy-dark-390.png
- wallet-light-390.png
- integrations-light-390.png
- stm-light-390.png
- stm-dark-1440.png
- notes-light-768.png
- memory-dark-390.png
- auth-dark-1280.png
- public-light-768.png

Actual Codex preview was also inspected at1280×720; no horizontal overflow.
Zoom shortcut did not change viewport width or devicePixelRatio, so actual200%
browser zoom is UNVERIFIED. Automated200% root-text reflow checks are separate.
Screenshot matrices:112 captures total in `/private/tmp/matterhorn-retro-final-captures-2026-09-28`;
only the18 named files are reviewed/passed as required evidence, not all112.

## Detector

The single manual detector ran against all changed production CSS/TSX targets
after round2. Exit0: no primary findings. It reported many advisory old design
scale/font/color mismatches, including legacy large files touched only by hooks
and retro.css switch radius1px. Raw terminal output was truncated; no exact count
claimed. No second detector run. The documenter must describe actual scoped
tokens and default-off rollout rather than erasing incumbent behavior.

## Test evidence / limits

Current Chromium controls suite16 pass/184 assertions including capture matrix;
composer9 pass/60 assertions; STM6 pass/33 assertions, all synthetic.
Before latest picker changes, component suite14 pass/100 assertions in each of
Chromium, Firefox, WebKit. Last frontend1234 pass on/off, typecheck/build pass;
latest picker regression/full frontend rerun underway. Focused wallet/operational/
design gate passed, not a full platform safety gate claim. See WORKLOG/COVERAGE.

Review visual quality and changed component semantics. Do not certify production,
complete agent execution or full-product coverage from these fixtures. No direct
browser use or code edits in the review. Return the required five-section finish
contract and disposition (ship/fix/rebuild/recapture), with material findings and
precise file/screenshot evidence. Store your report under this QA directory.
