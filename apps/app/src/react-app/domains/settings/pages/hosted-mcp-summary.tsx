/** @jsxImportSource react */
import {
  Check,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
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

function HostedMcpCompactSummary({
  connections,
  onViewTools,
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
    </section>
  );
}
