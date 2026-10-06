# Sui object answer truncation

Read-only diagnosis of the normal-account local runtime `matterhorn-pr1032-functional-oQ384K`, session `ses_ef19e05b3ffe7hYsWZ23En03VO`. No new model requests, operator credentials, runtime changes, prompt text, or response text were used/persisted by this inspection.

The [sanitized receipt](sui-object-truncated-chat-receipt.json), captured at `2026-10-05T23:27:06.663Z`, shows:

- One successful `matterhorn_sui_get_object` call, source `sui.grpc`, network `testnet`, fetched at `2026-10-05T23:25:22.280Z`.
- Initial answer normalized finish reason `length`: 75 output tokens and 4 reasoning tokens.
- User-approved answer-only continuation also finished `length`: 48 output tokens and 11 reasoning tokens; no second tool call.
- Both run receipts are correctly `partial`; account pending requests and reserved tokens are zero.

The normal-account provider catalog GET returned HTTP 200. Selected `cudos/asi1` declares context/output limits as zero (unknown) and contains no numeric maximum-token override in model/provider options. The config GET returned HTTP 403; the denial was respected, without operator access or another route around it.

Pinned runtime source commit `014614d35b397775e5d397a490fc72368c894ec2` matches the active binary's provenance. In that source, `packages/opencode/src/provider/transform.ts:1468` computes the output maximum as `Math.min(model.limit.output, outputTokenMax) || outputTokenMax`, with the default `OUTPUT_TOKEN_MAX` of 32,000. `packages/opencode/src/session/llm/request.ts:129` initializes the request maximum with that function. The isolated launcher does not inherit/forward `OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX`. OpenAI-compatible protocol parsing maps upstream `length` to normalized `length`.

No local low-output-cap defect is demonstrated. These stops occur far below the default computed cap. The browser's observation that both stopped while generating a long zero-padded identifier is consistent with a provider-side repetitive-generation cutoff, but it does not prove that mechanism. The exact outbound request and raw provider stream were not captured, so this is not a definitive provider root-cause attribution. A user-approved answer-only follow-up asking for the equivalent short public ID `0x2` is a controlled next check; no source or active-request change was made here.

The QA sanitizer was extended only to recognize the known object-result container and allowlisted finish reasons. Its four synthetic tests pass; arbitrary content and identifiers are still excluded from the durable receipt.

## Authorized presentation follow-up

The owner-run short-ID continuation completed, but the model incorrectly treated the read tool's `canSubmit: false` as a property of the on-chain object. A separately authorized, Sui-only model projection now omits `custody` and `canSubmit` from object facts. The authenticated backend API and exact typed metadata remain unchanged.

Only schema-known public object/address fields are converted to equivalent short hex (`objectId`, `owner.address`, `owner.objectId`, `type.packageAddress`). Values must be a complete `0x`-prefixed 1–64-digit hex string; invalid values fail closed. The projection never abbreviates with ellipses and does not modify digest, object version, network, or source. Raw secret rejection still happens before projection, including for fields later omitted.

Focused verification: **89 passed / 0 failed, 4 files, 644 assertions**, including six identity-equivalence cases, malformed ID/type cases, and secret material hidden in an omitted field. Existing 11,000-character schema ceiling remains unchanged. This is a deterministic presentation fix, not a proven explanation of the upstream cutoff or a live acceptance claim.

```sh
env -u MATTERHORN_WORK_DATA_DIR bun --no-env-file test apps/server/src/managed-opencode-mcp.test.ts apps/server/src/tools/sui.test.ts apps/server/src/agent-token-budget.test.ts apps/server/src/agent-capability.test.ts --timeout 15000
pnpm --dir apps/server typecheck
```
