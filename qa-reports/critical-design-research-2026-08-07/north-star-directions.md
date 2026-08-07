# Matterhorn north-star directions

Date: 2026-08-07
Status: Composed A+B+C system approved for implementation

All directions use the confirmed Matterhorn palette and the Thinking Orbs agent-activity language. They differ in product topology, not visual theme.

## Direction A — Focused Workspace

Artifact: `north-star-a-focused-workspace.png`

### Carries forward

- Familiar fixed project navigation and compact location bar.
- Home has one adaptive continuation action.
- Recent work is a quiet list.
- Desks are compact rows with identity accents instead of a card wall.
- Creation actions are secondary.

### Trade-off

This is the lowest-risk evolution of the current shell. It substantially improves Home but does less to define the inside of a desk. The generated 64px orb in the continuation row is not part of the intended implementation; only live agent activity receives an orb.

## Direction B — Task Canvas

Artifact: `north-star-b-task-canvas.png`

### Carries forward

- Compact global rail and canonical project/desk location.
- Three recommended starts plus `More tasks`.
- Selected tasks become a structured workspace with inputs, readiness, sources, expected output, save destination, and one action.
- Public-beta wallet-action availability remains explicit but secondary.
- Agent activity is a persistent 20px inline status at the bottom of the active task.

### Trade-off

This is the strongest model for protocol desks and the clearest replacement for task catalogs. It adds a second navigation column inside desks, so mobile must convert the task list into an inline picker or prior step rather than simply stacking both columns.

## Direction C — Guided Workstream

Artifact: `north-star-c-guided-workstream.png`

### Carries forward

- One centered workstream with current, completed, and next stages.
- The current stage expands inline; other stages remain compact rows.
- Persistent Back, Copy link, progress, evidence destination, and specific agent activity.
- No duplicate hero or agent summary.

### Trade-off

This is the strongest model for Longevity and any ordered multi-stage workflow. It should not be forced onto single-shot research tasks, where the task canvas is faster.

## Recommended system

Use a composed direction rather than forcing one topology across every state:

1. **Direction A for the global shell and Home.**
2. **Direction B for protocol and single-outcome desks.**
3. **Direction C for Longevity and genuinely sequential workflows.**

The shared system is consistent because location, typography, palette, spacing, button vocabulary, evidence placement, and Thinking Orbs behavior remain the same. The work topology adapts to task intent.

## Elements not to literalize from generated mocks

- Generated logos/icons are placeholders; use the established Lucide and protocol mark components.
- Do not rasterize any UI or text.
- Do not add an orb to static navigation, source rows, or continuation recommendations.
- Do not copy accidental oversized orbs from Direction A.
- Do not add a sparkle icon to the primary button unless the existing icon vocabulary requires it.
- Exact sample timestamps and fixture data remain test/demo content, not production copy.
