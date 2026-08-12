/** @jsxImportSource react */
import { useMemo, useState, type ReactNode } from "react";
import { Cpu, RefreshCw } from "lucide-react";

import { t } from "../../../../i18n";
import { isPublicBetaWebDeployment } from "../../../../app/lib/matterhorn-deployment";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { PluginsView, type PluginsExtensionsStore } from "./plugins-view";
import { mcpServerDisplayName } from "./mcp-display-name";

export type ExtensionsSection = "all" | "mcp" | "skills" | "plugins";

type SuggestedPlugin = {
  name: string;
  packageName: string;
  description: string;
  tags: string[];
  aliases?: string[];
  installMode?: "simple" | "guided";
  steps?: Array<{
    title: string;
    description: string;
    command?: string;
    url?: string;
    path?: string;
    note?: string;
  }>;
};

export type ExtensionsViewProps = {
  busy: boolean;
  selectedWorkspaceRoot: string;
  isRemoteWorkspace: boolean;
  canEditPlugins: boolean;
  canUseGlobalScope: boolean;
  accessHint?: string | null;
  suggestedPlugins: SuggestedPlugin[];
  extensions: PluginsExtensionsStore;
  mcpConnectedAppNames: string[];
  /** The MCP view (quick-connect grid + configured servers). Skills are injected into it. */
  mcpView: ReactNode;
  /** Organization marketplace content, rendered in the same Extensions pane. */
  cloudMarketplaceView?: ReactNode;
  onRefresh: () => void;
  initialSection?: ExtensionsSection;
  setSectionRoute?: (tab: "mcp" | "skills" | "plugins") => void;
  showHeader?: boolean;
  compact?: boolean;
  /** Overrides the hosted managed-tools boundary for focused rendering and tests. */
  hostedManagedMode?: boolean;
};

export function ExtensionsView(props: ExtensionsViewProps) {
  const hostedManagedMode =
    props.hostedManagedMode ?? isPublicBetaWebDeployment();
  const [view, setView] = useState<"my" | "marketplace">("my");
  const marketplaceAvailable =
    !hostedManagedMode && Boolean(props.cloudMarketplaceView);
  const pluginCount = useMemo(
    () => (hostedManagedMode ? 0 : props.extensions.pluginList().length),
    [hostedManagedMode, props.extensions],
  );
  const connectedAppNames = props.mcpConnectedAppNames.map(mcpServerDisplayName);
  const connectedAppCount = connectedAppNames.length;

  const refreshButton = (
    <Button
      aria-label={t("common.refresh")}
      title={t("common.refresh")}
      variant="ghost"
      size="icon-sm"
      className="shrink-0 border-0 bg-transparent text-dls-secondary shadow-none hover:bg-dls-surface-muted/[0.12] hover:text-dls-text"
      onClick={props.onRefresh}
    >
      <RefreshCw className={cn("size-4", props.busy && "animate-spin")} aria-hidden="true" />
    </Button>
  );

  return (
    <section className={cn(
      "w-full animate-in fade-in duration-300",
      props.compact ? "space-y-4 max-w-none" : "space-y-6 max-w-3xl",
    )}>
      {!hostedManagedMode &&
      (connectedAppCount > 0 || !marketplaceAvailable) ? (
        <div className="flex min-w-0 items-start justify-between gap-3 text-xs">
          {connectedAppCount > 0 ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn(
                "inline-flex items-center text-green-12",
                props.compact
                  ? "gap-1.5 text-[11px] font-medium"
                  : "gap-2 rounded-md bg-green-3 px-3 py-1 font-medium",
              )}>
                <span className={cn("rounded-full bg-green-9", props.compact ? "size-1.5" : "size-2")} />
                {connectedAppCount} {connectedAppCount === 1 ? t("mcp.app_connected") : t("mcp.apps_connected")}
              </span>
              <span className="min-w-0 text-dls-secondary" aria-label={`Connected MCP servers: ${connectedAppNames.join(", ")}`}>
                {connectedAppNames.join(" · ")}
              </span>
            </div>
          ) : <span />}
          {!marketplaceAvailable ? refreshButton : null}
        </div>
      ) : null}

      {marketplaceAvailable ? (
        <div className="flex items-end justify-between gap-2">
          <div className={cn(
            props.compact
              ? "grid min-w-0 flex-1 grid-cols-2 rounded-md bg-dls-surface-muted/[0.14] p-1"
              : "inline-flex w-fit rounded-md bg-dls-surface-muted/15 p-1",
          )}>
            <Button
              variant={view === "my" ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                props.compact && cn(
                  "h-9 min-w-0 rounded-md border-0 bg-transparent px-2 text-sm leading-5 shadow-none hover:bg-dls-surface-muted/[0.20]",
                  view === "my" && "bg-dls-surface-muted/[0.40] text-dls-text",
                ),
              )}
              onClick={() => setView("my")}
            >
              <span className="min-w-0 truncate">My Extensions</span>
            </Button>
            <Button
              variant={view === "marketplace" ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                props.compact
                  ? cn(
                    "h-9 min-w-0 rounded-md border-0 bg-transparent px-2 text-sm leading-5 shadow-none hover:bg-dls-surface-muted/[0.20]",
                    view === "marketplace" && "bg-dls-surface-muted/[0.40] text-dls-text",
                  )
                  : undefined,
              )}
              onClick={() => setView("marketplace")}
            >
              <span className="min-w-0 max-w-full truncate">Marketplace</span>
            </Button>
          </div>
          {refreshButton}
        </div>
      ) : null}

      {view === "my" ? (
        <>
          {/* Runtime extensions: MCPs + skills + marketplace imports in one view */}
          {props.mcpView}

          {/* Underlying engine runtime plugins -- advanced, collapsed */}
          {pluginCount > 0 ? (
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-2 text-sm font-medium text-dls-secondary transition-colors hover:text-dls-text">
                <Cpu size={14} />
                <span>Engine plugins</span>
                <span className="text-[11px] text-dls-secondary">({pluginCount})</span>
              </summary>
              <div className="mt-3">
                <PluginsView
                  extensions={props.extensions}
                  busy={props.busy}
                  selectedWorkspaceRoot={props.selectedWorkspaceRoot}
                  canEditPlugins={props.canEditPlugins}
                  canUseGlobalScope={props.canUseGlobalScope}
                  accessHint={props.accessHint}
                  suggestedPlugins={props.suggestedPlugins}
                />
              </div>
            </details>
          ) : null}
        </>
      ) : props.cloudMarketplaceView}
    </section>
  );
}
