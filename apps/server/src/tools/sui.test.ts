import { describe, expect, test } from "bun:test";

import {
  SUI_NATIVE_COIN_TYPE,
  SuiInputError,
  SuiPublicReadProvider,
  buildSuiAccountCard,
  findForbiddenSuiCredentialInput,
  formatMistToSui,
  normalizeMatterhornSuiAddress,
  normalizeMatterhornSuiNetwork,
  type SuiNetwork,
  type SuiReadClient,
} from "./sui.js";

const SHORT_ADDRESS = "0x2";
const NORMALIZED_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000002";
const NOW = new Date("2026-07-06T00:00:00.000Z");

function mockProvider() {
  const calls: Array<{ network: SuiNetwork; input: Parameters<SuiReadClient["getBalance"]>[0] }> = [];
  const provider = new SuiPublicReadProvider({
    now: () => NOW,
    clientFactory: (network) => ({
      async getBalance(input) {
        calls.push({ network, input });
        return {
          balance: {
            coinType: input.coinType ?? SUI_NATIVE_COIN_TYPE,
            balance: "1234567890",
            coinBalance: "1234560000",
            addressBalance: "7890",
          },
        };
      },
    }),
  });
  return { provider, calls };
}

describe("Sui public read provider", () => {
  test("normalizes public Sui addresses before validation", () => {
    expect(normalizeMatterhornSuiAddress(SHORT_ADDRESS)).toBe(NORMALIZED_ADDRESS);
    expect(() => normalizeMatterhornSuiAddress("not-a-sui-address")).toThrow(SuiInputError);
  });

  test("normalizes supported Sui network names", () => {
    expect(normalizeMatterhornSuiNetwork(null)).toBe("testnet");
    expect(normalizeMatterhornSuiNetwork("sui-testnet")).toBe("testnet");
    expect(normalizeMatterhornSuiNetwork("mainnet")).toBe("mainnet");
    expect(() => normalizeMatterhornSuiNetwork("devnet")).toThrow(SuiInputError);
  });

  test("rejects secret-shaped Sui inputs", () => {
    expect(findForbiddenSuiCredentialInput({ nested: { privateKey: "nope" } })).toBe("nested.privateKey");
    expect(findForbiddenSuiCredentialInput({ message: "Use this seed phrase to sign: never never never" })).toBe("message");
    expect(findForbiddenSuiCredentialInput({ address: SHORT_ADDRESS })).toBeNull();
    expect(() => normalizeMatterhornSuiAddress("seed phrase: fake words for signing")).toThrow(SuiInputError);
  });

  test("formats MIST balances as SUI without floating point drift", () => {
    expect(formatMistToSui("0")).toBe("0");
    expect(formatMistToSui("1000000000")).toBe("1");
    expect(formatMistToSui("1234567890")).toBe("1.23456789");
    expect(formatMistToSui("10")).toBe("0.00000001");
  });

  test("reads balances through an injectable read-only client", async () => {
    const { provider, calls } = mockProvider();

    const balance = await provider.getBalance(SHORT_ADDRESS, { network: "sui-mainnet" });

    expect(balance).toMatchObject({
      version: "matterhorn.sui.balance.v1",
      address: NORMALIZED_ADDRESS,
      network: "mainnet",
      coinType: SUI_NATIVE_COIN_TYPE,
      balanceMist: "1234567890",
      balanceSui: "1.23456789",
      custody: false,
      canSubmit: false,
      source: {
        source: "sui.grpc",
        network: "mainnet",
        fetchedAt: NOW.toISOString(),
      },
    });
    expect(calls).toEqual([{
      network: "mainnet",
      input: {
        owner: NORMALIZED_ADDRESS,
        coinType: SUI_NATIVE_COIN_TYPE,
        signal: undefined,
      },
    }]);
  });

  test("builds non-custodial account cards without signing material", async () => {
    const { provider } = mockProvider();

    const account = await provider.getAccountSnapshot(SHORT_ADDRESS);
    const card = buildSuiAccountCard(account);
    const serialized = JSON.stringify({ account, card });

    expect(account).toMatchObject({
      version: "matterhorn.sui.account.v1",
      custody: false,
      canSubmit: false,
      signerPolicy: "client_wallet_required",
      safety: {
        publicReadOnly: true,
        signingInMatterhorn: false,
        secretsAccepted: false,
      },
    });
    expect(card.kind).toBe("sui_account_snapshot");
    expect(card.items.map((item) => item.label)).toContain("Custody");
    expect(serialized).not.toMatch(/private[_\s-]?key|seed[_\s-]?phrase|mnemonic|wallet export|raw signature|signed payload/i);
  });
});
