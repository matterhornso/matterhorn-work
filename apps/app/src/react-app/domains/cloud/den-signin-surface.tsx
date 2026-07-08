/** @jsxImportSource react */
import {
  ArrowUpRight,
  Cloud,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { t } from "../../../i18n";
import { DEFAULT_DEN_BASE_URL } from "../../../app/lib/den";
import { Button } from "@/components/ui/button";
import { TextInput } from "../../design-system/text-input";

export type DenSignInSurfaceVariant = "panel" | "fullscreen";

export type DenSignInSurfaceProps = {
  variant?: DenSignInSurfaceVariant;
  developerMode: boolean;
  baseUrl: string;
  baseUrlDraft: string;
  baseUrlError: string | null;
  statusMessage: string | null;
  authError: string | null;
  authBusy: boolean;
  baseUrlBusy: boolean;
  sessionBusy: boolean;
  manualAuthOpen: boolean;
  manualAuthInput: string;
  onBaseUrlDraftInput: (value: string) => void;
  onResetBaseUrl: () => void;
  onApplyBaseUrl: () => void;
  onOpenControlPlane: () => void;
  onOpenBrowserAuth: (mode: "sign-in" | "sign-up") => void;
  onContinueWithoutCloud?: () => void;
  onToggleManualAuth: () => void;
  onManualAuthInput: (value: string) => void;
  onSubmitManualAuth: () => void;
};

const settingsPanelClass = "ow-soft-card rounded-lg p-5 md:p-6";
const settingsPanelSoftClass = "ow-soft-card-quiet rounded-lg p-4";
const headerBadgeClass =
  "inline-flex min-h-8 items-center gap-2 rounded-lg border border-dls-border bg-dls-hover px-3 text-[13px] font-medium text-dls-text";
const softNoticeClass =
  "rounded-lg border border-dls-border bg-dls-hover px-3 py-2 text-xs leading-5 text-dls-text";
const errorBannerClass =
  "rounded-lg border border-red-7/30 bg-red-1/40 px-3 py-2 text-xs leading-5 text-red-11";
const primaryActionClass =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-dls-accent px-4 text-sm font-semibold text-[var(--dls-accent-fg)] transition-colors hover:bg-[var(--dls-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60";
const secondaryActionClass =
  "inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dls-border bg-dls-surface/70 px-4 text-sm font-medium text-dls-text transition-colors hover:bg-dls-surface disabled:cursor-not-allowed disabled:opacity-60";
const tertiaryActionClass =
  "inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dls-border bg-transparent px-4 text-sm font-medium text-dls-text transition-colors hover:bg-dls-surface disabled:cursor-not-allowed disabled:opacity-60";

function isUnavailableDefaultCloudUrl(value: string): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase() === "app.matterhorn.work";
  } catch {
    return false;
  }
}

const matterhornPrinciples = [
  "AI should be an operator you can understand, not a black box you must trust blindly.",
  "People should keep control of memory, approvals, wallets, files, and final decisions.",
  "Useful work should become durable project context, not disappear into chat history.",
];

function ShowcasePanel() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-dls-text">
            Matterhorn Work
          </h2>
        </div>
        <img
          className="size-12 shrink-0 rounded-lg border border-dls-border bg-[var(--matterhorn-blue)] p-1"
          src="/matterhorn-logo-square.svg"
          alt="Matterhorn Work"
        />
      </div>

      <div className="rounded-lg border border-dls-border bg-dls-background p-5">
        <div className="text-[18px] font-semibold leading-7 text-dls-text">
          Matterhorn is building the workspace where people can trust AI to help
          with serious work.
        </div>
        <p className="mt-4 text-[13px] leading-6 text-dls-secondary">
          The vision is simple: AI should not only answer questions. It should
          help people understand complex systems, prepare safe next steps, keep
          evidence visible, and carry work all the way into saved outputs.
        </p>
        <p className="mt-3 text-[13px] leading-6 text-dls-secondary">
          Matterhorn turns chat into an operating layer for projects, protocols,
          workflows, and real-world decisions while keeping the human clearly in
          control.
        </p>
      </div>

      <div className="rounded-lg border border-dls-border bg-dls-background p-5">
        <div className="text-[13px] font-semibold text-dls-text">
          What that means for people
        </div>
        <div className="mt-3 space-y-3">
          {matterhornPrinciples.map((principle) => (
            <div
              key={principle}
              className="text-[13px] leading-6 text-dls-secondary"
            >
              {principle}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * React port of the Solid `DenSignInSurface`
 * (`apps/app/src/app/cloud/den-signin-surface.tsx` on dev).
 *
 * Stateless presentation: all state + actions are driven by the parent
 * (ForcedSigninPage for the full-screen gate, or the Den settings panel
 * for the embedded "panel" variant). Matches the Solid contract 1:1 so
 * feature parity is obvious.
 */
export function DenSignInSurface(props: DenSignInSurfaceProps) {
  const variant: DenSignInSurfaceVariant = props.variant ?? "panel";
  const cloudUrlMayNeedSetup = isUnavailableDefaultCloudUrl(props.baseUrl);
  const browserAuthDisabled =
    props.authBusy || props.sessionBusy || cloudUrlMayNeedSetup;
  const cloudControlPlaneHint =
    "Use this for local testing or a self-hosted Matterhorn Cloud control plane.";

  const panelContent = (
    <div className={`${settingsPanelClass} space-y-4`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className={headerBadgeClass}>
            <Cloud size={13} className="text-dls-secondary" />
            {t("den.cloud_section_title")}
          </div>
          <div>
            <div className="text-sm font-medium text-dls-text">
              {t("den.signin_title")}
            </div>
          </div>
        </div>
      </div>

      {props.developerMode ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <TextInput
            label={t("den.cloud_control_plane_url_label")}
            value={props.baseUrlDraft}
            onChange={(event) =>
              props.onBaseUrlDraftInput(event.currentTarget.value)
            }
            placeholder={DEFAULT_DEN_BASE_URL}
            hint={cloudControlPlaneHint}
            disabled={props.authBusy || props.baseUrlBusy || props.sessionBusy}
        />
        <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={props.onResetBaseUrl}
              disabled={props.authBusy || props.baseUrlBusy || props.sessionBusy}
            >
              {t("den.cloud_control_plane_reset")}
            </Button>
            <Button
              size="sm"
              onClick={props.onApplyBaseUrl}
              disabled={props.authBusy || props.baseUrlBusy || props.sessionBusy}
            >
              {t("den.cloud_control_plane_save")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={props.onOpenControlPlane}
            >
              {t("den.cloud_control_plane_open")}
              <ArrowUpRight size={13} />
            </Button>
          </div>
        </div>
      ) : null}

      {props.baseUrlError ? (
        <div className={errorBannerClass}>{props.baseUrlError}</div>
      ) : null}

      {props.statusMessage && !props.authError ? (
        <div className={softNoticeClass}>{props.statusMessage}</div>
      ) : null}

      <div className="space-y-2">
        <div className="max-w-[54ch] text-sm text-dls-secondary">
          {t("den.auto_reconnect_hint")}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => props.onOpenBrowserAuth("sign-in")}
          disabled={browserAuthDisabled}
          title={
            cloudUrlMayNeedSetup
              ? "Enter a live Matterhorn Cloud URL before signing in."
              : undefined
          }
        >
          {t("den.signin_button")}
          <ArrowUpRight size={13} />
        </Button>
        {props.onContinueWithoutCloud ? (
          <Button
            variant="outline"
            size="sm"
            onClick={props.onContinueWithoutCloud}
          >
            Continue without Cloud
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={() => props.onOpenBrowserAuth("sign-up")}
          disabled={browserAuthDisabled}
          title={
            cloudUrlMayNeedSetup
              ? "Enter a live Matterhorn Cloud URL before creating an account."
              : undefined
          }
        >
          {t("den.create_account")}
          <ArrowUpRight size={13} />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={props.onToggleManualAuth}
          disabled={props.authBusy || props.sessionBusy}
        >
          {props.manualAuthOpen
            ? t("den.hide_signin_code")
            : t("den.paste_signin_code")}
        </Button>
      </div>

      {props.manualAuthOpen ? (
        <div className={`${settingsPanelSoftClass} space-y-3`}>
          <TextInput
            label={t("den.signin_link_label")}
            value={props.manualAuthInput}
            onChange={(event) =>
              props.onManualAuthInput(event.currentTarget.value)
            }
            placeholder={t("den.signin_link_placeholder")}
            disabled={props.authBusy || props.sessionBusy}
            hint={t("den.signin_link_hint")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={props.onSubmitManualAuth}
              disabled={
                props.authBusy ||
                props.sessionBusy ||
                !props.manualAuthInput.trim()
              }
            >
              {props.authBusy ? t("den.finishing") : t("den.finish_signin")}
            </Button>
            <div className="text-[11px] text-dls-secondary">
              {t("den.signin_code_note")}
            </div>
          </div>
        </div>
      ) : null}

      {props.authError ? (
        <div className={errorBannerClass}>{props.authError}</div>
      ) : null}
    </div>
  );

  if (variant === "fullscreen") {
    return (
      <div className="relative min-h-screen overflow-y-auto bg-dls-background text-dls-text">
        <div className="absolute inset-x-0 top-0 z-20 h-10 mac:titlebar-drag" />

        <div className="relative z-10 grid min-h-screen gap-10 px-6 py-16 lg:grid-cols-[minmax(360px,480px)_minmax(0,640px)] lg:items-center lg:justify-center lg:px-12">
          <div className="w-full">
            <div className="w-full max-w-md space-y-7">
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-dls-text">
                  Welcome to Matterhorn Work
                </h1>
                <p className="text-sm text-dls-secondary">
                  Sign in with Matterhorn Cloud, or continue locally for desktop
                  testing.
                </p>
              </div>

              {cloudUrlMayNeedSetup ? (
                <div className={softNoticeClass}>
                  Matterhorn Cloud is not live in this local build yet.
                  Continue locally, or enter a Matterhorn Cloud control-plane URL
                  if you have one.
                </div>
              ) : null}

              <div className="grid gap-2">
                {cloudUrlMayNeedSetup ? (
                  <>
                    {props.onContinueWithoutCloud ? (
                      <button
                        type="button"
                        className={primaryActionClass}
                        onClick={props.onContinueWithoutCloud}
                      >
                        Continue locally without Cloud
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={primaryActionClass}
                      onClick={() => props.onOpenBrowserAuth("sign-in")}
                      disabled={browserAuthDisabled}
                    >
                      Sign in with Matterhorn Cloud
                      <ArrowUpRight size={15} />
                    </button>
                    <button
                      type="button"
                      className={secondaryActionClass}
                      onClick={() => props.onOpenBrowserAuth("sign-up")}
                      disabled={browserAuthDisabled}
                    >
                      Create account
                      <ArrowUpRight size={14} />
                    </button>
                    {props.onContinueWithoutCloud ? (
                      <button
                        type="button"
                        className={tertiaryActionClass}
                        onClick={props.onContinueWithoutCloud}
                      >
                        Continue locally without Cloud
                      </button>
                    ) : null}
                  </>
                )}
              </div>

              {props.statusMessage && !props.authError ? (
                <div className={softNoticeClass}>{props.statusMessage}</div>
              ) : null}

              {props.authError ? (
                <div className={errorBannerClass}>{props.authError}</div>
              ) : null}

              <div className="space-y-3">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border border-dls-border bg-dls-surface/60 px-4 py-2.5 text-left text-xs font-medium text-dls-secondary transition-colors hover:bg-dls-surface"
                  onClick={props.onToggleManualAuth}
                  disabled={props.authBusy || props.sessionBusy}
                >
                  {props.manualAuthOpen ? (
                    <ChevronUp size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                  {props.manualAuthOpen
                    ? t("den.hide_signin_code")
                    : t("den.paste_signin_code")}
                </button>

                {props.manualAuthOpen ? (
                  <div className="space-y-3 rounded-lg border border-dls-border bg-dls-surface p-4">
                    <TextInput
                      label={t("den.signin_link_label")}
                      value={props.manualAuthInput}
                      onChange={(event) =>
                        props.onManualAuthInput(event.currentTarget.value)
                      }
                      placeholder={t("den.signin_link_placeholder")}
                      disabled={props.authBusy || props.sessionBusy}
                      hint={t("den.signin_link_hint")}
                    />
                    <button
                      type="button"
                      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-dls-accent px-4 text-xs font-semibold text-[var(--dls-accent-fg)] transition-colors hover:bg-[var(--dls-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={props.onSubmitManualAuth}
                      disabled={
                        props.authBusy ||
                        props.sessionBusy ||
                        !props.manualAuthInput.trim()
                      }
                    >
                      {props.authBusy
                        ? t("den.finishing")
                        : t("den.finish_signin")}
                    </button>
                  </div>
                ) : null}
              </div>

              {props.developerMode ? (
                <div className="space-y-3 rounded-lg border border-dls-border bg-dls-surface p-4">
                  <TextInput
                    label={t("den.cloud_control_plane_url_label")}
                    value={props.baseUrlDraft}
                    onChange={(event) =>
                      props.onBaseUrlDraftInput(event.currentTarget.value)
                    }
                    placeholder={DEFAULT_DEN_BASE_URL}
                    hint={cloudControlPlaneHint}
                    disabled={
                      props.authBusy || props.baseUrlBusy || props.sessionBusy
                    }
                  />
                  {props.baseUrlError ? (
                    <div className={errorBannerClass}>{props.baseUrlError}</div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-dls-border bg-dls-surface px-3.5 text-xs font-medium text-dls-text transition-colors hover:border-dls-border hover:bg-dls-hover disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={props.onResetBaseUrl}
                      disabled={
                        props.authBusy || props.baseUrlBusy || props.sessionBusy
                      }
                    >
                      {t("den.cloud_control_plane_reset")}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-dls-accent px-3.5 text-xs font-semibold text-[var(--dls-accent-fg)] transition-colors hover:bg-[var(--dls-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={props.onApplyBaseUrl}
                      disabled={
                        props.authBusy || props.baseUrlBusy || props.sessionBusy
                      }
                    >
                      {t("den.cloud_control_plane_save")}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="hidden lg:flex lg:items-center lg:justify-center">
            <div className="relative w-full max-w-xl overflow-hidden rounded-lg border border-[rgba(var(--matterhorn-blue-rgb),0.45)] bg-[var(--matterhorn-blue)] p-2">
              <div className="pointer-events-none absolute inset-0 opacity-[0.08]">
                <img
                  src="/matterhorn-mark.svg"
                  alt=""
                  className="absolute -right-8 -top-10 size-56 rotate-12"
                />
                <img
                  src="/matterhorn-mark.svg"
                  alt=""
                  className="absolute -bottom-16 left-6 size-64 -rotate-12"
                />
              </div>

              <div className="relative z-10 rounded-lg border border-dls-border bg-dls-surface p-6">
                <ShowcasePanel />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return panelContent;
}
