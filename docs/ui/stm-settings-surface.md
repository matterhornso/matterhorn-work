# Secret storage settings

Operate mode. Local desktop users manage selected API credentials without exporting existing vault values into the renderer. Hosted/remote settings retain their existing restriction.

## Direction contract

THESIS: Extend Environment with explicit storage and consumer choices, not a secrets dashboard.

OWN-WORLD: Reuse Matterhorn's settings sections, field, input and button components, existing type and semantic light/dark tokens. No palette, typography or navigation changes.

STORY: Inspect authenticated capability state; connect with consent; link or replace a selected secret; migrate selected eligible names; confirm plaintext removal separately. Explain failures without exposing native payloads.

FIRST VIEWPORT: Compact section heading, one status, short consumer-access explanation, wrapping actions. Focused forms appear inline. Metadata and migration follow; restart details remain collapsed.

FORM: Local extension of the incumbent settings form/list. No concept seed or visual-world replacement is applicable. The interaction of record is the verified migration followed by a separate destructive confirmation.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Existing DESIGN.md remains authoritative and unchanged. No shipping raster assets are added; QA captures depict synthetic fixture data.

The approved STM implementation plan explicitly authorizes transient API-secret password entry here. This is a scoped exception to DESIGN.md's general secret-field prohibition: inputs go directly to the privileged host-only save endpoint, are cleared on completion/error/cancel/unmount, and never enter React Query or persistent browser storage. Existing vault values remain metadata-only. Wallet private keys, seed phrases and mnemonics remain prohibited; no general-purpose Reveal or export action is introduced.
