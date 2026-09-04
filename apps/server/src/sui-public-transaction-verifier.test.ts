import { describe, expect, test } from "bun:test";

import {
  createPinnedSuiPublicTransactionVerifier,
  type MatterhornSuiPublicTransactionProjection,
} from "./sui-public-transaction-verifier.js";

const ENDPOINT = new URL("https://fullnode.testnet.sui.io:443");
const PEER = "8.8.8.8";
const DIGEST = "3".repeat(44);
const SIGNER = `0x${"1".repeat(64)}`;
const RECIPIENT = `0x${"2".repeat(64)}`;
const NATIVE = "0x2::sui::SUI";

function u64(value: bigint): string {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes.toString("base64");
}

function address(value: string): string {
  return Buffer.from(value.slice(2), "hex").toString("base64");
}

function projection(overrides: Partial<MatterhornSuiPublicTransactionProjection> = {}): MatterhornSuiPublicTransactionProjection {
  return {
    digest: DIGEST,
    success: true,
    error: null,
    sender: SIGNER,
    gasOwner: SIGNER,
    inputs: [
      { $kind: "Pure", Pure: { bytes: u64(1_000_000_000n) } },
      { $kind: "Pure", Pure: { bytes: address(RECIPIENT) } },
    ],
    commands: [
      {
        $kind: "SplitCoins",
        SplitCoins: {
          coin: { $kind: "GasCoin", GasCoin: true },
          amounts: [{ $kind: "Input", Input: 0 }],
        },
      },
      {
        $kind: "TransferObjects",
        TransferObjects: {
          objects: [{ $kind: "Result", Result: 0 }],
          address: { $kind: "Input", Input: 1 },
        },
      },
    ],
    balanceChanges: [
      { coinType: NATIVE, address: RECIPIENT, amount: "1000000000" },
      { coinType: NATIVE, address: SIGNER, amount: "-1001000000" },
    ],
    epoch: "912",
    ...overrides,
  };
}

function verifier(value: MatterhornSuiPublicTransactionProjection = projection()) {
  const calls: unknown[] = [];
  return {
    calls,
    verify: createPinnedSuiPublicTransactionVerifier({
      endpoint: ENDPOINT,
      resolver: async () => [{ address: PEER, family: 4 }],
      now: () => new Date("2026-09-01T10:00:00.000Z"),
      createClient: (input) => ({
        async getTransaction(request) {
          calls.push({ input, request });
          return structuredClone(value);
        },
      }),
    }),
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    network: "sui:testnet" as const,
    digest: DIGEST,
    signer: SIGNER,
    operation: "transfer_sui" as const,
    recipient: RECIPIENT,
    amountSui: "1",
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("pinned Sui public transaction verifier", () => {
  test("verifies the exact wallet-submitted native transfer through a pinned read client", async () => {
    const fixture = verifier();
    await expect(fixture.verify(request())).resolves.toEqual({
      network: "sui:testnet",
      digest: DIGEST,
      status: "confirmed",
      signer: SIGNER,
      recipient: RECIPIENT,
      amountMist: "1000000000",
      epoch: "912",
      source: "sui.grpc",
      observedAt: "2026-09-01T10:00:00.000Z",
    });
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.calls[0]).toMatchObject({
      input: {
        endpoint: ENDPOINT,
        approvedAddresses: [PEER],
      },
      request: { digest: DIGEST },
    });
  });

  test("accepts a chain-confirmed failure only after the immutable transaction terms match", async () => {
    const fixture = verifier(projection({ success: false, error: "insufficient gas", balanceChanges: [] }));
    await expect(fixture.verify(request())).resolves.toMatchObject({ status: "failed", digest: DIGEST });
  });

  test("returns stable not-found and lookup-failed errors without leaking provider details", async () => {
    for (const [message, code] of [
      [`Transaction ${DIGEST} not found`, "sui_public_transaction_not_found"],
      ["upstream credentials=must-not-leak", "sui_public_transaction_lookup_failed"],
    ] as const) {
      const verify = createPinnedSuiPublicTransactionVerifier({
        endpoint: ENDPOINT,
        resolver: async () => [{ address: PEER, family: 4 }],
        createClient: () => ({
          async getTransaction() { throw new Error(message); },
        }),
      });
      await expect(verify(request())).rejects.toThrow(code);
      await expect(verify(request())).rejects.not.toThrow("must-not-leak");
    }
  });

  test("rejects digest, sender, gas owner, recipient, amount and hidden-command mutation", async () => {
    for (const [candidate, code] of [
      [projection({ digest: "4".repeat(44) }), "sui_public_transaction_digest_mismatch"],
      [projection({ sender: `0x${"4".repeat(64)}` }), "sui_public_transaction_sender_mismatch"],
      [projection({ gasOwner: `0x${"4".repeat(64)}` }), "sui_public_transaction_gas_owner_mismatch"],
      [projection({ gasOwner: null }), "sui_public_transaction_gas_owner_mismatch"],
      [projection({ inputs: [
        { $kind: "Pure", Pure: { bytes: u64(2_000_000_000n) } },
        { $kind: "Pure", Pure: { bytes: address(RECIPIENT) } },
      ] }), "sui_public_transaction_amount_mismatch"],
      [projection({ inputs: [
        { $kind: "Pure", Pure: { bytes: u64(1_000_000_000n) } },
        { $kind: "Pure", Pure: { bytes: address(`0x${"5".repeat(64)}`) } },
      ] }), "sui_public_transaction_recipient_mismatch"],
      [projection({ commands: [
        ...projection().commands,
        { $kind: "MoveCall", MoveCall: { package: "0x2", module: "coin", function: "burn" } },
      ] }), "sui_public_transaction_commands_mismatch"],
      [projection({ commands: [
        {
          ...projection().commands[0],
          MoveCall: { package: "0x2", module: "coin", function: "burn" },
        },
        projection().commands[1]!,
      ] }), "sui_public_transaction_commands_mismatch"],
      [projection({ commands: [
        projection().commands[0]!,
        {
          ...projection().commands[1],
          MergeCoins: { destination: { $kind: "GasCoin", GasCoin: true }, sources: [] },
        },
      ] }), "sui_public_transaction_commands_mismatch"],
      [projection({ commands: [
        {
          $kind: "SplitCoins",
          SplitCoins: {
            coin: { $kind: "GasCoin", GasCoin: true, Input: 0 },
            amounts: [{ $kind: "Input", Input: 0 }],
          },
        },
        projection().commands[1]!,
      ] }), "sui_public_transaction_commands_mismatch"],
    ] as const) {
      await expect(verifier(candidate).verify(request())).rejects.toThrow(code);
    }
  });

  test("rejects malformed digests and non-canonical or missing chain epochs before promotion", async () => {
    const fixture = verifier();
    await expect(fixture.verify(request({ digest: "3".repeat(32) })))
      .rejects.toThrow("sui_public_transaction_digest_invalid");
    expect(fixture.calls).toHaveLength(0);

    for (const epoch of [null, "01", "18446744073709551616", "epoch-912"]) {
      await expect(verifier(projection({ epoch })).verify(request()))
        .rejects.toThrow("sui_public_transaction_epoch_invalid");
    }
  });

  test("rejects unexplained balance changes, mainnet, self transfers and abort before network access", async () => {
    await expect(verifier(projection({ balanceChanges: [
      ...projection().balanceChanges,
      { coinType: NATIVE, address: `0x${"6".repeat(64)}`, amount: "1" },
    ] })).verify(request())).rejects.toThrow("sui_public_transaction_balance_mismatch");
    await expect(verifier().verify(request({ network: "sui:mainnet" }) as never))
      .rejects.toThrow("sui_public_transaction_mainnet_disabled");
    await expect(verifier().verify(request({ recipient: SIGNER })))
      .rejects.toThrow("sui_public_transaction_self_transfer_unsupported");
    const aborted = new AbortController();
    aborted.abort();
    const fixture = verifier();
    await expect(fixture.verify(request({ signal: aborted.signal })))
      .rejects.toThrow("sui_public_transaction_aborted");
    expect(fixture.calls).toHaveLength(0);
  });
});
