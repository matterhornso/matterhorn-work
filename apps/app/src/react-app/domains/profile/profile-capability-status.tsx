/** @jsxImportSource react */
import type { ReactNode } from "react";
import { CircleUser, Users } from "lucide-react";
import type { MatterhornBackendCapabilitiesResponse } from "@matterhorn-work/types/backend-capabilities";
import {
  capabilityStatusLabel,
  capabilityStatusTone,
  capabilitySummary,
  type CapabilityUiStatus,
} from "../settings/backend-capabilities/backend-capability-helpers";

export interface ProfileCapabilityStatusProps {
  capabilities: MatterhornBackendCapabilitiesResponse | null;
  cloudAvailable?: boolean;
  compact?: boolean;
  error?: Error | null;
  isLoading?: boolean;
}

const profileStatusToneClasses = {
  ready: "text-emerald-300",
  setup: "text-sky-300",
  preview: "text-amber-300",
  neutral: "text-dls-secondary",
  error: "text-red-300",
} as const;

function ProfileStatusText(props: { status: CapabilityUiStatus; label?: string }) {
  return (
    <span
      className={`shrink-0 text-[11px] font-medium ${profileStatusToneClasses[capabilityStatusTone(props.status)]}`}
    >
      {props.label ?? capabilityStatusLabel(props.status)}
    </span>
  );
}

function ProfileStatusRow(props: {
  compact?: boolean;
  label: string;
  status: CapabilityUiStatus;
  hint?: string;
  value?: ReactNode;
}) {
  return (
    <div className={props.compact
      ? "grid min-w-0 gap-1 rounded-md px-2.5 py-2.5"
      : "grid min-w-0 gap-1 rounded-lg bg-dls-surface-muted/[0.055] px-3 py-2.5"
    }>
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <p className="min-w-0 text-[13px] font-medium leading-5 text-dls-text">{props.label}</p>
        {props.value ?? <ProfileStatusText status={props.status} />}
      </div>
      {props.hint ? (
        <p className="break-words text-[12px] leading-5 text-dls-secondary">{props.hint}</p>
      ) : null}
    </div>
  );
}

export function ProfileCapabilityStatus(props: ProfileCapabilityStatusProps) {
  const profileCapability = props.capabilities?.settings.find((s) => s.section === "profile");
  const teamCapability = props.capabilities?.teams;
  const accountStatus = profileCapability?.status ?? "unavailable";
  const localTeamStatus = teamCapability?.localTokenSharing.status ?? "unavailable";
  const cloudTeamStatus = teamCapability?.cloudTeams.status ?? "unavailable";
  const cloudDisabled = props.cloudAvailable === false;

  if (props.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-3.5 animate-pulse rounded-full bg-dls-accent" />
        Loading profile status…
      </div>
    );
  }

  if (props.error || props.capabilities == null) {
    return (
      <div className="flex flex-col gap-2 rounded-md bg-dls-surface-muted/20 px-3 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <CircleUser size={14} />
          <span>Profile status unavailable</span>
        </div>
        <p>{props.error?.message ?? "The backend control plane did not return profile capabilities."}</p>
      </div>
    );
  }

  if (props.compact) {
    return (
      <section className="flex flex-col gap-4" aria-label="Local profile status">
        <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center text-dls-secondary">
            <CircleUser size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-6 text-dls-text">Local profile</h2>
            <p className="mt-0.5 text-sm leading-5 text-dls-secondary">
              This workspace works locally. No account is required.
            </p>
          </div>
        </div>

        <div className="grid min-w-0 gap-1 rounded-lg bg-dls-surface-muted/[0.10] p-1.5">
          <div className="rounded-md px-3 py-2.5">
            <p className="text-[13px] font-medium leading-5 text-dls-text">Preferences and workspace access</p>
            <p className="mt-0.5 text-[12px] leading-5 text-dls-secondary">
              Available from this Matterhorn Work engine.
            </p>
          </div>
          <div className="rounded-md px-3 py-2.5">
            <div className="flex items-start gap-2.5">
              <Users className="mt-0.5 size-3.5 shrink-0 text-dls-secondary" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-5 text-dls-text">Local teammate access</p>
                <p className="mt-0.5 text-[12px] leading-5 text-dls-secondary">
                  Share this workspace with scoped local tokens. This is separate from Cloud collaboration.
                </p>
              </div>
            </div>
          </div>
        </div>

        <details className="group rounded-lg bg-dls-surface-muted/[0.20] px-3 py-2.5 text-xs text-dls-secondary transition-colors hover:bg-dls-surface-muted/[0.30]">
          <summary className="cursor-pointer select-none font-medium text-dls-text">Technical details</summary>
          <dl className="mt-3 grid gap-2 border-t border-dls-border-subtle/50 pt-3">
            <div className="flex items-center justify-between gap-3">
              <dt>Backend version</dt>
              <dd className="font-mono text-dls-text">{props.capabilities.server.version}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Profile capability</dt>
              <dd><ProfileStatusText status={profileCapability?.status ?? "unavailable"} /></dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Local token sharing</dt>
              <dd><ProfileStatusText status={localTeamStatus} /></dd>
            </div>
            {!cloudDisabled ? <div className="flex items-center justify-between gap-3">
              <dt>Cloud teammates</dt>
              <dd>
                <ProfileStatusText
                  status={cloudTeamStatus}
                  label={capabilityStatusLabel(cloudTeamStatus)}
                />
              </dd>
            </div> : null}
          </dl>
        </details>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--dls-accent-rgb),0.12)] text-dls-text">
          <CircleUser size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2 className="min-w-0 text-base font-semibold leading-6 text-dls-text">Profile</h2>
            <ProfileStatusText status={profileCapability?.status ?? "unavailable"} />
          </div>
          <p className="mt-0.5 text-sm leading-5 text-dls-secondary">
            {profileCapability ? capabilitySummary(profileCapability) : "Your account and sign-in status."}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-1 pl-0 sm:pl-12">
        {!cloudDisabled ? <ProfileStatusRow
          compact={props.compact}
          label="Cloud account"
          status={accountStatus}
          hint="Cloud account sync status from the backend. Local use needs no account."
          value={(
            <ProfileStatusText
              status={accountStatus}
              label={capabilityStatusLabel(accountStatus)}
            />
          )}
        /> : null}
        <ProfileStatusRow
          compact={props.compact}
          label="Local teammate access"
          status={localTeamStatus}
          hint="Local workspace sharing uses scoped tokens and the Matterhorn Work engine. It is not cloud collaboration."
          value={<ProfileStatusText status={localTeamStatus} label={capabilityStatusLabel(localTeamStatus)} />}
        />
        {!cloudDisabled ? <ProfileStatusRow
          compact={props.compact}
          label="Cloud teammates"
          status={cloudTeamStatus}
          hint="Shared cloud workspaces require Matterhorn Cloud team setup."
          value={(
            <ProfileStatusText
              status={cloudTeamStatus}
              label={cloudTeamStatus === "needs_setup"
                  ? "Platform setup"
                  : capabilityStatusLabel(cloudTeamStatus)}
            />
          )}
        /> : null}
        <ProfileStatusRow
          compact={props.compact}
          label="Backend version"
          status={profileCapability?.status ?? "unavailable"}
          value={props.capabilities.server.version}
        />
      </div>

      <div className="flex items-start gap-2 text-xs leading-5 text-dls-secondary">
        <Users className="mt-0.5 size-3.5 shrink-0 text-dls-muted" />
        <p>
          {teamCapability
            ? capabilitySummary(teamCapability)
            : "Team sharing status is unavailable until the backend control plane responds."}
        </p>
      </div>
    </div>
  );
}
