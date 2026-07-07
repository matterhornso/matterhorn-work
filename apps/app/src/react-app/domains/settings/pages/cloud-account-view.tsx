/** @jsxImportSource react */
import * as React from "react";
import { ArrowUpRight, ExternalLink, ListChecks } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

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
import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
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
import {
  getProfileReadiness,
  type ProfileAuthState,
  type ProfileReadiness,
} from "@matterhorn-work/types";
import { ProfileCapabilityStatus } from "../../profile/profile-capability-status";
import { getSessionActivityStatusLabel, type SessionActivityStatus } from "../../session/status/session-activity-store";
import { useWorkflowTaskLog } from "./use-workflow-task-log";

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
  workspaceId?: string;
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

function cloudAuthState(isSignedIn: boolean, authError: string | null | undefined): ProfileAuthState {
  if (authError) return "unavailable";
  if (!isSignedIn) return "signed_out";
  // cloud_unconfigured when signed in but cloud sync is paused is not exposed via current session interface;
  // default to signed_in for the happy path.
  return "signed_in";
}

function ProfileReadinessSupportSection({
  onSendFeedback,
  readiness,
}: {
  onSendFeedback?: () => void;
  readiness: ProfileReadiness;
}) {
  const { docsUrl, feedbackUrl, issueUrl, accountUrl } = readiness.supportLinks;
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-dls-surface-muted/20 px-3 py-3 text-xs leading-5 text-dls-secondary">
      <h4 className="font-semibold text-dls-text">{readiness.stateCopy.headline}</h4>
      <p>{readiness.stateCopy.body}</p>
      <div className="flex flex-wrap gap-2">
        {onSendFeedback ? (
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg border border-dls-border/60 px-2.5 py-1.5 text-dls-text hover:bg-dls-hover"
            onClick={onSendFeedback}
          >
            Send feedback
          </button>
        ) : feedbackUrl ? (
          <a className="flex items-center gap-1 rounded-lg border border-dls-border/60 px-2.5 py-1.5 text-dls-text hover:bg-dls-hover" href={feedbackUrl} target="_blank" rel="noreferrer">
            Send feedback <ExternalLink size={10} />
          </a>
        ) : null}
        {docsUrl ? (
          <a className="flex items-center gap-1 rounded-lg border border-dls-border/60 px-2.5 py-1.5 text-dls-text hover:bg-dls-hover" href={docsUrl} target="_blank" rel="noreferrer">
            Docs <ExternalLink size={10} />
          </a>
        ) : null}
        {issueUrl ? (
          <a className="flex items-center gap-1 rounded-lg border border-dls-border/60 px-2.5 py-1.5 text-dls-text hover:bg-dls-hover" href={issueUrl} target="_blank" rel="noreferrer">
            Report issue <ExternalLink size={10} />
          </a>
        ) : null}
        {accountUrl ? (
          <a className="flex items-center gap-1 rounded-lg border border-dls-border/60 px-2.5 py-1.5 text-dls-text hover:bg-dls-hover" href={accountUrl} target="_blank" rel="noreferrer">
            Account settings <ExternalLink size={10} />
          </a>
        ) : null}
      </div>
    </section>
  );
}

function formatTaskLogTime(updatedAt: number) {
  if (!updatedAt) return "Just now";
  return new Date(updatedAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TaskLogSourceBadge({ source }: { source: "backend" | "local" }) {
  if (source === "backend") {
    return (
      <span className="rounded bg-dls-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-dls-accent">
        Workflow
      </span>
    );
  }
  return (
    <span className="rounded bg-dls-surface/70 px-1.5 py-0.5 text-[10px] font-medium text-dls-secondary">
      Local
    </span>
  );
}

function formatTaskLogDesk(deskId?: string) {
  if (!deskId) return "Matterhorn";
  if (deskId === "wellness") return "Longevity";
  if (deskId === "mcps") return "MCPs";
  return deskId
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function taskLogTitle(log: { visibleUserIntent?: string; sessionId: string }) {
  const intent = log.visibleUserIntent?.trim();
  if (intent) return intent;
  return `Task ${log.sessionId.slice(0, 8)}`;
}

function ProfileTaskLogSection({
  workspaceId,
  matterhornServerClient,
}: {
  workspaceId?: string;
  matterhornServerClient?: MatterhornServerClient | null;
}) {
  const { logs, error } = useWorkflowTaskLog(workspaceId, matterhornServerClient ?? undefined);

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-dls-surface-muted/20 px-3 py-3 text-xs leading-5 text-dls-secondary">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <ListChecks className="mt-0.5 size-4 shrink-0 text-dls-text" />
          <div className="min-w-0">
            <h4 className="font-semibold text-dls-text">Task log</h4>
            <p>Recent task state from this workspace session.</p>
          </div>
        </div>
        <span className="shrink-0 font-semibold text-dls-text">{logs.length}</span>
      </div>

      {error ? (
        <div className="rounded-lg border border-dls-border/45 px-3 py-3 text-center text-dls-secondary">
          {error}
        </div>
      ) : logs.length ? (
        <div className="divide-y divide-dls-border/35">
          {logs.map((log) => (
            <div key={log.id} className="grid gap-1 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-medium text-dls-text">
                  {taskLogTitle(log)}
                </span>
                <span className="shrink-0 text-[11px] text-dls-secondary">{formatTaskLogTime(log.updatedAt)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {log.deskId ? <span>{formatTaskLogDesk(log.deskId)}</span> : null}
                <span>{getSessionActivityStatusLabel(log.status as SessionActivityStatus)}</span>
                {log.waitingCount ? <span>{log.waitingCount} waiting</span> : null}
                <TaskLogSourceBadge source={log.source} />
                <span className="truncate text-dls-muted">Workspace {log.workspaceId.slice(-8)}</span>
              </div>
              {log.outputBasePath ? (
                <div className="truncate rounded bg-dls-surface/45 px-2 py-1 font-mono text-[10px] leading-4 text-dls-secondary">
                  {log.outputBasePath}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dls-border/45 px-3 py-3 text-center">
          Task events appear here when Matterhorn starts, waits, finishes, or errors.
        </div>
      )}
    </section>
  );
}

export function CloudAccountView({
  compact = false,
  developerMode,
  session,
  workspaceId,
  matterhornServerClient,
  onSendFeedback,
}: CloudAccountViewProps) {
  const { activeOrganization, isSignedIn, statusMessage } = useCloudSession();
  const navigate = useNavigate();

  const profileReadiness = React.useMemo(
    () => getProfileReadiness(cloudAuthState(isSignedIn, session.authError)),
    [isSignedIn, session.authError],
  );
  const workspaceIdForBackend = workspaceId?.trim() ?? "";
  const backendProfileQuery = useQuery({
    queryKey: ["profile-backend-control-plane", workspaceIdForBackend],
    enabled: Boolean(matterhornServerClient),
    staleTime: 30_000,
    queryFn: async () => {
      if (!matterhornServerClient) throw new Error("Matterhorn Work engine is offline.");
      if (workspaceIdForBackend) {
        const snapshot = await matterhornServerClient.workspaceBackendControlPlane(workspaceIdForBackend);
        return snapshot.capabilities;
      }
      return matterhornServerClient.backendCapabilities();
    },
  });
  const backendProfileError = backendProfileQuery.error instanceof Error ? backendProfileQuery.error : null;

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

        <ProfileCapabilityStatus
          capabilities={backendProfileQuery.data ?? null}
          error={backendProfileError}
          isLoading={backendProfileQuery.isLoading}
        />

        <section className="flex flex-col gap-3 rounded-xl bg-dls-surface-muted/35 px-3 py-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-dls-secondary">Profile readiness</h4>
            <p className="mt-1 text-xs leading-5 text-dls-secondary">
              {profileReadiness.stateCopy.body}
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

        <ProfileTaskLogSection
          workspaceId={workspaceId}
          matterhornServerClient={matterhornServerClient}
        />

        <ProfileReadinessSupportSection
          onSendFeedback={onSendFeedback}
          readiness={profileReadiness}
        />
      </SettingsStack>
    );
  }

  return (
    <SettingsStack>
      <Separator />

      <SettingsSection>
        <ProfileCapabilityStatus
          capabilities={backendProfileQuery.data ?? null}
          error={backendProfileError}
          isLoading={backendProfileQuery.isLoading}
        />
      </SettingsSection>

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

      <ProfileTaskLogSection
        workspaceId={workspaceId}
        matterhornServerClient={matterhornServerClient}
      />
    </SettingsStack>
  );
}
