# Matterhorn Desks Wednesday Controlled Beta Distribution

Release date: 2026-07-15

Audience: named internal testers only.

This is a local, non-custodial beta. It is not a public macOS release and must
not be reposted, mirrored, or attached to a public release page.

## What Testers Can Use

- local projects, chat, and protocol desks;
- Bittensor public research and unsigned external-signer previews;
- Hyperliquid and Polymarket research and unsigned handoffs;
- Sui questions, public reads, and unsigned wallet handoffs;
- Longevity educational workflows;
- Notes, review-first Memory, Outputs, Project history, Settings, and MCP
  configuration;
- local Generated Media test surfaces where the configured entitlement allows
  them.

## What Is Not Included

- live charging or paid entitlement activation;
- production image generation, Walrus upload, Sui minting, or marketplace
  listing;
- Matterhorn Cloud, cross-device sync, or shared Cloud workers;
- Hyperliquid or Polymarket order submission;
- custody, seed phrases, private keys, raw signatures, signed payload storage,
  or automatic transaction broadcast;
- public, signed, notarized, or auto-updating macOS distribution.

The Bittensor desk is ready for limited test-customer QA, but its current public
network data comes from curated fallback. Testers must not present fallback
rows as live validator or live provider evidence.

## Wallet Status

MetaMask, Coinbase Wallet, Wallet Standard, and Phantom Sui integration paths
are covered by automated safety and contract tests. Real-device acceptance was
not completed because the required Chrome control extension was unavailable.
Treat wallet connection as experimental. Never enter or paste a seed phrase,
private key, mnemonic, raw signature, signed payload, or wallet export into
Matterhorn Desks.

## Install And Verify

1. Obtain the artifact only from the Matterhorn release operator.
2. Confirm the artifact directory and SHA-256 values below.
3. Verify the downloaded files before opening them:

   ```sh
   shasum -a 256 Matterhorn.Work-*.dmg Matterhorn.Work-*.zip
   hdiutil verify Matterhorn.Work-*.dmg
   unzip -t Matterhorn.Work-*.zip
   ```

4. Expect macOS to warn that this internal build is unsigned and unnotarized.
   Do not bypass that warning unless you are a named tester who explicitly
   accepted this limitation.
5. Start the local Matterhorn backend and app using the launch operator's
   authenticated setup. Do not share credentials or include them in screenshots
   or bug reports.

Final release record:

- frozen source candidate: `19ca5c5d`;
- evidence-ledger release ref: `v0.13.13-beta.1`;
- artifact directory:
  `/Users/abhinavramesh/Desktop/matterhorn-work-controlled-beta-19ca5c5d`;
- DMG: `Matterhorn-Work-19ca5c5d-arm64-unsigned.dmg`;
- DMG SHA-256:
  `4f168ca1221f65dc21e97371f5cb65664205fff012a7c600c4b6f3d41e4c06f6`;
- ZIP: `Matterhorn-Work-19ca5c5d-arm64-unsigned.zip`;
- ZIP SHA-256:
  `61a27cb71208ab8636af9c87918f06bee792ea699535d004870d87cac37570a3`.

Canonical local app after launch cutover:
`http://127.0.0.1:5190/workspace/ws_18dc91c9102a/session`.

The URL is already connected to the local authenticated stack on the release
operator's machine. Credentials are intentionally omitted from this document.

## Testing Checklist

- create or open a project;
- start a normal chat and confirm a complete response;
- open each desk and verify the task starts or asks the required question;
- create and reopen a note;
- inspect Memory without saving a suggestion automatically;
- open an Output and verify long identifiers wrap or truncate cleanly;
- reload the direct session URL;
- verify unavailable Billing, Cloud, media, execution, and wallet states are
  labeled truthfully;
- reject any wallet request that is unexpected, on the wrong network, or asks
  for a secret.

## Reporting And Rollback

Bug reports should include the app version, operating system, route, expected
result, actual result, and a redacted screenshot. Never attach credentials,
wallet secrets, signatures, signed payloads, or unredacted support exports.

For a P0 or P1 issue, stop testing, quit the app, stop the local backend, and
notify the release operator. The rollback is to the previously verified local
build; do not use auto-update or replace the canonical artifact without new
hashes and a fresh verification record.
