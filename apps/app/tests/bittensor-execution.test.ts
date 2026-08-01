import { describe, expect, it } from "bun:test";

import {
  BITTENSOR_STAKE_CONFIRMATION,
  BITTENSOR_TRANSFER_CONFIRMATION,
  BITTENSOR_UNSTAKE_CONFIRMATION,
  createBittensorStakePreview,
  createBittensorTransferPreview,
  listBittensorExtensionAccounts,
  submitBittensorTransfer,
  submitBittensorWalletAction,
  taoToRao,
  type BittensorExecutionDependencies,
} from "../src/react-app/domains/wallet/bittensor-execution";

const sender = "5SenderPublicSs58Address";
const destination = "5DestinationPublicSs58Address";

function fakeDependencies(options: { reject?: boolean; onPreview?: (preview: unknown) => void } = {}): BittensorExecutionDependencies {
  return {
    now: () => new Date("2026-07-26T10:00:00.000Z"),
    timeoutMs: 100,
    extension: {
      enable: async () => [{}],
      accounts: async () => [{ address: sender, meta: { name: "Coldkey", source: "talisman" } }],
      injectorFor: async () => ({ signer: { signPayload: () => undefined } }),
    },
    createApi: async () => ({
      submitAction: async (preview, _sender, _signer, onResult) => {
        options.onPreview?.(preview);
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
      hotkey: null,
      netuid: null,
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

  it("submits exact reviewed stake and unstake calls through the connected wallet", async () => {
    const submitted: unknown[] = [];
    const dependencies = fakeDependencies({ onPreview: (preview) => submitted.push(preview) });
    const stake = createBittensorStakePreview({
      action: "stake",
      sender,
      hotkey: destination,
      netuid: 14,
      amountTao: "1.5",
    });
    const stakeReceipt = await submitBittensorWalletAction({
      preview: stake,
      confirmation: BITTENSOR_STAKE_CONFIRMATION,
      dependencies,
    });
    expect(stakeReceipt).toMatchObject({
      action: "stake",
      signerAddress: sender,
      hotkey: destination,
      netuid: 14,
      destination: null,
      amountTao: "1.5",
    });

    const unstake = createBittensorStakePreview({
      action: "unstake",
      sender,
      hotkey: destination,
      netuid: 14,
      amountTao: "0.5",
    });
    await expect(submitBittensorWalletAction({
      preview: unstake,
      confirmation: BITTENSOR_UNSTAKE_CONFIRMATION,
      dependencies,
    })).resolves.toMatchObject({ action: "unstake", netuid: 14 });
    expect(submitted).toEqual([stake, unstake]);
  });

  it("rejects changed staking terms and the wrong operation confirmation", async () => {
    const preview = createBittensorStakePreview({
      action: "stake",
      sender,
      hotkey: destination,
      netuid: 14,
      amountTao: "1",
    });
    await expect(submitBittensorWalletAction({
      preview,
      confirmation: BITTENSOR_TRANSFER_CONFIRMATION,
      dependencies: fakeDependencies(),
    })).rejects.toThrow(BITTENSOR_STAKE_CONFIRMATION);

    await expect(submitBittensorWalletAction({
      preview: { ...preview, amountRao: "2000000000" },
      confirmation: BITTENSOR_STAKE_CONFIRMATION,
      dependencies: fakeDependencies(),
    })).rejects.toThrow("terms changed");
  });
});
