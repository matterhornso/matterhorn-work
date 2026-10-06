## Summary

- Restore visible, labelled desk/model/workspace/profile navigation on narrow screens and bound the model picker; correct settings drawer/profile routing.
- Report exact account-scoped operator-approval waiting state without exposing approval authority; preserve Stop, drafts and usage cleanup.
- Retain bounded Polymarket, cross-venue and Bittensor public evidence in chat; implement the advertised Sui object read. Keep authentication, secret rejection, output caps and wallet approvals intact.
- Make watch/receipt starters accurately describe planning and guidance. Put Sui fee preview behind the existing reviewed-transfer gate; clarify bounded two-network balance comparison without new tool permissions.

## Validation

All five tested core desk public-read flows completed in isolated local ASI1 browser chats; this is not every action or hosted release certification. Additional real tests verified Waiting → Stop with zero usage/holds, approved Private AI retry (984 tokens), and cross-venue tool + answer (8,667 tokens; account total 9,651, zero holds).

Broad final checks: 1,646 frontend/MCP/Bittensor tests passed; SDK/UI builds, app/server typechecks, offline Bittensor gate and isolated production web build passed. The final compact Account-link adjustment happened afterward and passed 42 focused tests plus app typecheck. Approval/session regression separately passed 871 tests. Counts overlap. Schema remains 10,982/11,000 characters and read results stay at 2,000 characters.

The final selected `desk.depth,product.readiness` safety stages passed. A fresh full all-stage pass remains outstanding: after correcting three stale tooltip assertions, the full attempt encountered Bun import/read EINTR errors; retained failure logs and subsequent selected passes are reported separately.

Screenshots and sanitized receipts: [one-hour results](ONE-HOUR-RESULTS.md). Full functionality and gate inventory: [desk action matrix](DESK-ACTION-MATRIX.md). Prior five-desk acceptance: [results](RESULTS.md).

## Boundaries and known limits

Hosted manual operator approval still requires a secure staffed review process; the waiting label is not an approval bypass. No deployment, wallet signing/submission, geoblock bypass or connector OAuth. Persisted watches and receipt import are not chat capabilities. Provider/hosted/email/backup acceptance remains open.

Successful tool execution does not certify every generated sentence: the cross-venue answer misattributed two omitted records to Polymarket instead of one Polymarket and one Manifold; earlier Bittensor emission and Sui owner wording caveats are documented. Use authoritative tool metadata.

Final Sui two-network browser acceptance remains unverified after approval timeout and a Mac lock that interrupted browser automation. Final compact Account-link/settings-drawer clicks, Safari, Firefox, 200% zoom and the full accessibility matrix are also unverified. Existing user previews/chats/data remain untouched. Keep this PR draft pending new-head CI and the remaining acceptance work; no merge or deployment was performed.
