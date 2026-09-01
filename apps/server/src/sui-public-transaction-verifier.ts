import { bcs } from "@mysten/sui/bcs";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import type { SuiClientTypes } from "@mysten/sui/client";
import { fromBase64, normalizeSuiAddress, normalizeStructTag } from "@mysten/sui/utils";
import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";

import {
  createPinnedSuiGrpcWebFetch,
  type MatterhornGrpcTransportObservation,
} from "./crypto-app-http2-grpc-fetch.js";
import {
  type MatterhornAdapterDnsResolver,
  resolvePublicCryptoAdapterEndpoint,
} from "./crypto-app-egress.js";
import { SUI_NATIVE_COIN_TYPE } from "./tools/sui.js";

const SUI_TESTNET_NETWORK = "sui:testnet" as const;

type SuiArgument = {
  $kind?: "GasCoin" | "Input" | "Result" | "NestedResult";
  GasCoin?: true;
  Input?: number;
  Result?: number;
  NestedResult?: [number, number];
};

type SuiPureInput = {
  $kind: "Pure";
  Pure: { bytes: string };
};

type SuiCommand = { $kind?: string; [key: string]: unknown };

type SplitCoinsCommand = {
  $kind: "SplitCoins";
  SplitCoins: { coin: SuiArgument; amounts: SuiArgument[] };
};

type TransferObjectsCommand = {
  $kind: "TransferObjects";
  TransferObjects: { objects: SuiArgument[]; address: SuiArgument };
};

export type MatterhornSuiPublicTransactionProjection = {
  digest: string;
  success: boolean;
  error: string | null;
  sender: string;
  gasOwner: string | null;
  commands: SuiCommand[];
  inputs: unknown[];
  balanceChanges: Array<{ coinType: string; address: string; amount: string }>;
  epoch: string | null;
};

export type MatterhornSuiVerifiedPublicTransaction = {
  network: typeof SUI_TESTNET_NETWORK;
  digest: string;
  status: "confirmed" | "failed";
  signer: string;
  recipient: string;
  amountMist: string;
  epoch: string | null;
  source: "sui.grpc";
  observedAt: string;
};

export type MatterhornSuiPublicTransactionVerifier = (input: {
  network: typeof SUI_TESTNET_NETWORK;
  digest: string;
  signer: string;
  operation: "transfer_sui";
  recipient: string;
  amountSui: string;
  signal: AbortSignal;
}) => Promise<MatterhornSuiVerifiedPublicTransaction>;

type SuiTransactionReadClient = {
  getTransaction(input: {
    digest: string;
    signal: AbortSignal;
  }): Promise<MatterhornSuiPublicTransactionProjection>;
};

export type MatterhornSuiPublicTransactionVerifierOptions = {
  endpoint: URL;
  resolver?: MatterhornAdapterDnsResolver;
  now?: () => Date;
  onObservation?: (observation: MatterhornGrpcTransportObservation) => void;
  createClient?: (input: {
    endpoint: URL;
    approvedAddresses: readonly string[];
    signal: AbortSignal;
    onObservation?: (observation: MatterhornGrpcTransportObservation) => void;
  }) => SuiTransactionReadClient;
};

function canonicalSuiDigest(value: string): string {
  const digest = value.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(digest)) {
    throw new Error("sui_public_transaction_digest_invalid");
  }
  return digest;
}

function canonicalSuiAddress(value: string, code: string): string {
  try {
    return normalizeSuiAddress(value);
  } catch {
    throw new Error(code);
  }
}

function amountSuiToMist(value: string): bigint {
  const amount = value.trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,9})?$/.test(amount)) {
    throw new Error("sui_public_transaction_amount_invalid");
  }
  const [whole = "0", fraction = ""] = amount.split(".");
  const mist = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
  if (mist <= 0n) throw new Error("sui_public_transaction_amount_invalid");
  return mist;
}

function pureBytes(inputs: unknown[], argument: SuiArgument, code: string): Uint8Array {
  if (enumKind(argument, ["GasCoin", "Input", "Result", "NestedResult"]) !== "Input"
    || !Number.isSafeInteger(argument.Input)
    || Number(argument.Input) < 0
    || Number(argument.Input) >= inputs.length) throw new Error(code);
  const candidate = inputs[Number(argument.Input)] as Partial<SuiPureInput> | null;
  if (!candidate
    || candidate.$kind !== "Pure"
    || !candidate.Pure
    || typeof candidate.Pure.bytes !== "string") throw new Error(code);
  try {
    return fromBase64(candidate.Pure.bytes);
  } catch {
    throw new Error(code);
  }
}

function enumKind(value: Record<string, unknown>, allowed: readonly string[]): string | null {
  if (typeof value.$kind === "string" && allowed.includes(value.$kind)) return value.$kind;
  const present = allowed.filter((key) => Object.hasOwn(value, key));
  return present.length === 1 ? present[0]! : null;
}

function isArgument(value: unknown): value is SuiArgument {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const argument = value as Partial<SuiArgument>;
  const kind = enumKind(argument as Record<string, unknown>, ["GasCoin", "Input", "Result", "NestedResult"]);
  if (kind === "GasCoin") return argument.GasCoin === true;
  if (kind === "Input") return Number.isSafeInteger(argument.Input) && Number(argument.Input) >= 0;
  if (kind === "Result") return Number.isSafeInteger(argument.Result) && Number(argument.Result) >= 0;
  return kind === "NestedResult"
    && Array.isArray(argument.NestedResult)
    && argument.NestedResult.length === 2
    && argument.NestedResult.every((item) => Number.isSafeInteger(item) && item >= 0);
}

function isSplitCoinsCommand(value: SuiCommand | undefined): value is SplitCoinsCommand {
  if (!value || enumKind(value, ["SplitCoins", "TransferObjects", "MoveCall", "MergeCoins", "Publish", "MakeMoveVec", "Upgrade", "$Intent"]) !== "SplitCoins") return false;
  const split = value.SplitCoins;
  return Boolean(split)
    && typeof split === "object"
    && !Array.isArray(split)
    && isArgument((split as { coin?: unknown }).coin)
    && Array.isArray((split as { amounts?: unknown }).amounts)
    && (split as { amounts: unknown[] }).amounts.every(isArgument);
}

function isTransferObjectsCommand(value: SuiCommand | undefined): value is TransferObjectsCommand {
  if (!value || enumKind(value, ["SplitCoins", "TransferObjects", "MoveCall", "MergeCoins", "Publish", "MakeMoveVec", "Upgrade", "$Intent"]) !== "TransferObjects") return false;
  const transfer = value.TransferObjects;
  return Boolean(transfer)
    && typeof transfer === "object"
    && !Array.isArray(transfer)
    && isArgument((transfer as { address?: unknown }).address)
    && Array.isArray((transfer as { objects?: unknown }).objects)
    && (transfer as { objects: unknown[] }).objects.every(isArgument);
}

function assertExactNativeTransfer(input: {
  transaction: MatterhornSuiPublicTransactionProjection;
  signer: string;
  recipient: string;
  amountMist: bigint;
}): void {
  const commands = input.transaction.commands;
  if (commands.length !== 2
    || !isSplitCoinsCommand(commands[0])
    || !isTransferObjectsCommand(commands[1])) {
    throw new Error("sui_public_transaction_commands_mismatch");
  }
  const split = commands[0].SplitCoins;
  const transfer = commands[1].TransferObjects;
  if (enumKind(split.coin, ["GasCoin", "Input", "Result", "NestedResult"]) !== "GasCoin"
    || split.amounts.length !== 1
    || transfer.objects.length !== 1
    || !transfer.objects[0]
    || enumKind(transfer.objects[0], ["GasCoin", "Input", "Result", "NestedResult"]) !== "Result"
    || transfer.objects[0].Result !== 0) {
    throw new Error("sui_public_transaction_commands_mismatch");
  }
  let observedAmount: bigint;
  let observedRecipient: string;
  try {
    observedAmount = BigInt(bcs.U64.parse(pureBytes(
      input.transaction.inputs,
      split.amounts[0]!,
      "sui_public_transaction_amount_mismatch",
    )));
    observedRecipient = canonicalSuiAddress(
      bcs.Address.parse(pureBytes(
        input.transaction.inputs,
        transfer.address,
        "sui_public_transaction_recipient_mismatch",
      )),
      "sui_public_transaction_recipient_mismatch",
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("sui_public_transaction_")) throw error;
    throw new Error("sui_public_transaction_commands_mismatch");
  }
  if (observedAmount !== input.amountMist) throw new Error("sui_public_transaction_amount_mismatch");
  if (observedRecipient !== input.recipient) throw new Error("sui_public_transaction_recipient_mismatch");

  if (input.transaction.inputs.length !== 2) {
    throw new Error("sui_public_transaction_inputs_mismatch");
  }
  if (!input.transaction.success) return;
  const normalizedNative = normalizeStructTag(SUI_NATIVE_COIN_TYPE);
  let recipientChange = 0n;
  let signerChange = 0n;
  for (const change of input.transaction.balanceChanges) {
    let coinType: string;
    try {
      coinType = normalizeStructTag(change.coinType);
    } catch {
      throw new Error("sui_public_transaction_balance_mismatch");
    }
    const address = canonicalSuiAddress(change.address, "sui_public_transaction_balance_mismatch");
    let amount: bigint;
    try {
      amount = BigInt(change.amount);
    } catch {
      throw new Error("sui_public_transaction_balance_mismatch");
    }
    if (coinType !== normalizedNative || (address !== input.signer && address !== input.recipient)) {
      throw new Error("sui_public_transaction_balance_mismatch");
    }
    if (address === input.recipient) recipientChange += amount;
    if (address === input.signer) signerChange += amount;
  }
  if (recipientChange !== input.amountMist || signerChange >= -input.amountMist) {
    throw new Error("sui_public_transaction_balance_mismatch");
  }
}

function defaultClient(input: Parameters<NonNullable<MatterhornSuiPublicTransactionVerifierOptions["createClient"]>>[0]): SuiTransactionReadClient {
  const transport = new GrpcWebFetchTransport({
    baseUrl: input.endpoint.href.replace(/\/$/, ""),
    format: "binary",
    fetch: createPinnedSuiGrpcWebFetch({
      endpoint: input.endpoint,
      approvedAddresses: input.approvedAddresses,
      outerSignal: input.signal,
      onObservation: input.onObservation,
    }),
  });
  const client = new SuiGrpcClient({ network: "testnet", transport });
  return {
    async getTransaction(request) {
      const result = await client.getTransaction({
        digest: request.digest,
        include: { transaction: true, balanceChanges: true, effects: true },
        signal: request.signal,
      });
      const transaction = result.$kind === "Transaction" ? result.Transaction : result.FailedTransaction;
      const transactionData = transaction.transaction;
      if (!transactionData?.sender) throw new Error("sui_public_transaction_data_missing");
      return {
        digest: transaction.digest,
        success: transaction.status.success,
        error: transaction.status.success ? null : transaction.status.error.message.slice(0, 500),
        sender: transactionData.sender,
        gasOwner: transactionData.gasData.owner,
        commands: transactionData.commands as unknown as SuiCommand[],
        inputs: transactionData.inputs,
        balanceChanges: transaction.balanceChanges ?? [],
        epoch: transaction.epoch,
      };
    },
  };
}

/**
 * Independently verifies a connected-wallet native SUI transfer through one
 * pinned, read-only GetTransaction call. The model, MCP bridge and wallet
 * handoff never receive this client, and ExecuteTransaction remains denied.
 */
export function createPinnedSuiPublicTransactionVerifier(
  options: MatterhornSuiPublicTransactionVerifierOptions,
): MatterhornSuiPublicTransactionVerifier {
  if (options.endpoint.protocol !== "https:"
    || options.endpoint.username
    || options.endpoint.password
    || options.endpoint.search
    || options.endpoint.hash) throw new Error("sui_public_transaction_endpoint_invalid");
  const createClient = options.createClient ?? defaultClient;
  const now = options.now ?? (() => new Date());
  return async (input) => {
    if (input.network !== SUI_TESTNET_NETWORK) throw new Error("sui_public_transaction_mainnet_disabled");
    if (input.operation !== "transfer_sui") throw new Error("sui_public_transaction_operation_invalid");
    if (input.signal.aborted) throw new Error("sui_public_transaction_aborted");
    const digest = canonicalSuiDigest(input.digest);
    const signer = canonicalSuiAddress(input.signer, "sui_public_transaction_signer_invalid");
    const recipient = canonicalSuiAddress(input.recipient, "sui_public_transaction_recipient_invalid");
    if (signer === recipient) throw new Error("sui_public_transaction_self_transfer_unsupported");
    const amountMist = amountSuiToMist(input.amountSui);
    const resolved = await resolvePublicCryptoAdapterEndpoint(options.endpoint.href, options.resolver);
    let transaction: MatterhornSuiPublicTransactionProjection;
    try {
      transaction = await createClient({
        endpoint: resolved.endpoint,
        approvedAddresses: resolved.approvedAddresses,
        signal: input.signal,
        onObservation: options.onObservation,
      }).getTransaction({ digest, signal: input.signal });
    } catch (error) {
      if (input.signal.aborted) throw new Error("sui_public_transaction_aborted");
      const message = error instanceof Error ? error.message : "";
      if (/transaction .* not found/i.test(message)) throw new Error("sui_public_transaction_not_found");
      throw new Error("sui_public_transaction_lookup_failed");
    }
    if (transaction.digest !== digest) throw new Error("sui_public_transaction_digest_mismatch");
    if (canonicalSuiAddress(transaction.sender, "sui_public_transaction_sender_mismatch") !== signer
      || (transaction.gasOwner !== null
        && canonicalSuiAddress(transaction.gasOwner, "sui_public_transaction_gas_owner_mismatch") !== signer)) {
      throw new Error("sui_public_transaction_sender_mismatch");
    }
    assertExactNativeTransfer({ transaction, signer, recipient, amountMist });
    return {
      network: SUI_TESTNET_NETWORK,
      digest,
      status: transaction.success ? "confirmed" : "failed",
      signer,
      recipient,
      amountMist: amountMist.toString(),
      epoch: transaction.epoch,
      source: "sui.grpc",
      observedAt: now().toISOString(),
    };
  };
}
