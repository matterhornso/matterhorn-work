# Market Execution-Readiness Security Gate

This document defines the security gate that must pass before Matterhorn Work can even discuss enabling live Hyperliquid or Polymarket execution. It does **not** enable live submission. Current product behavior remains read-only, preview-only, external-signer handoff, and public receipt import.

## Current Enforcement

- `liveSubmissionEnabled: false`
- `canSubmit: false` on every Hyperliquid and Polymarket preview/handoff
- no Matterhorn route that submits, signs, or broadcasts market orders
- no private key, seed phrase, API secret, raw signature, signed payload, or wallet export accepted through HTTP, MCP, CLI, fixtures, or docs
- Polymarket compliance-blocked previews carry no executable price, size, estimated shares, or typed-data handoff
- public receipt import verifies preview/handoff hashes and rejects credential-shaped fields

## Future External-Signer-Only Architecture

Any future execution path must keep Matterhorn non-custodial:

1. Build a fresh preview from public data and user-supplied public context.
2. Bind the preview to `previewSha256`.
3. Reject stale previews and hash mismatches before a handoff can be used.
4. Show an operator confirmation with exact venue, market, side, size, price, expiry, fee/risk notes, and `canSubmit: false`.
5. Hand off public order terms to the user's own wallet/client or official SDK.
6. The user's own signer decides whether to sign and submit outside Matterhorn.
7. Matterhorn imports only a public receipt: order id, tx hash, status, public signer address, or public result metadata.
8. Audit logs store public hashes, public route names, safety status, and redacted evidence only.

## Required Controls

| Control | Required behavior |
| --- | --- |
| `preview_hash_binding` | Every preview includes a deterministic public hash over the non-secret action terms. |
| `stale_preview_rejection` | Expired previews, mismatched hashes, or changed public terms fail closed. |
| `operator_confirmation` | Any future handoff requires a plain-English consequence statement and explicit external-signer acknowledgement. |
| `external_signer_handoff` | Matterhorn never signs, computes a final signature, stores keys, or broadcasts. |
| `public_receipt_import` | Receipt import accepts only public status fields and verifies them against the originating handoff. |
| `audit_logging` | Evidence logs are public/redacted and contain no signing material. |
| `prompt_injection_rejection` | Prompts that ask Matterhorn to ignore safety, sign, submit, or bypass policy return a safe refusal or clarification. |
| `secret_injection_rejection` | Credential-shaped fields and values are rejected before planning, preview, handoff, receipt, MCP, or CLI execution. |
| `compliance_bypass_rejection` | Compliance-blocked Polymarket previews cannot emit executable order terms or signing handoff data. |

## Negative Tests

The readiness gate must continue to prove:

- prompt injection cannot enable market signing/submission;
- secret-shaped input is rejected in HTTP, MCP, and CLI surfaces;
- stale preview or hash mismatch fails closed;
- Polymarket compliance blocks cannot be bypassed into executable price/size/share fields;
- fake signed-payload or raw-signature receipt imports are rejected;
- no route, command, MCP schema, or helper exposes live market submit/sign/exchange API secret handling.

## Current Status

The gate is intentionally conservative. Passing it means Matterhorn Work is safe for read/preview customer demos and external-signer education. It does not approve live submission. A separate security review, threat model, signed artifact validation, customer consent design, and incident response plan are required before any future live execution PR.
