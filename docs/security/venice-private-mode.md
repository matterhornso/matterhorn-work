# Venice private mode

Matterhorn can offer a per-chat `Private` control through a server-owned Venice
provider. The browser never receives the Venice API key and cannot declare a
model private.

## Trust boundary

1. The backend checks for `VENICE_API_KEY` only in its server environment.
2. Before the managed OpenCode runtime starts, Matterhorn fetches Venice's
   public `/api/v1/models` catalog over HTTPS.
3. Matterhorn admits only `text` models whose current metadata says
   `privacy: private`, `offline` is not true, and function calling is enabled.
4. The exact admitted model identifiers are registered in the backend privacy
   firewall and injected into OpenCode's in-memory runtime config.
5. Requests claiming `providerId: venice` with any other model identifier fail
   closed, including when general provider enforcement is in disclosure mode.

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
- The catalog contains no eligible private, tool-capable text model.
- A request names an anonymized, retired, offline, or otherwise unregistered
  Venice model.
- The request contains secret material.

Primary provider references:

- <https://docs.venice.ai/overview/about-venice>
- <https://docs.venice.ai/api-reference/endpoint/models/list>
- <https://docs.venice.ai/api-reference/endpoint/chat/completions>
