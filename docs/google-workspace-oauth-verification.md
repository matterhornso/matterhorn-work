# Matterhorn Desks Google Workspace OAuth Launch Gate

Google Workspace is **not a public-beta capability until every item in this
runbook has current production evidence**. Keep it out of
`VITE_MATTERHORN_PUBLIC_OAUTH_CONNECTORS` while any value is missing or any test
is incomplete. The product must show the connector as `Coming soon`, not as a
working connection.

## Owner-Supplied Consent Identity

Create or update a Google Cloud project whose visible consent-screen identity
matches the released product:

| Field | Required value |
|---|---|
| Product name | `Matterhorn Desks` |
| Support email | A monitored `@matterhorn.work` address |
| Homepage | The reviewed production HTTPS origin |
| Privacy policy | `<production-origin>/privacy` |
| Terms | `<production-origin>/terms` |
| Authorized domain | The verified Matterhorn production domain |
| Desktop OAuth client | A Matterhorn-owned Desktop client from this project |

Do not reuse a client whose consent screen presents another product or company.
Record project and client identifiers in the deployment secret manager and
private acceptance report, not in this public runbook.

Configure the reviewed project through the canonical server-side variables:

```text
MATTERHORN_GOOGLE_WORKSPACE_OAUTH_CLIENT_ID
MATTERHORN_GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET
MATTERHORN_GOOGLE_WORKSPACE_TOKEN_BROKER_URL
```

Older installations can still migrate from their previous internal variable
names, but those compatibility keys must never appear in public UI, consent
copy, support copy, screenshots, or launch collateral.

## Requested Phase 1 Scopes

```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/gmail.compose
```

### Identity

`openid`, `userinfo.email`, and `userinfo.profile` identify the connected
Google account and let the user verify that they chose the intended account.

### Calendar

`calendar.readonly` reads upcoming event context only when the user requests
meeting preparation. It does not create, edit, or delete calendar events.

### Drive

`drive.file` limits access to files selected, opened, or created through
Matterhorn Desks. Phase 1 does not request broad Drive read access.

### Gmail

`gmail.compose` creates a draft for the user to review in Gmail. Matterhorn
Desks does not expose automatic email sending in Phase 1.

## Data Use

Matterhorn Desks uses Google Workspace data only for a user-requested action,
such as reading calendar context, reading an explicitly selected Drive file, or
creating a Gmail draft. It does not sell Google user data, use it for
advertising, or use it to train generalized AI models.

Desktop access and refresh tokens must use protected operating-system storage.
They must never be committed, logged, included in QA evidence, placed in a
browser bundle, or passed in a command-line argument.

## Deployment Modes

### Local-first desktop

The desktop flow uses PKCE and a loopback redirect. The app exchanges the code
with Google and stores tokens locally in protected operating-system storage.
Desktop client metadata can be extracted from a shipped binary and must not be
treated as a confidential server secret.

### Enterprise token broker

An enterprise deployment can set
`MATTERHORN_GOOGLE_WORKSPACE_TOKEN_BROKER_URL`. The desktop app still owns the
browser authorization flow and PKCE verifier, while the reviewed broker
performs token exchange and refresh. The broker must enforce organization
policy, redact logs, protect refresh tokens, and support revocation.

The broker receives an authorization-code request shaped like:

```json
{
  "provider": "google-workspace",
  "grantType": "authorization_code",
  "clientId": "<matterhorn-desktop-client-id>",
  "code": "<authorization-code>",
  "codeVerifier": "<pkce-verifier>",
  "redirectUri": "http://127.0.0.1:<port>/"
}
```

For refresh:

```json
{
  "provider": "google-workspace",
  "grantType": "refresh_token",
  "clientId": "<matterhorn-desktop-client-id>",
  "refreshToken": "<refresh-token>"
}
```

The broker returns Google's token response shape, including `access_token`,
`expires_in`, optional `refresh_token`, and optional `scope`.

## Required Acceptance

Use a dedicated test account and a production-shaped signed desktop build:

1. Open `Settings -> Extensions -> Google Workspace`.
2. Confirm the UI describes Calendar read, Gmail drafts, and selected Drive
   files without claiming broader access.
3. Select `Connect with Google`.
4. Confirm the consent screen says `Matterhorn Desks`, uses the reviewed domain,
   links to the deployed `/privacy` and `/terms` pages, and shows only the
   accepted scopes.
5. Connect the intended test account and return to Matterhorn Desks.
6. Confirm the exact connected account email is visible.
7. Run the connection test and verify profile plus Calendar read access.
8. Run the scope smoke test. It must create and read a clearly labeled
   Matterhorn Desks Drive smoke-test file and create a clearly labeled Gmail
   draft without sending it.
9. Reload the application and repeat one read action to prove token recovery.
10. Disconnect. Confirm local protected storage is cleared and the token is
    revoked.
11. Attempt a tool call after disconnect and confirm it fails closed without
    leaking token or provider response details.
12. Revoke Matterhorn Desks from the Google account security page and confirm
    the application reports a reconnect action instead of a false healthy
    state.

Capture sanitized evidence for connect, reload, Calendar read, Drive
create/read, Gmail draft, disconnect, revoke, and post-revocation failure.
Never attach tokens, authorization codes, message content, private file
content, or account recovery information.

## Verification and Stop-Ship Rules

- `gmail.compose` can require restricted-scope verification and an additional
  Google security review.
- The production privacy and terms pages must be deployed and owner-approved.
- The support address must be monitored during the launch window.
- The Google consent identity must match Matterhorn Desks exactly.
- The signed build, production redirect, and current scopes must match the
  submitted verification configuration.
- Any failed or missing acceptance step keeps the connector hidden.

Only after all evidence is approved may the exact connector server name be
added to `VITE_MATTERHORN_PUBLIC_OAUTH_CONNECTORS` for a new immutable release
candidate.
