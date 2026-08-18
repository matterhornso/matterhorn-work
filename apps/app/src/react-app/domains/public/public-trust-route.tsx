/** @jsxImportSource react */

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  LifeBuoy,
  LoaderCircle,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MATTERHORN_DOCS_URL,
  MATTERHORN_ISSUES_URL,
  MATTERHORN_SECURITY_REPORT_URL,
  MATTERHORN_SUPPORT_EMAIL,
  PUBLIC_TRUST_PATHS,
  isPublicTrustPath,
  type PublicTrustPath,
} from "./public-trust-content";

type TrustSection = {
  title: string;
  body: ReactNode;
};

type TrustPage = {
  title: string;
  description: string;
  sections: TrustSection[];
};

const LAST_UPDATED = "August 19, 2026";

const pageLabels: Record<PublicTrustPath, string> = {
  "/privacy": "Privacy",
  "/terms": "Terms",
  "/security": "Security",
  "/support": "Support",
  "/status": "Status",
};

const trustPages: Record<Exclude<PublicTrustPath, "/status">, TrustPage> = {
  "/privacy": {
    title: "Privacy",
    description:
      "What Matterhorn Desks stores, when data leaves your device, and the controls available to you.",
    sections: [
      {
        title: "Where workspace data is stored",
        body: (
          <>
            <p>
              Desktop and local workspaces store chats, notes, memory, outputs,
              settings, and runtime data on the connected device. Signed-in web
              workspaces store this data in Matterhorn&apos;s hosted workspace
              runtime so it remains available across sessions.
            </p>
            <p>
              Matterhorn does not use workspace content to train models. Use
              the available export and deletion controls before moving devices
              or removing a workspace; deleting data can be permanent.
            </p>
          </>
        ),
      },
      {
        title: "Model and tool providers",
        body: (
          <>
            <p>
              Matterhorn checks each model request before it contacts a
              provider. The check identifies the provider and model, the
              provider&apos;s training and retention policy, the categories of data
              included, and whether that data will leave Matterhorn.
            </p>
            <p>
              Public research can use a disclosed external provider. Selected
              files, memories, and account-linked wallet context are private.
              Matterhorn sends private context automatically only to a local or
              verified provider. An unverified provider requires approval for
              one exact request; that approval expires after five minutes and
              becomes invalid if the prompt, attachment, memory, provider, or
              model changes.
            </p>
            <p>
              Matterhorn blocks detected seed phrases, private keys, API
              credentials, raw signatures, and wallet exports before provider
              contact. The block identifies the category and remediation but
              never echoes the detected value.
            </p>
          </>
        ),
      },
      {
        title: "Wallets and public networks",
        body: (
          <p>
            A public address becomes private context when it is linked to your
            Matterhorn account. The same applies to balances, positions, and
            trade intent. An agent can research, read, prepare, and simulate an
            action, but it cannot sign, relay, or submit it. Signing, approval,
            and submission stay in the connected wallet or external signer.
          </p>
        ),
      },
      {
        title: "Cloud and telemetry",
        body: (
          <>
            <p>
              Signed-in web sessions use Matterhorn&apos;s hosted workspace services.
              Product telemetry is limited to operational events and does not
              include prompt text, response text, code, file contents, or file
              paths. Local-only use does not send these hosted product events.
            </p>
            <p>
              Completed and interrupted runs produce a security receipt with the
              provider policy, data categories, redaction count, tool outcomes,
              token usage, duration, memory activity, and reviewed-action
              references. A receipt does not contain raw prompts, unrestricted
              tool output, secrets, signatures, private keys, or wallet exports.
              Minimal content-free security metadata is hash-chained and expires
              after 365 days.
            </p>
          </>
        ),
      },
      {
        title: "Your controls",
        body: (
          <>
            <p>
              You can review saved memory, choose what to remember, disconnect
              providers, and use the export or deletion controls available for
              each workspace store.
            </p>
            <p>
              Download a complete workspace archive from Settings → Privacy.
              Download your profile, legal acceptance, and memberships from
              Settings → Account. Deleting a workspace removes user-controlled
              content immediately. Only minimal content-free security metadata
              remains until its normal 365-day expiry. For hosted access,
              deletion, or privacy questions, contact{" "}
              <a className="text-foreground underline underline-offset-4" href={`mailto:${MATTERHORN_SUPPORT_EMAIL}`}>
                {MATTERHORN_SUPPORT_EMAIL}
              </a>
              .
            </p>
          </>
        ),
      },
    ],
  },
  "/terms": {
    title: "Terms",
    description:
      "The rules for using the Matterhorn Desks public beta and its connected services.",
    sections: [
      {
        title: "Using Matterhorn Desks",
        body: (
          <p>
            You may use Matterhorn Desks only where permitted by law and by the
            terms of connected providers. You are responsible for your prompts,
            files, accounts, wallet activity, and decisions made from generated
            output.
          </p>
        ),
      },
      {
        title: "Public beta",
        body: (
          <p>
            This release is a public beta. Features can change, external
            providers can become unavailable, and errors can occur. Keep
            independent backups and verify important output before relying on
            it. We may suspend a feature when security, compliance, or provider
            behavior cannot be verified.
          </p>
        ),
      },
      {
        title: "Financial, health, and professional decisions",
        body: (
          <p>
            Matterhorn Desks can organize research and prepare previews, but it
            does not provide financial, investment, medical, legal, or other
            professional advice. Market and longevity information can be
            incomplete or delayed. Consult a qualified professional when the
            decision requires one.
          </p>
        ),
      },
      {
        title: "Wallet actions",
        body: (
          <>
            <p>
              You control connected wallets and external signers. Matterhorn
              prepares an exact action with its protocol, network, signer,
              asset, destination, amount, slippage, expiry, and simulation. Any
              change to a reviewed field invalidates the review and requires a
              new action.
            </p>
            <p>
              Agents, MCP clients, command-line clients, watches, and schedulers
              cannot sign, relay, or submit. Review and submission happen only
              in the connected wallet. Blockchain transactions can be
              irreversible, and Matterhorn Desks cannot recover funds or reverse
              a transaction.
            </p>
          </>
        ),
      },
      {
        title: "Third-party services",
        body: (
          <p>
            Models, wallets, protocols, MCPs, and connectors are operated by
            third parties and remain subject to their availability and terms.
            Matterhorn Desks is not responsible for a third party&apos;s service,
            output, custody, pricing, or security.
          </p>
        ),
      },
      {
        title: "Acceptable use",
        body: (
          <p>
            Do not use the service to violate law, compromise systems, evade
            access controls, infringe rights, distribute malware, or expose
            credentials or personal data without authorization. We may restrict
            access when necessary to protect users or the service.
          </p>
        ),
      },
      {
        title: "Warranty and liability",
        body: (
          <p>
            The public beta is provided on an as-available basis without a
            guarantee that it will be uninterrupted or error-free. To the
            extent permitted by law, Matterhorn is not liable for indirect,
            incidental, or consequential loss arising from use of the beta or a
            connected third-party service.
          </p>
        ),
      },
    ],
  },
  "/security": {
    title: "Security",
    description:
      "How Matterhorn Desks protects local work, credentials, wallet approvals, and reports from researchers.",
    sections: [
      {
        title: "Security model",
        body: (
          <>
            <p>
              Matterhorn treats the selected model as an untrusted planner. The
              authenticated server—not model text, tool output, or the browser
              UI—controls data disclosure, workspace access, available tools,
              and reviewed transaction terms.
            </p>
            <p>
              Crypto tool calls are bound to the workspace, session, desk, tool,
              and exact arguments. Guarded calls use short-lived, single-use
              authorization. Browser deployments fail closed when their
              authenticated same-origin backend is unavailable.
            </p>
          </>
        ),
      },
      {
        title: "Credentials",
        body: (
          <p>
            Never paste seed phrases, private keys, recovery codes, or raw
            payment credentials into chat. Provider credentials should use the
            operating system&apos;s protected storage or server-side secrets. They
            must not be committed to a project or embedded in a public web
            build. Matterhorn&apos;s deterministic privacy check blocks detected
            credential-shaped content before model or tool-provider contact.
          </p>
        ),
      },
      {
        title: "Wallet safeguards",
        body: (
          <p>
            Matterhorn Desks keeps signing in your wallet or external signer.
            Transaction previews bind exact terms, policy, expiry, signer,
            network, and a fresh simulation to one reviewed intent. Changing a
            reviewed field or allowing the simulation to become stale requires
            regeneration. A preview is not proof that a transaction is safe or
            final.
          </p>
        ),
      },
      {
        title: "Untrusted external data",
        body: (
          <p>
            Webpages, token metadata, contract text, governance proposals,
            protocol responses, and MCP results are treated as data, not
            instructions. Matterhorn projects approved fields into model context
            and prevents external content from changing the agent, provider,
            consent, permissions, or tool authorization.
          </p>
        ),
      },
      {
        title: "Report a vulnerability",
        body: (
          <>
            <p>
              Do not disclose a suspected vulnerability in a public issue.
              Submit it through GitHub&apos;s private vulnerability reporting
              channel with reproduction steps, impact, and affected versions.
            </p>
            <a
              className="inline-flex items-center gap-2 rounded-md bg-dls-surface-muted px-3 py-2 font-medium text-foreground transition-colors hover:bg-dls-hover"
              href={MATTERHORN_SECURITY_REPORT_URL}
              target="_blank"
              rel="noreferrer"
            >
              Report privately <ExternalLink className="size-4" />
            </a>
          </>
        ),
      },
      {
        title: "Response target",
        body: (
          <p>
            We aim to acknowledge a complete report within three business days
            and provide an initial triage status within seven business days.
            Please keep details private until a fix or mitigation is available.
          </p>
        ),
      },
    ],
  },
  "/support": {
    title: "Support",
    description:
      "Get help, report a product problem, or find the right private security channel.",
    sections: [
      {
        title: "Product help",
        body: (
          <>
            <p>
              For setup or usage questions, email{" "}
              <a className="text-foreground underline underline-offset-4" href={`mailto:${MATTERHORN_SUPPORT_EMAIL}`}>
                {MATTERHORN_SUPPORT_EMAIL}
              </a>
              . Include your Matterhorn Desks version, operating system, the
              affected desk, and what you expected to happen.
            </p>
            <a
              className="inline-flex items-center gap-2 rounded-md bg-dls-surface-muted px-3 py-2 font-medium text-foreground transition-colors hover:bg-dls-hover"
              href={`mailto:${MATTERHORN_SUPPORT_EMAIL}?subject=Matterhorn%20Desks%20support`}
            >
              Email support <LifeBuoy className="size-4" />
            </a>
          </>
        ),
      },
      {
        title: "Bug reports",
        body: (
          <>
            <p>
              Search existing reports first. For a new bug, include exact
              reproduction steps, screenshots when useful, and sanitized debug
              output. Remove access tokens, wallet identifiers you do not want
              public, file contents, and other sensitive data.
            </p>
            <a
              className="inline-flex items-center gap-2 rounded-md bg-dls-surface-muted px-3 py-2 font-medium text-foreground transition-colors hover:bg-dls-hover"
              href={MATTERHORN_ISSUES_URL}
              target="_blank"
              rel="noreferrer"
            >
              Open issue chooser <ExternalLink className="size-4" />
            </a>
          </>
        ),
      },
      {
        title: "Documentation",
        body: (
          <p>
            Installation, workspace, desk, wallet, recovery, and operator
            guidance is available in the public documentation. Public beta
            limitations are called out where a workflow is preview-only,
            external-signer-only, or unavailable.
          </p>
        ),
      },
      {
        title: "Security reports",
        body: (
          <p>
            Vulnerabilities must use the{" "}
            <Link className="text-foreground underline underline-offset-4" to="/security">
              private security reporting process
            </Link>
            , not a public issue or support email thread.
          </p>
        ),
      },
    ],
  },
};

type ProbeState = "checking" | "available" | "not-ready" | "unavailable";

type ProbeResult = {
  state: ProbeState;
  detail: string;
};

async function probeHealth(path: "/health/live" | "/health/ready"): Promise<ProbeResult> {
  try {
    const response = await fetch(path, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "same-origin",
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      return {
        state: "unavailable",
        detail: "This deployment does not expose a same-origin health endpoint.",
      };
    }

    const payload = (await response.json()) as { status?: unknown; reason?: unknown };
    if (response.ok) {
      return {
        state: "available",
        detail:
          typeof payload.status === "string"
            ? `Backend reports ${payload.status}.`
            : "Backend responded successfully.",
      };
    }

    return {
      state: "not-ready",
      detail:
        typeof payload.reason === "string"
          ? payload.reason
          : `Backend returned HTTP ${response.status}.`,
    };
  } catch {
    return {
      state: "unavailable",
      detail: "The health endpoint could not be reached from this browser.",
    };
  }
}

function StatusIcon({ state }: { state: ProbeState }) {
  if (state === "checking") {
    return <LoaderCircle className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" />;
  }
  if (state === "available") {
    return <CheckCircle2 className="size-4 text-emerald-500" />;
  }
  if (state === "not-ready") {
    return <AlertCircle className="size-4 text-amber-500" />;
  }
  return <AlertCircle className="size-4 text-red-400" />;
}

function StatusPage() {
  const [liveness, setLiveness] = useState<ProbeResult>({
    state: "checking",
    detail: "Checking the backend process.",
  });
  const [readiness, setReadiness] = useState<ProbeResult>({
    state: "checking",
    detail: "Checking storage and workspace readiness.",
  });
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLiveness({ state: "checking", detail: "Checking the backend process." });
    setReadiness({
      state: "checking",
      detail: "Checking storage and workspace readiness.",
    });
    const [liveResult, readyResult] = await Promise.all([
      probeHealth("/health/live"),
      probeHealth("/health/ready"),
    ]);
    setLiveness(liveResult);
    setReadiness(readyResult);
    setCheckedAt(new Date());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Status</h1>
          <p className="mt-2 max-w-[68ch] text-base leading-7 text-muted-foreground">
            Live checks for the Matterhorn Desks backend serving this deployment.
          </p>
        </div>
        <Button variant="secondary" size="sm" className="gap-2" onClick={() => void refresh()}>
          <RefreshCw className="size-4" />
          Check again
        </Button>
      </div>

      <div className="mt-10 divide-y divide-border/70" aria-live="polite">
        {[
          {
            label: "Backend process",
            description: "Checks whether the API process can answer requests.",
            result: liveness,
          },
          {
            label: "Workspace service",
            description: "Checks storage, workspace routing, and authorization readiness.",
            result: readiness,
          },
        ].map((item) => (
          <div key={item.label} className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)] sm:gap-8">
            <div>
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Server className="size-4 text-muted-foreground" />
                {item.label}
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {item.description}
              </p>
            </div>
            <div className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
              <StatusIcon state={item.result.state} />
              <span>{item.result.detail}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-5 text-xs text-muted-foreground">
        {checkedAt
          ? `Last checked ${checkedAt.toLocaleTimeString()}.`
          : "Health checks are in progress."}{" "}
        Provider, blockchain, wallet, and model availability can vary independently.
      </p>

      <div className="mt-10 border-t border-border/70 pt-6">
        <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
          If a service is unavailable, retry once and then include the time,
          affected workspace, and sanitized diagnostics in a{" "}
          <Link className="text-foreground underline underline-offset-4" to="/support">
            support report
          </Link>
          .
        </p>
      </div>
    </>
  );
}

function PublicHeader() {
  return (
    <header className="border-b border-border/70 bg-background">
      <div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-4 pl-[calc(1.25rem+env(safe-area-inset-left))] pr-[calc(1.25rem+env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] sm:pl-[calc(2rem+env(safe-area-inset-left))] sm:pr-[calc(2rem+env(safe-area-inset-right))]">
        <Link to="/session" className="inline-flex items-center gap-2 font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <img src="/matterhorn-logo-square.svg" alt="" className="size-6 rounded-md" />
          Matterhorn Desks
        </Link>
        <Link
          to="/session"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-dls-surface-muted px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-dls-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none sm:min-h-8"
        >
          Open app
        </Link>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t border-border/70 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 pl-[calc(1.25rem+env(safe-area-inset-left))] pr-[calc(1.25rem+env(safe-area-inset-right))] text-sm text-muted-foreground sm:pl-[calc(2rem+env(safe-area-inset-left))] sm:pr-[calc(2rem+env(safe-area-inset-right))]">
        <span>Matterhorn Desks</span>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Trust and support">
          {PUBLIC_TRUST_PATHS.map((path) => (
            <Link key={path} className="inline-flex min-h-11 items-center rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-h-0" to={path}>
              {pageLabels[path]}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export function PublicTrustRoute() {
  const location = useLocation();
  const path = isPublicTrustPath(location.pathname)
    ? location.pathname.toLowerCase().replace(/\/+$/, "") as PublicTrustPath
    : "/support";
  const page = path === "/status" ? null : trustPages[path];

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${pageLabels[path]} | Matterhorn Desks`;
    return () => {
      document.title = previousTitle;
    };
  }, [path]);

  const activeLabel = useMemo(() => pageLabels[path], [path]);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <PublicHeader />
      <main className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] flex-1 gap-10 py-8 pl-[calc(1.25rem+env(safe-area-inset-left))] pr-[calc(1.25rem+env(safe-area-inset-right))] sm:py-12 sm:pl-[calc(2rem+env(safe-area-inset-left))] sm:pr-[calc(2rem+env(safe-area-inset-right))] md:grid-cols-[180px_minmax(0,1fr)]">
        <aside className="min-w-0">
          <Link
            to="/session"
            className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-2 rounded-sm px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:mb-6 md:min-h-0"
          >
            <ArrowLeft className="size-4" />
            Back to app
          </Link>
          <nav className="flex flex-wrap gap-1 md:flex-col" aria-label="Trust pages">
            {PUBLIC_TRUST_PATHS.map((navPath) => (
              <Link
                key={navPath}
                to={navPath}
                aria-current={path === navPath ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none md:min-h-0",
                  path === navPath
                    ? "bg-dls-surface-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-dls-hover hover:text-foreground",
                )}
              >
                {pageLabels[navPath]}
              </Link>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 max-w-3xl">
          {path === "/status" ? (
            <StatusPage />
          ) : page ? (
            <>
              <h1 className="text-3xl font-semibold text-foreground">{page.title}</h1>
              <p className="mt-2 max-w-[68ch] text-base leading-7 text-muted-foreground">
                {page.description}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">Last updated {LAST_UPDATED}</p>

              <div className="mt-10 divide-y divide-border/70">
                {page.sections.map((section) => (
                  <section key={section.title} className="py-6 first:pt-0">
                    <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
                    <div className="mt-2 flex max-w-[70ch] flex-col gap-3 text-sm leading-6 text-muted-foreground">
                      {section.body}
                    </div>
                  </section>
                ))}
              </div>

              {path === "/support" ? (
                <div className="mt-4 flex flex-wrap gap-3 border-t border-border/70 pt-6">
                  <a
                    className="inline-flex min-h-11 items-center gap-2 rounded-md bg-dls-surface-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-dls-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none sm:min-h-9"
                    href={MATTERHORN_DOCS_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read docs <ExternalLink className="size-4" />
                  </a>
                  <Link
                    className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-dls-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none sm:min-h-9"
                    to="/status"
                  >
                    View status <ShieldCheck className="size-4" />
                  </Link>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground">
              <AlertCircle className="size-5" />
              {activeLabel} is unavailable.
            </div>
          )}
        </article>
      </main>
      <PublicFooter />
    </div>
  );
}
