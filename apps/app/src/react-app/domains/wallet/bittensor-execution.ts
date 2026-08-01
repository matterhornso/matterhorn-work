export const BITTENSOR_FINNEY_RPC_URL =
  import.meta.env.VITE_BITTENSOR_RPC_URL?.trim() ||
  "wss://entrypoint-finney.opentensor.ai:443";

export const BITTENSOR_TRANSFER_CONFIRMATION = "SUBMIT BITTENSOR TRANSFER";
export const BITTENSOR_STAKE_CONFIRMATION = "SUBMIT BITTENSOR STAKE";
export const BITTENSOR_UNSTAKE_CONFIRMATION = "SUBMIT BITTENSOR UNSTAKE";
export const RAO_PER_TAO = 1_000_000_000n;

export type BittensorWalletAction = "transfer" | "stake" | "unstake";

export const BITTENSOR_ACTION_CONFIRMATIONS = {
  transfer: BITTENSOR_TRANSFER_CONFIRMATION,
  stake: BITTENSOR_STAKE_CONFIRMATION,
  unstake: BITTENSOR_UNSTAKE_CONFIRMATION,
} as const satisfies Record<BittensorWalletAction, string>;

export type BittensorExtensionAccount = {
  address: string;
  name: string;
  source: string;
};

type BittensorWalletActionPreviewBase = {
  action: BittensorWalletAction;
  network: "finney";
  sender: string;
  amountTao: string;
  amountRao: string;
  feeTao: number | null;
  consequenceSummary: string;
  warnings: string[];
  confirmation: {
    required: true;
    phrase: string;
  };
};

export type BittensorTransferPreview = BittensorWalletActionPreviewBase & {
  action: "transfer";
  destination: string;
  hotkey: null;
  netuid: null;
};

export type BittensorStakePreview = BittensorWalletActionPreviewBase & {
  action: "stake" | "unstake";
  destination: null;
  hotkey: string;
  netuid: number;
};

export type BittensorWalletActionPreview = BittensorTransferPreview | BittensorStakePreview;

export type BittensorPublicReceipt = {
  status: "submitted";
  network: "finney";
  action: BittensorWalletAction;
  signerAddress: string;
  destination: string | null;
  hotkey: string | null;
  netuid: number | null;
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
  submitAction: (
    preview: BittensorWalletActionPreview,
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
    hotkey: null,
    netuid: null,
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

export function createBittensorStakePreview(input: {
  action: "stake" | "unstake";
  sender: string;
  hotkey: string;
  netuid: number;
  amountTao: string;
  feeTao?: number | null;
  warnings?: string[];
}): BittensorStakePreview {
  const sender = requireText(input.sender, "Sender");
  const hotkey = requireText(input.hotkey, "Validator hotkey");
  if (!Number.isInteger(input.netuid) || input.netuid < 0) {
    throw new Error("Subnet netuid must be a non-negative integer.");
  }
  const amountRao = taoToRao(input.amountTao);
  const amountTao = input.amountTao.trim();
  const verb = input.action === "stake" ? "stakes" : "unstakes";
  const direction = input.action === "stake" ? "to" : "from";

  return {
    action: input.action,
    network: "finney",
    sender,
    destination: null,
    hotkey,
    netuid: input.netuid,
    amountTao,
    amountRao: amountRao.toString(),
    feeTao: input.feeTao ?? null,
    consequenceSummary: `This ${verb} ${amountTao} TAO ${direction} ${hotkey} on Bittensor subnet ${input.netuid}.`,
    warnings: [
      ...(input.warnings ?? []),
      "Your Bittensor wallet will show the final chain-native call before signing.",
      "Staking exposure and returned value can change with subnet conditions.",
    ],
    confirmation: {
      required: true,
      phrase: BITTENSOR_ACTION_CONFIRMATIONS[input.action],
    },
  };
}

export function createBittensorWalletActionPreview(
  input:
    | Parameters<typeof createBittensorTransferPreview>[0] & { action: "transfer" }
    | Parameters<typeof createBittensorStakePreview>[0],
): BittensorWalletActionPreview {
  if (input.action === "transfer") return createBittensorTransferPreview(input);
  return createBittensorStakePreview(input);
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

  type RuntimeArgument = { name?: { toString: () => string } | string };
  type RuntimeCall = {
    signAndSend: (
      sender: string,
      options: { signer: unknown },
      onResult: (result: SubmissionResultLike) => void,
    ) => Promise<unknown>;
  };
  type RuntimeCallFactory = ((...args: unknown[]) => RuntimeCall) & {
    meta?: { args?: Iterable<RuntimeArgument> };
  };

  const normalizeArgumentName = (value: RuntimeArgument): string =>
    String(value.name ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();

  const buildStakingCall = (preview: BittensorStakePreview): RuntimeCall => {
    const section = (api.tx as unknown as Record<string, Record<string, unknown>>).subtensorModule;
    const methodName = preview.action === "stake" ? "addStake" : "removeStake";
    const factory = section?.[methodName] as RuntimeCallFactory | undefined;
    if (typeof factory !== "function") {
      throw new Error(`The connected Bittensor runtime does not expose subtensorModule.${methodName}.`);
    }
    const metadataArguments = Array.from(factory.meta?.args ?? []);
    if (!metadataArguments.length) {
      throw new Error(`The connected Bittensor runtime did not expose metadata for ${methodName}.`);
    }
    const values = metadataArguments.map((argument) => {
      const name = normalizeArgumentName(argument);
      if (name === "hotkey" || name === "hotkeyss58") return preview.hotkey;
      if (name === "netuid") return preview.netuid;
      if (
        name === "amount" ||
        name === "amountstaked" ||
        name === "amountunstaked" ||
        name === "staketobeadded" ||
        name === "staketoberemoved"
      ) return BigInt(preview.amountRao);
      throw new Error(`The connected Bittensor runtime has an unsupported ${methodName} argument: ${name || "unknown"}.`);
    });
    return factory(...values);
  };

  return {
    submitAction: async (preview, sender, signer, onResult) => {
      const call = preview.action === "transfer"
        ? api.tx.balances.transferKeepAlive(preview.destination, BigInt(preview.amountRao))
        : buildStakingCall(preview);
      const unsubscribe = await (call as unknown as RuntimeCall).signAndSend(sender, { signer }, onResult);
      if (typeof unsubscribe !== "function") {
        throw new Error("The Bittensor wallet did not open a transaction status subscription.");
      }
      return unsubscribe as () => void;
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

export async function submitBittensorWalletAction(input: {
  preview: BittensorWalletActionPreview;
  confirmation: string;
  rpcUrl?: string;
  dependencies?: BittensorExecutionDependencies;
}): Promise<BittensorPublicReceipt> {
  const expectedConfirmation = BITTENSOR_ACTION_CONFIRMATIONS[input.preview.action];
  if (input.confirmation.trim() !== expectedConfirmation) {
    throw new Error(`Type ${expectedConfirmation} to submit this ${input.preview.action}.`);
  }
  const normalized = input.preview.action === "transfer"
    ? createBittensorTransferPreview({
        sender: input.preview.sender,
        destination: input.preview.destination,
        amountTao: input.preview.amountTao,
        feeTao: input.preview.feeTao,
      })
    : createBittensorStakePreview({
        action: input.preview.action,
        sender: input.preview.sender,
        hotkey: input.preview.hotkey,
        netuid: input.preview.netuid,
        amountTao: input.preview.amountTao,
        feeTao: input.preview.feeTao,
      });
  const preview = { ...normalized, warnings: input.preview.warnings } as BittensorWalletActionPreview;
  if (
    preview.sender !== input.preview.sender ||
    preview.destination !== input.preview.destination ||
    preview.hotkey !== input.preview.hotkey ||
    preview.netuid !== input.preview.netuid ||
    preview.amountRao !== input.preview.amountRao ||
    preview.action !== input.preview.action
  ) {
    throw new Error(`The reviewed Bittensor ${input.preview.action} terms changed. Prepare it again.`);
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

      void api.submitAction(
        preview,
        preview.sender,
        injector.signer,
        (result) => {
          if (result.dispatchError) {
            finish(() => reject(new Error(`Bittensor rejected the ${preview.action}: ${result.dispatchError?.toString()}`)));
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
            action: preview.action,
            signerAddress: preview.sender,
            destination: preview.destination,
            hotkey: preview.hotkey,
            netuid: preview.netuid,
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

export async function submitBittensorTransfer(input: {
  preview: BittensorTransferPreview;
  confirmation: string;
  rpcUrl?: string;
  dependencies?: BittensorExecutionDependencies;
}): Promise<BittensorPublicReceipt> {
  return submitBittensorWalletAction(input);
}
