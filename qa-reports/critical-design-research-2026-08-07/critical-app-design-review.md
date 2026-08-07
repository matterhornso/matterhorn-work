# Matterhorn Desks: critical product-design review

Date: 2026-08-07

Scope: current local application, desktop and mobile, plus the current minified web artifact

Audit mode: combined UX, visual design, responsive, accessibility-risk, and implementation review

## Verdict

Matterhorn Desks is technically mature and visually restrained, but not yet best-in-class. The underlying design system is coherent; the problem is accumulated interface debt. Home, protocol desks, workflow desks, MCPs, Settings, and the public entry each add another local navigation model, another stack of cards, and another explanation of safety or capability. Individual parts are reasonable, but the whole product makes users repeatedly decide where they are, what is primary, and which layer owns the next action.

The next design cycle should prioritize hierarchy and information architecture. A cosmetic restyle would preserve the real problem.

## Audit health score

| Dimension | Score | Key finding |
|---|---:|---|
| Accessibility | 3/4 | Strong semantics and labels; mobile visual discoverability and compact secondary controls still need systematic acceptance. |
| Performance | 2/4 | Route and vendor chunks remain unusually large for an interactive workspace. |
| Responsive design | 3/4 | Layout reflows without horizontal overflow, but some desktop information patterns compress awkwardly on mobile. |
| Theming | 3/4 | Strong token foundation and dark theme; desk colors and component-local state styling are not fully unified. |
| Anti-patterns | 2/4 | The authenticated app is restrained, but repeated card walls and the public entry's giant headline, uppercase kicker, and numbered benefit list read as generic AI-product design. |
| **Total** | **13/20** | **Acceptable — strong foundation, significant product-design work remains.** |

No P0 blockers were observed. The audit identifies 6 P1 structural issues, 5 P2 issues, and 2 focused P3 polish issues.

## What current design research says

The relevant direction is not “more glass,” gradients, or animation.

1. **Calmer hierarchy for dense work tools.** Linear's 2026 refresh argues that supporting chrome should recede, structure should be felt rather than constantly drawn, and only the task should command attention. Its earlier redesign likewise focused on consistent headers, panels, hierarchy, density, and reduced navigation noise. Matterhorn has the same growth pattern: useful features have accumulated faster than the global shell has been pruned. Sources: [Linear, A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh), [How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui).

2. **Expressiveness should improve task-finding, not decorate every surface.** Google's Material 3 Expressive research uses controlled differences in size, shape, color, motion, and containment to point at what matters. Google reports 46 studies with more than 18,000 participants; a later CHI study reports faster fixation on the correct target and faster task completion. Matterhorn should adopt the principle—one unmistakable next action and clearer grouping—without copying Material's visual style. Sources: [Google Design research](https://design.google/library/expressive-material-design-google-research), [Google Research CHI 2026](https://research.google/pubs/usability-hasnt-peaked-exploring-how-expressive-design-overcomes-the-usability-plateau/).

3. **Modern AI products are becoming contextual work surfaces, not chat shells with feature launchers.** Atlassian's current AI guidance emphasizes preserving flow, adapting controls to intent, exposing deeper state on demand, and making AI feel integrated rather than bolted on. Matterhorn's desk concept is directionally right, but the desk still resolves to a catalog of prompt-like cards rather than an adaptive task surface. Sources: [Atlassian AI interaction guidelines](https://atlassian.design/rovo-ui/ai-interaction-guidelines), [About Rovo UI](https://atlassian.design/rovo-ui/about-rovo-ui).

4. **Agency, limitations, correction, and specific progress are core AI interaction patterns.** Apple recommends setting capability expectations, confirming significant actions, providing Edit/Undo/Retry/Adjust near outputs, and using specific progress language. Microsoft's validated human-AI guidelines add efficient correction, explanations, global controls, and clear consequences. Matterhorn is unusually strong on confirmation and non-custodial boundaries; it should bring the same quality to ordinary generation, correction, and provenance. Sources: [Apple Generative AI HIG](https://developer.apple.com/design/human-interface-guidelines/generative-ai), [Microsoft Human-AI Interaction Guidelines](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/).

5. **Progressive disclosure must preserve context.** GitHub Primer warns against disclosure that disorients users and recommends pairing icons with descriptive text. This is directly relevant to the MCP overlay and mobile icon-only utility bar. Source: [Primer progressive disclosure](https://primer.style/product/ui-patterns/progressive-disclosure/).

6. **Accessibility expectations continue to rise.** WCAG 2.2 adds 24px minimum target size, focus-not-obscured criteria, and accessible authentication guidance; 44px remains the enhanced target. Matterhorn's latest fixes materially improve this, but every new compact control should inherit these rules. Source: [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## Captured flow

1. **Project Home — needs structural improvement.** Technically healthy and readable, but it exposes four competing navigation layers: project rail, header/breadcrumb, right rail, and footer utilities. `Home`, workspace name, and `Project home` repeat orientation. The first view presents three creation actions, readiness, history, and five desks without one recommended continuation. The raw `org_…` value under `Project folder` reads like an internal identifier.
2. **Bittensor desk — improved but still catalog-first.** Risk groups are valuable, yet all tasks inside each group have similar weight. `Add address` describes a missing input rather than the user's outcome, and the warning competes with the hero. On mobile, its two-column sentence collapses into a narrow text strip.
3. **Longevity desk — healthy content, weak workflow model.** The hero and agent panel repeat the same description. Seven stages receive equal prominence rather than forming a guided sequence. The view is not URL-persistent, so reload and copied links lose it.
4. **MCPs panel — structurally overloaded.** A full manager, client selector, built-in MCP catalog, custom connector, search, filters, and coming-soon catalog are embedded in a narrow overlay while the previous workflow remains visible. This is the clearest information-architecture failure in the app.
5. **Settings / Models — visually strong, conceptually repetitive.** `Models`, `Model provider`, `Selected model`, `Available models`, and `Model providers` create a long heading chain for one decision. `Profile & Settings` opening Models weakens the label's promise, while `Global` navigation contains text that still refers to the workspace.
6. **Mobile Home — responsive but under-explained.** No horizontal overflow and the content remains usable. However, the footer becomes three unlabeled icons, workspace identity disappears, and cards create a long scroll before users can compare desks.
7. **Mobile Bittensor — usable with one concrete breakpoint defect.** The provider warning's secondary sentence becomes a very narrow right column. Hero spacing consumes substantial first-screen height before the first useful task.
8. **Security — strong.** Clear, restrained, trustworthy, readable, and consistent. This is the best reference surface inside the current product.
9. **Public entry — the weakest brand surface.** The form is subordinate to an oversized marketing headline and a second manifesto column. The uppercase kicker and numbered benefit list are saturated AI-landing-page patterns. At 900px height, the form error already sits near the fold. Authentication should feel private, direct, and trustworthy—not like a campaign page surrounding a utility form.

## Prioritized findings

### P1 — Consolidate the shell and location model

Reduce the four navigation layers to three clear responsibilities: project/context navigation, current view, and contextual tools. Use one location bar; do not repeat `Home → workspace → Project home` plus another page title. On mobile, give the compact toolbar a visible current-workspace affordance and label secondary utilities when opened.

### P1 — Give Home one context-aware primary action

Home should answer “what should I do now?” Use a single adaptive action: continue the last task, finish setup, or start the recommended safe desk task. Keep New chat, New project, and New note as secondary actions. Replace internal workspace IDs with a friendly name and an optional technical-details disclosure.

### P1 — Replace desk card catalogs with a task workspace

Keep three recommended starts visible. After selection, transform the area into a short task builder: required public inputs, source/readiness, expected output, and one primary action. Move remaining tasks behind search or `More tasks`. Preserve Wallet actions as a clearly separate progressive stage.

### P1 — Turn Longevity into a real sequence

Remove the duplicate agent summary. Show the current/recommended stage, completed stages, and the next stage in a vertical workflow. Persist the route and progress so reload, Back/Forward, and copied links behave like every protocol desk.

### P1 — Split compact MCP status from full MCP management

The rail should show connected count, sync state, active client, and one `Manage MCPs` action. Put built-in products, custom MCP setup, connector search, and coming-soon catalog on the full Settings page. Preserve the current work surface instead of compressing it beside a second full application.

### P1 — Redesign the public entry around trust and access

Use a compact sign-in-first composition with one short product statement, account-access form, and a restrained link to Security/Privacy. Remove the huge headline, uppercase marketing kicker, and numbered manifesto. Show service availability before the user fills the form, and keep error/help adjacent to the affected action.

### P2 — Clarify Settings ownership

Separate Account, Workspace, and App preferences. Make the `Profile & Settings` action land on Overview/Profile, not Models. Reduce the Models page to: current model, provider status, choose/change model, and advanced details.

### P2 — Make AI state and provenance first-class

For active tasks, show what context will be used, what source was checked, current progress in specific language, and where the result/evidence was saved. Put Edit, Retry, Revert, and feedback beside generated output. Matterhorn already has the underlying evidence model; surface it during the task rather than mainly in logs and history.

### P2 — Fix mobile priority and warning composition

Collapse desk hero spacing, use a single-column warning with icon + title + supporting line, and surface the first safe task within the initial viewport. Keep 44px ergonomic targets for primary mobile actions.

### P2 — Reduce authenticated bundle cost

The current build artifact includes approximately 1.85MB raw Shiki, 1.80MB wallet, 946KB translations, 812KB Settings, and 761KB Session chunks. Public routes now defer wallet runtime, which is good. Continue splitting wallet families, syntax themes/languages, Settings sections, spreadsheet/editor code, and experimental translations behind the exact feature that needs them.

### P2 — Use links for persistent destinations

Desk and Settings destinations that change the URL should be real links, not action buttons, so users can open them in a new tab, copy them, bookmark them, and receive standard focus/navigation behavior. Reserve buttons for state changes.

### P3 — Replace repeated colored cards with a stronger rhythm

Use desk color for a small identity cue, selection, or key action—not a full tinted rectangle on every capability. Create rhythm with spacing, headings, and row density before adding more containers.

### P3 — Add purposeful motion only where state changes

Use short motion for opening a contextual panel, progressing a workflow stage, or moving an output into evidence. Do not add page-load choreography or ambient glow. The product's restraint is worth preserving.

## Recommended sequence

1. `$impeccable shape` — redesign the shell, Home activation, and desk task model together.
2. `$impeccable distill` — split MCP status from management and simplify Models settings.
3. `$impeccable onboard` — rebuild public entry and first-session activation.
4. `$impeccable adapt` — tighten mobile hero, warnings, and compact navigation.
5. `$impeccable optimize` — code-split authenticated route and vendor bundles.
6. `$impeccable polish` — final typography, motion, state, and cross-theme pass.

## Evidence limits

- Screenshots prove the visible states listed above, not complete WCAG conformance.
- The generated-media fixture provides representative local data but is not a hosted production account.
- No destructive, wallet, payment, or real-provider action was performed.
- Performance conclusions are based on the current minified build artifact, not a hosted Core Web Vitals trace.
