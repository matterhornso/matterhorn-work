/** @jsxImportSource react */
import { useMemo, useState, type ReactNode } from "react";
import { Cpu } from "lucide-react";

import { t } from "../../../../i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { PluginsView, type PluginsExtensionsStore } from "./plugins-view";

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
  mcpConnectedAppsCount: number;
  /** The MCP view (quick-connect grid + configured servers). Skills are injected into it. */
  mcpView: ReactNode;
  /** Organization marketplace content, rendered in the same Extensions pane. */
  cloudMarketplaceView?: ReactNode;
  onRefresh: () => void;
  initialSection?: ExtensionsSection;
  setSectionRoute?: (tab: "mcp" | "skills" | "plugins") => void;
  showHeader?: boolean;
  compact?: boolean;
};

export function ExtensionsView(props: ExtensionsViewProps) {
  const [view, setView] = useState<"my" | "marketplace">("my");
  const pluginCount = useMemo(
    () => props.extensions.pluginList().length,
    [props.extensions],
  );

  return (
    <section className={cn(
      "w-full animate-in fade-in duration-300",
      props.compact ? "space-y-4 max-w-none" : "space-y-6 max-w-3xl",
    )}>
      <div className={cn(
        "flex items-center justify-between",
        props.compact && "gap-2",
      )}>
        <div className="flex flex-wrap items-center gap-2">
          {props.mcpConnectedAppsCount > 0 ? (
            <div className={cn(
              "inline-flex items-center gap-2 rounded-full bg-green-3 px-3 py-1",
              props.compact && "px-2 py-0.5",
            )}>
              <div className="size-2 rounded-full bg-green-9" />
              <span className={cn("text-xs font-medium text-green-11", props.compact && "text-[11px]")}>
                {t("extensions.app_count", { count: props.mcpConnectedAppsCount })}
              </span>
            </div>
          ) : null}
        </div>
        <Button
          variant="outline"
          className={props.compact ? "h-8 px-2 text-xs" : undefined}
          onClick={props.onRefresh}
        >
          {t("common.refresh")}
        </Button>
      </div>

      <div className={cn(
        "flex rounded-lg border border-dls-border bg-dls-surface p-1",
        props.compact ? "w-full" : "w-fit",
      )}>
        <Button
          variant={view === "my" ? "secondary" : "ghost"}
          size="sm"
          className={props.compact ? "flex-1" : undefined}
          onClick={() => setView("my")}
        >
          My Extensions
        </Button>
        <Button
          variant={view === "marketplace" ? "secondary" : "ghost"}
          size="sm"
          className={cn(props.compact ? "flex-1" : undefined, "gap-1.5")}
          onClick={() => setView("marketplace")}
        >
          Marketplace
          <span className="text-xs font-normal text-dls-secondary">
            post-go-live
          </span>
        </Button>
      </div>

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
      ) : (
        <div
          className={cn(
            "space-y-3 rounded-lg border border-dls-border bg-dls-surface px-4 py-5",
            props.compact && "px-3 py-4",
          )}
        >
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-dls-text">
              Marketplace extensions are post-go-live
            </h3>
            <p className="text-sm leading-6 text-dls-secondary">
              The built-in Matterhorn MCPs are the beta-ready extension path
              today. Organization marketplace extensions require Matterhorn
              Cloud marketplace setup, so this catalog is parked until after
              go-live.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setView("my")}>
            View Matterhorn MCPs
          </Button>
        </div>
      )}
    </section>
  );
}
