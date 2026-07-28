export const BITTENSOR_FINNEY_RPC_URL =
  import.meta.env.VITE_BITTENSOR_RPC_URL?.trim() ||
  "wss://entrypoint-finney.opentensor.ai:443";

export const BITTENSOR_TRANSFER_CONFIRMATION = "SUBMIT BITTENSOR TRANSFER";
export const RAO_PER_TAO = 1_000_000_000n;

export type BittensorExtensionAccount = {
  address: string;
  name: string;
  source: string;
};

export type BittensorTransferPreview = {
  action: "transfer";
  network: "finney";
  sender: string;
  destination: string;
  amountTao: string;
  amountRao: string;
  feeTao: number | null;
  consequenceSummary: string;
  warnings: string[];
  confirmation: {
    required: true;
    phrase: typeof BITTENSOR_TRANSFER_CONFIRMATION;
  };
};

export type BittensorPublicReceipt = {
  status: "submitted";
  network: "finney";
  action: "transfer";
  signerAddress: string;
  destination: string;
  amountTao: string;
  txHash: string;
  blockHash: string;
  submittedAt: string;
};

type ExtensionAccountLike = {
  address: string;
  meta?: {
    name?: string;
    source?: string;
  };
};

type ExtensionDappAdapter = {
  enable: (appName: string) => Promise<unknown[]>;
  accounts: () => Promise<ExtensionAccountLike[]>;
  injectorFor: (address: string) => Promise<{ signer: unknown }>;
};

type SubmissionResultLike = {
  dispatchError?: {
    toString: () => string;
  } | null;
  status: {
    isFinalized: boolean;
    isInvalid?: boolean;
    isDropped?: boolean;
    isUsurped?: boolean;
    asFinalized?: { toHex: () => string };
    type?: string;
  };
  txHash?: { toHex: () => string };
};

type BittensorApiAdapter = {
  submitTransfer: (
    destination: string,
    amountRao: bigint,
    sender: string,
    signer: unknown,
    onResult: (result: SubmissionResultLike) => void,
  ) => Promise<() => void>;
  disconnect: () => Promise<void>;
};

export type BittensorExecutionDependencies = {
  extension?: ExtensionDappAdapter;
  createApi?: (rpcUrl: string) => Promise<BittensorApiAdapter>;
  now?: () => Date;
  timeoutMs?: number;
};

function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

export function taoToRao(value: string): bigint {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(normalized)) {
    throw new Error("TAO amount must be a positive number with no more than 9 decimal places.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const rao = BigInt(whole) * RAO_PER_TAO + BigInt(fraction.padEnd(9, "0"));
  if (rao <= 0n) throw new Error("TAO amount must be greater than zero.");
  return rao;
}

export function createBittensorTransferPreview(input: {
  sender: string;
  destination: string;
  amountTao: string;
  feeTao?: number | null;
  warnings?: string[];
}): BittensorTransferPreview {
  const sender = requireText(input.sender, "Sender");
  const destination = requireText(input.destination, "Destination");
  if (sender === destination) throw new Error("Sender and destination must be different.");
  const amountRao = taoToRao(input.amountTao);
  const amountTao = input.amountTao.trim();

  return {
    action: "transfer",
    network: "finney",
    sender,
    destination,
    amountTao,
    amountRao: amountRao.toString(),
    feeTao: input.feeTao ?? null,
    consequenceSummary: `This transfers ${amountTao} TAO from ${sender} to ${destination} on Bittensor Finney.`,
    warnings: [
      ...(input.warnings ?? []),
      "Your Bittensor wallet will show the final chain-native call before signing.",
      "This transaction cannot be reversed after it is finalized.",
    ],
    confirmation: {
      required: true,
      phrase: BITTENSOR_TRANSFER_CONFIRMATION,
    },
  };
}

async function defaultExtension(): Promise<ExtensionDappAdapter> {
  const extension = await import("@polkadot/extension-dapp");
  return {
    enable: extension.web3Enable,
    accounts: extension.web3Accounts,
    injectorFor: extension.web3FromAddress,
  };
}

async function defaultApi(rpcUrl: string): Promise<BittensorApiAdapter> {
  const { ApiPromise, WsProvider } = await import("@polkadot/api");
  const provider = new WsProvider(rpcUrl);
  const api = await ApiPromise.create({ provider });
  return {
    submitTransfer: async (destination, amountRao, sender, signer, onResult) => {
      const transfer = api.tx.balances.transferKeepAlive(destination, amountRao);
      return transfer.signAndSend(sender, { signer: signer as never }, onResult as never);
    },
    disconnect: async () => {
      await api.disconnect();
    },
  };
}

export async function listBittensorExtensionAccounts(
  dependencies: BittensorExecutionDependencies = {},
): Promise<BittensorExtensionAccount[]> {
  const extension = dependencies.extension ?? await defaultExtension();
  const enabled = await extension.enable("Matterhorn Desks");
  if (!enabled.length) {
    throw new Error("No Bittensor wallet extension authorized Matterhorn Desks.");
  }
  const accounts = await extension.accounts();
  return accounts.map((account) => ({
    address: account.address,
    name: account.meta?.name?.trim() || "Bittensor account",
    source: account.meta?.source?.trim() || "wallet extension",
  }));
}

export async function submitBittensorTransfer(input: {
  preview: BittensorTransferPreview;
  confirmation: string;
  rpcUrl?: string;
  dependencies?: BittensorExecutionDependencies;
}): Promise<BittensorPublicReceipt> {
  if (input.confirmation.trim() !== BITTENSOR_TRANSFER_CONFIRMATION) {
    throw new Error(`Type ${BITTENSOR_TRANSFER_CONFIRMATION} to submit this transfer.`);
  }
  const preview = createBittensorTransferPreview(input.preview);
  if (
    preview.sender !== input.preview.sender ||
    preview.destination !== input.preview.destination ||
    preview.amountRao !== input.preview.amountRao
  ) {
    throw new Error("The reviewed Bittensor transfer terms changed. Prepare it again.");
  }

  const dependencies = input.dependencies ?? {};
  const extension = dependencies.extension ?? await defaultExtension();
  const enabled = await extension.enable("Matterhorn Desks");
  if (!enabled.length) throw new Error("Authorize a Bittensor wallet extension before submitting.");
  const accounts = await extension.accounts();
  if (!accounts.some((account) => account.address === preview.sender)) {
    throw new Error("The reviewed sender is no longer available in the connected wallet.");
  }

  const injector = await extension.injectorFor(preview.sender);
  const api = await (dependencies.createApi ?? defaultApi)(
    input.rpcUrl?.trim() || BITTENSOR_FINNEY_RPC_URL,
  );
  const timeoutMs = dependencies.timeoutMs ?? 120_000;
  const subscription: { stop: (() => void) | null } = { stop: null };

  try {
    const receipt = await new Promise<BittensorPublicReceipt>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback();
      };
      const timeout = setTimeout(() => {
        finish(() => reject(new Error("Bittensor submission timed out before finalization.")));
      }, timeoutMs);

      void api.submitTransfer(
        preview.destination,
        BigInt(preview.amountRao),
        preview.sender,
        injector.signer,
        (result) => {
          if (result.dispatchError) {
            finish(() => reject(new Error(`Bittensor rejected the transfer: ${result.dispatchError?.toString()}`)));
            return;
          }
          if (result.status.isInvalid || result.status.isDropped || result.status.isUsurped) {
            finish(() => reject(new Error(`Bittensor submission ${result.status.type?.toLowerCase() || "failed"}.`)));
            return;
          }
          if (!result.status.isFinalized) return;
          const txHash = result.txHash?.toHex();
          const blockHash = result.status.asFinalized?.toHex();
          if (!txHash || !blockHash) {
            finish(() => reject(new Error("Bittensor finalized without public transaction evidence.")));
            return;
          }
          finish(() => resolve({
            status: "submitted",
            network: "finney",
            action: "transfer",
            signerAddress: preview.sender,
            destination: preview.destination,
            amountTao: preview.amountTao,
            txHash,
            blockHash,
            submittedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
          }));
        },
      ).then((stop) => {
        subscription.stop = stop;
      }).catch((error: unknown) => {
        finish(() => reject(error instanceof Error ? error : new Error("Bittensor wallet submission failed.")));
      });
    });
    return receipt;
  } finally {
    subscription.stop?.();
    await api.disconnect();
  }
}
