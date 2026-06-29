/** @jsxImportSource react */
import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { t } from "@/i18n";
import { CloudAccountSection } from "../cloud/cloud-account-section";
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
  | "onSignOut"
  | "onSubmitManualAuth"
>;

export type CloudAccountViewProps = {
  developerMode: boolean;
  session: CloudAccountSession;
  compact?: boolean;
};

type DenSignedOutPanelProps = Pick<
  CloudAccountSession,
  | "authBusy"
  | "authError"
  | "onClearAuthError"
  | "onOpenBrowserAuth"
  | "onSubmitManualAuth"
  | "sessionBusy"
>;

function DenSignedOutPanel({
  authBusy,
  authError,
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

  const content = (
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

      <SettingsInset className="rounded-lg text-sm text-gray-10">
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

export function CloudAccountView({ compact = false, developerMode, session }: CloudAccountViewProps) {
  const { activeOrganization, isSignedIn, statusMessage } = useCloudSession();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!isSignedIn || !session.needsOrgSelection) return;
    navigate("/onboarding", { replace: true });
  }, [isSignedIn, navigate, session.needsOrgSelection]);

  if (compact) {
    return (
      <SettingsStack className="matterhorn-profile-rail max-w-none gap-4">
        <section className="flex flex-col gap-3 border-b border-dls-border/45 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-dls-text">{t("den.cloud_section_title")}</h3>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                {isSignedIn ? t("den.cloud_signed_in_desc") : t("den.cloud_section_desc")}
              </p>
            </div>
            <SettingsStatusBadge tone={session.summaryTone} label={session.summaryLabel} />
          </div>
          {!isSignedIn ? (
            <p className="text-xs leading-5 text-dls-secondary">{t("den.cloud_sleep_hint")}</p>
          ) : null}
        </section>

        <section className="flex flex-col gap-3 rounded-xl bg-dls-surface-muted/35 px-3 py-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-dls-secondary">Profile readiness</h4>
            <p className="mt-1 text-xs leading-5 text-dls-secondary">
              Local work is available now. Cloud sync, shared workspaces, and organization controls need Matterhorn account setup.
            </p>
          </div>
          <div className="divide-y divide-dls-border/35 text-xs leading-5">
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="text-dls-secondary">Local workspace</span>
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-300">Ready</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="text-dls-secondary">Matterhorn Cloud</span>
              <span className="rounded-md bg-sky-500/10 px-2 py-0.5 font-medium text-sky-300">
                {isSignedIn ? "Connected" : "Needs sign in"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="text-dls-secondary">Support</span>
              <span className="rounded-md bg-violet-500/10 px-2 py-0.5 font-medium text-violet-300">Matterhorn-owned</span>
            </div>
          </div>
        </section>

        {statusMessage && !session.authError && !session.orgsError ? (
          <SettingsNotice>{statusMessage}</SettingsNotice>
        ) : null}

        {session.baseUrlError ? <SettingsNotice tone="error">{session.baseUrlError}</SettingsNotice> : null}

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
            onClearAuthError={session.onClearAuthError}
            onOpenBrowserAuth={session.onOpenBrowserAuth}
            onSubmitManualAuth={session.onSubmitManualAuth}
            sessionBusy={session.sessionBusy}
          />
        )}

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

        <section className="flex flex-col gap-2 rounded-xl bg-dls-surface-muted/20 px-3 py-3 text-xs leading-5 text-dls-secondary">
          <h4 className="font-semibold text-dls-text">Beta support</h4>
          <p>Use these if sign-in, cloud workers, wallet connectors, or desk setup feels rough.</p>
          <div className="flex flex-wrap gap-2">
            <a className="rounded-lg border border-dls-border/60 px-2.5 py-1.5 text-dls-text hover:bg-dls-hover" href="https://matterhorn.work/feedback" target="_blank" rel="noreferrer">
              Send feedback
            </a>
            <a className="rounded-lg border border-dls-border/60 px-2.5 py-1.5 text-dls-text hover:bg-dls-hover" href="mailto:support@matterhorn.work">
              support@matterhorn.work
            </a>
          </div>
        </section>
      </SettingsStack>
    );
  }

  return (
    <SettingsStack>
      <Separator />

      <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionHeaderContent>
            <SettingsSectionHeaderTitle>
              {t("den.cloud_section_title")}
              <SettingsStatusBadge tone={session.summaryTone} label={session.summaryLabel} />
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
        ) : null}
      </SettingsSection>

      <Separator />

      {!isSignedIn ? (
        <DenSignedOutPanel
          authBusy={session.authBusy}
          authError={session.authError}
          onClearAuthError={session.onClearAuthError}
          onOpenBrowserAuth={session.onOpenBrowserAuth}
          onSubmitManualAuth={session.onSubmitManualAuth}
          sessionBusy={session.sessionBusy}
        />
      ) : null}
    </SettingsStack>
  );
}
