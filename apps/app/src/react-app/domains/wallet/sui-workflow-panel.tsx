/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useCurrentAccount,
  useCurrentNetwork,
  useCurrentWallet,
  useWalletConnection,
  useWallets,
  type UiWallet,
} from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { useQuery } from "@tanstack/react-query";
import type {
  ReviewedActionDraftHandoff,
  ReviewedActionHandoffV2,
  ReviewedActionOperation,
} from "@matterhorn-work/types";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  RefreshCw,
  Send,
  ShieldCheck,
  Unplug,
  Wallet,
  Waves,
} from "lucide-react";

import type {
  MatterhornServerClient,
  MatterhornSuiNetwork,
  MatterhornSuiTransactionKind,
  MatterhornSuiTransactionPreviewResponse,
  MatterhornSuiTransactionReceiptResponse,
} from "../../../app/lib/matterhorn-server";
import { isDesktopRuntime, isElectronRuntime } from "../../../app/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SUI_NETWORKS, suiDAppKit, type SuiMatterhornNetwork } from "../../infra/sui-dapp-kit";
import { getSuiWorkflowAvailability } from "./sui-workflow-state";
import { usePhantomSui } from "./phantom-sui-provider";
import {
  subscribeReviewedActionHandoff,
  takePendingReviewedActionGuard,
  takePendingReviewedActionHandoff,
} from "./reviewed-action-handoff";

type SuiDraftHandoff = Extract<ReviewedActionDraftHandoff, { protocol: "sui" }>[
  "draft"
];

function truncateAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function formatSuiBalance(totalBalance: string | number | bigint | null | undefined): string {
  if (totalBalance === null || totalBalance === undefined) return "--";
  try {
    const mist = BigInt(totalBalance);
    const whole = mist / 1_000_000_000n;
    const fraction = mist % 1_000_000_000n;
    const fractionText = fraction.toString().padStart(9, "0").slice(0, 4).replace(/0+$/g, "");
    return `${whole.toString()}${fractionText ? `.${fractionText}` : ""} SUI`;
  } catch {
    return "--";
  }
}

const SUI_TRANSACTION_LABELS: Record<MatterhornSuiTransactionKind, string> = {
  transfer_sui: "Send SUI",
  transfer_coin: "Send coin",
  transfer_object: "Send object / NFT",
  batch_transfer_sui: "Send SUI to many",
};

const SUI_CONFIRMATION_PHRASES: Record<MatterhornSuiTransactionKind, string> = {
  transfer_sui: "CONFIRM SUI TRANSFER",
  transfer_coin: "CONFIRM COIN TRANSFER",
  transfer_object: "CONFIRM OBJECT TRANSFER",
  batch_transfer_sui: "CONFIRM BATCH TRANSFER",
};

function parseBatchTransfers(value: string): Array<{ recipient: string; amountSui: string }> {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [recipient = "", amountSui = "", ...extra] = line.split(",").map((part) => part.trim());
      if (!recipient || !amountSui || extra.length > 0) {
        throw new Error("Use one recipient per line in the format 0xADDRESS, AMOUNT.");
      }
      return { recipient, amountSui };
    });
}

function isSuiMatterhornNetwork(value: unknown): value is SuiMatterhornNetwork {
  return typeof value === "string" && SUI_NETWORKS.includes(value as SuiMatterhornNetwork);
}

function fieldId(name: string) {
  return `matterhorn-sui-workflow-${name}`;
}

const SUI_PANEL_SECTION_CLASS = "matterhorn-rail-section grid gap-3 py-2";
const SUI_PANEL_INPUT_CLASS = "h-8 rounded-md border-0 bg-dls-surface-muted/[0.10] px-2.5 text-sm text-dls-text shadow-none outline-none placeholder:text-dls-muted transition-colors dark:bg-dls-surface-muted/[0.12] focus-visible:bg-dls-surface-muted/[0.16] focus-visible:ring-1 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.22)] dark:focus-visible:bg-dls-surface-muted/[0.18]";
const SUI_PANEL_TEXTAREA_CLASS = "min-h-[4.5rem] rounded-md border-0 bg-dls-surface-muted/[0.10] px-2.5 py-2 text-sm leading-6 text-dls-text shadow-none outline-none placeholder:text-dls-muted transition-colors dark:bg-dls-surface-muted/[0.12] focus-visible:bg-dls-surface-muted/[0.16] focus-visible:ring-1 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.22)] dark:focus-visible:bg-dls-surface-muted/[0.18]";

export type SuiWorkflowRuntime = "web" | "desktop" | "electron" | "unknown";

function resolveSuiWorkflowRuntime(runtime?: SuiWorkflowRuntime): SuiWorkflowRuntime {
  if (runtime) return runtime;
  if (isElectronRuntime()) return "electron";
  if (isDesktopRuntime()) return "desktop";
  if (typeof window === "undefined") return "unknown";
  return "web";
}

function supportsDirectSuiWallet(runtime: SuiWorkflowRuntime): boolean {
  return runtime === "web";
}

function WorkflowField(props: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  help?: string;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-[11px] font-medium text-dls-secondary" htmlFor={props.htmlFor}>
      <span className="text-xs font-medium text-dls-text">{props.label}</span>
      {props.children}
      {props.help ? <span className="text-[11px] font-normal leading-4 text-dls-muted">{props.help}</span> : null}
    </label>
  );
}

function EvidencePath({ path }: { path?: string }) {
  if (!path) return null;
  return (
    <div className="rounded-lg bg-dls-surface-muted/[0.08] px-2.5 py-2 text-[11px] leading-4 text-dls-secondary">
      <span className="font-medium text-dls-text">Saved evidence:</span>{" "}
      <span className="font-mono">{path}</span>
    </div>
  );
}

export function SuiWorkflowPanel(props: {
  matterhornServerClient: MatterhornServerClient | null | undefined;
  workspaceId?: string | null;
  sessionId?: string | null;
  initialOperation?: ReviewedActionOperation | null;
  runtime?: SuiWorkflowRuntime;
  compact?: boolean;
  embedded?: boolean;
  onEvidenceSaved?: (path: string) => void;
}) {
  const connection = useWalletConnection();
  const wallets = useWallets();
  const account = useCurrentAccount();
  const wallet = useCurrentWallet();
  const phantomSui = usePhantomSui();
  const reportedNetwork = useCurrentNetwork();
  const [network, setNetwork] = useState<MatterhornSuiNetwork>(
    isSuiMatterhornNetwork(reportedNetwork) ? reportedNetwork : "testnet",
  );
  const [sender, setSender] = useState("");
  const [transactionKind, setTransactionKind] = useState<MatterhornSuiTransactionKind>("transfer_sui");
  const [recipient, setRecipient] = useState("");
  const [amountSui, setAmountSui] = useState("");
  const [coinType, setCoinType] = useState("");
  const [objectId, setObjectId] = useState("");
  const [batchTransfers, setBatchTransfers] = useState("");
  const [memo, setMemo] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [digest, setDigest] = useState("");
  const [explorerUrl, setExplorerUrl] = useState("");
  const [previewResponse, setPreviewResponse] = useState<MatterhornSuiTransactionPreviewResponse | null>(null);
  const [receiptResponse, setReceiptResponse] = useState<MatterhornSuiTransactionReceiptResponse | null>(null);
  const [busyAction, setBusyAction] = useState<"connect" | "disconnect" | "preview" | "sign" | "receipt" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState<string | null>(null);
  const [draftHandoff, setDraftHandoff] = useState<Extract<ReviewedActionDraftHandoff, { protocol: "sui" }> | null>(null);
  const [guardedHandoff, setGuardedHandoff] = useState<Extract<ReviewedActionHandoffV2, { protocol: "sui" }> | null>(null);

  useEffect(() => {
    const operation = props.initialOperation;
    if (
      operation !== "transfer_sui"
      && operation !== "transfer_coin"
      && operation !== "transfer_object"
      && operation !== "batch_transfer_sui"
    ) return;
    setTransactionKind(operation);
    setDraftHandoff(null);
    setGuardedHandoff(null);
    setPreviewResponse(null);
    setReceiptResponse(null);
    setConfirmation("");
    setDigest("");
    setError(null);
  }, [props.initialOperation]);

  useEffect(() => {
    if (isSuiMatterhornNetwork(reportedNetwork)) setNetwork(reportedNetwork);
  }, [reportedNetwork]);

  useEffect(() => {
    const applyDraft = (draft: SuiDraftHandoff) => {
      setNetwork(draft.network);
      setSender(draft.sender ?? "");
      setTransactionKind(draft.operation);
      setRecipient(draft.recipient ?? "");
      setAmountSui(draft.amount ?? "");
      setCoinType(draft.coinType ?? "");
      setObjectId(draft.objectId ?? "");
      setBatchTransfers(
        draft.transfers.map((transfer) => `${transfer.recipient}, ${transfer.amount}`).join("\n"),
      );
      setPreviewResponse(null);
      setReceiptResponse(null);
      setConfirmation("");
      setDigest("");
      setError(null);
    };

    const applyHandoff = (handoff: ReviewedActionDraftHandoff, guard: ReviewedActionHandoffV2 | null) => {
      if (handoff.protocol !== "sui") return;
      setDraftHandoff(handoff);
      setGuardedHandoff(guard?.protocol === "sui" ? guard : null);
      applyDraft(handoff.draft);
    };

    const pending = takePendingReviewedActionHandoff();
    const pendingGuard = takePendingReviewedActionGuard();
    if (pending?.protocol === "sui") applyHandoff(pending, pendingGuard);

    return subscribeReviewedActionHandoff((handoff) => {
      if (handoff.protocol !== "sui") return;
      takePendingReviewedActionHandoff();
      applyHandoff(handoff, takePendingReviewedActionGuard());
    });
  }, []);

  const workspaceId = props.workspaceId?.trim() ?? "";
  const client = props.matterhornServerClient ?? null;
  const onEvidenceSaved = props.onEvidenceSaved;
  const runtime = resolveSuiWorkflowRuntime(props.runtime);
  const directWalletAvailable = supportsDirectSuiWallet(runtime);
  const connectedAddress = directWalletAvailable ? account?.address ?? phantomSui.address : null;
  const hasWalletStandardPhantom = wallets.some((availableWallet) =>
    availableWallet.name.toLowerCase().includes("phantom"),
  );

  useEffect(() => {
    if (connectedAddress && !sender.trim()) setSender(connectedAddress);
  }, [connectedAddress, sender]);

  const effectiveSender = sender.trim() || connectedAddress || "";

  const accountQuery = useQuery({
    queryKey: ["sui-workflow-account", network, effectiveSender, Boolean(client)] as const,
    enabled: Boolean(client && effectiveSender),
    queryFn: async () => {
      if (!client || !effectiveSender) throw new Error("Sui account is required.");
      return client.suiAccount(effectiveSender, { network: network as MatterhornSuiNetwork });
    },
    staleTime: 30_000,
  });

  const connectWallet = useCallback(async (nextWallet: UiWallet) => {
    setError(null);
    setBusyAction("connect");
    try {
      await suiDAppKit.connectWallet({ wallet: nextWallet });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Sui wallet.");
    } finally {
      setBusyAction(null);
    }
  }, []);

  const disconnectWallet = useCallback(async () => {
    setError(null);
    setBusyAction("disconnect");
    try {
      if (account?.address) {
        await suiDAppKit.disconnectWallet();
      } else {
        await phantomSui.disconnect();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect Sui wallet.");
    } finally {
      setBusyAction(null);
    }
  }, [account?.address, phantomSui]);

  const copyText = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel(label);
      window.setTimeout(() => setCopyLabel((current) => current === label ? null : current), 1400);
    } catch {
      setCopyLabel("Copy failed");
      window.setTimeout(() => setCopyLabel((current) => current === "Copy failed" ? null : current), 1800);
    }
  }, []);

  const emitEvidenceSaved = useCallback((path?: string) => {
    if (!path) return;
    onEvidenceSaved?.(path);
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("matterhorn:task-log-updated"));
    window.dispatchEvent(new Event("matterhorn:project-evidence-updated"));
  }, [onEvidenceSaved]);

  const preparePreview = useCallback(async () => {
    if (!client) {
      setError("Matterhorn Desks engine is offline.");
      return;
    }
    if (!workspaceId) {
      setError("Open a workspace before saving Sui evidence.");
      return;
    }
    setError(null);
    setBusyAction("preview");
    try {
      const transactionInput = transactionKind === "batch_transfer_sui"
        ? { transfers: parseBatchTransfers(batchTransfers) }
        : transactionKind === "transfer_object"
          ? { recipient: recipient.trim(), objectId: objectId.trim() }
          : transactionKind === "transfer_coin"
            ? { recipient: recipient.trim(), amountSui: amountSui.trim(), coinType: coinType.trim() }
            : { recipient: recipient.trim(), amountSui: amountSui.trim() };
      if (draftHandoff) {
        if (!guardedHandoff) {
          throw new Error("This legacy agent draft is preview-only. Regenerate it from the Sui desk to create a simulated, hash-bound wallet action.");
        }
        const source = guardedHandoff.source;
        const currentDraft: ReviewedActionDraftHandoff = transactionKind === "batch_transfer_sui"
          ? {
              version: "matterhorn.reviewed-action-handoff.v1",
              protocol: "sui",
              source,
              draft: {
                operation: "batch_transfer_sui",
                network,
                sender: effectiveSender || null,
                recipient: null,
                amount: null,
                coinType: null,
                objectId: null,
                transfers: ("transfers" in transactionInput ? transactionInput.transfers ?? [] : []).map((transfer) => ({
                  recipient: transfer.recipient,
                  amount: transfer.amountSui,
                })),
              },
            }
          : transactionKind === "transfer_object"
            ? {
                version: "matterhorn.reviewed-action-handoff.v1",
                protocol: "sui",
                source,
                draft: {
                  operation: "transfer_object",
                  network,
                  sender: effectiveSender || null,
                  recipient: recipient.trim(),
                  amount: null,
                  coinType: null,
                  objectId: objectId.trim(),
                  transfers: [],
                },
              }
            : transactionKind === "transfer_coin"
              ? {
                  version: "matterhorn.reviewed-action-handoff.v1",
                  protocol: "sui",
                  source,
                  draft: {
                    operation: "transfer_coin",
                    network,
                    sender: effectiveSender || null,
                    recipient: recipient.trim(),
                    amount: amountSui.trim(),
                    coinType: coinType.trim(),
                    objectId: null,
                    transfers: [],
                  },
                }
              : {
                  version: "matterhorn.reviewed-action-handoff.v1",
                  protocol: "sui",
                  source,
                  draft: {
                    operation: "transfer_sui",
                    network,
                    sender: effectiveSender || null,
                    recipient: recipient.trim(),
                    amount: amountSui.trim(),
                    coinType: null,
                    objectId: null,
                    transfers: [],
                  },
                };
        const validation = await client.validateReviewedAction(workspaceId, {
          handoff: guardedHandoff,
          currentDraft,
        });
        if (!validation.valid) {
          const reason = validation.issues.join(", ").replaceAll("_", " ");
          throw new Error(`This Sui wallet review is no longer valid (${reason}). Regenerate and re-simulate it before signing.`);
        }
        if (!validation.refreshedHandoff || validation.refreshedHandoff.protocol !== "sui") {
          throw new Error("Matterhorn did not return a fresh Sui dry-run. Regenerate this action before signing.");
        }
        setGuardedHandoff(validation.refreshedHandoff);
      }
      const response = await client.workspaceSuiTransactionPreview(
        workspaceId,
        {
          network: network as MatterhornSuiNetwork,
          kind: transactionKind,
          sender: effectiveSender,
          ...transactionInput,
          memo: memo.trim() || undefined,
        },
        { sessionId: props.sessionId ?? null },
      );
      setPreviewResponse(response);
      setReceiptResponse(null);
      setConfirmation("");
      emitEvidenceSaved(response.evidence?.outputPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare Sui handoff.");
    } finally {
      setBusyAction(null);
    }
  }, [
    amountSui,
    batchTransfers,
    client,
    coinType,
    draftHandoff,
    effectiveSender,
    emitEvidenceSaved,
    guardedHandoff,
    memo,
    network,
    objectId,
    props.sessionId,
    recipient,
    transactionKind,
    workspaceId,
  ]);

  const importReceipt = useCallback(async () => {
    if (!client) {
      setError("Matterhorn Desks engine is offline.");
      return;
    }
    if (!workspaceId) {
      setError("Open a workspace before saving Sui evidence.");
      return;
    }
    setError(null);
    setBusyAction("receipt");
    try {
      const response = await client.workspaceSuiVerifyTransactionReceipt(
        workspaceId,
        {
          network: network as MatterhornSuiNetwork,
          previewSha256: previewResponse?.preview.previewSha256,
          transactionDigest: digest.trim(),
          sender: previewResponse?.preview.sender || effectiveSender || undefined,
          recipient: previewResponse?.preview.recipient || recipient.trim() || undefined,
          amountMist: previewResponse?.preview.amountMist,
          explorerUrl: explorerUrl.trim() || undefined,
        },
        { sessionId: props.sessionId ?? null, reviewedAction: guardedHandoff },
      );
      setReceiptResponse(response);
      emitEvidenceSaved(response.evidence?.outputPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the Sui receipt.");
    } finally {
      setBusyAction(null);
    }
  }, [
    client,
    digest,
    effectiveSender,
    emitEvidenceSaved,
    explorerUrl,
    guardedHandoff,
    network,
    previewResponse,
    props.sessionId,
    recipient,
    workspaceId,
  ]);

  const signPreviewInWallet = useCallback(async () => {
    if (!client) {
      setError("Matterhorn Desks engine is offline.");
      return;
    }
    if (!workspaceId) {
      setError("Open a workspace before saving Sui evidence.");
      return;
    }
    if (!previewResponse?.preview) {
      setError("Prepare a Sui handoff before signing.");
      return;
    }
    if (!account?.address) {
      setError("Connect the Sui wallet that owns the sender address before signing.");
      return;
    }
    const preview = previewResponse.preview;
    if (account.address.toLowerCase() !== preview.sender.toLowerCase()) {
      setError("The connected Sui wallet does not match the handoff sender.");
      return;
    }
    const requiredConfirmation = SUI_CONFIRMATION_PHRASES[preview.kind];
    if (confirmation.trim() !== requiredConfirmation) {
      setError(`Type ${requiredConfirmation} to confirm the exact transaction before opening your wallet.`);
      return;
    }

    setError(null);
    setBusyAction("sign");
    try {
      const transaction = new Transaction();
      transaction.setSender(preview.sender);
      if (preview.kind === "transfer_sui") {
        if (!preview.recipient || !preview.amountMist) throw new Error("The SUI transfer preview is incomplete.");
        const coin = transaction.coin({ balance: BigInt(preview.amountMist) });
        transaction.transferObjects([coin], preview.recipient);
      } else if (preview.kind === "transfer_coin") {
        if (!preview.recipient || !preview.amountMist || !preview.coinType) {
          throw new Error("The coin transfer preview is incomplete.");
        }
        const coin = transaction.coin({
          balance: BigInt(preview.amountMist),
          type: preview.coinType,
          useGasCoin: false,
        });
        transaction.transferObjects([coin], preview.recipient);
      } else if (preview.kind === "transfer_object") {
        if (!preview.recipient || !preview.objectId) throw new Error("The object transfer preview is incomplete.");
        transaction.transferObjects([transaction.object(preview.objectId)], preview.recipient);
      } else {
        if (!preview.transfers?.length) throw new Error("The batch transfer preview is incomplete.");
        for (const transfer of preview.transfers) {
          const coin = transaction.coin({ balance: BigInt(transfer.amountMist) });
          transaction.transferObjects([coin], transfer.recipient);
        }
      }
      const result = await suiDAppKit.signAndExecuteTransaction({
        transaction,
        account,
        network: network as SuiMatterhornNetwork,
      });
      const executed = "Transaction" in result ? result.Transaction : result.FailedTransaction;
      if (!executed?.digest) {
        throw new Error("The Sui wallet did not return a transaction digest.");
      }
      const nextStatus = "Transaction" in result ? "success" : "failure";
      const nextDigest = executed.digest;
      const response = await client.workspaceSuiVerifyTransactionReceipt(
        workspaceId,
        {
          network: network as MatterhornSuiNetwork,
          previewSha256: preview.previewSha256,
          transactionDigest: nextDigest,
          status: nextStatus,
          sender: preview.sender,
          recipient: preview.recipient,
          amountMist: preview.amountMist,
        },
        { sessionId: props.sessionId ?? null, reviewedAction: guardedHandoff },
      );
      setDigest(nextDigest);
      setReceiptResponse(response);
      emitEvidenceSaved(response.evidence?.outputPath);
      if (nextStatus === "failure") {
        const message = executed.status?.error?.message ?? "The Sui wallet returned a failed transaction.";
        setError(message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign and submit the Sui transaction.");
    } finally {
      setBusyAction(null);
    }
  }, [account, client, confirmation, emitEvidenceSaved, guardedHandoff, network, previewResponse, props.sessionId, workspaceId]);

  const preview = previewResponse?.preview ?? null;
  const receipt = receiptResponse?.receipt ?? null;
  const batchTransferState = useMemo(() => {
    if (transactionKind !== "batch_transfer_sui") return { ready: true, reason: null as string | null };
    try {
      const transfers = parseBatchTransfers(batchTransfers);
      if (transfers.length < 2 || transfers.length > 16) {
        return { ready: false, reason: "Add between 2 and 16 recipient rows." };
      }
      return { ready: true, reason: null as string | null };
    } catch (batchError) {
      return {
        ready: false,
        reason: batchError instanceof Error ? batchError.message : "Check the batch transfer rows.",
      };
    }
  }, [batchTransfers, transactionKind]);
  const transactionDetails = useMemo(() => {
    if (transactionKind === "transfer_object") {
      if (!recipient.trim()) return { ready: false, reason: "Enter the public recipient address." };
      if (!objectId.trim()) return { ready: false, reason: "Enter the public Sui object ID." };
      return { ready: true, reason: null as string | null };
    }
    if (transactionKind === "transfer_coin") {
      if (!recipient.trim()) return { ready: false, reason: "Enter the public recipient address." };
      if (!amountSui.trim()) return { ready: false, reason: "Enter the coin amount." };
      if (!coinType.trim()) return { ready: false, reason: "Enter the full Sui coin type." };
      return { ready: true, reason: null as string | null };
    }
    if (transactionKind === "batch_transfer_sui") return batchTransferState;
    if (!recipient.trim()) return { ready: false, reason: "Enter the public recipient address." };
    if (!amountSui.trim()) return { ready: false, reason: "Enter the SUI amount." };
    return { ready: true, reason: null as string | null };
  }, [amountSui, batchTransferState, coinType, objectId, recipient, transactionKind]);
  const senderMatchesConnectedWallet = Boolean(
    connectedAddress && effectiveSender && connectedAddress.toLowerCase() === effectiveSender.toLowerCase(),
  );
  const canUseConnectedWalletSender = Boolean(
    directWalletAvailable && connectedAddress && !senderMatchesConnectedWallet,
  );
  const availability = getSuiWorkflowAvailability({
    clientReady: Boolean(client),
    workspaceReady: Boolean(workspaceId),
    sender: effectiveSender,
    recipient: recipient.trim(),
    amountSui: amountSui.trim(),
    transactionDetailsReady: transactionDetails.ready,
    transactionDetailsReason: transactionDetails.reason,
    previewReady: Boolean(preview),
    previewSender: preview?.sender,
    connectedAddress,
    directWalletAvailable,
    digest: digest.trim(),
  });
  const canPreview = availability.canPreparePreview;
  const confirmationMatches = Boolean(
    preview && confirmation.trim() === SUI_CONFIRMATION_PHRASES[preview.kind],
  );
  const canSignPreview = Boolean(account?.address)
    && directWalletAvailable
    && availability.canSignPreview
    && confirmationMatches;
  const canImportReceipt = availability.canImportReceipt;
  const accountBalance = accountQuery.data?.account.balance.balanceMist;
  const connectedWalletLabel = !directWalletAvailable
    ? effectiveSender
      ? `Sender ${truncateAddress(effectiveSender)}`
      : "External Sui wallet handoff"
    : connectedAddress
    ? `${account?.address ? wallet?.name ?? "Sui wallet" : "Phantom"} · ${truncateAddress(connectedAddress)}`
    : "No Sui wallet connected";

  const handoffText = useMemo(() => (
    preview ? JSON.stringify(preview.handoff, null, 2) : ""
  ), [preview]);
  const previewSummary = useMemo(() => {
    if (!preview) return "";
    if (preview.kind === "transfer_object") {
      return `Object ${truncateAddress(preview.objectId ?? "")} to ${truncateAddress(preview.recipient ?? "")}`;
    }
    if (preview.kind === "batch_transfer_sui") {
      return `${preview.transfers?.length ?? 0} SUI recipients`;
    }
    const asset = preview.kind === "transfer_coin" ? preview.coinType ?? "coin" : "SUI";
    return `${preview.amountSui ?? "--"} ${asset} to ${truncateAddress(preview.recipient ?? "")}`;
  }, [preview]);
  const networkSenderGridClass = props.compact
    ? "grid gap-3"
    : "grid gap-3 md:grid-cols-[8rem_minmax(0,1fr)]";
  const recipientAmountGridClass = props.compact
    ? "grid gap-3"
    : "grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem]";
  const receiptGridClass = props.compact
    ? "grid gap-3"
    : "grid gap-3 md:grid-cols-[9rem_minmax(0,1fr)]";

  const useConnectedWalletSender = useCallback(() => {
    if (connectedAddress) setSender(connectedAddress);
  }, [connectedAddress]);

  return (
    <section className={cn(
      "grid gap-3",
      props.embedded ? "pt-1" : props.compact ? "px-3 py-3" : "px-4 py-4",
    )}>
      {!props.embedded ? <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Waves className="size-4 text-dls-secondary" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-dls-text">Sui wallet</h4>
          </div>
          <p className="mt-1 text-xs leading-5 text-dls-secondary">
            {directWalletAvailable
              ? "Connect to view your balance and prepare transfers."
              : "Prepare a transfer handoff, sign externally, then import the public receipt as project evidence."}
          </p>
        </div>
      </div> : null}

      {!props.embedded ? <div className={SUI_PANEL_SECTION_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-dls-text">{connectedWalletLabel}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-dls-secondary">
              {accountQuery.isError
                ? "Account read unavailable"
                : accountQuery.isLoading
                  ? "Reading account..."
                  : `Balance ${formatSuiBalance(accountBalance)}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7 border-0 bg-transparent text-dls-secondary shadow-none hover:bg-dls-surface-muted/[0.10] hover:text-dls-text"
              disabled={!effectiveSender || accountQuery.isFetching}
              onClick={() => void accountQuery.refetch()}
              aria-label="Refresh Sui account"
              title="Refresh Sui account"
            >
              <RefreshCw className={cn("size-3", accountQuery.isFetching && "animate-spin")} />
            </Button>
            {directWalletAvailable && connectedAddress ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-lg text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                disabled={busyAction === "disconnect"}
                onClick={disconnectWallet}
              >
                <Unplug className="size-3" />
                Disconnect
              </Button>
            ) : null}
          </div>
        </div>

        {!directWalletAvailable ? (
          <div className="text-xs leading-5 text-dls-secondary">
            <span className="font-medium text-dls-text">Desktop handoff:</span>{" "}
            copy the handoff, sign in your Sui wallet or protocol client, then paste the public digest below.
          </div>
        ) : !connectedAddress ? (
          <div className="grid gap-2">
            {phantomSui.detected && !hasWalletStandardPhantom ? (
              <Button
                variant="outline"
                className="h-auto justify-start gap-2 rounded-lg border-0 bg-dls-surface-muted/[0.1] px-3 py-2 text-xs text-dls-text shadow-none hover:bg-dls-surface-muted/[0.16]"
                disabled={busyAction === "connect" || phantomSui.connecting}
                onClick={() => void phantomSui.connect()}
              >
                <Wallet className="size-3.5 shrink-0 text-[#ab9ff2]" />
                <span className="min-w-0 truncate">Phantom</span>
              </Button>
            ) : null}
            {wallets.slice(0, 3).map((availableWallet) => (
              <Button
                key={`${availableWallet.name}-${availableWallet.version}`}
                variant="outline"
                className="h-auto justify-start gap-2 rounded-lg border-0 bg-dls-surface-muted/[0.08] px-3 py-2 text-xs text-dls-text shadow-none hover:bg-dls-surface-muted/[0.14]"
                disabled={busyAction === "connect" || connection.isConnecting}
                onClick={() => connectWallet(availableWallet)}
              >
                {availableWallet.icon ? (
                  <img src={availableWallet.icon} alt="" className="size-4 shrink-0 rounded-sm" />
                ) : (
                  <Wallet className="size-3.5 shrink-0" />
                )}
                <span className="min-w-0 truncate">{availableWallet.name}</span>
              </Button>
            ))}
            {!phantomSui.detected && wallets.length === 0 ? (
              <a
                href="https://phantom.com/download"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center justify-between gap-3 rounded-lg bg-dls-surface-muted/[0.10] px-3 py-2 text-xs font-medium text-dls-text transition-colors hover:bg-dls-surface-muted/[0.16]"
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Wallet className="size-3.5 shrink-0 text-[#ab9ff2]" />
                  <span>Install or enable Phantom for Sui</span>
                </span>
                <ExternalLink className="size-3.5 shrink-0 text-dls-secondary" />
              </a>
            ) : null}
            <p className="text-[11px] leading-4 text-dls-secondary">
              You can prepare exact transfer terms now. Connect the sender wallet only when you are ready to sign and submit.
            </p>
          </div>
        ) : null}
        {phantomSui.address && !account?.address ? (
          <p className="text-[11px] leading-4 text-dls-secondary">
            Phantom Sui is connected for public reads and transfer previews. Use the prepared handoff in Phantom for final signing.
          </p>
        ) : null}
      </div> : null}

      <>
      <div className={SUI_PANEL_SECTION_CLASS}>
        <WorkflowField label="Action" htmlFor={fieldId("kind")}>
          <select
            id={fieldId("kind")}
            className={SUI_PANEL_INPUT_CLASS}
            value={transactionKind}
            onChange={(event) => {
              setTransactionKind(event.target.value as MatterhornSuiTransactionKind);
              setPreviewResponse(null);
              setReceiptResponse(null);
              setConfirmation("");
            }}
          >
            {Object.entries(SUI_TRANSACTION_LABELS).map(([kind, label]) => (
              <option key={kind} value={kind}>{label}</option>
            ))}
          </select>
        </WorkflowField>

        <div className={networkSenderGridClass}>
          <WorkflowField label="Network" htmlFor={fieldId("network")}>
            <select
              id={fieldId("network")}
              className={SUI_PANEL_INPUT_CLASS}
              value={network}
              onChange={(event) => setNetwork(event.target.value as MatterhornSuiNetwork)}
            >
              <option value="testnet">Testnet</option>
              <option value="mainnet">Mainnet</option>
            </select>
          </WorkflowField>
          <WorkflowField label="Sender" htmlFor={fieldId("sender")} help="Public Sui address only. Never paste keys, mnemonics, signatures, or wallet exports.">
            <div className="flex min-w-0 gap-2">
              <Input
                id={fieldId("sender")}
                className={SUI_PANEL_INPUT_CLASS}
                value={sender}
                placeholder="0x..."
                onChange={(event) => setSender(event.target.value)}
              />
              {canUseConnectedWalletSender ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-lg border-0 bg-dls-surface-muted/[0.10] text-xs text-dls-text shadow-none hover:bg-dls-surface-muted/[0.16]"
                  onClick={useConnectedWalletSender}
                >
                  Use wallet
                </Button>
              ) : null}
            </div>
          </WorkflowField>
        </div>

        {transactionKind === "batch_transfer_sui" ? (
          <WorkflowField
            label="Recipients"
            htmlFor={fieldId("batch")}
            help="One row per recipient: 0xADDRESS, AMOUNT. Minimum 2, maximum 16."
          >
            <Textarea
              id={fieldId("batch")}
              className={SUI_PANEL_TEXTAREA_CLASS}
              rows={4}
              value={batchTransfers}
              placeholder={"0x123..., 0.25\n0x456..., 0.10"}
              onChange={(event) => setBatchTransfers(event.target.value)}
            />
          </WorkflowField>
        ) : (
          <div className={recipientAmountGridClass}>
            <WorkflowField label="Recipient" htmlFor={fieldId("recipient")}>
              <Input
                id={fieldId("recipient")}
                className={SUI_PANEL_INPUT_CLASS}
                value={recipient}
                placeholder="0x..."
                onChange={(event) => setRecipient(event.target.value)}
              />
            </WorkflowField>
            {transactionKind !== "transfer_object" ? (
              <WorkflowField
                label="Amount"
                htmlFor={fieldId("amount")}
                help={transactionKind === "transfer_coin" ? "Coin units" : "SUI"}
              >
                <Input
                  id={fieldId("amount")}
                  className={SUI_PANEL_INPUT_CLASS}
                  inputMode="decimal"
                  value={amountSui}
                  placeholder="0.1"
                  onChange={(event) => setAmountSui(event.target.value)}
                />
              </WorkflowField>
            ) : null}
          </div>
        )}

        {transactionKind === "transfer_coin" ? (
          <WorkflowField label="Coin type" htmlFor={fieldId("coin-type")} help="Full Sui type, for example 0x2::sui::SUI.">
            <Input
              id={fieldId("coin-type")}
              className={SUI_PANEL_INPUT_CLASS}
              value={coinType}
              placeholder="0x...::module::COIN"
              onChange={(event) => setCoinType(event.target.value)}
            />
          </WorkflowField>
        ) : null}

        {transactionKind === "transfer_object" ? (
          <WorkflowField label="Object ID" htmlFor={fieldId("object-id")} help="Public Sui object or NFT ID.">
            <Input
              id={fieldId("object-id")}
              className={SUI_PANEL_INPUT_CLASS}
              value={objectId}
              placeholder="0x..."
              onChange={(event) => setObjectId(event.target.value)}
            />
          </WorkflowField>
        ) : null}

        <WorkflowField label="Memo" htmlFor={fieldId("memo")} help="Optional. Saved with the handoff evidence, not signed by Matterhorn.">
          <Textarea
            id={fieldId("memo")}
            className={SUI_PANEL_TEXTAREA_CLASS}
            rows={2}
            value={memo}
            placeholder="Why this transfer is being prepared"
            onChange={(event) => setMemo(event.target.value)}
          />
        </WorkflowField>

        <Button
          type="button"
          className="w-fit rounded-lg"
          disabled={!canPreview || busyAction === "preview"}
          onClick={preparePreview}
          title={availability.preparePreviewReason ?? "Review the exact Sui transaction"}
        >
          {busyAction === "preview" ? <RefreshCw className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          Review transaction
        </Button>
      </div>

      {preview ? (
        <div className={SUI_PANEL_SECTION_CLASS}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-dls-text">Handoff ready</p>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                {previewSummary}
              </p>
            </div>
            <ShieldCheck className="size-4 text-emerald-300" aria-hidden="true" />
          </div>
          <div className="grid gap-1 text-xs leading-5 text-dls-secondary">
            <p><span className="font-medium text-dls-text">Handoff hash:</span> <span className="font-mono">{preview.previewSha256.slice(0, 18)}...</span></p>
            <p><span className="font-medium text-dls-text">Execution:</span> wallet-only. Matterhorn does not hold keys or submit directly.</p>
          </div>
          <EvidencePath path={previewResponse?.evidence?.outputPath} />
          {directWalletAvailable ? (
            <WorkflowField
              label="Confirm exact transaction"
              htmlFor={fieldId("confirmation")}
              help={`Type ${SUI_CONFIRMATION_PHRASES[preview.kind]} to open your wallet.`}
            >
              <Input
                id={fieldId("confirmation")}
                className={SUI_PANEL_INPUT_CLASS}
                value={confirmation}
                autoComplete="off"
                spellCheck={false}
                placeholder={SUI_CONFIRMATION_PHRASES[preview.kind]}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </WorkflowField>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {directWalletAvailable ? (
              <Button
                type="button"
                size="sm"
                disabled={!canSignPreview || busyAction === "sign"}
                onClick={signPreviewInWallet}
                title={
                  availability.signPreviewReason
                    ?? (!confirmationMatches
                      ? `Type ${SUI_CONFIRMATION_PHRASES[preview.kind]} before opening your wallet.`
                      : "Sign and submit with the connected Sui wallet")
                }
              >
                {busyAction === "sign" ? <RefreshCw className="size-3 animate-spin" /> : <Send className="size-3" />}
                Review in wallet
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={() => copyText("handoff", handoffText)}>
                <Copy className="size-3" />
                {copyLabel === "handoff" ? "Copied" : "Copy handoff"}
              </Button>
            )}
            {directWalletAvailable ? (
              <Button variant="outline" size="sm" onClick={() => copyText("handoff", handoffText)}>
                <Copy className="size-3" />
                {copyLabel === "handoff" ? "Copied" : "Copy handoff"}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => copyText("hash", preview.previewSha256)}>
              <Copy className="size-3" />
              {copyLabel === "hash" ? "Copied" : "Copy handoff hash"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className={SUI_PANEL_SECTION_CLASS}>
        <div>
          <p className="text-sm font-semibold text-dls-text">Import receipt</p>
          <p className="mt-1 text-xs leading-5 text-dls-secondary">
            Paste the public digest. Matterhorn will verify its status against the selected Sui network before saving evidence. Do not paste signatures or signed payloads.
          </p>
        </div>
        <WorkflowField label="Transaction digest" htmlFor={fieldId("digest")}>
          <Input
            id={fieldId("digest")}
            className={SUI_PANEL_INPUT_CLASS}
            value={digest}
            placeholder="Sui transaction digest"
            onChange={(event) => setDigest(event.target.value)}
          />
        </WorkflowField>
        <div className={receiptGridClass}>
          <div className="rounded-lg bg-dls-surface-muted/[0.10] px-3 py-2">
            <p className="text-xs font-medium text-dls-text">Status from Sui RPC</p>
            <p className="mt-0.5 text-[11px] leading-4 text-dls-secondary">No user-entered status is trusted.</p>
          </div>
          <WorkflowField label="Explorer URL" htmlFor={fieldId("explorer")} help="Optional public link.">
            <Input
              id={fieldId("explorer")}
              className={SUI_PANEL_INPUT_CLASS}
              value={explorerUrl}
              placeholder="https://..."
              onChange={(event) => setExplorerUrl(event.target.value)}
            />
          </WorkflowField>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-fit rounded-lg border-0 bg-dls-surface-muted/[0.10] text-dls-text shadow-none hover:bg-dls-surface-muted/[0.16]"
          disabled={!canImportReceipt || busyAction === "receipt"}
          onClick={importReceipt}
          title={availability.importReceiptReason ?? "Verify and save the public Sui transaction receipt"}
        >
          {busyAction === "receipt" ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
          Verify receipt
        </Button>
      </div>

      {receipt ? (
        <div className={SUI_PANEL_SECTION_CLASS}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-dls-text">Receipt verified</p>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                Status: {receipt.status}. Verified on Sui; Matterhorn did not sign or submit this transaction.
              </p>
            </div>
            {receipt.explorerUrl ? (
              <a
                href={receipt.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Explorer
                <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>
          <p className="truncate font-mono text-xs text-dls-secondary" title={receipt.transactionDigest}>
            {receipt.transactionDigest}
          </p>
          <EvidencePath path={receiptResponse?.evidence?.outputPath} />
        </div>
      ) : null}
      </>

      {error || phantomSui.error ? (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-300">
          {error ?? phantomSui.error}
        </div>
      ) : null}
    </section>
  );
}
