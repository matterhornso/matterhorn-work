---
version: 1
slug: "ains-session-surface-jev-chat-control-tsx-da74c6ed"
primary_target: "apps/app/src/react-app/domains/session/surface/jev-chat-control.tsx"
related_targets: ["apps/app/src/react-app/domains/session/surface/session-surface.tsx"]
---

# Jev chat control

Mode: Operate. Extend the existing chat composer; do not redesign it.

## Direction contract

THESIS: Make optional classification understandable at send time. Jev helps interpret a message; the selected model still answers. No new model picker or competing navigation.

OWN-WORLD: Inherit Matterhorn's retro and legacy shared buttons, dialogs, semantic surfaces, typography, focus rings, and light/dark themes. No new palette or decorative icons.

STORY: Users enable Jev after reviewing data sharing, see whether it ran or skipped a message, and disable it in the same place. Remember the confirmed choice across new chats for the current account and workspace in this browser.

FIRST VIEWPORT: A compact labelled Jev control sits immediately above the composer, with a short inline status. Consent details open in the existing dialog pattern. The composer, model selector, and Send remain primary. Wrap the status at narrow widths without horizontal overflow.

FORM: Precisely scoped extension of the incumbent surface; no concept seed or replacement world. The meaningful interaction is turning classification on or off without changing the draft, model, or agent.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
