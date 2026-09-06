/** @jsxImportSource react */
import {
  Check,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Code2,
  FileCheck2,
  ExternalLink,
  ListTree,
  MessageSquareText,
  SearchCheck,
  WalletCards,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type HostedMcpConnection = {
  name: string;
  statusLabel: string;
  ready: boolean;
};

type HostedMcpSummaryProps = {
  compact?: boolean;
  showHeader?: boolean;
  connections: HostedMcpConnection[];
  onViewTools?: () => void;
  onBrowseCryptoApps?: () => void;
};

const MANAGED_TOOL_GROUPS = [
  {
    title: "Desk research",
    description:
      "Bittensor, prediction markets, Hyperliquid, and Sui research tools are supplied by each desk.",
    icon: SearchCheck,
  },
  {
    title: "Workspace evidence",
    description:
      "Notes, memory, saved outputs, and evidence stay attached to the current workspace.",
    icon: FileCheck2,
  },
  {
    title: "Reviewed wallet actions",
    description:
      "Supported transactions move to a separate wallet review before anything is signed or submitted.",
    icon: WalletCards,
  },
] as const;

const GUARDED_MCP_CLIENTS = [
  "Codex",
  "Claude Code",
  "Claude Desktop",
  "Cursor",
] as const;

const GUARDED_MCP_CAPABILITIES = [
  {
    title: "Find your work",
    description: "Check Matterhorn and list only the workspaces and chats your client token can access.",
    count: 3,
    icon: ListTree,
  },
  {
    title: "Work in chat",
    description: "Create and read chats, then send requests through Matterhorn's privacy and tool-policy gateway.",
    count: 4,
    icon: MessageSquareText,
  },
  {
    title: "Follow progress",
    description: "Read bounded status, event, and session snapshots without opening server administration.",
    count: 3,
    icon: SearchCheck,
  },
  {
    title: "Delete a chat",
    description: "Delete one authorized chat. The MCP cannot delete a workspace or another account's data.",
    count: 1,
    icon: CircleX,
  },
] as const;

const GUARDED_MCP_TOOL_NAMES = [
  "matterhorn_status",
  "matterhorn_list_workspaces",
  "matterhorn_create_session",
  "matterhorn_list_sessions",
  "matterhorn_get_session",
  "matterhorn_get_session_messages",
  "matterhorn_submit_session_prompt",
  "matterhorn_get_session_status",
  "matterhorn_watch_session_events",
  "matterhorn_get_session_snapshot",
  "matterhorn_delete_session",
] as const;

function HostedMcpCompactSummary({
  connections,
  onViewTools,
  onBrowseCryptoApps,
}: HostedMcpSummaryProps) {
  const readyCount = connections.filter(
    (connection) => connection.ready,
  ).length;

  return (
    <section className="space-y-4" aria-label="Matterhorn managed tools">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-dls-text">
            Matterhorn tools
          </h2>
          <p className="mt-1 text-xs leading-5 text-dls-secondary">
            Desk tools are managed for this web workspace. No MCP setup is
            required.
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-dls-surface-muted/25 px-2 py-1 text-[10px] font-semibold text-dls-secondary">
          Managed
        </span>
      </div>

      <div className="border-y border-dls-border/70 py-1">
        {MANAGED_TOOL_GROUPS.map((group) => {
          const Icon = group.icon;
          return (
            <div
              key={group.title}
              className="flex min-h-11 items-center gap-3 border-b border-dls-border/50 py-2.5 last:border-b-0"
            >
              <Icon
                className="size-4 shrink-0 text-dls-secondary"
                aria-hidden="true"
              />
              <span className="min-w-0 text-xs font-medium text-dls-text">
                {group.title}
              </span>
              <Check
                className="ml-auto size-3.5 shrink-0 text-green-10"
                aria-label="Available"
              />
            </div>
          );
        })}
      </div>

      {connections.length > 0 ? (
        <p className="text-[11px] leading-4 text-dls-secondary">
          {readyCount} of {connections.length} managed connections ready
        </p>
      ) : null}

      {onViewTools ? (
        <Button
          type="button"
          variant="secondary"
          className="h-11 w-full justify-center"
          onClick={onViewTools}
        >
          View managed tools
        </Button>
      ) : null}
      {onBrowseCryptoApps ? (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-center"
          onClick={onBrowseCryptoApps}
        >
          Browse certified crypto apps
        </Button>
      ) : null}
    </section>
  );
}

export function HostedMcpSummary(props: HostedMcpSummaryProps) {
  if (props.compact) return <HostedMcpCompactSummary {...props} />;
  const SectionHeading = props.showHeader === false ? "h2" : "h3";
  const ItemHeading = props.showHeader === false ? "h3" : "h4";

  return (
    <section className="w-full max-w-3xl space-y-8 animate-in fade-in duration-300">
      {props.showHeader !== false ? (
        <header>
          <h2 className="text-xl font-semibold tracking-tight text-dls-text">
            MCPs &amp; Tools
          </h2>
          <p className="mt-1 text-sm leading-6 text-dls-secondary">
            Managed tools for this web workspace. Custom MCP configuration stays
            in Matterhorn Desktop.
          </p>
        </header>
      ) : null}

      <section aria-labelledby="managed-tools-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <SectionHeading
              id="managed-tools-heading"
              className="text-base font-semibold text-dls-text"
            >
              Available in this workspace
            </SectionHeading>
            <p className="mt-1 text-xs leading-5 text-dls-secondary">
              Matterhorn supplies the tools each desk needs. There is nothing to
              install or authorize here.
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-medium text-dls-secondary">
            Managed by Matterhorn
          </span>
        </div>

        <div className="mt-4 border-y border-dls-border/70">
          {MANAGED_TOOL_GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <div
                key={group.title}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-b border-dls-border/50 py-4 last:border-b-0"
              >
                <Icon
                  className="mt-0.5 size-4 text-dls-secondary"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <ItemHeading className="text-sm font-medium text-dls-text">
                    {group.title}
                  </ItemHeading>
                  <p className="mt-1 text-xs leading-5 text-dls-secondary">
                    {group.description}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-green-10">
                  <Check className="size-3.5" aria-hidden="true" />
                  Available
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="managed-connections-heading">
        <SectionHeading
          id="managed-connections-heading"
          className="text-base font-semibold text-dls-text"
        >
          Managed connections
        </SectionHeading>
        <p className="mt-1 text-xs leading-5 text-dls-secondary">
          Runtime services are monitored by Matterhorn and cannot be edited from
          a Public Beta workspace.
        </p>

        {props.connections.length > 0 ? (
          <ul
            className="mt-4 divide-y divide-dls-border/50 border-y border-dls-border/70"
            aria-label="Managed MCP connections"
          >
            {props.connections.map((connection) => (
              <li
                key={connection.name}
                className="flex min-h-12 items-center justify-between gap-4 py-3"
              >
                <span className="min-w-0 truncate text-sm font-medium text-dls-text">
                  {connection.name}
                </span>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 text-xs",
                    connection.ready ? "text-green-10" : "text-amber-10",
                  )}
                >
                  {connection.ready ? (
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  ) : (
                    <CircleAlert className="size-3.5" aria-hidden="true" />
                  )}
                  {connection.statusLabel}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 border-y border-dls-border/70 py-4 text-xs leading-5 text-dls-secondary">
            No external connections are attached. Built-in desk tools remain
            available.
          </p>
        )}

        <p className="mt-4 text-xs leading-5 text-dls-secondary">
          Need a custom MCP server or local connector? Use Matterhorn Desktop,
          where credentials and configuration stay under your control.
        </p>
      </section>

      <section aria-labelledby="external-agent-tools-heading">
        <SectionHeading
          id="external-agent-tools-heading"
          className="text-base font-semibold text-dls-text"
        >
          Use Matterhorn from another AI app
        </SectionHeading>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-dls-secondary">
          The guarded MCP lets another AI app work in Matterhorn chats. It
          cannot approve wallet actions, change server settings, or reach work
          outside its client token.
        </p>

        <ul
          className="mt-4 grid gap-x-6 border-y border-dls-border/70 sm:grid-cols-2"
          aria-label="Supported AI apps"
        >
          {GUARDED_MCP_CLIENTS.map((client) => (
            <li
              key={client}
              className="flex min-h-11 items-center gap-2 border-b border-dls-border/50 py-2.5 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0"
            >
              <Code2 className="size-3.5 shrink-0 text-dls-secondary" aria-hidden="true" />
              <span className="text-xs font-medium text-dls-text">{client}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5">
          <ItemHeading className="text-sm font-medium text-dls-text">
            What it can do
          </ItemHeading>
          <div className="mt-2 divide-y divide-dls-border/50">
            {GUARDED_MCP_CAPABILITIES.map((capability) => {
              const Icon = capability.icon;
              return (
                <div
                  key={capability.title}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 py-3"
                >
                  <Icon className="mt-0.5 size-4 text-dls-secondary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-dls-text">{capability.title}</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-dls-secondary">
                      {capability.description}
                    </p>
                  </div>
                  <span className="text-[11px] tabular-nums text-dls-muted">
                    {capability.count} {capability.count === 1 ? "tool" : "tools"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <details className="mt-3 text-[11px] leading-5 text-dls-secondary">
          <summary className="w-fit cursor-pointer font-medium text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.35)]">
            View all 11 tool names
          </summary>
          <ul className="mt-2 grid gap-x-4 gap-y-1 border-y border-dls-border/60 py-3 sm:grid-cols-2">
            {GUARDED_MCP_TOOL_NAMES.map((tool) => (
              <li key={tool}>
                <code className="break-all font-mono text-[10px] text-dls-secondary">{tool}</code>
              </li>
            ))}
          </ul>
        </details>

        <p className="mt-5 max-w-2xl text-xs leading-5 text-dls-secondary">
          External setup is available today with Matterhorn Desktop or a
          self-hosted Matterhorn server. Connecting an external client directly
          to this hosted account is not available in this release.
        </p>
        <a
          href="https://github.com/matterhornso/matterhorn-work/blob/dev/docs/agent-mcp-install.md"
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-dls-surface-muted/30 px-3 text-xs font-semibold text-dls-text transition-colors hover:bg-dls-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.35)]"
        >
          Set up with Matterhorn Desktop
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
        <p className="mt-2 text-[11px] leading-4 text-dls-muted">
          The current setup uses a trusted local checkout and a client-only
          token. The MCP package is not published to npm yet.
        </p>
      </section>

      {props.onBrowseCryptoApps ? (
        <section aria-labelledby="certified-crypto-apps-heading">
          <SectionHeading
            id="certified-crypto-apps-heading"
            className="text-base font-semibold text-dls-text"
          >
            Certified crypto apps
          </SectionHeading>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-dls-secondary">
            Give a coworker narrow testnet access to certified reads, watches,
            simulations, and wallet previews. Credentials never belong in chat,
            and your connected wallet remains the only signer.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 h-11"
            onClick={props.onBrowseCryptoApps}
          >
            Browse certified apps
          </Button>
        </section>
      ) : null}
    </section>
  );
}
