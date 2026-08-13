/** @jsxImportSource react */
import * as React from "react";
import { ArrowUpRight, Cloud, ExternalLink, SlidersHorizontal } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { MATTERHORN_CLOUD_ENABLED } from "../../../../app/lib/den";
import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
import { CloudAccountSection } from "../cloud/cloud-account-section";
import { AccountSecuritySection } from "../cloud/account-security-section";
import { useCloudSession } from "../cloud/cloud-session-provider";
import { CloudDevMode } from "../cloud/dev-mode";
import type { useDenSession } from "../cloud/use-den-session";
import {
  SettingsInset,
  SettingsNotice,
  SettingsSection,
  SettingsSectionHeader,
  SettingsSectionHeaderContent,
  SettingsSectionHeaderDescription,
  SettingsSectionHeaderTitle,
  SettingsStack,
  SettingsStatusBadge,
} from "../settings-section";
import {
  getProfileReadiness,
  type ProfileAuthState,
  type ProfileReadiness,
} from "@matterhorn-work/types";
import { ProfileCapabilityStatus } from "../../profile/profile-capability-status";

type CloudAccountSession = Pick<
  ReturnType<typeof useDenSession>,
  | "authBusy"
  | "authError"
  | "baseUrlDraft"
  | "baseUrlError"
  | "needsOrgSelection"
  | "orgs"
  | "orgsBusy"
  | "orgsError"
  | "sessionBusy"
  | "summaryLabel"
  | "summaryTone"
  | "onActiveOrgChange"
  | "onApplyBaseUrl"
  | "onBaseUrlDraftChange"
  | "onClearAuthError"
  | "onOpenBrowserAuth"
  | "onOpenControlPlane"
  | "onRefreshOrgs"
  | "onResetBaseUrl"
  | "onSessionEnded"
  | "onSignOut"
  | "onSubmitManualAuth"
>;

export type CloudAccountViewProps = {
  developerMode: boolean;
  session: CloudAccountSession;
  compact?: boolean;
  workspaceId?: string;
  runtimeWorkspaceId?: string | null;
  matterhornServerClient?: MatterhornServerClient | null;
  onSendFeedback?: () => void;
};

type DenSignedOutPanelProps = Pick<
  CloudAccountSession,
  | "authBusy"
  | "authError"
  | "onClearAuthError"
  | "onOpenBrowserAuth"
  | "onSubmitManualAuth"
  | "sessionBusy"
> & { cloudAvailable: boolean };

function DenSignedOutPanel({
  authBusy,
  authError,
  cloudAvailable,
  compact = false,
  onClearAuthError,
  onOpenBrowserAuth,
  onSubmitManualAuth,
  sessionBusy,
}: DenSignedOutPanelProps & { compact?: boolean }) {
  const [manualAuthOpen, setManualAuthOpen] = React.useState(false);
  const [manualAuthInput, setManualAuthInput] = React.useState("");
  const controlsDisabled = [authBusy, sessionBusy].some(Boolean);

  const submitManualAuth = async () => {
    const ok = await onSubmitManualAuth(manualAuthInput);
    if (!ok) return;
    setManualAuthInput("");
    setManualAuthOpen(false);
  };

  const content = !cloudAvailable ? (
    <SettingsNotice>
      Matterhorn Cloud is not available in this build. Local workspaces, chats, notes, memory, and outputs continue to work without an account.
    </SettingsNotice>
  ) : (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => onOpenBrowserAuth("sign-in")}>
            {t("den.signin_button")}
            <ArrowUpRight size={13} />
          </Button>
          <Button variant="outline" onClick={() => onOpenBrowserAuth("sign-up")}>
            {t("den.create_account")}
            <ArrowUpRight size={13} />
          </Button>
        </div>

        <Collapsible
          open={manualAuthOpen}
          onOpenChange={(open) => {
            setManualAuthOpen(open);
            onClearAuthError();
          }}
          disabled={controlsDisabled}
          className="flex flex-col gap-3"
        >
          <CollapsibleTrigger
            render={<Button variant="ghost" size="sm" className="w-fit self-start" disabled={controlsDisabled} />}
          >
            {manualAuthOpen ? t("den.hide_signin_code") : t("den.paste_signin_code")}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SettingsInset className="flex flex-col gap-y-3 rounded-lg p-3">
              <Field data-disabled={controlsDisabled}>
                <FieldLabel htmlFor="den-signin-link">{t("den.signin_link_label")}</FieldLabel>
                <Input
                  id="den-signin-link"
                  value={manualAuthInput}
                  onChange={(event) => setManualAuthInput(event.currentTarget.value)}
                  placeholder={t("den.signin_link_placeholder")}
                  disabled={controlsDisabled}
                />
                <FieldDescription className="text-xs">{t("den.signin_link_hint")}</FieldDescription>
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void submitManualAuth()}
                  disabled={[controlsDisabled, !manualAuthInput.trim()].some(Boolean)}
                >
                  {authBusy ? t("den.finishing") : t("den.finish_signin")}
                </Button>
              </div>
            </SettingsInset>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {authError ? <SettingsNotice tone="error">{authError}</SettingsNotice> : null}

      <SettingsInset className={cn(
        "text-sm text-gray-10",
        compact ? "rounded-none bg-transparent px-0 py-0" : "rounded-lg",
      )}>
        {t("den.auto_reconnect_hint")}
      </SettingsInset>
    </>
  );

  if (compact) {
    return <div className="flex flex-col gap-4">{content}</div>;
  }

  return (
    <SettingsSection>
      <SettingsSectionHeader>
        <SettingsSectionHeaderContent>
          <SettingsSectionHeaderTitle>{t("den.signin_title")}</SettingsSectionHeaderTitle>
          <SettingsSectionHeaderDescription className="max-w-[54ch]">
            {t("den.cloud_sleep_hint")}
          </SettingsSectionHeaderDescription>
        </SettingsSectionHeaderContent>
      </SettingsSectionHeader>

      {content}
    </SettingsSection>
  );
}

function cloudAuthState(isSignedIn: boolean, authError: string | null | undefined): ProfileAuthState {
  if (authError) return "unavailable";
  if (!isSignedIn) return "signed_out";
  // cloud_unconfigured when signed in but cloud sync is paused is not exposed via current session interface;
  // default to signed_in for the happy path.
  return "signed_in";
}

function ProfileReadinessSupportSection({
  compact = false,
  onSendFeedback,
  readiness,
}: {
  compact?: boolean;
  onSendFeedback?: () => void;
  readiness: ProfileReadiness;
}) {
  const { docsUrl, feedbackUrl, issueUrl, accountUrl } = readiness.supportLinks;
  const actionClass =
    "inline-flex items-center gap-1.5 rounded-md bg-dls-surface-muted/[0.18] px-2.5 py-1.5 text-[12px] font-medium text-dls-secondary transition-colors duration-150 hover:bg-dls-surface-muted/[0.30] hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--matterhorn-blue-rgb)/0.28)]";
  return (
    <section className={cn(
      "flex flex-col gap-2 text-xs leading-5 text-dls-secondary",
      compact ? "matterhorn-rail-section" : "rounded-lg bg-dls-surface-muted/[0.08] px-3 py-3",
    )}>
      <h4 className="font-semibold text-dls-text">
        {compact ? "Help and support" : readiness.stateCopy.headline}
      </h4>
      {compact ? null : <p>{readiness.stateCopy.body}</p>}
      <div className="flex flex-wrap gap-2">
        {onSendFeedback ? (
          <button
            type="button"
            className={actionClass}
            onClick={onSendFeedback}
          >
            Send feedback
          </button>
        ) : feedbackUrl ? (
          <a className={actionClass} href={feedbackUrl} target="_blank" rel="noreferrer">
            Send feedback <ExternalLink size={10} />
          </a>
        ) : null}
        {docsUrl ? (
          <a className={actionClass} href={docsUrl} target="_blank" rel="noreferrer">
            Docs <ExternalLink size={10} />
          </a>
        ) : null}
        {issueUrl ? (
          <a className={actionClass} href={issueUrl} target="_blank" rel="noreferrer">
            Report issue <ExternalLink size={10} />
          </a>
        ) : null}
        {accountUrl ? (
          <a className={actionClass} href={accountUrl} target="_blank" rel="noreferrer">
            Account settings <ExternalLink size={10} />
          </a>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px]">
        <Link className="hover:text-dls-text" to="/privacy">Privacy</Link>
        <Link className="hover:text-dls-text" to="/terms">Terms</Link>
        <Link className="hover:text-dls-text" to="/security">Security</Link>
        <Link className="hover:text-dls-text" to="/support">Support</Link>
        <Link className="hover:text-dls-text" to="/status">Status</Link>
      </div>
    </section>
  );
}

export function CloudAccountView({
  compact = false,
  developerMode,
  session,
  workspaceId,
  runtimeWorkspaceId,
  matterhornServerClient,
  onSendFeedback,
}: CloudAccountViewProps) {
  const { activeOrganization, client, isSignedIn, statusMessage, user } = useCloudSession();
  const navigate = useNavigate();

  const profileReadiness = React.useMemo(
    () => getProfileReadiness(cloudAuthState(isSignedIn, session.authError)),
    [isSignedIn, session.authError],
  );
  const workspaceIdForBackend = runtimeWorkspaceId?.trim() ?? "";
  const backendProfileQuery = useQuery({
    queryKey: ["profile-backend-control-plane", workspaceIdForBackend],
    enabled: Boolean(matterhornServerClient),
    staleTime: 30_000,
    queryFn: async () => {
      if (!matterhornServerClient) throw new Error("Matterhorn Desks engine is offline.");
      if (workspaceIdForBackend) {
        const snapshot = await matterhornServerClient.workspaceBackendControlPlane(workspaceIdForBackend);
        return snapshot.capabilities;
      }
      return matterhornServerClient.backendCapabilities();
    },
  });
  const backendProfileError = backendProfileQuery.error instanceof Error ? backendProfileQuery.error : null;
  const cloudAvailable = MATTERHORN_CLOUD_ENABLED || developerMode;

  React.useEffect(() => {
    if (!isSignedIn || !session.needsOrgSelection) return;
    navigate("/onboarding", { replace: true });
  }, [isSignedIn, navigate, session.needsOrgSelection]);

  if (compact) {
    return (
      <SettingsStack className="matterhorn-profile-rail max-w-none gap-6">
        <ProfileCapabilityStatus
          compact
          capabilities={backendProfileQuery.data ?? null}
          cloudAvailable={cloudAvailable}
          error={backendProfileError}
          isLoading={backendProfileQuery.isLoading}
        />

        <Button
          variant="outline"
          size="sm"
          className="h-10 w-full justify-start gap-2 border-0 bg-dls-surface-muted/[0.32] px-3 text-dls-text shadow-none hover:bg-dls-surface-muted/[0.46]"
          onClick={() => navigate(workspaceId ? `/workspace/${workspaceId}/settings/preferences` : "/settings/preferences")}
        >
          <SlidersHorizontal className="size-3.5" />
          Open workspace preferences
        </Button>

        {cloudAvailable ? <section className="flex flex-col gap-3 rounded-lg bg-dls-surface-muted/[0.12] px-3.5 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <Cloud className="mt-0.5 size-4 shrink-0 text-dls-secondary" />
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-dls-text">{t("den.cloud_section_title")}</h3>
                <p className="mt-1 text-xs leading-5 text-dls-secondary">
                  {isSignedIn ? t("den.cloud_signed_in_desc") : t("den.cloud_section_desc")}
                </p>
              </div>
            </div>
            <span className="shrink-0 text-[11px] font-medium text-dls-secondary">
              {session.summaryLabel}
            </span>
          </div>
          {!isSignedIn ? (
            <p className="pl-[1.625rem] text-xs leading-5 text-dls-secondary">{t("den.cloud_sleep_hint")}</p>
          ) : null}
        </section> : null}

        {statusMessage && cloudAvailable && !session.authError && !session.orgsError ? (
          <SettingsNotice>{statusMessage}</SettingsNotice>
        ) : null}

        {session.baseUrlError ? <SettingsNotice tone="error">{session.baseUrlError}</SettingsNotice> : null}

        {cloudAvailable ? isSignedIn ? (
          <CloudAccountSection
            activeOrgId={activeOrganization?.id ?? ""}
            authBusy={session.authBusy}
            needsOrgSelection={session.needsOrgSelection}
            orgs={session.orgs}
            orgsBusy={session.orgsBusy}
            orgsError={session.orgsError}
            sessionBusy={session.sessionBusy}
            onActiveOrgChange={session.onActiveOrgChange}
            onRefreshOrgs={session.onRefreshOrgs}
            onSignOut={session.onSignOut}
          />
        ) : (
          <DenSignedOutPanel
            compact
            authBusy={session.authBusy}
            authError={session.authError}
            cloudAvailable={cloudAvailable}
            onClearAuthError={session.onClearAuthError}
            onOpenBrowserAuth={session.onOpenBrowserAuth}
            onSubmitManualAuth={session.onSubmitManualAuth}
            sessionBusy={session.sessionBusy}
          />
        ) : null}

        {developerMode ? (
          <CloudDevMode
            authBusy={session.authBusy}
            baseUrlDraft={session.baseUrlDraft}
            onApplyBaseUrl={session.onApplyBaseUrl}
            onBaseUrlDraftChange={session.onBaseUrlDraftChange}
            onOpenControlPlane={session.onOpenControlPlane}
            onResetBaseUrl={session.onResetBaseUrl}
            sessionBusy={session.sessionBusy}
          />
        ) : null}

        <ProfileReadinessSupportSection
          compact
          onSendFeedback={onSendFeedback}
          readiness={profileReadiness}
        />
      </SettingsStack>
    );
  }

  return (
    <SettingsStack>
      <SettingsSection>
        <ProfileCapabilityStatus
          capabilities={backendProfileQuery.data ?? null}
          cloudAvailable={cloudAvailable}
          error={backendProfileError}
          isLoading={backendProfileQuery.isLoading}
        />
      </SettingsSection>

      {cloudAvailable ? <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionHeaderContent>
            <SettingsSectionHeaderTitle>
              {t("den.cloud_section_title")}
              <SettingsStatusBadge
                tone={cloudAvailable ? session.summaryTone : "neutral"}
                label={cloudAvailable ? session.summaryLabel : "Not included"}
              />
            </SettingsSectionHeaderTitle>
            <SettingsSectionHeaderDescription>
              {t(isSignedIn ? "den.cloud_signed_in_desc" : "den.cloud_section_desc")}
            </SettingsSectionHeaderDescription>
            {!isSignedIn ? (
              <SettingsSectionHeaderDescription className="text-xs">
                {t("den.cloud_sleep_hint")}
              </SettingsSectionHeaderDescription>
            ) : null}
          </SettingsSectionHeaderContent>
        </SettingsSectionHeader>

        {developerMode ? (
          <CloudDevMode
            authBusy={session.authBusy}
            baseUrlDraft={session.baseUrlDraft}
            onApplyBaseUrl={session.onApplyBaseUrl}
            onBaseUrlDraftChange={session.onBaseUrlDraftChange}
            onOpenControlPlane={session.onOpenControlPlane}
            onResetBaseUrl={session.onResetBaseUrl}
            sessionBusy={session.sessionBusy}
          />
        ) : null}

        {session.baseUrlError ? <SettingsNotice tone="error">{session.baseUrlError}</SettingsNotice> : null}

        {statusMessage && !session.authError && !session.orgsError ? (
          <SettingsNotice>{statusMessage}</SettingsNotice>
        ) : null}

        {isSignedIn ? (
          <CloudAccountSection
            activeOrgId={activeOrganization?.id ?? ""}
            authBusy={session.authBusy}
            needsOrgSelection={session.needsOrgSelection}
            orgs={session.orgs}
            orgsBusy={session.orgsBusy}
            orgsError={session.orgsError}
            sessionBusy={session.sessionBusy}
            onActiveOrgChange={session.onActiveOrgChange}
            onRefreshOrgs={session.onRefreshOrgs}
            onSignOut={session.onSignOut}
          />
        ) : (
          <DenSignedOutPanel
            compact
            authBusy={session.authBusy}
            authError={session.authError}
            cloudAvailable={cloudAvailable}
            onClearAuthError={session.onClearAuthError}
            onOpenBrowserAuth={session.onOpenBrowserAuth}
            onSubmitManualAuth={session.onSubmitManualAuth}
            sessionBusy={session.sessionBusy}
          />
        )}
      </SettingsSection> : null}

      {isSignedIn && user ? (
        <AccountSecuritySection
          client={client}
          user={user}
          onSessionEnded={session.onSessionEnded}
        />
      ) : null}

    </SettingsStack>
  );
}
