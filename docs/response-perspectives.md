# Response Perspectives

Response perspective lets a user choose how Matterhorn frames the next chat response without changing the underlying model, tools, or safety policy.

## Current Behavior

The chat composer presents one label, **Perspective**, followed by three choices:

| Choice | Framing |
| --- | --- |
| Cautious | Leads with material risks, failure cases, reversibility, and what could go wrong. |
| Balanced | Answers directly with evidence and tradeoffs, without directional spin. This is the default. |
| Optimistic | Leads with realistic possibilities and actionable opportunities while acknowledging material tradeoffs. |

Matterhorn produces one response for the selected perspective. It does not generate three parallel answers or a comparison card.

## Persistence And Prompting

The selection is stored locally per workspace and session under the versioned `matterhorn.response-perspective.v1` namespace. A new or unavailable session defaults to Balanced.

At send time, the selected framing is added to the system context. The user prompt is not rewritten, and changing perspective does not create a separate agent or provider call.

## Safety Invariant

Perspective changes presentation only. It must never remove, weaken, delay, or hide:

- non-custodial and external-signer boundaries;
- financial risk and compliance disclosures;
- wallet transaction review requirements;
- wellness and non-medical disclaimers;
- tool permissions, approval gates, or workspace access controls.

## Source And Verification

- UI and prompt contract: `apps/app/src/react-app/domains/session/perspectives/response-perspective.ts`
- Contract test: `apps/app/tests/response-perspective-contract.test.ts`
- Historical design exploration: `docs/ui/matterhorn-chat-perspectives-media-nft/chat-usp-and-response-modes.md`

```bash
pnpm --filter @matterhorn-work/app exec bun test tests/response-perspective-contract.test.ts
```
