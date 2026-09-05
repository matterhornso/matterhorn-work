# Venice private mode

Matterhorn can offer a per-chat `Private` control through a server-owned Venice
provider. The browser never receives the Venice API key and cannot declare a
model private.

## Trust boundary

1. The backend checks for `VENICE_API_KEY` only in its server environment.
2. Before the managed OpenCode runtime starts, Matterhorn fetches Venice's
   public `/api/v1/models` catalog through its DNS-resolved, TLS-hostname and
   socket-peer-pinned JSON transport. Redirects, endpoint substitution,
   private-network addresses, non-JSON responses, and oversized responses fail
   closed. No provider credential is sent during catalog discovery.
3. Matterhorn admits only `text` models whose current metadata says
   `privacy: private`, `offline` is not true, and function calling is enabled.
4. The exact admitted model identifiers are registered in the backend privacy
   firewall and injected into OpenCode's in-memory runtime config.
5. Requests claiming `providerId: venice` with any other model identifier fail
   closed, including when general provider enforcement is in disclosure mode.
6. The admitted-model proof expires after 24 hours and is refreshed every 12
   hours while the managed runtime is running. A failed refresh clears the
   authoritative registry immediately; an expired model cannot receive a
   prompt even if it remains visible in a stale client view.

Venice documents its private API path as no-retention processing. Matterhorn's
provider policy therefore reports no training and zero-day prompt retention for
the admitted model set. This does not weaken Matterhorn's own deterministic
secret detector: seed phrases, private keys, provider credentials, wallet
exports, and raw signatures remain non-consentable and are blocked before
usage reservation or provider contact.

## User flow

- `Private` appears next to the model selector only when the verified Venice
  provider is connected.
- Turning it on selects the backend's preferred admitted private model and
  sends `privacyMode: private_workspace` through the authoritative message
  gateway.
- The choice is stored only for the active workspace chat. Other chats keep
  their own model; an explicit fork inherits the source choice, and deleting
  the chat removes it. The user's default for new chats is not silently
  replaced.
- Turning it off restores the last connected non-Venice model, or opens the
  model picker when no standard model is available.
- Selecting a Venice model directly also activates the private request mode.
- The disclosure above the composer states where the request is processed and
  links to the existing privacy details screen.

## Operator verification

Keep the key in the Railway service secret manager, restart the backend, then
verify the model catalog and a single authenticated chat. Do not print the key
or include environment dumps in acceptance evidence.

The release remains fail closed when:

- Venice catalog discovery times out or returns a non-2xx response.
- DNS, TLS peer, origin, response type, response size, or freshness checks fail.
- The catalog contains no eligible private, tool-capable text model.
- A request names an anonymized, retired, offline, or otherwise unregistered
  Venice model.
- The request contains secret material.

### Hosted acceptance

The code-level privacy and rendering tests do not prove that an exact deployed
candidate is correctly wired to Venice. Create a non-passing owner-only packet
for the immutable frontend/backend commit:

```bash
pnpm template:venice-private-acceptance -- \
  --expected-commit <full-40-character-candidate-sha> \
  --app-url https://candidate.example/workspace/example/session \
  --output /absolute/path/to/venice-private-acceptance.json
```

After testing with two real accounts, replace each pending outcome and report
hash only from reviewed, redacted evidence. Then evaluate it:

```bash
pnpm gate:venice-private-acceptance -- \
  --input /absolute/path/to/venice-private-acceptance.json \
  --expected-commit <full-40-character-candidate-sha> \
  --strict \
  --json
```

The verifier requires matching frontend and backend commits, a current exact
Venice model proof, every visible and keyboard state of the Private control,
`private_workspace` dispatch, zero-retention receipt reconciliation, expired
and substituted-model denials, zero provider calls and zero usage for a secret
block, reload behavior, and cross-account isolation. Provider, UI, and request
reports must be separate content-addressed files. They may contain bounded
outcomes and public model/policy metadata, but not prompts, messages, account
identity, credentials, signatures, private wallet data, or unrestricted tool
output.

This companion verifier is additive. It does not change the Phase 1–5 v2
acceptance schema, enable Venice, alter guarded-runtime mode, or contact a
provider. Integrating signed acceptance reports into the strict release gate
remains a separate owner-approved migration.

Primary provider references:

- <https://docs.venice.ai/overview/about-venice>
- <https://docs.venice.ai/api-reference/endpoint/models/list>
- <https://docs.venice.ai/api-reference/endpoint/chat/completions>
