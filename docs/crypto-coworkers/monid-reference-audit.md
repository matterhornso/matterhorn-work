# Monid Reference Audit

Captured: 2026-09-01

Reference: <https://monid.ai>

Evidence: [`qa-reports/monid-reference-2026-09-01`](../../qa-reports/monid-reference-2026-09-01)

## Scope and limitation

This is a product-pattern audit, not a security endorsement. The public landing page, tool catalog, one tool detail page, public documentation, and the unauthenticated onboarding path were reviewed. The audit stopped at Monid's account wall; authenticated budget, usage, credential, and execution behavior was not tested.

## Journey health

| Step | Evidence | Health | Matterhorn lesson |
|---|---|---:|---|
| 1. Understand the promise | `01-home.png` | Strong | Lead with one plain-language outcome and one setup action. |
| 2. Discover capabilities | `02-tools-empty.png` | Strong | Use search, categories, counts, and scannable capability cards. |
| 3. Inspect a capability | `03-tool-detail.png` | Strong | Show exact inputs, endpoint/action count, verification state, and unit cost before use. |
| 4. Choose an agent client | `04-onboarding.png` | Strong | Tailor setup to Codex, Claude Code, MCP, CLI, or API instead of showing generic integration prose. |
| 5. Install/connect | `05-agent-setup.png` | Strong | Provide one copyable setup command plus a visible progress step. |
| 6. Create an account | `06-account-wall.png` | Not assessed | Account creation was outside the reference review and no test account was created. |

## Patterns to adopt

1. **One-line onboarding.** A developer should be able to connect a certified Matterhorn gateway through a Skill, MCP, CLI, SDK, or API without learning the internal runtime first.
2. **Discover → inspect → use.** The catalog should separate searching for a capability from understanding its schema, authority, risk, privacy, freshness, and price.
3. **Visible verification.** Certification should be present on the app and every action, not buried in documentation.
4. **Transparent metering.** Model/tool cost, quota, and latency should be visible before and after execution.
5. **Progressive agent setup.** Setup instructions should adapt to the user's client and remember their progress.
6. **Provider-friendly distribution.** A signed manifest, conformance suite, and certification report should make it practical for crypto teams to list integrations.

## Crypto changes Matterhorn must make

Monid's `run` concept is safe for data endpoints but too broad for financial actions. Matterhorn uses the following safer flow:

```text
discover
  → inspect authority, privacy, risk, freshness, and cost
  → connect with narrow scopes
  → read/watch, or prepare + simulate
  → deterministic policy decision
  → exact wallet review
  → connected wallet signs and submits
  → reconcile public receipt
  → produce redacted evidence receipt
```

Every Matterhorn action card must add:

- Access class: read, watch, prepare, or simulate.
- Risk class and maximum financial authority.
- Data labels and provider disclosure.
- Required app, wallet, network, asset, and OAuth scopes.
- Freshness and simulation requirements.
- Expected cost, quota, latency, and evidence source.
- Certification version, publisher identity, and revocation status.
- A plain statement of what can happen automatically, what needs approval, and what is impossible.

## Patterns not to copy

- Never treat a unified prepaid tool balance as wallet transaction authority.
- Never expose a generic agent-facing `run` route that can sign, relay, broadcast, or submit.
- Never load the full catalog into model context. Resolve a small active tool set server-side.
- Never accept provider descriptions or tool output as policy instructions.
- Never make a verified badge permanent. Certification is version-pinned and revocable.
- Never publish raw prompts, wallet-linked content, signatures, keys, or unrestricted tool output as evidence.

