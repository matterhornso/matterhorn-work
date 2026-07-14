# Matterhorn Product Readiness

Generated: 2026-07-14T08:27:22.760Z
Workspace: ws_18dc91c9102a
Server: http://127.0.0.1:4140
Mode: live
Overall: fail

## Safety

- Non-custodial: yes
- Live submission enabled: no
- Asks for secrets: no
- Training use: none_by_default

## Summary

- Passed: 12
- Failed: 3
- Skipped: 0

## Launch blockers

- **Stripe test billing** (Matterhorn operator): Configure Stripe test checkout and signed webhooks, then verify both paths while live charging stays disabled.
- **Generated-media production services** (Matterhorn operator): Configure and verify: Production image provider, Walrus publisher, Walrus relay, Sui NFT package, Sui Kiosk package, Sui TransferPolicy.
- **Run image to Sui NFT receipt flow smoke** (Matterhorn operator): generated media flow stopped at walrus.upload: Walrus storage is not included on Free. Upgrade to Matterhorn Max to continue.

## Stages

| Stage | Status | Label | Detail |
| --- | --- | --- | --- |
| workspace.resolve | pass | Resolve active workspace |  |
| production.cors_readiness | pass | Check production CORS readiness |  |
| backend.capabilities | pass | Read backend capabilities |  |
| workspace.readiness | pass | Read workspace readiness |  |
| backend.control_plane | pass | Read workspace control plane |  |
| backend.support_report | pass | Read redacted support report |  |
| backend.data_map | pass | Read workspace data map |  |
| backend.data_controls | pass | Read data controls |  |
| team.access_summary | pass | Read local team access summary |  |
| ledger.project | pass | Read project data ledger |  |
| ledger.export | pass | Read redacted data ledger export |  |
| billing.production_readiness | fail | Read billing production readiness | production readiness requires verified Stripe test checkout and webhooks |
| generated_media.production_readiness | fail | Read generated media production readiness | generated media production readiness is blocked by 6 setup requirements |
| generated_media.history | pass | Read generated media history |  |
| generated_media.flow | fail | Run image to Sui NFT receipt flow smoke | generated media flow stopped at walrus.upload: Walrus storage is not included on Free. Upgrade to Matterhorn Max to continue. |

## Artifacts

| Artifact | Summary |
| --- | --- |
| productionCors | {"defaultCors":"loopback","productionWildcardAllowed":false,"checks":[{"id":"server_default","status":"pass"},{"id":"config_regression_test","status":"pass"},{"id":"local_dev_launcher","status":"pass"},{"id":"generated_media_smoke_launcher","status":"pass"},{"id":"environment_cors","status":"pass"}]} |
| capabilities | {"models":"working","memory":"working","notes":"working","outputs":"working","imageGeneration":"working","walrusStorage":"needs_setup","nftMinting":"needs_setup","nftMarketplaceListing":"needs_setup"} |
| readiness | {"status":"working","blockingChecks":[],"recommendedActions":[]} |
| controlPlane | {"status":"preview","readyFeatures":6,"totalFeatures":6,"exportableStores":14} |
| supportReport | {"filename":"matterhorn-backend-support-ws_18dc91c9102a-2026-07-14.json","warnings":4,"localTeamSharing":"local_tokens"} |
| dataMap | {"stores":["audit","billing","chat","dataPolicy","evidence","feedback","imageOutputs","memory","modelPreferences","notes","outputs","taskEvents","walletEvidence","workflowRuns"],"imageOutputsStatus":"preview"} |
| dataControls | {"totalStores":14,"exportableStores":14,"userControlledStores":8} |
| teamAccess | {"mode":"local_tokens","cloudTeamsStatus":"needs_setup","tokenCount":1} |
| ledger | {"itemCount":20,"summary":{"total":20,"notes":1,"memorySuggestions":0,"teamAccess":0,"wallets":0,"chats":12,"tasks":0,"outputs":0,"images":0,"nfts":0,"billing":0,"audits":7,"feedback":0,"redacted":0}} |
| ledgerExport | {"filename":"matterhorn-project-ledger-ws_18dc91c9102a-2026-07-14.json","itemCount":20,"includes":["audit","opencode_runtime","project_evidence"]} |
| generatedMediaHistory | {"itemCount":0,"counts":{"images":0,"drafts":0,"minted":0,"listed":0}} |
