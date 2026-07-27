import { describe, expect, it } from "bun:test";

import {
  BITTENSOR_TRANSFER_CONFIRMATION,
  createBittensorTransferPreview,
  listBittensorExtensionAccounts,
  submitBittensorTransfer,
  taoToRao,
  type BittensorExecutionDependencies,
} from "../src/react-app/domains/wallet/bittensor-execution";

const sender = "5SenderPublicSs58Address";
const destination = "5DestinationPublicSs58Address";

function fakeDependencies(options: { reject?: boolean } = {}): BittensorExecutionDependencies {
  return {
    now: () => new Date("2026-07-26T10:00:00.000Z"),
    timeoutMs: 100,
    extension: {
      enable: async () => [{}],
      accounts: async () => [{ address: sender, meta: { name: "Coldkey", source: "talisman" } }],
      injectorFor: async () => ({ signer: { signPayload: () => undefined } }),
    },
    createApi: async () => ({
      submitTransfer: async (_destination, _amountRao, _sender, _signer, onResult) => {
        queueMicrotask(() => {
          if (options.reject) {
            onResult({
              dispatchError: { toString: () => "Balances.InsufficientBalance" },
              status: { isFinalized: false },
            });
            return;
          }
          onResult({
            status: {
              isFinalized: true,
              asFinalized: { toHex: () => "0xblock" },
            },
            txHash: { toHex: () => "0xtx" },
          });
        });
        return () => undefined;
      },
      disconnect: async () => undefined,
    }),
  };
}

describe("Bittensor connected-wallet execution", () => {
  it("converts TAO to integer RAO without floating-point loss", () => {
    expect(taoToRao("1")).toBe(1_000_000_000n);
    expect(taoToRao("0.000000001")).toBe(1n);
    expect(taoToRao("12.345678901")).toBe(12_345_678_901n);
    expect(() => taoToRao("1.0000000001")).toThrow();
    expect(() => taoToRao("0")).toThrow();
  });

  it("lists only public extension account metadata", async () => {
    const accounts = await listBittensorExtensionAccounts(fakeDependencies());
    expect(accounts).toEqual([{ address: sender, name: "Coldkey", source: "talisman" }]);
    expect(JSON.stringify(accounts)).not.toMatch(/seed|private|signature/i);
  });

  it("requires exact review confirmation before submitting", async () => {
    const preview = createBittensorTransferPreview({
      sender,
      destination,
      amountTao: "0.25",
    });
    await expect(submitBittensorTransfer({
      preview,
      confirmation: "submit",
      dependencies: fakeDependencies(),
    })).rejects.toThrow(BITTENSOR_TRANSFER_CONFIRMATION);
  });

  it("submits exact reviewed terms and returns public evidence only", async () => {
    const preview = createBittensorTransferPreview({
      sender,
      destination,
      amountTao: "0.25",
    });
    const receipt = await submitBittensorTransfer({
      preview,
      confirmation: BITTENSOR_TRANSFER_CONFIRMATION,
      dependencies: fakeDependencies(),
    });
    expect(receipt).toEqual({
      status: "submitted",
      network: "finney",
      action: "transfer",
      signerAddress: sender,
      destination,
      amountTao: "0.25",
      txHash: "0xtx",
      blockHash: "0xblock",
      submittedAt: "2026-07-26T10:00:00.000Z",
    });
    expect(JSON.stringify(receipt)).not.toMatch(/seed|private|signature|signedPayload/i);
  });

  it("surfaces chain rejection without fabricating a receipt", async () => {
    const preview = createBittensorTransferPreview({
      sender,
      destination,
      amountTao: "0.25",
    });
    await expect(submitBittensorTransfer({
      preview,
      confirmation: BITTENSOR_TRANSFER_CONFIRMATION,
      dependencies: fakeDependencies({ reject: true }),
    })).rejects.toThrow("InsufficientBalance");
  });
});
