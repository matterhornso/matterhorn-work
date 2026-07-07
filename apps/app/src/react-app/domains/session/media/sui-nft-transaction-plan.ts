import { Transaction } from "@mysten/sui/transactions";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { KioskClient, KioskTransaction, type KioskOwnerCap } from "@mysten/kiosk";
import type {
  MatterhornNftKioskListingTransactionPlan,
  MatterhornNftMintTransactionPlan,
  MatterhornNftTransactionPlan,
  MatterhornSuiTransactionArgumentPlan,
} from "@matterhorn-work/types/generated-media";
import type { SuiMatterhornNetwork } from "../../../infra/sui-dapp-kit";

export type MatterhornSuiWalletExecutionReceipt = {
  digest: string;
  status: "success" | "failure";
  objectId?: string | null;
  error?: string | null;
};

export function suiNetworkFromNftPlan(plan: MatterhornNftTransactionPlan): SuiMatterhornNetwork {
  return plan.network === "sui-mainnet" ? "mainnet" : "testnet";
}

export function buildMintTransactionFromPlan(
  plan: MatterhornNftMintTransactionPlan,
  sender: string,
): Transaction {
  const tx = new Transaction();
  tx.setSender(plan.sender || sender);
  for (const moveCall of plan.moveCalls) {
    tx.moveCall({
      target: moveCall.target,
      typeArguments: moveCall.typeArguments,
      arguments: moveCall.arguments.map((argument) => transactionArgument(tx, argument)),
    });
  }
  return tx;
}

export function buildKioskListingTransactionFromPlan(
  plan: MatterhornNftKioskListingTransactionPlan,
  sender: string,
): Transaction {
  const network = suiNetworkFromNftPlan(plan);
  const tx = new Transaction();
  tx.setSender(plan.sender || sender);

  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(network),
    network,
  });
  const kioskClient = new KioskClient({
    client,
    network,
  });
  const cap: KioskOwnerCap = {
    kioskId: plan.kioskId,
    objectId: plan.kioskOwnerCapId,
    digest: "",
    version: "",
  };

  new KioskTransaction({ transaction: tx, kioskClient, cap })
    .placeAndList({
      itemType: plan.nftType,
      item: plan.nftObjectId,
      price: plan.priceMist,
    })
    .finalize();

  return tx;
}

export function receiptFromSuiWalletResult(result: unknown): MatterhornSuiWalletExecutionReceipt {
  const record = objectRecord(result);
  const failed = objectRecord(record?.FailedTransaction);
  const directTransaction = stringValue(record?.digest) ? record : null;
  const succeeded = objectRecord(record?.Transaction) ?? (!failed ? directTransaction : null);
  const executed = succeeded ?? failed;
  const digest = transactionDigest(executed);
  if (!digest) {
    throw new Error("The Sui wallet did not return a transaction digest.");
  }
  const status = failed || transactionFailed(executed) ? "failure" : "success";
  return {
    digest,
    status,
    objectId: findCreatedObjectId(executed),
    error: status === "failure" ? transactionErrorMessage(executed) : null,
  };
}

function transactionArgument(tx: Transaction, argument: MatterhornSuiTransactionArgumentPlan) {
  if (argument.kind === "object" || argument.type === "object") {
    return tx.object(argument.value);
  }
  if (argument.type === "address") {
    return tx.pure.address(argument.value);
  }
  if (argument.type === "u64") {
    return tx.pure.u64(BigInt(argument.value));
  }
  return tx.pure.string(argument.value);
}

function findCreatedObjectId(value: unknown): string | null {
  const seen = new Set<unknown>();
  const queue: unknown[] = [value];

  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    const record = objectRecord(current);
    if (!record) continue;
    const createdObjectId = createdObjectIdFromCollection(record.created, true)
      ?? createdObjectIdFromCollection(record.objectChanges)
      ?? createdObjectIdFromCollection(objectRecord(record.objectChanges)?.nodes);
    if (createdObjectId) return createdObjectId;

    const objectId = objectIdFromRecord(record);
    if (objectId && isCreatedObjectRecord(record)) return objectId;
    for (const nested of Object.values(record)) queue.push(nested);
  }

  return null;
}

function createdObjectIdFromCollection(value: unknown, allowImplicitCreated = false): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const record = objectRecord(item);
    if (!record) continue;
    const objectId = objectIdFromRecord(record);
    const implicitlyCreated = allowImplicitCreated && !("type" in record) && !("idOperation" in record);
    if (objectId && (isCreatedObjectRecord(record) || implicitlyCreated)) {
      return objectId;
    }
  }
  return null;
}

function isCreatedObjectRecord(record: Record<string, unknown>) {
  const kind = [
    stringValue(record.type),
    stringValue(record.$kind),
    stringValue(record.kind),
    stringValue(record.idOperation),
  ].filter(Boolean).join(" ");
  if (/created/i.test(kind)) return true;
  if (record.idCreated === true) return true;

  const inputState = stringValue(record.inputState);
  const outputState = stringValue(record.outputState);
  return inputState === "DoesNotExist" && Boolean(outputState && outputState !== "DoesNotExist");
}

function objectIdFromRecord(record: Record<string, unknown>): string | null {
  return stringValue(record.objectId) ??
    stringValue(record.address) ??
    stringValue(record.id) ??
    stringValue(objectRecord(record.reference)?.objectId) ??
    stringValue(objectRecord(record.object)?.objectId);
}

function transactionDigest(record: Record<string, unknown> | null): string | null {
  if (!record) return null;
  return stringValue(record.digest) ??
    stringValue(record.transactionDigest) ??
    stringValue(objectRecord(record.transaction)?.digest);
}

function transactionFailed(record: Record<string, unknown> | null): boolean {
  const status = objectRecord(record?.status);
  if (!status) return false;
  return status.success === false || Boolean(status.error);
}

function transactionErrorMessage(record: Record<string, unknown> | null): string | null {
  const status = objectRecord(record?.status);
  const error = status?.error ?? record?.error;
  return stringValue(error) ??
    stringValue(objectRecord(error)?.message) ??
    stringValue(objectRecord(error)?.name) ??
    null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
