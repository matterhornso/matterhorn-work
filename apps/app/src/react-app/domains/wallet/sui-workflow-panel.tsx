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

function isSuiMatterhornNetwork(value: unknown): value is SuiMatterhornNetwork {
  return typeof value === "string" && SUI_NETWORKS.includes(value as SuiMatterhornNetwork);
}

function fieldId(name: string) {
  return `matterhorn-sui-workflow-${name}`;
}

const SUI_PANEL_SECTION_CLASS = "grid gap-3 rounded-lg bg-dls-surface-muted/[0.055] px-3 py-3";
const SUI_PANEL_INPUT_CLASS = "h-9 rounded-lg border border-transparent bg-dls-surface-muted/[0.10] px-3 text-sm text-dls-text shadow-none outline-none placeholder:text-dls-muted transition-colors dark:bg-dls-surface-muted/[0.12] focus-visible:border-[rgba(var(--dls-accent-rgb),0.34)] focus-visible:bg-dls-surface-muted/[0.16] focus-visible:ring-1 focus-visible:ring-[rgba(var(--dls-accent-rgb),0.16)] dark:focus-visible:bg-dls-surface-muted/[0.18]";
const SUI_PANEL_TEXTAREA_CLASS = "min-h-[5.25rem] rounded-lg border border-transparent bg-dls-surface-muted/[0.10] px-3 py-2.5 text-sm leading-6 text-dls-text shadow-none outline-none placeholder:text-dls-muted transition-colors dark:bg-dls-surface-muted/[0.12] focus-visible:border-[rgba(var(--dls-accent-rgb),0.34)] focus-visible:bg-dls-surface-muted/[0.16] focus-visible:ring-1 focus-visible:ring-[rgba(var(--dls-accent-rgb),0.16)] dark:focus-visible:bg-dls-surface-muted/[0.18]";

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
      {props.help ? <span className="text-[11px] font-normal leading-4 text-dls-secondary">{props.help}</span> : null}
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
  runtime?: SuiWorkflowRuntime;
  compact?: boolean;
  onEvidenceSaved?: (path: string) => void;
}) {
  const connection = useWalletConnection();
  const wallets = useWallets();
  const account = useCurrentAccount();
  const wallet = useCurrentWallet();
  const reportedNetwork = useCurrentNetwork();
  const [network, setNetwork] = useState<MatterhornSuiNetwork>(
    isSuiMatterhornNetwork(reportedNetwork) ? reportedNetwork : "testnet",
  );
  const [sender, setSender] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amountSui, setAmountSui] = useState("");
  const [memo, setMemo] = useState("");
  const [digest, setDigest] = useState("");
  const [receiptStatus, setReceiptStatus] = useState<"success" | "failure" | "unknown">("success");
  const [explorerUrl, setExplorerUrl] = useState("");
  const [previewResponse, setPreviewResponse] = useState<MatterhornSuiTransactionPreviewResponse | null>(null);
  const [receiptResponse, setReceiptResponse] = useState<MatterhornSuiTransactionReceiptResponse | null>(null);
  const [busyAction, setBusyAction] = useState<"connect" | "disconnect" | "preview" | "sign" | "receipt" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState<string | null>(null);

  useEffect(() => {
    if (isSuiMatterhornNetwork(reportedNetwork)) setNetwork(reportedNetwork);
  }, [reportedNetwork]);

  useEffect(() => {
    if (account?.address && !sender.trim()) setSender(account.address);
  }, [account?.address, sender]);

  const effectiveSender = sender.trim() || account?.address || "";
  const workspaceId = props.workspaceId?.trim() ?? "";
  const client = props.matterhornServerClient ?? null;
  const onEvidenceSaved = props.onEvidenceSaved;
  const runtime = resolveSuiWorkflowRuntime(props.runtime);
  const directWalletAvailable = supportsDirectSuiWallet(runtime);

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
      await suiDAppKit.disconnectWallet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect Sui wallet.");
    } finally {
      setBusyAction(null);
    }
  }, []);

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
      setError("Matterhorn Work engine is offline.");
      return;
    }
    if (!workspaceId) {
      setError("Open a workspace before saving Sui evidence.");
      return;
    }
    setError(null);
    setBusyAction("preview");
    try {
      const response = await client.workspaceSuiTransactionPreview(
        workspaceId,
        {
          network: network as MatterhornSuiNetwork,
          sender: effectiveSender,
          recipient: recipient.trim(),
          amountSui: amountSui.trim(),
          memo: memo.trim() || undefined,
        },
        { sessionId: props.sessionId ?? null },
      );
      setPreviewResponse(response);
      setReceiptResponse(null);
      emitEvidenceSaved(response.evidence?.outputPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare Sui preview.");
    } finally {
      setBusyAction(null);
    }
  }, [amountSui, client, effectiveSender, emitEvidenceSaved, memo, network, props.sessionId, recipient, workspaceId]);

  const importReceipt = useCallback(async () => {
    if (!client) {
      setError("Matterhorn Work engine is offline.");
      return;
    }
    if (!workspaceId) {
      setError("Open a workspace before saving Sui evidence.");
      return;
    }
    setError(null);
    setBusyAction("receipt");
    try {
      const response = await client.workspaceSuiTransactionReceipt(
        workspaceId,
        {
          network: network as MatterhornSuiNetwork,
          previewSha256: previewResponse?.preview.previewSha256,
          transactionDigest: digest.trim(),
          status: receiptStatus,
          sender: previewResponse?.preview.sender || effectiveSender || undefined,
          recipient: previewResponse?.preview.recipient || recipient.trim() || undefined,
          amountMist: previewResponse?.preview.amountMist,
          explorerUrl: explorerUrl.trim() || undefined,
        },
        { sessionId: props.sessionId ?? null },
      );
      setReceiptResponse(response);
      emitEvidenceSaved(response.evidence?.outputPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import Sui receipt.");
    } finally {
      setBusyAction(null);
    }
  }, [
    client,
    digest,
    effectiveSender,
    emitEvidenceSaved,
    explorerUrl,
    network,
    previewResponse,
    props.sessionId,
    receiptStatus,
    recipient,
    workspaceId,
  ]);

  const signPreviewInWallet = useCallback(async () => {
    if (!client) {
      setError("Matterhorn Work engine is offline.");
      return;
    }
    if (!workspaceId) {
      setError("Open a workspace before saving Sui evidence.");
      return;
    }
    if (!previewResponse?.preview) {
      setError("Prepare a Sui preview before signing.");
      return;
    }
    if (!account?.address) {
      setError("Connect the Sui wallet that owns the sender address before signing.");
      return;
    }
    const preview = previewResponse.preview;
    if (account.address.toLowerCase() !== preview.sender.toLowerCase()) {
      setError("The connected Sui wallet does not match the preview sender.");
      return;
    }

    setError(null);
    setBusyAction("sign");
    try {
      const transaction = new Transaction();
      transaction.setSender(preview.sender);
      const [coin] = transaction.splitCoins(transaction.gas, [BigInt(preview.amountMist)]);
      transaction.transferObjects([coin], preview.recipient);
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
      const response = await client.workspaceSuiTransactionReceipt(
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
        { sessionId: props.sessionId ?? null },
      );
      setDigest(nextDigest);
      setReceiptStatus(nextStatus);
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
  }, [account, client, emitEvidenceSaved, network, previewResponse, props.sessionId, workspaceId]);

  const preview = previewResponse?.preview ?? null;
  const receipt = receiptResponse?.receipt ?? null;
  const connectedAddress = directWalletAvailable ? account?.address ?? null : null;
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
    previewReady: Boolean(preview),
    previewSender: preview?.sender,
    connectedAddress,
    directWalletAvailable,
    digest: digest.trim(),
  });
  const canPreview = availability.canPreparePreview;
  const canSignPreview = directWalletAvailable && availability.canSignPreview;
  const canImportReceipt = availability.canImportReceipt;
  const accountBalance = accountQuery.data?.account.balance.balanceMist;
  const connectedWalletLabel = !directWalletAvailable
    ? effectiveSender
      ? `Sender ${truncateAddress(effectiveSender)}`
      : "External Sui wallet handoff"
    : account?.address
    ? `${wallet?.name ?? "Sui wallet"} · ${truncateAddress(account.address)}`
    : "No Sui wallet connected";

  const handoffText = useMemo(() => (
    preview ? JSON.stringify(preview.handoff, null, 2) : ""
  ), [preview]);
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
      "grid gap-4",
      props.compact ? "px-3 py-3" : "px-4 py-4",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Waves className="size-4 text-dls-secondary" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-dls-text">Sui wallet workflow</h4>
          </div>
          <p className="mt-1 text-xs leading-5 text-dls-secondary">
            {directWalletAvailable
              ? "Prepare a transfer preview, sign in your wallet, and save the public receipt."
              : "Prepare a transfer preview, sign externally, then import the public receipt as project evidence."}
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-dls-secondary">No custody</span>
      </div>

      <div className={SUI_PANEL_SECTION_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-dls-text">{connectedWalletLabel}</p>
            <p className="mt-0.5 text-[11px] text-dls-secondary">
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
            {directWalletAvailable && account?.address ? (
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
            copy the preview handoff, sign in your Sui wallet or protocol client, then paste the public digest below.
          </div>
        ) : !account?.address && wallets.length > 0 ? (
          <div className="grid gap-2">
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
          </div>
        ) : null}
      </div>

      <div className={SUI_PANEL_SECTION_CLASS}>
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
          <WorkflowField label="Amount" htmlFor={fieldId("amount")} help="SUI">
            <Input
              id={fieldId("amount")}
              className={SUI_PANEL_INPUT_CLASS}
              inputMode="decimal"
              value={amountSui}
              placeholder="0.1"
              onChange={(event) => setAmountSui(event.target.value)}
            />
          </WorkflowField>
        </div>

        <WorkflowField label="Memo" htmlFor={fieldId("memo")} help="Optional. Saved with the preview evidence, not signed by Matterhorn.">
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
          title={availability.preparePreviewReason ?? "Prepare a non-custodial Sui preview"}
        >
          {busyAction === "preview" ? <RefreshCw className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          Prepare preview
        </Button>
      </div>

      {preview ? (
        <div className={SUI_PANEL_SECTION_CLASS}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-dls-text">Preview ready</p>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                {preview.amountSui} SUI to {truncateAddress(preview.recipient)}
              </p>
            </div>
            <ShieldCheck className="size-4 text-emerald-300" aria-hidden="true" />
          </div>
          <div className="grid gap-1 text-xs leading-5 text-dls-secondary">
            <p><span className="font-medium text-dls-text">Preview hash:</span> <span className="font-mono">{preview.previewSha256.slice(0, 18)}...</span></p>
            <p><span className="font-medium text-dls-text">Execution:</span> wallet-only. Matterhorn does not hold keys or submit directly.</p>
          </div>
          <EvidencePath path={previewResponse?.evidence?.outputPath} />
          <div className="flex flex-wrap gap-2">
            {directWalletAvailable ? (
              <Button
                type="button"
                size="sm"
                disabled={!canSignPreview || busyAction === "sign"}
                onClick={signPreviewInWallet}
                title={availability.signPreviewReason ?? "Sign and submit with the connected Sui wallet"}
              >
                {busyAction === "sign" ? <RefreshCw className="size-3 animate-spin" /> : <Send className="size-3" />}
                Sign in wallet
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
              {copyLabel === "hash" ? "Copied" : "Copy preview hash"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className={SUI_PANEL_SECTION_CLASS}>
        <div>
          <p className="text-sm font-semibold text-dls-text">Import receipt</p>
          <p className="mt-1 text-xs leading-5 text-dls-secondary">
            After signing in your wallet, paste the public transaction digest. Do not paste signatures or signed payloads.
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
          <WorkflowField label="Status" htmlFor={fieldId("status")}>
            <select
              id={fieldId("status")}
              className={SUI_PANEL_INPUT_CLASS}
              value={receiptStatus}
              onChange={(event) => setReceiptStatus(event.target.value as "success" | "failure" | "unknown")}
            >
              <option value="success">Success</option>
              <option value="failure">Failure</option>
              <option value="unknown">Unknown</option>
            </select>
          </WorkflowField>
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
          title={availability.importReceiptReason ?? "Import the public Sui transaction receipt"}
        >
          {busyAction === "receipt" ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
          Import receipt
        </Button>
      </div>

      {receipt ? (
        <div className={SUI_PANEL_SECTION_CLASS}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-dls-text">Receipt imported</p>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                Status: {receipt.status}. Matterhorn did not sign or submit this transaction.
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

      {error ? (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-300">
          {error}
        </div>
      ) : null}
    </section>
  );
}
