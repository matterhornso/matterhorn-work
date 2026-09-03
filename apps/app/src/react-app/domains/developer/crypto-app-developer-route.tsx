/** @jsxImportSource react */

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock3, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router";

import {
  createMatterhornCryptoDeveloperClient,
  MatterhornCryptoDeveloperClientError,
  type MatterhornCryptoDeveloperStatus,
  type MatterhornCryptoDeveloperSubmissionView,
} from "@matterhorn-work/crypto-app-sdk";
import {
  validateMatterhornCryptoAppManifest,
  type MatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { resolveMatterhornConnection } from "../../shell/matterhorn-connection";
import { DeveloperIntegrationSetup } from "./developer-integration-setup";
import { DeveloperQuickstartSetup } from "./developer-quickstart-setup";

const QUERY_KEY = ["crypto-app-developer-portal"] as const;

type PortalSnapshot = {
  status: MatterhornCryptoDeveloperStatus;
  submissions: MatterhornCryptoDeveloperSubmissionView[];
};

type DeveloperClient = ReturnType<typeof createMatterhornCryptoDeveloperClient>;

const stepCopy: Record<MatterhornCryptoDeveloperStatus["nextStep"], { title: string; body: string }> = {
  enroll: {
    title: "Accept your developer invite",
    body: "Use the one-time invite from Matterhorn and choose the public publisher identity shown on manifests.",
  },
  register_public_key: {
    title: "Register a public signing key",
    body: "Add an Ed25519 public key. Keep the private key in your own HSM, KMS, or offline signer.",
  },
  submit_testnet_manifest: {
    title: "Submit a signed testnet manifest",
    body: "Stage one immutable revision. Matterhorn checks authority, schemas, network scope, and signature before runtime testing.",
  },
  fix_static_conformance: {
    title: "Fix static conformance",
    body: "Review the failed revision below, correct the reported contract issues, and submit a new immutable revision.",
  },
  request_testnet_certification: {
    title: "Request testnet certification",
    body: "Static checks passed. Request Matterhorn's independent runtime, egress, timeout, and adversarial-output probes.",
  },
  await_certification_review: {
    title: "Certification review is queued",
    body: "Matterhorn is running independent testnet probes. Passing local or static checks never promotes an app automatically.",
  },
  fix_runtime_certification: {
    title: "Runtime review needs a new revision",
    body: "One or more independent testnet checks failed. Fix the adapter, sign a new immutable manifest revision, and submit it below.",
  },
  certification_complete: {
    title: "Testnet review passed",
    body: "Independent checks passed. This does not list or promote the app; Matterhorn completes that separate host review with you.",
  },
};

function messageFor(error: unknown): string {
  if (error instanceof MatterhornCryptoDeveloperClientError) {
    if (error.serverCode === "developer_account_session_required") return "Sign in with your Matterhorn account to continue.";
    if (error.serverCode === "crypto_app_gateway_disabled") return "The invite-only developer gateway is not enabled on this deployment.";
    if (error.serverCode === "developer_invite_invalid") return "That invite is not valid. Ask Matterhorn for a new invite.";
    if (error.serverCode === "developer_invite_expired") return "That invite has expired. Ask Matterhorn for a new invite.";
    if (error.serverCode === "developer_invite_consumed") return "That invite has already been used.";
    if (error.serverCode === "developer_publisher_key_invalid") return "Use a valid Ed25519 public key in PEM format. Private keys are never accepted.";
    if (error.serverCode === "developer_manifest_invalid") return "The signed manifest is incomplete or does not match the certification contract.";
    if (error.serverCode === "developer_mainnet_unavailable") return "Mainnet certification is not available in this release. Submit a testnet-only manifest.";
    if (error.serverCode === "developer_submission_policy_stale") return "Certification policy changed. Submit a new manifest revision against the current policy.";
    if (error.issues.length) return error.issues.slice(0, 3).join(" · ");
  }
  return "Matterhorn could not complete that request. Try again or contact support.";
}

function readableFinding(code: string): string {
  return code.replaceAll("_", " ");
}

async function connect(): Promise<{
  client: DeveloperClient;
  snapshot: PortalSnapshot;
  serverOrigin: string;
}> {
  const connection = await resolveMatterhornConnection();
  if (!connection.normalizedBaseUrl) throw new Error("developer_connection_unavailable");
  const client = createMatterhornCryptoDeveloperClient({ baseUrl: connection.normalizedBaseUrl });
  const [{ status }, submissions] = await Promise.all([client.getStatus(), client.listSubmissions().catch((error) => {
    if (error instanceof MatterhornCryptoDeveloperClientError && error.serverCode === "developer_not_enrolled") return [];
    throw error;
  })]);
  return { client, snapshot: { status, submissions }, serverOrigin: connection.normalizedBaseUrl };
}

function StateMark({ step }: { step: MatterhornCryptoDeveloperStatus["nextStep"] }) {
  const Icon = step === "register_public_key" ? KeyRound
    : step === "await_certification_review" ? Clock3
      : step === "request_testnet_certification" || step === "certification_complete" ? ShieldCheck
        : Check;
  return <Icon aria-hidden="true" className="size-5 shrink-0 text-foreground" />;
}

export function CryptoAppDeveloperRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState("");
  const [publisherId, setPublisherId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [keyId, setKeyId] = useState("");
  const [publicKeyPem, setPublicKeyPem] = useState("");
  const [manifestJson, setManifestJson] = useState("");

  const portal = useQuery({ queryKey: QUERY_KEY, queryFn: connect, retry: false });
  const snapshot = portal.data?.snapshot;
  const copy = snapshot ? stepCopy[snapshot.status.nextStep] : null;

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  const run = useCallback(async (operation: (client: DeveloperClient) => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const active = portal.data ?? await connect();
      await operation(active.client);
      await refresh();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }, [portal.data, refresh]);

  const submitManifest = useCallback(() => run(async (client) => {
    if (/PRIVATE KEY|seed phrase|mnemonic/i.test(manifestJson)) {
      setError("Private keys and recovery phrases are never accepted. Sign the manifest outside Matterhorn and paste only the signed public manifest.");
      return;
    }
    let candidate: unknown;
    try {
      candidate = JSON.parse(manifestJson);
    } catch {
      setError("Manifest JSON is not valid.");
      return;
    }
    const issues = validateMatterhornCryptoAppManifest(candidate as MatterhornCryptoAppManifest);
    if (issues.length) {
      setError(issues.slice(0, 3).join(" · "));
      return;
    }
    await client.submitTestnetManifest(candidate as MatterhornCryptoAppManifest);
    setManifestJson("");
  }), [manifestJson, run]);

  const requested = useMemo(
    () => snapshot?.submissions.filter((item) => item.state === "certification_requested") ?? [],
    [snapshot],
  );
  const latestFailed = useMemo(
    () => snapshot?.submissions.find((item) => item.state === "static_failed") ?? null,
    [snapshot],
  );
  const latestRuntimeFailed = useMemo(
    () => snapshot?.submissions.find((item) => item.state === "certification_failed") ?? null,
    [snapshot],
  );

  return (
    <main className="min-h-dvh overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 sm:py-8">
        <Button variant="ghost" size="sm" className="-ml-2 mb-6 min-h-11" onClick={() => navigate("/session")}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to Matterhorn
        </Button>

        <header className="border-b border-border pb-6">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Crypto app certification</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Publish a narrow testnet capability for Matterhorn coworkers. Your adapter never receives wallet signing or submission authority.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground" aria-label="Certification safety boundary">
            <span>Testnet only</span>
            <span>Public keys only</span>
            <span>Connected wallet signs</span>
            <span>Independent runtime probes</span>
          </div>
        </header>

        {portal.isLoading ? (
          <div className="flex min-h-64 items-center gap-3 text-sm text-muted-foreground" role="status">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            Loading developer status…
          </div>
        ) : portal.isError || !snapshot || !copy ? (
          <section className="py-10" aria-live="polite">
            <h2 className="text-base font-semibold">Developer portal unavailable</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{messageFor(portal.error)}</p>
            <Button className="mt-5 min-h-11" onClick={() => void portal.refetch()}>Try again</Button>
          </section>
        ) : (
          <>
            <section className="grid gap-8 border-b border-border py-8 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
              <div>
                <div className="flex items-start gap-3">
                  <StateMark step={snapshot.status.nextStep} />
                  <div>
                    <h2 className="text-lg font-semibold">{copy.title}</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.body}</p>
                  </div>
                </div>
                <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                  <div><dt className="text-muted-foreground">Policy</dt><dd className="mt-1 font-medium">{snapshot.status.policyVersion}</dd></div>
                  <div><dt className="text-muted-foreground">Environment</dt><dd className="mt-1 font-medium">Sui, Hyperliquid, or Bittensor testnet</dd></div>
                  <div><dt className="text-muted-foreground">Signing boundary</dt><dd className="mt-1 font-medium">External signer</dd></div>
                  <div><dt className="text-muted-foreground">Mainnet</dt><dd className="mt-1 font-medium">Unavailable</dd></div>
                </dl>
              </div>

              <div className="border-t border-border pt-6 md:border-l md:border-t-0 md:pl-8 md:pt-0">
                {snapshot.status.nextStep === "enroll" ? (
                  <form className="space-y-4" onSubmit={(event) => {
                    event.preventDefault();
                    void run((client) => client.enroll({ inviteToken, publisherId, displayName }));
                  }}>
                    <div><Label htmlFor="developer-invite">Invite token</Label><Input id="developer-invite" className="mt-2" value={inviteToken} onChange={(event) => setInviteToken(event.target.value)} autoComplete="off" required /></div>
                    <div><Label htmlFor="publisher-id">Publisher ID</Label><Input id="publisher-id" className="mt-2" value={publisherId} onChange={(event) => setPublisherId(event.target.value)} placeholder="company.protocol" required /></div>
                    <div><Label htmlFor="publisher-name">Display name</Label><Input id="publisher-name" className="mt-2" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></div>
                    <Button type="submit" className="min-h-11" disabled={busy}>{busy ? "Enrolling…" : "Accept invite"}</Button>
                  </form>
                ) : snapshot.status.nextStep === "register_public_key" ? (
                  <form className="space-y-4" onSubmit={(event) => {
                    event.preventDefault();
                    void run((client) => client.registerPublisherKey({ keyId, algorithm: "ed25519", publicKeyPem }));
                  }}>
                    <div><Label htmlFor="publisher-key-id">Key ID</Label><Input id="publisher-key-id" className="mt-2" value={keyId} onChange={(event) => setKeyId(event.target.value)} placeholder="release-key-1" required /></div>
                    <div><Label htmlFor="publisher-public-key">Ed25519 public key (PEM)</Label><Textarea id="publisher-public-key" className="mt-2 min-h-36 font-mono text-xs" value={publicKeyPem} onChange={(event) => setPublicKeyPem(event.target.value)} spellCheck={false} required /></div>
                    <p className="text-xs leading-5 text-muted-foreground">Do not paste a private key. Matterhorn stores only the public SPKI key and its fingerprint.</p>
                    <Button type="submit" className="min-h-11" disabled={busy}>{busy ? "Registering…" : "Register public key"}</Button>
                  </form>
                ) : snapshot.status.nextStep === "submit_testnet_manifest"
                  || snapshot.status.nextStep === "fix_static_conformance"
                  || snapshot.status.nextStep === "fix_runtime_certification" ? (
                  <div className="space-y-4">
                    <div><Label htmlFor="developer-manifest">Signed manifest JSON</Label><Textarea id="developer-manifest" className="mt-2 min-h-56 font-mono text-xs" value={manifestJson} onChange={(event) => setManifestJson(event.target.value)} spellCheck={false} /></div>
                    <Button className="min-h-11" disabled={busy || !manifestJson.trim()} onClick={() => void submitManifest()}>{busy ? "Checking…" : "Run static checks"}</Button>
                    {snapshot.status.nextStep === "fix_static_conformance" && latestFailed ? (
                      <div className="border-t border-border pt-4">
                        <p className="text-sm font-medium">Latest revision findings</p>
                        <ul className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
                          {latestFailed.staticReport.findings.filter((finding) => finding.severity === "error").slice(0, 6).map((finding) => (
                            <li key={`${finding.code}:${finding.actionId ?? "manifest"}`}>
                              <span className="capitalize text-foreground">{readableFinding(finding.code)}</span>
                              {finding.actionId ? ` · action ${finding.actionId}` : " · manifest"}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-3 text-xs leading-5 text-muted-foreground">Submit a new immutable revision after correcting these issues. The failed revision is retained for audit history.</p>
                      </div>
                    ) : snapshot.status.nextStep === "fix_runtime_certification" && latestRuntimeFailed?.runtimeReview ? (
                      <div className="border-t border-border pt-4">
                        <p className="text-sm font-medium">Checks to address</p>
                        <ul className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
                          {latestRuntimeFailed.runtimeReview.probes.filter((probe) => !probe.passed).map((probe) => (
                            <li key={probe.id} className="capitalize text-foreground">{readableFinding(probe.id)}</li>
                          ))}
                        </ul>
                        <p className="mt-3 text-xs leading-5 text-muted-foreground">Submit a newly signed revision. The failed result remains in the audit history and cannot be overwritten.</p>
                      </div>
                    ) : null}
                  </div>
                ) : snapshot.status.nextStep === "request_testnet_certification" ? (
                  <div className="space-y-3">
                    {snapshot.submissions.filter((item) => item.state === "static_passed").map((item) => (
                      <div key={`${item.appId}:${item.manifestRevision}`} className="border-b border-border pb-3 last:border-0">
                        <p className="text-sm font-medium">{item.manifest.displayName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Revision {item.manifestRevision}</p>
                        <Button size="sm" className="mt-3 min-h-11" disabled={busy} onClick={() => void run((client) => client.requestTestnetCertification(item.appId, item.manifestRevision))}>Request certification</Button>
                      </div>
                    ))}
                  </div>
                ) : snapshot.status.nextStep === "await_certification_review" ? (
                  <div className="flex items-start gap-3 text-sm">
                    <Clock3 aria-hidden="true" className="mt-0.5 size-4" />
                    <p className="leading-6 text-muted-foreground">{requested.length} revision{requested.length === 1 ? " is" : "s are"} awaiting independent review.</p>
                  </div>
                ) : (
                  <div className="text-sm">
                    <p className="font-medium">Independent testnet review complete</p>
                    <p className="mt-2 leading-6 text-muted-foreground">Matterhorn will contact you about the separate listing review. No mainnet or wallet authority has been granted.</p>
                  </div>
                )}
                {error ? <p className="mt-4 text-sm text-destructive" role="alert">{error}</p> : null}
              </div>
            </section>

            {snapshot.status.enrolled && portal.data ? (
              <>
                <DeveloperQuickstartSetup />
                <DeveloperIntegrationSetup serverOrigin={portal.data.serverOrigin} />
              </>
            ) : null}

            <section className="py-8">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-base font-semibold">Submitted revisions</h2>
                <span className="text-sm text-muted-foreground">{snapshot.submissions.length} total</span>
              </div>
              {snapshot.submissions.length === 0 ? (
                <p className="mt-4 border-t border-border py-6 text-sm text-muted-foreground">No revisions yet. Complete the next step above to stage your first testnet manifest.</p>
              ) : (
                <div className="mt-4 overflow-x-auto border-y border-border">
                  <table className="w-full min-w-[42rem] text-left text-sm">
                    <thead className="text-xs text-muted-foreground"><tr><th className="py-3 pr-4 font-medium">App</th><th className="px-4 py-3 font-medium">Revision</th><th className="px-4 py-3 font-medium">Static checks</th><th className="px-4 py-3 font-medium">Review</th></tr></thead>
                    <tbody>{snapshot.submissions.map((item) => (
                      <tr key={`${item.appId}:${item.manifestRevision}`} className="border-t border-border">
                        <td className="py-4 pr-4"><span className="font-medium">{item.manifest.displayName}</span><span className="mt-1 block text-xs text-muted-foreground">{item.appId}</span></td>
                        <td className="px-4 py-4 font-mono text-xs">{item.manifestRevision}</td>
                        <td className="px-4 py-4">{item.staticReport.passed ? "Passed" : `${item.staticReport.findings.filter((finding) => finding.severity === "error").length} issues`}</td>
                        <td className="px-4 py-4">{
                          item.state === "certification_requested" ? "Queued"
                            : item.state === "certification_passed" ? "Passed"
                              : item.state === "certification_failed" ? "Needs new revision"
                                : item.state === "static_passed" ? "Ready to request"
                                  : "Fix and resubmit"
                        }</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
