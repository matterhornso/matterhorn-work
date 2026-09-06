/** @jsxImportSource react */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock3, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router";

import {
  createMatterhornCryptoDeveloperClient,
  MatterhornCryptoDeveloperClientError,
  type MatterhornCryptoDeveloperStatus,
  type MatterhornCryptoDeveloperSubmissionView,
  type MatterhornCryptoDeveloperUsageReport,
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
import {
  capturePendingDeveloperInviteFromBrowser,
  takePendingDeveloperInvite,
} from "./developer-invite-fragment";
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

function usageRevisionKey(item: Pick<MatterhornCryptoDeveloperSubmissionView, "appId" | "manifestRevision">): string {
  return JSON.stringify([item.appId, item.manifestRevision]);
}

function formatEstimatedCost(costMicros: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: costMicros > 0 && costMicros < 10_000 ? 4 : 2,
  }).format(costMicros / 1_000_000);
}

function formatLatency(latencyMs: number | null): string {
  if (latencyMs === null) return "No completed calls";
  if (latencyMs < 1_000) return `${latencyMs} ms`;
  return `${(latencyMs / 1_000).toFixed(latencyMs < 10_000 ? 1 : 0)} sec`;
}

function successRate(usage: MatterhornCryptoDeveloperUsageReport): string {
  const completed = usage.totals.succeeded + usage.totals.failed + usage.totals.timedOut;
  if (completed === 0) return "No completed calls";
  return `${Math.round((usage.totals.succeeded / completed) * 100)}%`;
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
  const [inviteLoaded, setInviteLoaded] = useState(false);
  const [usageRevision, setUsageRevision] = useState("");
  const [usageWindowDays, setUsageWindowDays] = useState<7 | 30>(7);

  useEffect(() => {
    capturePendingDeveloperInviteFromBrowser();
    const fragment = takePendingDeveloperInvite();
    if (!fragment.detected) return;
    if (fragment.token) {
      setInviteToken(fragment.token);
      setInviteLoaded(true);
      return;
    }
    setError("This developer invite link is not valid. Ask Matterhorn for a new invite.");
  }, []);

  const portal = useQuery({ queryKey: QUERY_KEY, queryFn: connect, retry: false });
  const snapshot = portal.data?.snapshot;
  const copy = snapshot ? stepCopy[snapshot.status.nextStep] : null;
  const selectedUsageSubmission = useMemo(() => {
    const submissions = snapshot?.submissions ?? [];
    return submissions.find((item) => usageRevisionKey(item) === usageRevision) ?? submissions[0] ?? null;
  }, [snapshot?.submissions, usageRevision]);
  const usage = useQuery({
    queryKey: [
      ...QUERY_KEY,
      "usage",
      selectedUsageSubmission?.appId ?? "none",
      selectedUsageSubmission?.manifestRevision ?? "none",
      usageWindowDays,
    ],
    enabled: Boolean(portal.data && selectedUsageSubmission),
    retry: false,
    queryFn: async () => {
      if (!portal.data || !selectedUsageSubmission) throw new Error("developer_usage_unavailable");
      return portal.data.client.getUsage(
        selectedUsageSubmission.appId,
        selectedUsageSubmission.manifestRevision,
        usageWindowDays,
      );
    },
  });

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
                  <div><dt className="text-muted-foreground">Signing boundary</dt><dd className="mt-1 font-medium">Connected wallet only</dd></div>
                  <div><dt className="text-muted-foreground">Mainnet</dt><dd className="mt-1 font-medium">Unavailable</dd></div>
                </dl>
              </div>

              <div className="border-t border-border pt-6 md:border-l md:border-t-0 md:pl-8 md:pt-0">
                {snapshot.status.nextStep === "enroll" ? (
                  <form className="space-y-4" onSubmit={(event) => {
                    event.preventDefault();
                    void run((client) => client.enroll({ inviteToken, publisherId, displayName }));
                  }}>
                    {inviteLoaded ? (
                      <div>
                        <p className="text-sm font-medium" role="status">Developer invite ready</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">The one-time token was removed from the address bar and is not stored by your browser.</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="-ml-2 mt-2 min-h-11"
                          onClick={() => {
                            setInviteToken("");
                            setInviteLoaded(false);
                          }}
                        >
                          Use a different invite
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <Label htmlFor="developer-invite">Developer invite</Label>
                        <Input
                          id="developer-invite"
                          className="mt-2"
                          value={inviteToken}
                          onChange={(event) => setInviteToken(event.target.value)}
                          autoComplete="off"
                          required
                        />
                      </div>
                    )}
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

            {snapshot.status.enrolled && selectedUsageSubmission ? (
              <section className="border-b border-border py-8" aria-labelledby="developer-app-usage-title">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <h2 id="developer-app-usage-title" className="text-base font-semibold">App usage</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                      Calls routed through Matterhorn for this exact app revision. Estimates are shown in USD.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div>
                      <Label htmlFor="developer-usage-revision">App revision</Label>
                      <select
                        id="developer-usage-revision"
                        className="mt-2 min-h-11 max-w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={usageRevisionKey(selectedUsageSubmission)}
                        onChange={(event) => setUsageRevision(event.target.value)}
                      >
                        {snapshot.submissions.map((item) => (
                          <option key={usageRevisionKey(item)} value={usageRevisionKey(item)}>
                            {item.manifest.displayName} · {item.manifestRevision}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="developer-usage-window">Time window</Label>
                      <select
                        id="developer-usage-window"
                        className="mt-2 min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                        value={usageWindowDays}
                        onChange={(event) => setUsageWindowDays(event.target.value === "30" ? 30 : 7)}
                      >
                        <option value="7">Last 7 days</option>
                        <option value="30">Last 30 days</option>
                      </select>
                    </div>
                  </div>
                </div>

                {usage.isLoading ? (
                  <div className="mt-6 flex min-h-24 items-center gap-3 text-sm text-muted-foreground" role="status">
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                    Loading aggregate usage…
                  </div>
                ) : usage.isError || !usage.data ? (
                  <div className="mt-6 border-t border-border py-5" role="alert">
                    <p className="text-sm font-medium">Usage is unavailable</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">No app data was exposed. Try loading this report again.</p>
                    <Button variant="outline" size="sm" className="mt-3 min-h-11" onClick={() => void usage.refetch()}>Try again</Button>
                  </div>
                ) : (
                  <>
                    <dl className="mt-6 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
                      <div className="bg-background p-4"><dt className="text-xs text-muted-foreground">Calls</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{usage.data.totals.calls}</dd></div>
                      <div className="bg-background p-4"><dt className="text-xs text-muted-foreground">Success rate</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{successRate(usage.data)}</dd></div>
                      <div className="bg-background p-4"><dt className="text-xs text-muted-foreground">Estimated cost</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{formatEstimatedCost(usage.data.totals.actualCostMicros)}</dd></div>
                      <div className="bg-background p-4"><dt className="text-xs text-muted-foreground">Average response</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{formatLatency(usage.data.totals.averageLatencyMs)}</dd></div>
                    </dl>
                    {usage.data.byAction.length > 0 ? (
                      <div className="mt-6 overflow-x-auto border-y border-border">
                        <table className="w-full min-w-[34rem] text-left text-sm">
                          <thead className="text-xs text-muted-foreground"><tr><th className="py-3 pr-4 font-medium">Action</th><th className="px-4 py-3 font-medium">Calls</th><th className="px-4 py-3 font-medium">Succeeded</th><th className="px-4 py-3 font-medium">Average response</th></tr></thead>
                          <tbody>{usage.data.byAction.slice(0, 8).map((item) => (
                            <tr key={item.actionId} className="border-t border-border">
                              <td className="py-3 pr-4 font-mono text-xs">{item.actionId}</td>
                              <td className="px-4 py-3 tabular-nums">{item.calls}</td>
                              <td className="px-4 py-3 tabular-nums">{item.succeeded}</td>
                              <td className="px-4 py-3 tabular-nums">{formatLatency(item.averageLatencyMs)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="mt-6 border-t border-border py-5 text-sm text-muted-foreground">No calls reached this revision in the selected window.</p>
                    )}
                    <p className="mt-4 text-xs leading-5 text-muted-foreground">
                      Aggregate only. No workspace, prompt, wallet, credential, or request identifiers are included.
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Tool-cost guardrail: up to {formatEstimatedCost(usage.data.budgetPolicy.perCallToolCostLimitMicros)} per call and {formatEstimatedCost(usage.data.budgetPolicy.dailyToolCostLimitMicros)} per day for each workspace. Wallet transaction limits are separate.
                      {usage.data.totals.pending > 0 ? ` ${usage.data.totals.pending} call${usage.data.totals.pending === 1 ? " is" : "s are"} still in progress.` : ""}
                      {usage.data.totals.abandoned > 0 ? ` ${usage.data.totals.abandoned} unfinished call${usage.data.totals.abandoned === 1 ? " was" : "s were"} closed after its reservation expired.` : ""}
                    </p>
                  </>
                )}
              </section>
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
