# Matterhorn Desks Backend Security Audit

**Audit date:** 2026-08-03
**Candidate:** `ff0acdaca4b2bde9e7179e3cefddc978a0b1f8bf` plus the uncommitted hardening changes described below
**Scope:** server APIs, authentication and session state, workspace isolation, MCP and provider configuration, filesystem access, model proxying, protocol action boundaries, logs, downloads, and dependency integrity

## Executive Result

The reviewed backend is suitable for release-candidate acceptance after the focused hardening in this pass. The automated backend and protocol audit completed with **383 passing tests and no failures**. Secret scanning, dependency advisory scanning, type checking, and both MCP security suites also passed.

This is not a claim that an external penetration test or production-environment certification has occurred. Live wallet acceptance, production infrastructure controls, and an independent penetration test remain separate release evidence.

## Security Model

Matterhorn Desks treats prompts, provider responses, wallet metadata, MCP responses, filenames, URLs, and workspace identifiers as untrusted input. The system is designed around these boundaries:

- Authentication and workspace authorization are enforced server-side.
- Hosted accounts cannot enable arbitrary local MCP servers.
- Agent tools prepare or validate actions; they do not silently hold keys, sign, or bypass wallet review.
- Secrets and signed payloads are rejected from durable evidence surfaces.
- Workspace filesystem access must remain inside the authorized real path, including through symlinks.
- Outbound protocol reads are allowlisted and guarded against SSRF.
- Downloaded executables must have verifiable SHA-256 integrity before extraction.

The controls align with the [NIST Secure Software Development Framework](https://csrc.nist.gov/pubs/sp/800/218/final), [OWASP REST Security guidance](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html), [OWASP Logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), and [OWASP SSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

## Findings Closed In This Pass

### High: Executable fallback downloads lacked a complete trust chain

The direct OpenCode fallback previously depended on a release URL without independently enforcing the exact asset digest. It now resolves the exact GitHub release asset, requires the official SHA-256 digest, verifies the archive before extraction, rejects unsafe archive paths, and verifies the extracted binary remains inside the extraction root.

Generic Matterhorn sidecars now require a 64-character SHA-256 digest. Failed or invalid downloads are removed, and URL query strings are excluded from logs.

### High: Filesystem authorization could be weakened by symlinked parents

Workspace path validation now checks real parent paths before creating or writing a target. Symlink escapes from an authorized workspace are rejected even when the final target does not yet exist.

### Medium: Optional context could delay or destabilize prompt dispatch

Optional wallet, workflow, environment, and protocol-provider reads now have explicit deadlines. Timeouts and lookup failures fail closed to absent optional context rather than blocking the prompt or weakening action policies.

### Medium: Mode and reasoning controls needed server enforcement

Discuss, Plan, and Work are now capability policies, not presentation hints. The server validates camel-case and snake-case reasoning fields, rejects conflicting values, normalizes supported effort values, and preserves the selected effort when proxying to compatible providers. Tool access remains deny-by-default for specialized agents.

### Medium: Prompt and telemetry surfaces could retain more data than necessary

Specialized prompts receive a compact protocol safety overlay instead of the full general router prompt. First-output telemetry records only duration, mode, and agent identifiers; it does not record prompt or response content. Session context and wallet metadata are sanitized and bounded before becoming system context.

## Verified Controls

| Area | Verified behavior |
| --- | --- |
| Authentication | Signup, sign-in, sign-out, hashed credentials, session cookies, bearer sessions, invalid credentials, duplicate users, and recovery from rate limiting |
| Tenant isolation | Two-account and two-organization workspace isolation, durable workspace ownership, scoped read/write tokens |
| Browser boundary | Origin validation on state changes, production HSTS on HTTPS, CORS behavior, request body limits |
| Abuse resistance | Independent per-workspace read/write limits and credential-attack limits |
| Error and log safety | Generic external failures, malformed route safety, bearer/private-key redaction, token-free startup and download logs |
| Filesystem | Authorized-root checks, symlink escape rejection, safe nonexistent target handling |
| Provider and MCP | Hosted users cannot configure custom MCPs; reasoning validation; bounded model context; secret-safe capabilities and evidence |
| Protocol reads | Polymarket SSRF protections and no-submit boundary; bounded Bittensor reads |
| Wallet actions | Transaction allowlists, exact review artifacts, external-signer enforcement, signed artifact validation, legacy server signing fails closed |
| Bittensor | Read, preview, canary, adapter, and unsigned-extrinsic workflows |
| Supply chain | Required sidecar checksums, verified fallback download digest, archive traversal checks, dependency advisory scan |

## Verification Evidence

Commands were run from the repository root.

```text
bun test <11 focused server/security/protocol suites> --timeout 20000
383 pass, 0 fail, 2683 assertions

pnpm --filter @matterhorn-work/app typecheck
pnpm --dir apps/server typecheck
pnpm --dir apps/orchestrator typecheck
All passed

pnpm release:secret-scan
964 source files, 0 findings

pnpm audit:dependencies
1,405 locked versions, no low-or-higher advisories

node packages/matterhorn-work-wallet-mcp/test-security.mjs
node packages/matterhorn-work-crypto-mcp/test-security.mjs
Both passed

pnpm test:matterhorn-platform-safety
10/10 stages passed
```

The full safety gate covered wallet approval, money-path security, desk depth, billing, the local router, daemon and Electron boundaries, observability, the design contract, browser-smoke contracts, and production-readiness contracts.

## Residual Risks And Required Release Evidence

1. Run owner acceptance with real test accounts for wallet cancellation, wrong network, review, signature, and submission. Automated tests cannot prove browser-extension behavior.
2. Verify production secrets, CORS origins, HSTS, rate limiting, observability, backup restoration, and rollback against the exact deployed commit.
3. Perform a two-user production isolation test using genuinely separate accounts and browser profiles.
4. Obtain an independent penetration test before representing the product as independently security certified.
5. Keep live execution restricted to explicitly supported protocol paths. Polymarket and Bittensor remain external submission flows where the product cannot safely submit on the user's behalf.

## Release Decision

**Code audit:** Pass for release-candidate acceptance.
**Production security certification:** Pending live infrastructure and owner-acceptance evidence listed above.
