/** @jsxImportSource react */

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useNavigate, useParams } from "react-router";

import type {
  MatterhornEvidenceVerificationPacket,
  MatterhornEvidenceVerificationResult,
} from "@matterhorn-work/types/crypto-coworkers";

import { Button } from "../../../components/ui/button";
import { createMatterhornServerClient, MatterhornServerError } from "../../../app/lib/matterhorn-server";
import { resolveMatterhornConnection } from "../../shell/matterhorn-connection";

type ServerClient = ReturnType<typeof createMatterhornServerClient>;

const QUERY_PREFIX = "crypto-evidence";

function shortHash(value: string): string {
  return value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

function formatDate(value: string | null): string {
  if (!value) return "No automatic expiry";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unknown";
}

function statusLabel(item: MatterhornEvidenceVerificationPacket): string {
  if (item.state === "key_destroyed") return "Recovery key deleted";
  if (item.state === "published") return "Published and encrypted";
  return "Encrypted locally";
}

function userMessage(error: unknown): string {
  if (error instanceof MatterhornServerError) {
    if (error.code === "crypto_evidence_unavailable") return "Encrypted coworker evidence is not enabled for this deployment.";
    if (error.code === "crypto_evidence_not_found") return "This evidence record no longer exists or belongs to another workspace.";
    if (error.code === "crypto_evidence_verification_unavailable") return "Live verification is temporarily unavailable. No proof state was changed.";
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
  const { workspaceId = "" } = useParams<{ workspaceId: string }>();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
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
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Encrypted evidence</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Check that a coworker receipt is still encrypted, bound to its Walrus blob, and certified on Sui testnet. Matterhorn never puts prompts or recovery keys in this packet.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground" aria-label="Evidence safety boundary">
            <span>Ciphertext only</span>
            <span>Owner-scoped access</span>
            <span>Read-only verification</span>
            <span>No wallet signature</span>
          </div>
        </header>

        {query.isLoading ? (
          <div className="flex min-h-64 items-center gap-3 text-sm text-muted-foreground" role="status">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            Loading encrypted evidence…
          </div>
        ) : query.isError || !snapshot ? (
          <section className="py-10" aria-live="polite">
            <h2 className="text-base font-semibold">Evidence unavailable</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{userMessage(query.error)}</p>
            <Button className="mt-5" onClick={() => void query.refetch()}>Try again</Button>
          </section>
        ) : !snapshot.available ? (
          <section className="py-10">
            <h2 className="text-base font-semibold">Encrypted evidence is not configured</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              This deployment has no server-side evidence key manager. Chat and wallet receipts continue to use their existing private workspace storage.
            </p>
          </section>
        ) : snapshot.items.length === 0 ? (
          <section className="py-10">
            <h2 className="text-base font-semibold">No encrypted coworker evidence yet</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Finalized coworker receipts will appear here after they are sealed by the server. Walrus publication is {snapshot.mode === "testnet" ? "configured for testnet" : "currently off"}.
            </p>
          </section>
        ) : (
          <section className="py-2" aria-label="Encrypted evidence records">
            {error ? <p className="border-b border-border py-4 text-sm text-destructive" role="alert">{error}</p> : null}
            {snapshot.items.map((item) => {
              const expanded = expandedId === item.evidenceId;
              const result = verificationById[item.evidenceId];
              const canVerify = item.state === "published" && snapshot.mode === "testnet";
              return (
                <article key={item.evidenceId} className="border-b border-border py-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h2 className="font-semibold">Evidence {shortHash(item.evidenceId.replace(/^evidence_/, ""))}</h2>
                        <span className="text-xs text-muted-foreground">{statusLabel(item)}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">Created {formatDate(item.createdAt)}</p>
                      {result ? (
                        <p className={result.verification.status === "verified" ? "mt-2 text-sm text-emerald-600 dark:text-emerald-400" : "mt-2 text-sm text-destructive"} role="status">
                          {result.verification.status === "verified" ? "Live verification passed" : `Verification ${result.verification.status.replaceAll("_", " ")}`}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? null : item.evidenceId)}
                    >
                      {expanded ? "Hide proof" : "Review proof"}
                      {expanded ? <ChevronUp aria-hidden="true" className="size-4" /> : <ChevronDown aria-hidden="true" className="size-4" />}
                    </Button>
                  </div>

                  {expanded ? (
                    <div className="mt-5 grid gap-6 border-t border-border pt-5 md:grid-cols-[minmax(0,1fr)_18rem]">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium">Public verification packet</h3>
                        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
                          <dt className="text-muted-foreground">Ciphertext SHA-256</dt>
                          <dd className="break-all font-mono text-xs">{item.ciphertextSha256}</dd>
                          <dt className="text-muted-foreground">Merkle root</dt>
                          <dd className="break-all font-mono text-xs">{item.publication?.merkleRoot ?? "Not published"}</dd>
                          <dt className="text-muted-foreground">Sui object</dt>
                          <dd className="break-all font-mono text-xs">{item.publication?.suiObjectId ?? "Not published"}</dd>
                          <dt className="text-muted-foreground">Walrus blob</dt>
                          <dd className="break-all font-mono text-xs">{item.publication?.blobId ?? "Not published"}</dd>
                          <dt className="text-muted-foreground">Valid epochs</dt>
                          <dd>{item.publication ? `${item.publication.certifiedEpoch}–${item.publication.validUntilEpoch}` : "Not published"}</dd>
                          <dt className="text-muted-foreground">Recovery key</dt>
                          <dd>{item.retention.keyAvailable ? "Available to this workspace" : "Deleted"}</dd>
                          <dt className="text-muted-foreground">Content expiry</dt>
                          <dd>{formatDate(item.retention.expiresAt)}</dd>
                        </dl>
                        <Button variant="outline" size="sm" className="mt-5" onClick={() => void copyPacket(item)}>
                          {copiedId === item.evidenceId ? <Check aria-hidden="true" className="size-4" /> : <Clipboard aria-hidden="true" className="size-4" />}
                          {copiedId === item.evidenceId ? "Copied" : "Copy proof packet"}
                        </Button>
                      </div>

                      <div className="border-t border-border pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <ShieldCheck aria-hidden="true" className="size-4" />
                          Verification checks
                        </div>
                        <ul className="mt-4 space-y-3">
                          <CheckLine ok={result?.verification.checks.tenantScope ?? true}>Owner and workspace scope</CheckLine>
                          <CheckLine ok={result?.verification.checks.ciphertextHash ?? false}>Exact ciphertext hash</CheckLine>
                          <CheckLine ok={result?.verification.checks.merkleInclusion ?? false}>Merkle inclusion</CheckLine>
                          <CheckLine ok={result?.verification.checks.suiCertification ?? false}>Sui certification is current</CheckLine>
                          <CheckLine ok={result?.verification.checks.walrusReadback ?? false}>Walrus bytes match</CheckLine>
                        </ul>
                        <Button
                          className="mt-5 w-full"
                          disabled={!canVerify || verifyingId === item.evidenceId}
                          onClick={() => void verify(item)}
                        >
                          {verifyingId === item.evidenceId ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw aria-hidden="true" className="size-4" />}
                          {verifyingId === item.evidenceId ? "Verifying…" : "Verify live"}
                        </Button>
                        {!canVerify ? (
                          <p className="mt-3 text-xs leading-5 text-muted-foreground">
                            Live verification is available only for published testnet evidence.
                          </p>
                        ) : null}
                        {result?.verification.reason ? (
                          <p className="mt-3 break-words text-xs leading-5 text-muted-foreground">
                            {result.verification.reason.replaceAll("_", " ")}
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
