# Certified OpenAPI action profile

Matterhorn does not import or execute arbitrary OpenAPI documents. Certified apps may use the signed `matterhorn.openapi-action.v1` profile, which binds every manifest action to one exact HTTPS `POST` path.

## Signed boundary

The publisher signature covers:

- the adapter HTTPS origin;
- the profile version;
- every action ID;
- exactly one static `POST` path for every action;
- the closed input and output schemas, networks, scopes, timing, freshness, and wallet-only authority fields.

Paths are absolute, bounded, query-free, fragment-free, and cannot contain traversal segments. The endpoint must be an origin, so joining a signed path cannot inherit or replace an unsigned base path.

Legacy `openapi` manifests without the signed profile remain parseable for compatibility, but conformance rejects them and the runtime refuses to execute them.

## Runtime boundary

After tenant, connection, action, network, schema, quota, circuit, and single-use capability checks pass, the server sends one JSON body to the exact signed path. Credentials are resolved only after the operation binding is validated and remain in bounded server-side HTTPS headers.

The response must contain only Matterhorn's closed evidence envelope:

```json
{
  "data": {},
  "source": "bounded source label",
  "observedAt": "2026-09-05T12:00:00.000Z",
  "blockOrVersion": "checkpoint-or-version"
}
```

Dynamic documents, `$ref` fetching, server lists, callbacks, webhooks, links, redirects, caller-selected methods or paths, query parameters, upstream cost claims, signing, relay, and submission are excluded.
