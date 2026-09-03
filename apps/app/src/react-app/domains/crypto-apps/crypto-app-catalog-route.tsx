/** @jsxImportSource react */

import { useCallback, useMemo, useState } from "react";
import { useCurrentAccount, useWallets } from "@mysten/dapp-kit-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, ChevronUp, LoaderCircle, Pause, Play, Search, ShieldCheck, X } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { useAccount, useConnect, useSignMessage } from "wagmi";

import type {
  MatterhornCryptoAppActionAccess,
  MatterhornCryptoAppCatalogSummary,
  MatterhornCryptoAppConnectionView,
} from "@matterhorn-work/types/crypto-coworkers";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { createMatterhornServerClient, MatterhornServerError } from "../../../app/lib/matterhorn-server";
import { resolveMatterhornConnection } from "../../shell/matterhorn-connection";
import { suiDAppKit } from "../../infra/sui-dapp-kit";

type CatalogSnapshot = {
  mode: "shadow" | "enforce";
  apps: MatterhornCryptoAppCatalogSummary[];
  connections: MatterhornCryptoAppConnectionView[];
};

type ServerClient = ReturnType<typeof createMatterhornServerClient>;
type ConnectionScope = "research" | "wallet_previews";
type AccessFilter = "all" | MatterhornCryptoAppActionAccess;
type WalletFamily = "evm" | "sui";

const QUERY_PREFIX = "crypto-app-catalog";

function userMessage(error: unknown): string {
  if (error instanceof MatterhornServerError) {
    if (error.code === "crypto_app_gateway_disabled") return "App connections are currently unavailable.";
    if (error.code === "crypto_app_connection_flow_required") return "This app needs a managed connection flow that is not available in this release.";
    if (error.code === "crypto_app_managed_credential_unavailable") return "This app connection is not ready yet. Ask your workspace owner to finish its secure setup.";
    if (error.code === "app_certification_unavailable") return "This app did not pass its latest safety check. Refresh before reconnecting.";
    if (error.code === "connection_transition_invalid") return "That connection changed. Refresh and try again.";
    if (error.code === "wallet_connection_unavailable") return "Secure wallet connections are not available in this environment yet.";
    if (error.code === "wallet_challenge_expired") return "The wallet check expired. Try connecting again.";
    if (error.code === "wallet_challenge_invalid") return "That wallet check was already used or is no longer valid. Try again.";
    if (error.code === "wallet_signature_invalid") return "The wallet could not confirm this address. Check the active account and try again.";
    if (error.code === "wallet_family_mismatch" || error.code === "wallet_family_unsupported") return "This wallet does not match the selected network.";
    if (error.code === "oauth_connection_unavailable" || error.code === "oauth_connection_binding_unavailable") return "Sign-in for this app is not ready yet.";
    if (error.code === "oauth_flow_expired") return "The app sign-in expired. Try connecting again.";
    if (error.code === "oauth_flow_invalid") return "That app sign-in was already used or is no longer valid. Try again.";
    if (error.code === "oauth_token_exchange_failed" || error.code === "oauth_token_response_invalid") return "The app could not finish signing in. Try again.";
  }
  if (error instanceof Error && error.message === "popup_blocked") return "Allow the sign-in window, then try again.";
  if (error instanceof Error && error.message === "oauth_flow_expired") return "The app sign-in expired. Try connecting again.";
  if (error instanceof Error && /reject|cancel|denied/i.test(error.message)) return "The wallet request was cancelled. Nothing was connected.";
  return "Matterhorn could not update this crypto app. Try again.";
}

function walletFamily(app: MatterhornCryptoAppCatalogSummary): WalletFamily | null {
  const protocols = new Set(app.networks.map((network) => network.protocol.toLowerCase()));
  if ([...protocols].every((protocol) => protocol === "sui")) return "sui";
  if ([...protocols].every((protocol) => [
    "evm",
    "ethereum",
    "base",
    "arbitrum",
    "optimism",
    "polygon",
    "hyperliquid",
    "polymarket",
    "cow",
  ].includes(protocol))) return "evm";
  return null;
}

function accessLabel(access: MatterhornCryptoAppActionAccess): string {
  if (access === "read") return "Research";
  if (access === "watch") return "Monitoring";
  if (access === "prepare") return "Wallet review";
  return "Safety check";
}

function riskLabel(risk: MatterhornCryptoAppCatalogSummary["actions"][number]["risk"]): string {
  if (risk === "informational") return "Public data";
  if (risk === "private_data") return "Uses approved private data";
  if (risk === "financial_low") return "Low-value financial preview";
  return "High-value financial preview";
}

function checkedDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(timestamp))
    : "recently";
}

function activeConnection(
  connections: MatterhornCryptoAppConnectionView[],
  appId: string,
): MatterhornCryptoAppConnectionView | null {
  return connections.find((connection) => connection.appId === appId && connection.state !== "revoked") ?? null;
}

function defaultScope(app: MatterhornCryptoAppCatalogSummary): ConnectionScope {
  return app.actions.some((action) => action.access === "read" || action.access === "watch")
    ? "research"
    : "wallet_previews";
}

async function loadCatalog(workspaceId: string): Promise<{ client: ServerClient; snapshot: CatalogSnapshot }> {
  if (!workspaceId.trim()) throw new Error("workspace_required");
  const connection = await resolveMatterhornConnection();
  if (!connection.normalizedBaseUrl) throw new Error("connection_unavailable");
  // This account route never receives the host token. Operator certification
  // and promotion remain unreachable from the browser client.
  const client = createMatterhornServerClient({
    baseUrl: connection.normalizedBaseUrl,
    token: connection.resolvedToken || undefined,
  });
  const [catalog, tenantConnections] = await Promise.all([
    client.listCryptoApps({ environment: "testnet" }),
    client.listCryptoAppConnections(workspaceId),
  ]);
  if (catalog.mode !== tenantConnections.mode) throw new Error("crypto_app_mode_mismatch");
  return {
    client,
    snapshot: {
      mode: catalog.mode,
      apps: catalog.apps,
      connections: tenantConnections.connections,
    },
  };
}

export function CryptoAppCatalogRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId = "" } = useParams<{ workspaceId: string }>();
  const [search, setSearch] = useState("");
  const [access, setAccess] = useState<AccessFilter>("all");
  const [protocol, setProtocol] = useState("all");
  const [network, setNetwork] = useState("all");
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const [scopeByApp, setScopeByApp] = useState<Record<string, ConnectionScope>>({});
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const evmAccount = useAccount();
  const evmConnect = useConnect();
  const evmSigner = useSignMessage();
  const suiAccount = useCurrentAccount();
  const suiWallets = useWallets();

  const queryKey = [QUERY_PREFIX, workspaceId] as const;
  const catalog = useQuery({
    queryKey,
    queryFn: () => loadCatalog(workspaceId),
    enabled: Boolean(workspaceId.trim()),
    retry: false,
  });
  const snapshot = catalog.data?.snapshot;

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("en-US");
    return (snapshot?.apps ?? []).filter((app) => {
      const text = [
        app.displayName,
        app.description,
        ...app.networks.flatMap((network) => [network.protocol, network.chainId]),
        ...app.actions.flatMap((action) => [action.title, action.description]),
      ].join(" ").toLocaleLowerCase("en-US");
      return (!needle || text.includes(needle))
        && (access === "all" || app.actions.some((action) => action.access === access))
        && (protocol === "all" || app.networks.some((item) => item.protocol === protocol))
        && (network === "all" || app.networks.some((item) => item.chainId === network));
    });
  }, [access, network, protocol, search, snapshot?.apps]);

  const protocols = useMemo(() => [...new Set(
    (snapshot?.apps ?? []).flatMap((app) => app.networks.map((network) => network.protocol)),
  )].sort((left, right) => left.localeCompare(right)), [snapshot?.apps]);

  const networks = useMemo(() => [...new Set(
    (snapshot?.apps ?? []).flatMap((app) => app.networks.map((item) => item.chainId)),
  )].sort((left, right) => left.localeCompare(right)), [snapshot?.apps]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const mutate = useCallback(async (id: string, operation: (client: ServerClient) => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      const active = catalog.data ?? await loadCatalog(workspaceId);
      await operation(active.client);
      setConfirmRevokeId(null);
      await refresh();
    } catch (cause) {
      setError(userMessage(cause));
    } finally {
      setBusyId(null);
    }
  }, [catalog.data, refresh, workspaceId]);

  const connectApp = useCallback((app: MatterhornCryptoAppCatalogSummary) => {
    const scope = scopeByApp[app.appId] ?? defaultScope(app);
    const actions = app.actions.filter((action) => (
      action.access === "read" || action.access === "watch" || scope === "wallet_previews"
    ));
    const grantedActionIds = actions.map((action) => action.id);
    const grantedScopes = [...new Set(actions.flatMap((action) => action.requiredScopes))];
    const grantedNetworks = app.networks
      .filter((network) => network.environment === "testnet")
      .map((network) => network.chainId);
    const signInWindow = app.authentication.type === "oauth2"
      ? window.open("about:blank", "matterhorn-crypto-app-sign-in", "popup,width=560,height=720")
      : null;
    void mutate(app.appId, async (client) => {
      if (app.authentication.type === "oauth2") {
        if (!signInWindow) throw new Error("popup_blocked");
        signInWindow.document.title = "Connecting app…";
        const response = await client.startCryptoAppOAuth(workspaceId, {
          appId: app.appId,
          grantedActionIds,
          grantedScopes,
          grantedNetworks,
        });
        const authorizationUrl = new URL(response.authorization.authorizationUrl);
        if (authorizationUrl.protocol !== "https:") throw new Error("authorization_url_invalid");
        signInWindow.location.replace(authorizationUrl.href);
        const expiresAt = Date.parse(response.authorization.expiresAt);
        while (Date.now() < expiresAt) {
          await new Promise((resolve) => window.setTimeout(resolve, 1_000));
          const current = await client.getCryptoAppOAuthStatus(workspaceId, response.authorization.flowId);
          if (current.status.status === "connected") {
            signInWindow.close();
            return current.status;
          }
          if (current.status.status === "failed" || current.status.status === "expired") {
            signInWindow.close();
            throw new Error(current.status.error ?? "oauth_flow_expired");
          }
        }
        signInWindow.close();
        throw new Error("oauth_flow_expired");
      }
      if (app.authentication.type !== "wallet_connection") {
        return client.createCryptoAppConnection(workspaceId, {
          appId: app.appId,
          grantedActionIds,
          grantedScopes,
          grantedNetworks,
        });
      }
      const family = walletFamily(app);
      if (!family) throw new Error("wallet_network_unsupported");
      if (family === "evm") {
        let address = evmAccount.address;
        if (!address) {
          const connector = evmConnect.connectors[0];
          if (!connector) throw new Error("wallet_not_found");
          const connected = await evmConnect.connectAsync({ connector });
          address = connected.accounts[0];
        }
        if (!address) throw new Error("wallet_not_found");
        const response = await client.issueCryptoAppWalletChallenge(workspaceId, {
          appId: app.appId,
          grantedActionIds,
          grantedScopes,
          grantedNetworks,
          walletFamily: family,
          walletAddress: address,
        });
        const signature = await evmSigner.signMessageAsync({
          account: address,
          message: response.challenge.message,
        });
        return client.confirmCryptoAppWalletChallenge(workspaceId, response.challenge.challengeId, {
          walletAddress: address,
          signature,
        });
      }
      let account = suiAccount;
      if (!account) {
        const wallet = suiWallets[0];
        if (!wallet) throw new Error("wallet_not_found");
        const connected = await suiDAppKit.connectWallet({ wallet });
        account = connected.accounts[0] ?? null;
      }
      if (!account) throw new Error("wallet_not_found");
      const response = await client.issueCryptoAppWalletChallenge(workspaceId, {
        appId: app.appId,
        grantedActionIds,
        grantedScopes,
        grantedNetworks,
        walletFamily: family,
        walletAddress: account.address,
      });
      const signed = await suiDAppKit.signPersonalMessage({
        message: new TextEncoder().encode(response.challenge.message),
        account,
        network: "testnet",
      });
      return client.confirmCryptoAppWalletChallenge(workspaceId, response.challenge.challengeId, {
        walletAddress: account.address,
        signature: signed.signature,
      });
    }).finally(() => signInWindow?.close());
  }, [
    evmAccount.address,
    evmConnect,
    evmSigner,
    mutate,
    scopeByApp,
    suiAccount,
    suiWallets,
    workspaceId,
  ]);

  return (
    <main className="min-h-dvh overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={() => navigate(`/workspace/${encodeURIComponent(workspaceId)}/session`)}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to workspace
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/workspace/${encodeURIComponent(workspaceId)}/evidence-proofs`)}
          >
            <ShieldCheck aria-hidden="true" className="size-4" />
            Evidence proofs
          </Button>
        </div>

        <header className="border-b border-border pb-6">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Apps for your coworkers</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose what a coworker may research, monitor, or prepare for your wallet. You can pause or remove access at any time.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground" aria-label="Crypto app safety boundary">
            <span>Testing networks only</span>
            <span>Never paste keys in chat</span>
            <span>Your wallet approves every transaction</span>
            <span>{snapshot?.mode === "enforce" ? "Access controls active" : "Preview access only"}</span>
          </div>
        </header>

        {catalog.isLoading ? (
          <div className="flex min-h-64 items-center gap-3 text-sm text-muted-foreground" role="status">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            Loading apps…
          </div>
        ) : catalog.isError || !snapshot ? (
          <section className="py-10" aria-live="polite">
            <h2 className="text-base font-semibold">Apps are unavailable</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{userMessage(catalog.error)}</p>
            <Button className="mt-5" onClick={() => void catalog.refetch()}>Try again</Button>
          </section>
        ) : (
          <>
            <section className="grid gap-3 border-b border-border py-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10rem_10rem_12rem]" aria-label="Catalog filters">
              <label className="relative block">
                <span className="sr-only">Search apps</span>
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search apps or tasks" />
              </label>
              <label>
                <span className="sr-only">Filter by what the app can do</span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={access}
                  onChange={(event) => setAccess(event.target.value as AccessFilter)}
                >
                  <option value="all">Any task</option>
                  <option value="read">Research</option>
                  <option value="watch">Monitoring</option>
                  <option value="prepare">Wallet review</option>
                  <option value="simulate">Safety checks</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Filter by protocol</span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={protocol}
                  onChange={(event) => setProtocol(event.target.value)}
                >
                  <option value="all">Any protocol</option>
                  {protocols.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>
                <span className="sr-only">Filter by network</span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={network}
                  onChange={(event) => setNetwork(event.target.value)}
                >
                  <option value="all">Any network</option>
                  {networks.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </section>

            {error ? <p className="border-b border-border py-4 text-sm text-destructive" role="alert">{error}</p> : null}

            <section className="py-2" aria-label="Available apps">
              {filtered.length === 0 ? (
                <p className="py-10 text-sm text-muted-foreground">No test-network apps match these filters.</p>
              ) : filtered.map((app) => {
                const connection = activeConnection(snapshot.connections, app.appId);
                const revokedConnections = snapshot.connections.filter((item) => (
                  item.appId === app.appId && item.state === "revoked"
                ));
                const expanded = expandedAppId === app.appId;
                const scope = scopeByApp[app.appId] ?? defaultScope(app);
                const supportsResearch = app.actions.some((action) => action.access === "read" || action.access === "watch");
                const supportsPreview = app.actions.some((action) => action.access === "prepare" || action.access === "simulate");
                const managedConnection = app.authentication.type === "api_key_vault";
                const walletConnection = app.authentication.type === "wallet_connection";
                const signInConnection = app.authentication.type === "oauth2";
                const canConnect = (app.authentication.type === "none" || managedConnection || walletConnection || signInConnection)
                  && (supportsResearch || supportsPreview);
                return (
                  <article key={app.appId} className="border-b border-border py-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <h2 className="font-semibold">{app.displayName}</h2>
                          {connection ? (
                            <span className="text-xs capitalize text-muted-foreground">{connection.state}</span>
                          ) : null}
                        </div>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{app.description}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {app.networks.map((item) => item.chainId).join(" · ")} · {app.actions.length} {app.actions.length === 1 ? "task" : "tasks"} · Safety checked {checkedDate(app.certification.updatedAt)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        aria-expanded={expanded}
                        onClick={() => setExpandedAppId(expanded ? null : app.appId)}
                      >
                        {expanded ? "Hide details" : "Review access"}
                        {expanded ? <ChevronUp aria-hidden="true" className="size-4" /> : <ChevronDown aria-hidden="true" className="size-4" />}
                      </Button>
                    </div>

                    {expanded ? (
                      <div className="mt-5 grid gap-6 border-t border-border pt-5 md:grid-cols-[minmax(0,1fr)_18rem]">
                        <div>
                          <h3 className="text-sm font-medium">What this app can do</h3>
                          <ul className="mt-3 space-y-4">
                            {app.actions.map((action) => (
                              <li key={action.id} className="text-sm">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                  <span className="font-medium">{action.title}</span>
                                  <span className="text-xs text-muted-foreground">{accessLabel(action.access)} · {riskLabel(action.risk)}</span>
                                </div>
                                <p className="mt-1 leading-6 text-muted-foreground">{action.description}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {action.requiresFreshness ? `Data refreshed within ${Math.round((action.freshnessMaxAgeMs ?? 0) / 1_000)}s` : "Uses stable data"}
                                  {action.requiredScopes.length ? ` · Needs ${action.requiredScopes.length} approved ${action.requiredScopes.length === 1 ? "permission" : "permissions"}` : " · No account permission needed"}
                                  {action.walletSubmissionOnly && (action.access === "prepare" || action.access === "simulate") ? " · Your wallet submits" : ""}
                                </p>
                              </li>
                            ))}
                          </ul>
                          <dl className="mt-6 grid gap-3 border-t border-border pt-5 text-xs sm:grid-cols-2">
                            <div><dt className="text-muted-foreground">Version</dt><dd className="mt-1 break-words">{app.manifestRevision}</dd></div>
                            <div><dt className="text-muted-foreground">Safety check</dt><dd className="mt-1">Passed for the listed test networks</dd></div>
                            <div><dt className="text-muted-foreground">Task cost</dt><dd className="mt-1">Measured per run and shown in its receipt</dd></div>
                            <div><dt className="text-muted-foreground">Connection history</dt><dd className="mt-1">{revokedConnections.length ? `${revokedConnections.length} previously removed` : "No previous removals"}</dd></div>
                          </dl>
                          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                            <a className="underline underline-offset-4" href={app.support.privacyPolicyUrl} target="_blank" rel="noreferrer">How this provider handles data</a>
                            {app.support.statusUrl ? <a className="underline underline-offset-4" href={app.support.statusUrl} target="_blank" rel="noreferrer">Check service status</a> : <span className="text-muted-foreground">No public status page</span>}
                          </div>
                        </div>

                        <div className="border-t border-border pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                          {connection ? (
                            <div>
                              <div className="flex items-center gap-2 text-sm font-medium">
                                {connection.state === "active" ? <Check aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
                                {connection.state === "active" ? "Connected" : "Paused"}
                              </div>
                              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                {connection.grantedActionIds.length} {connection.grantedActionIds.length === 1 ? "task" : "tasks"} · {connection.grantedNetworks.join(" · ")}
                              </p>
                              {connection.availability !== "available" ? <p className="mt-3 text-xs leading-5 text-destructive">Safety review expired. This connection cannot run.</p> : null}
                              <div className="mt-4 flex flex-wrap gap-2">
                                {connection.state === "active" ? (
                                  <Button variant="outline" size="sm" disabled={busyId === connection.id} onClick={() => void mutate(connection.id, (client) => client.transitionCryptoAppConnection(workspaceId, connection.id, "paused"))}>
                                    <Pause aria-hidden="true" className="size-4" /> Pause
                                  </Button>
                                ) : (
                                  <Button variant="outline" size="sm" disabled={busyId === connection.id || connection.availability !== "available"} onClick={() => void mutate(connection.id, (client) => client.transitionCryptoAppConnection(workspaceId, connection.id, "active"))}>
                                    <Play aria-hidden="true" className="size-4" /> Resume
                                  </Button>
                                )}
                                {confirmRevokeId === connection.id ? (
                                  <Button variant="destructive" size="sm" disabled={busyId === connection.id} onClick={() => void mutate(connection.id, (client) => client.revokeCryptoAppConnection(workspaceId, connection.id))}>Remove access</Button>
                                ) : (
                                  <Button variant="ghost" size="sm" onClick={() => setConfirmRevokeId(connection.id)}><X aria-hidden="true" className="size-4" /> Remove access</Button>
                                )}
                              </div>
                              {confirmRevokeId === connection.id ? <p className="mt-3 text-xs leading-5 text-muted-foreground">This removal cannot be undone. You can connect the app again later.</p> : null}
                            </div>
                          ) : canConnect ? (
                            <div>
                              <h3 className="text-sm font-medium">Choose coworker access</h3>
                              {managedConnection ? (
                                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                  Matterhorn handles this connection. You do not enter an API key here.
                                </p>
                              ) : null}
                              {walletConnection ? (
                                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                  Your wallet confirms this address is yours. It does not give Matterhorn permission to move funds.
                                </p>
                              ) : null}
                              {signInConnection ? (
                                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                  Matterhorn opens this app’s sign-in page. Your sign-in tokens stay encrypted on the server and are never shown to the coworker.
                                </p>
                              ) : null}
                              {supportsResearch ? (
                                <label className="mt-3 flex min-h-11 cursor-pointer gap-3 rounded-md py-2 text-sm focus-within:ring-2 focus-within:ring-ring">
                                  <input type="radio" name={`scope-${app.appId}`} value="research" checked={scope === "research"} onChange={() => setScopeByApp((current) => ({ ...current, [app.appId]: "research" }))} />
                                  <span><span className="font-medium">Research only</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Reads and watches. No transaction preparation.</span></span>
                                </label>
                              ) : null}
                              {supportsPreview ? (
                                <label className="mt-3 flex min-h-11 cursor-pointer gap-3 rounded-md py-2 text-sm focus-within:ring-2 focus-within:ring-ring">
                                  <input type="radio" name={`scope-${app.appId}`} value="wallet_previews" checked={scope === "wallet_previews"} onChange={() => setScopeByApp((current) => ({ ...current, [app.appId]: "wallet_previews" }))} />
                                  <span><span className="font-medium">Research + wallet previews</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Adds preparation and simulation. Your connected wallet still signs and submits.</span></span>
                                </label>
                              ) : null}
                              <Button className="mt-5" disabled={busyId === app.appId} onClick={() => connectApp(app)}>
                                <ShieldCheck aria-hidden="true" className="size-4" />
                                {busyId === app.appId ? "Connecting…" : walletConnection ? "Connect wallet" : signInConnection ? "Sign in to connect" : "Connect to workspace"}
                              </Button>
                            </div>
                          ) : (
                            <div>
                              <h3 className="text-sm font-medium">Managed setup required</h3>
                              <p className="mt-2 text-xs leading-5 text-muted-foreground">This app needs a wallet or sign-in connection that is not ready yet. Matterhorn will never ask you to paste a key into chat.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
