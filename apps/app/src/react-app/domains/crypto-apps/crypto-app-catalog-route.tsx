/** @jsxImportSource react */

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, ChevronUp, LoaderCircle, Pause, Play, Search, ShieldCheck, X } from "lucide-react";
import { useNavigate, useParams } from "react-router";

import type {
  MatterhornCryptoAppActionAccess,
  MatterhornCryptoAppCatalogSummary,
  MatterhornCryptoAppConnectionView,
} from "@matterhorn-work/types/crypto-coworkers";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { createMatterhornServerClient, MatterhornServerError } from "../../../app/lib/matterhorn-server";
import { resolveMatterhornConnection } from "../../shell/matterhorn-connection";

type CatalogSnapshot = {
  mode: "shadow" | "enforce";
  apps: MatterhornCryptoAppCatalogSummary[];
  connections: MatterhornCryptoAppConnectionView[];
};

type ServerClient = ReturnType<typeof createMatterhornServerClient>;
type ConnectionScope = "research" | "wallet_previews";
type AccessFilter = "all" | MatterhornCryptoAppActionAccess;

const QUERY_PREFIX = "crypto-app-catalog";

function userMessage(error: unknown): string {
  if (error instanceof MatterhornServerError) {
    if (error.code === "crypto_app_gateway_disabled") return "Certified crypto apps are not enabled for this invite yet.";
    if (error.code === "crypto_app_connection_flow_required") return "This app needs a managed connection flow that is not available in this release.";
    if (error.code === "app_certification_unavailable") return "This certification is no longer available. Refresh before reconnecting.";
    if (error.code === "connection_transition_invalid") return "That connection changed. Refresh and try again.";
  }
  return "Matterhorn could not update this crypto app. Try again.";
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
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
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const [scopeByApp, setScopeByApp] = useState<Record<string, ConnectionScope>>({});
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        && (protocol === "all" || app.networks.some((network) => network.protocol === protocol));
    });
  }, [access, protocol, search, snapshot?.apps]);

  const protocols = useMemo(() => [...new Set(
    (snapshot?.apps ?? []).flatMap((app) => app.networks.map((network) => network.protocol)),
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
    void mutate(app.appId, (client) => client.createCryptoAppConnection(workspaceId, {
      appId: app.appId,
      grantedActionIds,
      grantedScopes,
      grantedNetworks,
    }));
  }, [mutate, scopeByApp, workspaceId]);

  return (
    <main className="min-h-dvh overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 sm:py-8">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-6"
          onClick={() => navigate(`/workspace/${encodeURIComponent(workspaceId)}/session`)}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to workspace
        </Button>

        <header className="border-b border-border pb-6">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Certified crypto apps</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Give a Matterhorn coworker narrow testnet access to a certified app. You choose the actions; every financial result remains a wallet preview.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground" aria-label="Crypto app safety boundary">
            <span>Testnet only</span>
            <span>No credentials in chat</span>
            <span>Connected wallet signs</span>
            <span>{snapshot?.mode === "enforce" ? "Invite enforcement active" : "Invite preview mode"}</span>
          </div>
        </header>

        {catalog.isLoading ? (
          <div className="flex min-h-64 items-center gap-3 text-sm text-muted-foreground" role="status">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            Loading certified apps…
          </div>
        ) : catalog.isError || !snapshot ? (
          <section className="py-10" aria-live="polite">
            <h2 className="text-base font-semibold">Crypto app catalog unavailable</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{userMessage(catalog.error)}</p>
            <Button className="mt-5" onClick={() => void catalog.refetch()}>Try again</Button>
          </section>
        ) : (
          <>
            <section className="grid gap-3 border-b border-border py-5 sm:grid-cols-[minmax(0,1fr)_11rem_11rem]" aria-label="Catalog filters">
              <label className="relative block">
                <span className="sr-only">Search certified apps</span>
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search protocol or capability" />
              </label>
              <label>
                <span className="sr-only">Filter by access</span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={access}
                  onChange={(event) => setAccess(event.target.value as AccessFilter)}
                >
                  <option value="all">All capabilities</option>
                  <option value="read">Reads</option>
                  <option value="watch">Watches</option>
                  <option value="prepare">Wallet previews</option>
                  <option value="simulate">Simulations</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Filter by protocol</span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={protocol}
                  onChange={(event) => setProtocol(event.target.value)}
                >
                  <option value="all">All protocols</option>
                  {protocols.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </section>

            {error ? <p className="border-b border-border py-4 text-sm text-destructive" role="alert">{error}</p> : null}

            <section className="py-2" aria-label="Certified app results">
              {filtered.length === 0 ? (
                <p className="py-10 text-sm text-muted-foreground">No certified testnet apps match these filters.</p>
              ) : filtered.map((app) => {
                const connection = activeConnection(snapshot.connections, app.appId);
                const expanded = expandedAppId === app.appId;
                const scope = scopeByApp[app.appId] ?? defaultScope(app);
                const supportsResearch = app.actions.some((action) => action.access === "read" || action.access === "watch");
                const supportsPreview = app.actions.some((action) => action.access === "prepare" || action.access === "simulate");
                const canConnect = app.authentication.type === "none"
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
                          {app.networks.map((network) => network.chainId).join(" · ")} · {app.actions.length} capabilities · {humanize(app.certification.state)}
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
                          <h3 className="text-sm font-medium">Declared capabilities</h3>
                          <ul className="mt-3 space-y-4">
                            {app.actions.map((action) => (
                              <li key={action.id} className="text-sm">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                  <span className="font-medium">{action.title}</span>
                                  <span className="text-xs capitalize text-muted-foreground">{humanize(action.access)} · {humanize(action.risk)}</span>
                                </div>
                                <p className="mt-1 leading-6 text-muted-foreground">{action.description}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {action.requiresFreshness ? `Fresh within ${Math.round((action.freshnessMaxAgeMs ?? 0) / 1_000)}s` : "No freshness claim"}
                                  {action.walletSubmissionOnly && (action.access === "prepare" || action.access === "simulate") ? " · Wallet submits" : ""}
                                </p>
                              </li>
                            ))}
                          </ul>
                          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                            <a className="underline underline-offset-4" href={app.support.privacyPolicyUrl} target="_blank" rel="noreferrer">Provider privacy policy</a>
                            {app.support.statusUrl ? <a className="underline underline-offset-4" href={app.support.statusUrl} target="_blank" rel="noreferrer">Provider status</a> : null}
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
                                {connection.grantedActionIds.length} capabilities · {connection.grantedNetworks.join(" · ")}
                              </p>
                              {connection.availability !== "available" ? <p className="mt-3 text-xs leading-5 text-destructive">Certification unavailable. This connection cannot run.</p> : null}
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
                                  <Button variant="destructive" size="sm" disabled={busyId === connection.id} onClick={() => void mutate(connection.id, (client) => client.revokeCryptoAppConnection(workspaceId, connection.id))}>Confirm revoke</Button>
                                ) : (
                                  <Button variant="ghost" size="sm" onClick={() => setConfirmRevokeId(connection.id)}><X aria-hidden="true" className="size-4" /> Revoke</Button>
                                )}
                              </div>
                              {confirmRevokeId === connection.id ? <p className="mt-3 text-xs leading-5 text-muted-foreground">Revocation is permanent. You can create a new connection later.</p> : null}
                            </div>
                          ) : canConnect ? (
                            <div>
                              <h3 className="text-sm font-medium">Choose coworker access</h3>
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
                                {busyId === app.appId ? "Connecting…" : "Connect to workspace"}
                              </Button>
                            </div>
                          ) : (
                            <div>
                              <h3 className="text-sm font-medium">Managed setup required</h3>
                              <p className="mt-2 text-xs leading-5 text-muted-foreground">This app needs a server-managed credential or wallet connection flow. Matterhorn will never ask you to paste it into chat.</p>
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
