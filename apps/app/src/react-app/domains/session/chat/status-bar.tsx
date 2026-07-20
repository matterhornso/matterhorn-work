/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, MessageCircleMore, Settings, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { usePlatform } from "../../../kernel/platform";
import { useControlAction, type MatterhornControlAction } from "../../../shell/control/control-provider";
import { useShellConfig } from "../../../shell/shell-config";
import { BetaAuthMenu } from "../../auth";
import type { MatterhornServerStatus } from "../../../../app/lib/matterhorn-server";

const DOCS_URL = "https://github.com/matterhornso/matterhorn-work/tree/dev/docs";
const PROFILE_SETTINGS_LABEL = "Profile & Settings";
const STATUS_BAR_BOOT_STARTED_AT = Date.now();
const STATUS_BAR_INITIALIZING_MS = 15_000;

type WalletStatus = {
  address: string | null;
  chainId: number | null;
  connector: string | null;
  isConnected: boolean;
  isConnecting: boolean;
};

type StatusDotVariant = "connected" | "loading" | "partial" | "disconnected";

type StatusDotProps = {
  variant: StatusDotVariant;
};

function StatusDot({ variant }: StatusDotProps) {
  return (
    <span className="relative flex size-2.5 shrink-0 items-center justify-center">
      {variant === "loading" ? (
        <span
          className="absolute inline-flex size-full animate-ping rounded-full bg-amber-9/35"
        />
      ) : null}
      <span
        className={cn(
          "relative inline-flex size-2.5 rounded-full",
          variant === "connected" && "bg-green-9",
          variant === "loading" && "bg-amber-9",
          variant === "partial" && "bg-amber-9",
          variant === "disconnected" && "bg-red-9",
        )}
      />
    </span>
  );
}

type StatusIndicatorProps = {
  clientConnected: boolean;
  matterhornServerStatus: MatterhornServerStatus;
  developerMode: boolean;
  mcpConnectedCount: number;
  loading?: boolean;
  initializing: boolean;
};

function StatusIndicator(props: StatusIndicatorProps) {
  if (props.loading || (props.matterhornServerStatus === "disconnected" && props.initializing)) {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot variant="loading" />
        <span className="shrink-0 font-medium text-foreground text-xs">
          {t("session.preparing_workspace")}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {t("session.loading_detail")}
        </span>
      </div>
    );
  }

  if (props.clientConnected) {
    const connectedDetails: string[] = [];
    if (props.mcpConnectedCount > 0) {
      connectedDetails.push(t("status.mcp_connected", undefined, { count: props.mcpConnectedCount }));
    }
    if (props.developerMode) {
      connectedDetails.push(t("status.developer_mode"));
    }
    if (connectedDetails.length === 0) {
      return null;
    }

    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <StatusDot variant="connected" />
          </TooltipTrigger>
          <TooltipContent>{t("status.connected")}</TooltipContent>
        </Tooltip>
        {connectedDetails.map((detail) => (
          <span key={detail} className="truncate text-muted-foreground text-xs">
            {detail}
          </span>
        ))}
      </div>
    );
  }

  if (props.matterhornServerStatus === "limited") {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot variant="partial" />
        <span className="shrink-0 font-medium text-foreground text-xs">
          {t("status.limited_mode")}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {props.mcpConnectedCount > 0
            ? t("status.limited_mcp_hint", undefined, { count: props.mcpConnectedCount })
            : t("status.limited_hint")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <StatusDot variant="disconnected" />
      <span className="shrink-0 font-medium text-foreground text-xs">
        {t("status.disconnected_label")}
      </span>
      <span className="truncate text-muted-foreground text-xs">
        {t("status.disconnected_hint")}
      </span>
    </div>
  );
}

function truncateAddress(address: string | null) {
  if (!address) return "";
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function walletStatusLabel(wallet: WalletStatus | null | undefined) {
  if (!wallet) return "Wallet unavailable";
  if (wallet.isConnecting) return "Wallet connecting";
  if (!wallet.isConnected) return "Wallet not connected";
  const address = truncateAddress(wallet.address);
  const network = wallet.chainId ? `chain ${wallet.chainId}` : wallet.connector ?? "connected";
  return `Wallet ${address}${address ? " · " : ""}${network}`;
}

export type StatusBarProps = {
  clientConnected: boolean;
  matterhornServerStatus: MatterhornServerStatus;
  developerMode: boolean;
  settingsOpen: boolean;
  onSendFeedback: () => void;
  onOpenSettings: () => void;
  providerConnectedIds: string[];
  mcpConnectedCount: number;
  walletStatus?: WalletStatus | null;
  onOpenWallet?: () => void;
  loading?: boolean;
  showSettingsButton?: boolean;
  showAccountActions?: boolean;
  showWalletButton?: boolean;
  initializing?: boolean;
};

export function StatusBar(props: StatusBarProps) {
  const platform = usePlatform();
  const { config: shellConfig } = useShellConfig();
  const docsButtonRef = useRef<HTMLButtonElement>(null);
  const feedbackButtonRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [initializing, setInitializing] = useState(
    () => Date.now() - STATUS_BAR_BOOT_STARTED_AT < STATUS_BAR_INITIALIZING_MS,
  );

  useEffect(() => {
    if (!initializing) return;
    const remaining = Math.max(
      0,
      STATUS_BAR_INITIALIZING_MS - (Date.now() - STATUS_BAR_BOOT_STARTED_AT),
    );
    const timeout = window.setTimeout(() => setInitializing(false), remaining);
    return () => window.clearTimeout(timeout);
  }, [initializing]);

  const docsControlAction = useMemo<MatterhornControlAction>(() => ({
    id: "status.docs.open",
    label: "Open Matterhorn docs",
    description: "Open the documentation from the status bar.",
    sideEffect: "external",
    targetRef: docsButtonRef,
    execute: () => platform.openLink(DOCS_URL),
  }), [platform]);
  useControlAction(docsControlAction);

  const feedbackControlAction = useMemo<MatterhornControlAction>(() => ({
    id: "status.feedback.open",
    label: "Send feedback",
    description: "Open the Matterhorn Desks feedback surface from the status bar.",
    sideEffect: "external",
    targetRef: feedbackButtonRef,
    execute: props.onSendFeedback,
  }), [props.onSendFeedback]);
  useControlAction(feedbackControlAction);

  const settingsControlAction = useMemo<MatterhornControlAction>(() => ({
    id: "status.settings.open",
    label: props.settingsOpen ? "Go back from settings" : "Open profile and settings from the status bar",
    description: "Use the visible profile and settings button in the status bar.",
    sideEffect: "navigation",
    disabled: props.showSettingsButton === false,
    targetRef: settingsButtonRef,
    execute: props.onOpenSettings,
  }), [props.onOpenSettings, props.settingsOpen, props.showSettingsButton]);
  useControlAction(settingsControlAction);

  const walletButtonLabel = walletStatusLabel(props.walletStatus);
  const walletControlAction = useMemo<MatterhornControlAction | null>(() => (
    props.onOpenWallet ? {
      id: "status.wallet.open",
      label: "Open Matterhorn Wallet",
      description: "Open the Matterhorn Wallet panel from the status bar.",
      sideEffect: "navigation",
      execute: props.onOpenWallet,
    } : null
  ), [props.onOpenWallet]);
  useControlAction(walletControlAction);

  return (
    <div className="bg-dls-surface/92 shadow-[0_-1px_0_rgba(var(--matterhorn-blue-rgb),0.10)]">
      <div className="flex h-8 min-w-0 items-center justify-between gap-2 px-3 md:gap-3 md:px-6">
        <StatusIndicator
          clientConnected={props.clientConnected}
          matterhornServerStatus={props.matterhornServerStatus}
          developerMode={props.developerMode}
          mcpConnectedCount={props.mcpConnectedCount}
          loading={props.loading}
          initializing={initializing}
        />

        <div className="flex min-w-0 shrink-0 items-center gap-1">
          {props.showWalletButton !== false && props.onOpenWallet ? (
            <Button
              className="max-w-[210px] gap-1.5 truncate text-muted-foreground"
              variant="ghost"
              size="xs"
              onClick={props.onOpenWallet}
              title={`${walletButtonLabel}. Bittensor uses public SS58 reads and the user's own signer. Hyperliquid orders require exact review and connected-wallet approval. Polymarket stays preview-only.`}
              aria-label={`${walletButtonLabel}. Open Matterhorn Wallet.`}
            >
              <Wallet className="size-3.5" />
              <span className="hidden max-w-[170px] truncate sm:inline">{walletButtonLabel}</span>
              <span className="sm:hidden">Wallet</span>
            </Button>
          ) : null}
          {props.showAccountActions !== false && shellConfig.cloudSignin ? (
            <BetaAuthMenu compact={false} />
          ) : null}
          {shellConfig.docsButton ? (
            <Button
              ref={docsButtonRef}
              className="text-muted-foreground gap-2"
              variant="ghost"
              size="xs"
              onClick={() => platform.openLink(DOCS_URL)}
              title={t("status.open_docs")}
              aria-label={`${t("status.docs")} - ${t("status.open_docs")}`}
            >
              <BookOpen className="size-3.5" />
              <span className="hidden sm:inline">{t("status.docs")}</span>
            </Button>
          ) : null}
          {shellConfig.feedbackButton ? (
            <Button
              ref={feedbackButtonRef}
              className="text-muted-foreground gap-2"
              variant="ghost"
              size="xs"
              onClick={props.onSendFeedback}
              title={t("status.send_feedback")}
              aria-label={t("status.send_feedback")}
            >
              <MessageCircleMore className="size-3.5" />
              <span className="hidden sm:inline">
                {t("status.feedback")}
              </span>
            </Button>
          ) : null}
          {props.showSettingsButton !== false ? (
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Button
                    ref={settingsButtonRef}
                    className="text-muted-foreground gap-2"
                    variant="ghost"
                    size="xs"
                    onClick={props.onOpenSettings}
                    title={props.settingsOpen ? t("status.back") : PROFILE_SETTINGS_LABEL}
                    aria-label={props.settingsOpen ? t("status.back") : PROFILE_SETTINGS_LABEL}
                  >
                    <Settings className="size-3.5" />
                    <span className="hidden md:inline">{props.settingsOpen ? t("status.back") : PROFILE_SETTINGS_LABEL}</span>
                  </Button>
                )}
              />
              <TooltipContent>{props.settingsOpen ? t("status.back") : PROFILE_SETTINGS_LABEL}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </div>
  );
}
