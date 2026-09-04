# Plain-language Coworker UX audit

Date: 2026-09-05  
Scope: first-run Home, Coworkers, Crypto Apps, Agent Files, and the private-mode control  
Audience: a non-technical invite user who wants useful crypto work within five minutes

## Activation target

The first useful moment is a completed, cited crypto research answer or a prepared testnet wallet review. The user should reach it by stating one outcome, accepting or changing Matterhorn's coworker suggestion, choosing narrowly scoped access, and starting the chat. The product must not require the user to understand agents, tool registries, capabilities, providers, storage protocols, or transaction infrastructure.

## What already works

- Home starts with one plain-language outcome field and four recognizable jobs.
- Matterhorn suggests a coworker locally and lets the user override that suggestion.
- Access selection happens before work starts; files, saved memory, and apps remain explicit.
- Private mode is a visible composer control and explains when Venice is unavailable or needs setup.
- Agent Files explains accepted formats, secret blocking, storage duration, and the optional encrypted testnet backup without asking for keys.
- Crypto Apps separates research, monitoring, wallet review, and safety checks, and keeps wallet approval visible.
- Coworker detail exposes one contextual next action and puts limits, activity, technical proof, and destructive controls behind deliberate disclosure.

## Issues found

### P1 — A direct first visit to Coworkers lacks enough decision context

The empty panel presents four job names as equal-width buttons, but hides the short explanation already present in the source data. A newcomer opening Coworkers directly must guess the difference between market research, risk monitoring, wallet preparation, and treasury tracking.

Recommended change: show the existing one-sentence explanation inside each choice, add a direct instruction to choose one, and remove the arbitrary visual preference for the first option. Preserve the immediate path into access review and the connected-wallet-only boundary.

### Resolved — Role language is consistent across surfaces

Home and Coworkers now use `Research markets`, `Watch risk`, `Prepare a wallet review`, and `Track balances`. Internal template IDs and persisted coworker names remain unchanged.

### Resolved — Private mode stays with the chat where it was chosen

The model picker and Venice Private control now change the active chat only. A deliberate chat fork inherits that choice; another chat keeps its own model, and deleting the chat removes the saved choice. The workspace default remains available for new chats without being silently changed by a private conversation.

### P2 — Hosted assistive-technology verification remains

Local rendered acceptance now passes at 320, 375, 768, 1024, and 1440 px with no horizontal overflow, one main landmark, visible primary headings, and no unnamed visible links or buttons. The compact navigation and Coworkers detail remain usable at phone width, and unavailable app connections fail closed with a plain-language next step. The attachment control now carries an explicit accessible name instead of depending on its tooltip fallback.

Authenticated Safari and Firefox checks plus manual keyboard and screen-reader acceptance still need to run against the release candidate. Walrus, Sui, hashes, manifests, and certification detail remain behind secondary disclosures until that hosted pass is complete.

## Decision for this PR

The direct first-visit P1 issue and the user-facing role terminology are resolved in separate reviewable changes. Neither change alters coworker templates, permissions, app scopes, privacy classification, transaction preparation, wallet signing, or submission behavior.
