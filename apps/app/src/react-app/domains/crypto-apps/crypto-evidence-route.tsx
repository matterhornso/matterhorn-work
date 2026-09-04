/** @jsxImportSource react */

import { useCallback, useState } from "react";
import {
  useCurrentAccount,
  useWallets,
  type UiWallet,
} from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  CloudUpload,
  Link2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import { useNavigate, useParams } from "react-router";

import type {
  MatterhornEvidenceVerificationPacket,
  MatterhornEvidenceVerificationResult,
} from "@matterhorn-work/types/crypto-coworkers";

import { Button } from "../../../components/ui/button";
import { createMatterhornServerClient, MatterhornServerError } from "../../../app/lib/matterhorn-server";
import { suiDAppKit } from "../../infra/sui-dapp-kit";
import { resolveMatterhornConnection } from "../../shell/matterhorn-connection";

type ServerClient = ReturnType<typeof createMatterhornServerClient>;

const QUERY_PREFIX = "crypto-evidence";

function shortHash(value: string): string {
  return value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

function sameSuiAddress(left: string, right: string): boolean {
  try {
    return normalizeSuiAddress(left) === normalizeSuiAddress(right);
  } catch {
    return false;
  }
}

function formatDate(value: string | null): string {
  if (!value) return "No automatic expiry";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unknown";
}

function statusLabel(item: MatterhornEvidenceVerificationPacket): string {
  if (item.publication?.deletionTransactionDigest) return "Deleted from Walrus";
  if (item.state === "key_destroyed") return "Recovery removed";
  if (item.anchor) return "Encrypted backup anchored on Sui";
  if (item.state === "published") return "Encrypted backup on Walrus";
  return "Encrypted in your workspace";
}

function userMessage(error: unknown): string {
  if (error instanceof MatterhornServerError) {
    if (error.code === "crypto_evidence_unavailable") return "Encrypted coworker evidence is not enabled for this deployment.";
    if (error.code === "crypto_evidence_not_found") return "This evidence record no longer exists or belongs to another workspace.";
    if (error.code === "crypto_evidence_verification_unavailable") return "Live verification is temporarily unavailable. No proof state was changed.";
    if (error.code === "crypto_evidence_walrus_confirmation_required") return "Confirm the public encrypted-copy notice before continuing.";
    if (error.code === "crypto_evidence_revision_conflict") return "This evidence record changed. Refresh and try again.";
    if (error.code === "crypto_evidence_walrus_publication_in_progress") return "This encrypted copy is already being stored.";
    if (error.code === "crypto_evidence_walrus_publish_state_invalid") return "This evidence record cannot be stored again.";
    if (error.code === "crypto_evidence_publication_unavailable") return "Encrypted testnet storage is temporarily unavailable. Your local encrypted evidence is unchanged.";
    if (error.code === "crypto_evidence_key_destruction_confirmation_required") return "Confirm that you understand this evidence cannot be recovered after its key is deleted.";
    if (error.code === "crypto_evidence_operation_in_progress") return "This evidence record is being updated. Try again shortly.";
    if (error.code === "crypto_evidence_key_destruction_unavailable") return "The recovery key could not be deleted. The evidence record is unchanged.";
    if (error.code === "crypto_evidence_walrus_renewal_not_due") return "This encrypted copy does not need renewal yet.";
    if (error.code === "crypto_evidence_walrus_renewal_in_progress") return "A renewal is already waiting for wallet review.";
    if (error.code === "crypto_evidence_walrus_renewal_expired_or_replayed") return "This renewal expired or was already used. Check the proof and try again.";
    if (error.code === "crypto_evidence_walrus_renewal_transaction_failed") return "The Sui wallet transaction failed. The encrypted copy was not renewed.";
    if (error.code === "crypto_evidence_walrus_renewal_unavailable") return "Encrypted testnet storage renewal is temporarily unavailable.";
    if (error.code.includes("crypto_evidence_walrus_renewal") && error.code.includes("mismatch")) return "The renewal changed after review. Nothing was recorded; check the proof and try again.";
    if (error.code === "crypto_evidence_walrus_deletion_confirmation_required") return "Confirm that the wallet will delete the Walrus copy and Matterhorn recovery key.";
    if (error.code === "crypto_evidence_walrus_not_deletable") return "This encrypted copy was not created as deletable. You can still delete its recovery key.";
    if (error.code === "crypto_evidence_walrus_deletion_in_progress") return "A deletion is already waiting for wallet review.";
    if (error.code === "crypto_evidence_walrus_deletion_expired_or_replayed") return "This deletion expired or was already used. Check the proof and try again.";
    if (error.code === "crypto_evidence_walrus_deletion_transaction_failed") return "The Sui wallet transaction failed. The encrypted copy was not deleted.";
    if (error.code === "crypto_evidence_walrus_deletion_unavailable") return "Encrypted Walrus deletion is temporarily unavailable.";
    if (error.code === "crypto_evidence_walrus_wallet_owner_required") return "This copy is not owned by the connected Sui wallet. You can still delete its recovery key.";
    if (error.code.includes("crypto_evidence_walrus_deletion") && error.code.includes("mismatch")) return "The deletion changed after review. Nothing was recorded; check the proof and try again.";
    if (error.code === "crypto_evidence_sui_anchor_confirmation_required") return "Confirm that the Sui testnet anchor will be permanent and public.";
    if (error.code === "crypto_evidence_sui_anchor_unavailable") return "Sui testnet anchoring is not available in this deployment.";
    if (error.code === "crypto_evidence_sui_anchor_in_progress") return "An anchor is already waiting for wallet review.";
    if (error.code === "crypto_evidence_sui_anchor_expired_or_replayed") return "This anchor request expired or was already used. Prepare a new one.";
    if (error.code === "crypto_evidence_sui_anchor_exists") return "This evidence is already anchored on Sui.";
    if (error.code === "crypto_evidence_sui_anchor_certification_changed") return "The Walrus proof changed or expired. Check the proof before anchoring.";
    if (error.code === "crypto_evidence_sui_anchor_transaction_failed") return "The Sui wallet transaction failed. The anchor was not recorded.";
    if (error.code.includes("crypto_evidence_sui_anchor") && error.code.includes("mismatch")) return "The anchor changed after review. Nothing was recorded; prepare it again.";
  }
  return "Matterhorn could not load the evidence proof. Try again.";
}

async function loadEvidence(workspaceId: string): Promise<{
  client: ServerClient;
  data: Awaited<ReturnType<ServerClient["listCryptoEvidence"]>>;
}> {
  if (!workspaceId.trim()) throw new Error("workspace_required");
  const connection = await resolveMatterhornConnection();
  if (!connection.normalizedBaseUrl) throw new Error("connection_unavailable");
  const client = createMatterhornServerClient({
    baseUrl: connection.normalizedBaseUrl,
    token: connection.resolvedToken || undefined,
  });
  return { client, data: await client.listCryptoEvidence(workspaceId) };
}

function CheckLine(props: { ok: boolean; children: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        aria-hidden="true"
        className={props.ok ? "size-1.5 rounded-full bg-emerald-500" : "size-1.5 rounded-full bg-muted-foreground/40"}
      />
      <span className={props.ok ? "text-foreground" : "text-muted-foreground"}>{props.children}</span>
    </li>
  );
}

export function CryptoEvidenceRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const account = useCurrentAccount();
  const wallets = useWallets();
  const { workspaceId = "" } = useParams<{ workspaceId: string }>();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishCandidateId, setPublishCandidateId] = useState<string | null>(null);
  const [publishAcknowledged, setPublishAcknowledged] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renewCandidateId, setRenewCandidateId] = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [walletConnectingId, setWalletConnectingId] = useState<string | null>(null);
  const [cloudDeleteCandidateId, setCloudDeleteCandidateId] = useState<string | null>(null);
  const [cloudDeletingId, setCloudDeletingId] = useState<string | null>(null);
  const [anchorCandidateId, setAnchorCandidateId] = useState<string | null>(null);
  const [anchorAcknowledged, setAnchorAcknowledged] = useState(false);
  const [anchoringId, setAnchoringId] = useState<string | null>(null);
  const [verificationById, setVerificationById] = useState<Record<string, MatterhornEvidenceVerificationResult>>({});
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const queryKey: readonly [string, string] = [QUERY_PREFIX, workspaceId];
  const query = useQuery({
    queryKey,
    queryFn: () => loadEvidence(workspaceId),
    enabled: Boolean(workspaceId.trim()),
    retry: false,
  });

  const verify = useCallback(async (item: MatterhornEvidenceVerificationPacket) => {
    setVerifyingId(item.evidenceId);
    setError(null);
    try {
      const active = query.data ?? await loadEvidence(workspaceId);
      const result = await active.client.verifyCryptoEvidence(workspaceId, item.evidenceId);
      setVerificationById((current) => ({ ...current, [item.evidenceId]: result }));
      await queryClient.invalidateQueries({ queryKey });
    } catch (cause) {
      setError(userMessage(cause));
    } finally {
      setVerifyingId(null);
    }
  }, [query.data, queryClient, queryKey, workspaceId]);

  const publish = useCallback(async (item: MatterhornEvidenceVerificationPacket) => {
    if (!publishAcknowledged || !account?.address) return;
    setPublishingId(item.evidenceId);
    setError(null);
    try {
      const active = query.data ?? await loadEvidence(workspaceId);
      await active.client.publishCryptoEvidence(workspaceId, item.evidenceId, item.revision, account.address);
      setPublishCandidateId(null);
      setPublishAcknowledged(false);
      setVerificationById((current) => {
        const next = { ...current };
        delete next[item.evidenceId];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey });
    } catch (cause) {
      setError(userMessage(cause));
    } finally {
      setPublishingId(null);
    }
  }, [account?.address, publishAcknowledged, query.data, queryClient, queryKey, workspaceId]);

  const destroyRecoveryKey = useCallback(async (item: MatterhornEvidenceVerificationPacket) => {
    if (!deleteAcknowledged) return;
    setDeletingId(item.evidenceId);
    setError(null);
    try {
      const active = query.data ?? await loadEvidence(workspaceId);
      await active.client.destroyCryptoEvidenceRecoveryKey(workspaceId, item.evidenceId, item.revision);
      setDeleteCandidateId(null);
      setDeleteAcknowledged(false);
      setVerificationById((current) => {
        const next = { ...current };
        delete next[item.evidenceId];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey });
    } catch (cause) {
      setError(userMessage(cause));
    } finally {
      setDeletingId(null);
    }
  }, [deleteAcknowledged, query.data, queryClient, queryKey, workspaceId]);

  const connectSuiWallet = useCallback(async (evidenceId: string, wallet: UiWallet) => {
    setWalletConnectingId(evidenceId);
    setError(null);
    try {
      await suiDAppKit.connectWallet({ wallet });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect the Sui wallet.");
    } finally {
      setWalletConnectingId(null);
    }
  }, []);

  const renew = useCallback(async (item: MatterhornEvidenceVerificationPacket) => {
    if (!account?.address) {
      setError("Connect the Sui wallet that will review and pay for this renewal.");
      return;
    }
    setRenewingId(item.evidenceId);
    setError(null);
    try {
      const active = query.data ?? await loadEvidence(workspaceId);
      const prepared = await active.client.renewCryptoEvidence(workspaceId, item.evidenceId, {
        expectedRevision: item.revision,
        signer: account.address,
      });
      if (!sameSuiAddress(prepared.preview.signer, account.address)) {
        throw new Error("The connected Sui wallet does not match the renewal signer.");
      }
      const transaction = Transaction.from(prepared.preview.transactionBytesBase64);
      if (await transaction.getDigest() !== prepared.preview.transactionDigest) {
        throw new Error("The renewal transaction changed before wallet review.");
      }
      const result = await suiDAppKit.signAndExecuteTransaction({
        transaction,
        account,
        network: "testnet",
      });
      const executed = "Transaction" in result ? result.Transaction : result.FailedTransaction;
      if (!executed?.digest || executed.digest !== prepared.preview.transactionDigest) {
        throw new Error("The wallet returned a different transaction. The renewal was not recorded.");
      }
      if (!("Transaction" in result)) {
        throw new Error(executed.status?.error?.message ?? "The Sui wallet returned a failed renewal transaction.");
      }
      const confirmed = await active.client.confirmCryptoEvidenceRenewal(workspaceId, item.evidenceId, {
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: executed.digest,
      });
      setVerificationById((current) => ({
        ...current,
        [item.evidenceId]: {
          version: confirmed.item.version,
          evidence: confirmed.item,
          verification: confirmed.verification,
        },
      }));
      setRenewCandidateId(null);
      await queryClient.invalidateQueries({ queryKey });
    } catch (cause) {
      const message = userMessage(cause);
      setError(message === "Matterhorn could not load the evidence proof. Try again."
        && cause instanceof Error ? cause.message : message);
    } finally {
      setRenewingId(null);
    }
  }, [account, query.data, queryClient, queryKey, workspaceId]);

  const deleteWalrusCopy = useCallback(async (item: MatterhornEvidenceVerificationPacket) => {
    if (!account?.address) {
      setError("Connect the Sui wallet that owns this encrypted copy.");
      return;
    }
    setCloudDeletingId(item.evidenceId);
    setError(null);
    try {
      const active = query.data ?? await loadEvidence(workspaceId);
      const prepared = await active.client.deleteCryptoEvidenceWalrusCopy(workspaceId, item.evidenceId, {
        expectedRevision: item.revision,
        signer: account.address,
      });
      if (!sameSuiAddress(prepared.preview.signer, account.address)) {
        throw new Error("The connected Sui wallet does not match the deletion signer.");
      }
      const transaction = Transaction.from(prepared.preview.transactionBytesBase64);
      if (await transaction.getDigest() !== prepared.preview.transactionDigest) {
        throw new Error("The deletion transaction changed before wallet review.");
      }
      const result = await suiDAppKit.signAndExecuteTransaction({
        transaction,
        account,
        network: "testnet",
      });
      const executed = "Transaction" in result ? result.Transaction : result.FailedTransaction;
      if (!executed?.digest || executed.digest !== prepared.preview.transactionDigest) {
        throw new Error("The wallet returned a different transaction. The deletion was not recorded.");
      }
      if (!("Transaction" in result)) {
        throw new Error(executed.status?.error?.message ?? "The Sui wallet returned a failed deletion transaction.");
      }
      const confirmed = await active.client.confirmCryptoEvidenceWalrusDeletion(workspaceId, item.evidenceId, {
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: executed.digest,
      });
      setVerificationById((current) => ({
        ...current,
        [item.evidenceId]: {
          version: confirmed.item.version,
          evidence: confirmed.item,
          verification: confirmed.verification,
        },
      }));
      setCloudDeleteCandidateId(null);
      await queryClient.invalidateQueries({ queryKey });
    } catch (cause) {
      const message = userMessage(cause);
      setError(message === "Matterhorn could not load the evidence proof. Try again."
        && cause instanceof Error ? cause.message : message);
    } finally {
      setCloudDeletingId(null);
    }
  }, [account, query.data, queryClient, queryKey, workspaceId]);

  const anchorOnSui = useCallback(async (item: MatterhornEvidenceVerificationPacket) => {
    if (!anchorAcknowledged || !account?.address) return;
    setAnchoringId(item.evidenceId);
    setError(null);
    try {
      const active = query.data ?? await loadEvidence(workspaceId);
      const prepared = await active.client.anchorCryptoEvidenceOnSui(workspaceId, item.evidenceId, {
        expectedRevision: item.revision,
        signer: account.address,
      });
      if (!sameSuiAddress(prepared.preview.signer, account.address)) {
        throw new Error("The connected Sui wallet does not match the anchor signer.");
      }
      const transaction = Transaction.from(prepared.preview.transactionBytesBase64);
      if (await transaction.getDigest() !== prepared.preview.transactionDigest) {
        throw new Error("The anchor transaction changed before wallet review.");
      }
      const result = await suiDAppKit.signAndExecuteTransaction({
        transaction,
        account,
        network: "testnet",
      });
      const executed = "Transaction" in result ? result.Transaction : result.FailedTransaction;
      if (!executed?.digest || executed.digest !== prepared.preview.transactionDigest) {
        throw new Error("The wallet returned a different transaction. The anchor was not recorded.");
      }
      if (!("Transaction" in result)) {
        throw new Error(executed.status?.error?.message ?? "The Sui wallet returned a failed anchor transaction.");
      }
      await active.client.confirmCryptoEvidenceSuiAnchor(workspaceId, item.evidenceId, {
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: executed.digest,
      });
      setAnchorCandidateId(null);
      setAnchorAcknowledged(false);
      await queryClient.invalidateQueries({ queryKey });
    } catch (cause) {
      const message = userMessage(cause);
      setError(message === "Matterhorn could not load the evidence proof. Try again."
        && cause instanceof Error ? cause.message : message);
    } finally {
      setAnchoringId(null);
    }
  }, [account, anchorAcknowledged, query.data, queryClient, queryKey, workspaceId]);

  const copyPacket = useCallback(async (item: MatterhornEvidenceVerificationPacket) => {
    setError(null);
    try {
      await navigator.clipboard.writeText(JSON.stringify(item, null, 2));
      setCopiedId(item.evidenceId);
      window.setTimeout(() => setCopiedId((current) => current === item.evidenceId ? null : current), 2_000);
    } catch {
      setError("The browser could not copy this proof packet.");
    }
  }, []);

  const snapshot = query.data?.data;
  return (
    <main className="min-h-dvh overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 sm:py-8">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-6"
          onClick={() => navigate(`/workspace/${encodeURIComponent(workspaceId)}/crypto-apps`)}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to crypto apps
        </Button>

        <header className="border-b border-border pb-6">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Secure records</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Keep a private record of completed coworker work. If you choose, Matterhorn can store an encrypted backup on Walrus testnet. Your prompts and recovery keys stay private.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground" aria-label="Secure record protections">
            <span>Readable only by you</span>
            <span>Nothing stored publicly without your approval</span>
            <span>Coworkers cannot use your wallet</span>
          </div>
        </header>

        {query.isLoading ? (
          <div className="flex min-h-64 items-center gap-3 text-sm text-muted-foreground" role="status">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            Loading secure records…
          </div>
        ) : query.isError || !snapshot ? (
          <section className="py-10" aria-live="polite">
            <h2 className="text-base font-semibold">Secure records unavailable</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{userMessage(query.error)}</p>
            <Button className="mt-5" onClick={() => void query.refetch()}>Try again</Button>
          </section>
        ) : !snapshot.available ? (
          <section className="py-10">
            <h2 className="text-base font-semibold">Secure records are not available yet</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Your chat and wallet receipts remain in this private workspace.
            </p>
          </section>
        ) : snapshot.items.length === 0 ? (
          <section className="py-10">
            <h2 className="text-base font-semibold">No secure records yet</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Completed coworker receipts appear here after Matterhorn encrypts them. Optional Walrus backup is {snapshot.mode === "testnet" ? "available on testnet" : "currently off"}.
            </p>
          </section>
        ) : (
          <section className="py-2" aria-label="Secure records">
            {error ? <p className="border-b border-border py-4 text-sm text-destructive" role="alert">{error}</p> : null}
            {snapshot.items.map((item) => {
              const expanded = expandedId === item.evidenceId;
              const result = verificationById[item.evidenceId];
              const verification = result?.verification ?? item.lastVerification;
              const canVerify = item.state === "published" && snapshot.mode === "testnet";
              const canPublish = item.state === "sealed" && snapshot.publicationAvailable;
              const remainingEpochs = verification?.currentEpoch != null && item.publication
                ? Math.max(0, item.publication.validUntilEpoch - verification.currentEpoch)
                : null;
              const renewalDue = verification?.status === "verified"
                && remainingEpochs !== null
                && remainingEpochs > 0
                && remainingEpochs <= 2;
              const canRenew = Boolean(snapshot.renewalAvailable && item.walletLifecycleReady && renewalDue);
              const confirmingRenewal = renewCandidateId === item.evidenceId;
              const deletedFromWalrus = Boolean(item.publication?.deletionTransactionDigest);
              const canDeleteWalrusCopy = Boolean(
                snapshot.deletionAvailable
                && item.walletLifecycleReady
                && item.state === "published"
                && item.publication
                && !deletedFromWalrus,
              );
              const canAnchor = Boolean(
                snapshot.anchorAvailable
                && item.walletLifecycleReady
                && item.state === "published"
                && item.publication
                && !item.anchor
                && !deletedFromWalrus,
              );
              const confirmingAnchor = anchorCandidateId === item.evidenceId;
              const confirmingCloudDelete = cloudDeleteCandidateId === item.evidenceId;
              const confirmingPublish = publishCandidateId === item.evidenceId;
              const canDeleteRecoveryKey = item.retention.keyAvailable;
              const confirmingDelete = deleteCandidateId === item.evidenceId;
              return (
                <article key={item.evidenceId} className="border-b border-border py-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h2 className="font-semibold">Record {shortHash(item.evidenceId.replace(/^evidence_/, ""))}</h2>
                        <span className="text-xs text-muted-foreground">{statusLabel(item)}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">Created {formatDate(item.createdAt)}</p>
                      {verification ? (
                        <p className={verification.status === "verified" || verification.status === "deleted" ? "mt-2 text-sm text-emerald-600 dark:text-emerald-400" : "mt-2 text-sm text-destructive"} role="status">
                          {verification.status === "verified"
                            ? `Integrity checked ${formatDate(verification.verifiedAt)}`
                            : verification.status === "deleted"
                              ? `Deletion checked ${formatDate(verification.verifiedAt)}`
                            : `Integrity check ${verification.status.replaceAll("_", " ")}`}
                        </p>
                      ) : item.state === "published" ? (
                        <p className="mt-2 text-sm text-muted-foreground" role="status">Integrity check pending</p>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? null : item.evidenceId)}
                    >
                      {expanded ? "Hide details" : "View details"}
                      {expanded ? <ChevronUp aria-hidden="true" className="size-4" /> : <ChevronDown aria-hidden="true" className="size-4" />}
                    </Button>
                  </div>

                  {expanded ? (
                    <div className="mt-5 grid gap-6 border-t border-border pt-5 md:grid-cols-[minmax(0,1fr)_18rem]">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium">Technical proof</h3>
                        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
                          <dt className="text-muted-foreground">Ciphertext SHA-256</dt>
                          <dd className="break-all font-mono text-xs">{item.ciphertextSha256}</dd>
                          <dt className="text-muted-foreground">Merkle root</dt>
                          <dd className="break-all font-mono text-xs">{item.publication?.merkleRoot ?? "Not published"}</dd>
                          <dt className="text-muted-foreground">Sui object</dt>
                          <dd className="break-all font-mono text-xs">{item.publication?.suiObjectId ?? "Not published"}</dd>
                          <dt className="text-muted-foreground">Immutable anchor</dt>
                          <dd className="break-all font-mono text-xs">{item.anchor?.objectId ?? "Not created"}</dd>
                          {item.anchor ? (
                            <>
                              <dt className="text-muted-foreground">Anchor transaction</dt>
                              <dd className="break-all font-mono text-xs">{item.anchor.transactionDigest}</dd>
                            </>
                          ) : null}
                          <dt className="text-muted-foreground">Walrus blob</dt>
                          <dd className="break-all font-mono text-xs">
                            {deletedFromWalrus ? "Deleted" : item.publication?.blobId ?? "Not published"}
                          </dd>
                          <dt className="text-muted-foreground">Valid epochs</dt>
                          <dd>{item.publication ? `${item.publication.certifiedEpoch}–${item.publication.validUntilEpoch}` : "Not published"}</dd>
                          {remainingEpochs !== null ? (
                            <>
                              <dt className="text-muted-foreground">Storage remaining</dt>
                              <dd>{remainingEpochs} period{remainingEpochs === 1 ? "" : "s"}</dd>
                            </>
                          ) : null}
                          <dt className="text-muted-foreground">Recovery key</dt>
                          <dd>{item.retention.keyAvailable ? "Available to this workspace" : "Deleted"}</dd>
                          <dt className="text-muted-foreground">Content expiry</dt>
                          <dd>{formatDate(item.retention.expiresAt)}</dd>
                          {item.publication?.deletedAt ? (
                            <>
                              <dt className="text-muted-foreground">Deleted</dt>
                              <dd>{formatDate(item.publication.deletedAt)}</dd>
                            </>
                          ) : null}
                        </dl>
                        <Button variant="outline" size="sm" className="mt-5" onClick={() => void copyPacket(item)}>
                          {copiedId === item.evidenceId ? <Check aria-hidden="true" className="size-4" /> : <Clipboard aria-hidden="true" className="size-4" />}
                          {copiedId === item.evidenceId ? "Copied" : "Copy technical proof"}
                        </Button>
                      </div>

                      <div className="border-t border-border pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <ShieldCheck aria-hidden="true" className="size-4" />
                          {deletedFromWalrus ? "Deletion confirmed" : "Verification checks"}
                        </div>
                        {deletedFromWalrus ? (
                          <p className="mt-3 text-xs leading-5 text-muted-foreground">
                            Sui confirmed the exact wallet-reviewed deletion. Matterhorn also destroyed the recovery key. The public transaction record may remain.
                          </p>
                        ) : (
                          <ul className="mt-4 space-y-3">
                            <CheckLine ok={verification?.checks.tenantScope ?? true}>Belongs to this workspace</CheckLine>
                            <CheckLine ok={verification?.checks.ciphertextHash ?? false}>Encrypted data matches</CheckLine>
                            <CheckLine ok={verification?.checks.merkleInclusion ?? false}>Included in the stored backup</CheckLine>
                            <CheckLine ok={verification?.checks.suiCertification ?? false}>Sui record is current</CheckLine>
                            <CheckLine ok={verification?.checks.walrusReadback ?? false}>Stored backup matches</CheckLine>
                          </ul>
                        )}
                        {canVerify ? (
                          <Button
                            className="mt-5 w-full"
                            disabled={verifyingId === item.evidenceId}
                            onClick={() => void verify(item)}
                          >
                            {verifyingId === item.evidenceId ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw aria-hidden="true" className="size-4" />}
                            {verifyingId === item.evidenceId ? "Checking…" : "Check now"}
                          </Button>
                        ) : null}
                        {canRenew && !confirmingRenewal ? (
                          <Button
                            variant="outline"
                            className="mt-3 w-full"
                            onClick={() => {
                              setRenewCandidateId(item.evidenceId);
                              setAnchorCandidateId(null);
                              setAnchorAcknowledged(false);
                              setCloudDeleteCandidateId(null);
                              setDeleteCandidateId(null);
                              setDeleteAcknowledged(false);
                              setError(null);
                            }}
                          >
                            Renew encrypted copy
                          </Button>
                        ) : null}
                        {canRenew && confirmingRenewal ? (
                          <div className="mt-5 border-t border-border pt-4">
                            <p className="text-xs leading-5 text-muted-foreground">
                              Renewal uses WAL on Sui testnet. Matterhorn checks the exact transaction; only your connected wallet can sign and submit it.
                            </p>
                            {account?.address ? (
                              <p className="mt-2 font-mono text-[11px] text-foreground">
                                {account.address.slice(0, 10)}…{account.address.slice(-6)}
                              </p>
                            ) : wallets.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2" aria-label="Available Sui wallets">
                                {wallets.slice(0, 3).map((wallet) => (
                                  <Button
                                    key={`${wallet.name}-${wallet.version}`}
                                    size="sm"
                                    variant="outline"
                                    disabled={walletConnectingId === item.evidenceId || renewingId === item.evidenceId}
                                    onClick={() => void connectSuiWallet(item.evidenceId, wallet)}
                                  >
                                    <Wallet aria-hidden="true" className="size-4" />
                                    {walletConnectingId === item.evidenceId ? "Connecting…" : `Connect ${wallet.name}`}
                                  </Button>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-xs leading-5 text-foreground">Install a Sui-compatible wallet to renew this copy.</p>
                            )}
                            <div className="mt-4 flex flex-wrap gap-2">
                              {account?.address ? (
                                <Button
                                  size="sm"
                                  disabled={renewingId === item.evidenceId}
                                  onClick={() => void renew(item)}
                                >
                                  {renewingId === item.evidenceId ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
                                  {renewingId === item.evidenceId ? "Opening wallet…" : "Review in wallet"}
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={renewingId === item.evidenceId}
                                onClick={() => setRenewCandidateId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        {canAnchor && !confirmingAnchor && !confirmingRenewal && !confirmingCloudDelete ? (
                          <Button
                            variant="outline"
                            className="mt-3 w-full"
                            onClick={() => {
                              setAnchorCandidateId(item.evidenceId);
                              setAnchorAcknowledged(false);
                              setRenewCandidateId(null);
                              setCloudDeleteCandidateId(null);
                              setDeleteCandidateId(null);
                              setError(null);
                            }}
                          >
                            <Link2 aria-hidden="true" className="size-4" />
                            Create Sui anchor
                          </Button>
                        ) : null}
                        {canAnchor && confirmingAnchor ? (
                          <div className="mt-5 border-t border-border pt-4">
                            <p className="text-xs leading-5 text-foreground">
                              Your wallet will create a permanent Sui testnet record that links this encrypted Walrus copy to its Merkle root.
                            </p>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">
                              Prompts, account details, wallet addresses, and recovery keys are not included. The anchor and wallet transaction will remain public.
                            </p>
                            <label className="mt-3 flex cursor-pointer items-start gap-3 text-xs leading-5">
                              <input
                                type="checkbox"
                                checked={anchorAcknowledged}
                                onChange={(event) => setAnchorAcknowledged(event.target.checked)}
                                className="mt-0.5 size-4 shrink-0 accent-primary"
                              />
                              <span>I understand this non-content anchor is permanent and public.</span>
                            </label>
                            {account?.address ? (
                              <p className="mt-3 font-mono text-[11px] text-foreground">
                                {account.address.slice(0, 10)}…{account.address.slice(-6)}
                              </p>
                            ) : wallets.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2" aria-label="Available Sui wallets">
                                {wallets.slice(0, 3).map((wallet) => (
                                  <Button
                                    key={`${wallet.name}-${wallet.version}`}
                                    size="sm"
                                    variant="outline"
                                    disabled={walletConnectingId === item.evidenceId || anchoringId === item.evidenceId}
                                    onClick={() => void connectSuiWallet(item.evidenceId, wallet)}
                                  >
                                    <Wallet aria-hidden="true" className="size-4" />
                                    {walletConnectingId === item.evidenceId ? "Connecting…" : `Connect ${wallet.name}`}
                                  </Button>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-xs leading-5 text-foreground">Install a Sui-compatible wallet to create this anchor.</p>
                            )}
                            <div className="mt-4 flex flex-wrap gap-2">
                              {account?.address ? (
                                <Button
                                  size="sm"
                                  disabled={!anchorAcknowledged || anchoringId === item.evidenceId}
                                  onClick={() => void anchorOnSui(item)}
                                >
                                  {anchoringId === item.evidenceId ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
                                  {anchoringId === item.evidenceId ? "Opening wallet…" : "Review in wallet"}
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={anchoringId === item.evidenceId}
                                onClick={() => {
                                  setAnchorCandidateId(null);
                                  setAnchorAcknowledged(false);
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        {canPublish && !confirmingPublish ? (
                          <Button
                            className="mt-5 w-full"
                            onClick={() => {
                              setPublishCandidateId(item.evidenceId);
                              setAnchorCandidateId(null);
                              setAnchorAcknowledged(false);
                              setCloudDeleteCandidateId(null);
                              setPublishAcknowledged(false);
                              setDeleteCandidateId(null);
                              setDeleteAcknowledged(false);
                              setError(null);
                            }}
                          >
                            <CloudUpload aria-hidden="true" className="size-4" />
                            Store encrypted copy
                          </Button>
                        ) : null}
                        {canPublish && confirmingPublish ? (
                          <div className="mt-5 border-t border-border pt-4">
                            <p className="text-xs leading-5 text-muted-foreground">
                              Only encrypted bytes go to the public Walrus test network. The Blob object will be assigned to your connected Sui wallet so only that wallet can renew or delete it. Your wallet address and the transaction remain public.
                            </p>
                            <label className="mt-3 flex cursor-pointer items-start gap-3 text-xs leading-5">
                              <input
                                type="checkbox"
                                checked={publishAcknowledged}
                                onChange={(event) => setPublishAcknowledged(event.target.checked)}
                                className="mt-0.5 size-4 shrink-0 accent-primary"
                              />
                              <span>I understand that the encrypted public bytes may remain.</span>
                            </label>
                            {account?.address ? (
                              <p className="mt-3 font-mono text-[11px] text-foreground">
                                Owner {account.address.slice(0, 10)}…{account.address.slice(-6)}
                              </p>
                            ) : wallets.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2" aria-label="Available Sui wallets">
                                {wallets.slice(0, 3).map((wallet) => (
                                  <Button
                                    key={`${wallet.name}-${wallet.version}`}
                                    size="sm"
                                    variant="outline"
                                    disabled={walletConnectingId === item.evidenceId || publishingId === item.evidenceId}
                                    onClick={() => void connectSuiWallet(item.evidenceId, wallet)}
                                  >
                                    <Wallet aria-hidden="true" className="size-4" />
                                    {walletConnectingId === item.evidenceId ? "Connecting…" : `Connect ${wallet.name}`}
                                  </Button>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-xs leading-5 text-foreground">Install a Sui-compatible wallet to own this encrypted copy.</p>
                            )}
                            <div className="mt-4 flex gap-2">
                              <Button
                                size="sm"
                                disabled={!publishAcknowledged || !account?.address || publishingId === item.evidenceId}
                                onClick={() => void publish(item)}
                              >
                                {publishingId === item.evidenceId ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
                                {publishingId === item.evidenceId ? "Storing…" : "Confirm storage"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={publishingId === item.evidenceId}
                                onClick={() => {
                                  setPublishCandidateId(null);
                                  setPublishAcknowledged(false);
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        {canDeleteWalrusCopy && !confirmingCloudDelete && !confirmingRenewal ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-5 w-full justify-start text-destructive hover:text-destructive"
                            onClick={() => {
                              setCloudDeleteCandidateId(item.evidenceId);
                              setAnchorCandidateId(null);
                              setAnchorAcknowledged(false);
                              setRenewCandidateId(null);
                              setDeleteCandidateId(null);
                              setDeleteAcknowledged(false);
                              setPublishCandidateId(null);
                              setPublishAcknowledged(false);
                              setError(null);
                            }}
                          >
                            <Trash2 aria-hidden="true" className="size-4" />
                            Delete encrypted copy
                          </Button>
                        ) : null}
                        {canDeleteWalrusCopy && confirmingCloudDelete ? (
                          <div className="mt-5 border-t border-border pt-4">
                            <p className="text-xs leading-5 text-foreground">
                              Your Sui wallet will review and submit one exact testnet deletion. Matterhorn will then destroy the recovery key.
                            </p>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">
                              This cannot be undone. The public Sui transaction may remain even after the encrypted Walrus copy is deleted.
                            </p>
                            {account?.address ? (
                              <p className="mt-2 font-mono text-[11px] text-foreground">
                                {account.address.slice(0, 10)}…{account.address.slice(-6)}
                              </p>
                            ) : wallets.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2" aria-label="Available Sui wallets">
                                {wallets.slice(0, 3).map((wallet) => (
                                  <Button
                                    key={`${wallet.name}-${wallet.version}`}
                                    size="sm"
                                    variant="outline"
                                    disabled={walletConnectingId === item.evidenceId || cloudDeletingId === item.evidenceId}
                                    onClick={() => void connectSuiWallet(item.evidenceId, wallet)}
                                  >
                                    <Wallet aria-hidden="true" className="size-4" />
                                    {walletConnectingId === item.evidenceId ? "Connecting…" : `Connect ${wallet.name}`}
                                  </Button>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-xs leading-5 text-foreground">Install a Sui-compatible wallet to delete this copy.</p>
                            )}
                            <div className="mt-4 flex flex-wrap gap-2">
                              {account?.address ? (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={cloudDeletingId === item.evidenceId}
                                  onClick={() => void deleteWalrusCopy(item)}
                                >
                                  {cloudDeletingId === item.evidenceId ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
                                  {cloudDeletingId === item.evidenceId ? "Opening wallet…" : "Delete in wallet"}
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={cloudDeletingId === item.evidenceId}
                                onClick={() => setCloudDeleteCandidateId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        {item.publication && !item.walletLifecycleReady && item.state === "published" ? (
                          <p className="mt-4 text-xs leading-5 text-muted-foreground">
                            This older copy was not assigned to a user wallet, so wallet renewal and deletion are unavailable. You can still delete its recovery key below.
                          </p>
                        ) : null}
                        {canDeleteRecoveryKey && !confirmingDelete && !confirmingCloudDelete ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-5 w-full justify-start text-destructive hover:text-destructive"
                            onClick={() => {
                              setDeleteCandidateId(item.evidenceId);
                              setAnchorCandidateId(null);
                              setAnchorAcknowledged(false);
                              setCloudDeleteCandidateId(null);
                              setDeleteAcknowledged(false);
                              setPublishCandidateId(null);
                              setPublishAcknowledged(false);
                              setError(null);
                            }}
                          >
                            <Trash2 aria-hidden="true" className="size-4" />
                            {canDeleteWalrusCopy ? "Delete recovery key only" : "Delete recovery key"}
                          </Button>
                        ) : null}
                        {canDeleteRecoveryKey && confirmingDelete ? (
                          <div className="mt-5 border-t border-border pt-4">
                            <p className="text-xs leading-5 text-foreground">
                              This cannot be undone. Matterhorn will no longer be able to open this evidence.
                            </p>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">
                              {item.publication
                                ? "The encrypted public copy may remain on Walrus, but Matterhorn will delete the recovery key."
                                : "The encrypted local content and its recovery key will be removed."}
                            </p>
                            <label className="mt-3 flex cursor-pointer items-start gap-3 text-xs leading-5">
                              <input
                                type="checkbox"
                                checked={deleteAcknowledged}
                                onChange={(event) => setDeleteAcknowledged(event.target.checked)}
                                className="mt-0.5 size-4 shrink-0 accent-destructive"
                              />
                              <span>I understand this evidence cannot be recovered.</span>
                            </label>
                            <div className="mt-4 flex gap-2">
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={!deleteAcknowledged || deletingId === item.evidenceId}
                                onClick={() => void destroyRecoveryKey(item)}
                              >
                                {deletingId === item.evidenceId ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
                                {deletingId === item.evidenceId ? "Deleting…" : "Delete key"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={deletingId === item.evidenceId}
                                onClick={() => {
                                  setDeleteCandidateId(null);
                                  setDeleteAcknowledged(false);
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        {!canVerify ? (
                          <p className="mt-3 text-xs leading-5 text-muted-foreground">
                            {item.state === "sealed"
                              ? snapshot.publicationAvailable
                                ? "This encrypted record stays private until you choose to store a testnet copy."
                                : "Encrypted testnet storage is not configured. This record stays in Matterhorn."
                              : item.state === "key_destroyed"
                                ? deletedFromWalrus
                                  ? "The wallet-confirmed Walrus deletion and recovery-key deletion are recorded."
                                  : "The recovery key has been deleted, so this record can no longer be opened."
                                : "Live verification is available only for published testnet evidence."}
                          </p>
                        ) : null}
                        {verification?.reason ? (
                          <p className="mt-3 break-words text-xs leading-5 text-muted-foreground">
                            {verification.reason.replaceAll("_", " ")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

export default CryptoEvidenceRoute;
