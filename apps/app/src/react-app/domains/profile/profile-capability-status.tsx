/** @jsxImportSource react */
import { CircleUser } from "lucide-react";
import type { MatterhornBackendCapabilitiesResponse } from "@matterhorn-work/types/backend-capabilities";
import { capabilitySummary, capabilityStatusLabel } from "../settings/backend-capabilities/backend-capability-helpers";
import { BackendCapabilityStatusBadge, BackendCapabilityStatusRow } from "../settings/backend-capabilities/backend-capability-status";

export interface ProfileCapabilityStatusProps {
  capabilities: MatterhornBackendCapabilitiesResponse | null;
  error?: Error | null;
  isLoading?: boolean;
}

export function ProfileCapabilityStatus(props: ProfileCapabilityStatusProps) {
  const profileCapability = props.capabilities?.settings.find((s) => s.section === "profile");
  const accountStatus = profileCapability?.status ?? "unavailable";

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--dls-accent-rgb),0.12)] text-dls-text">
          <CircleUser size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-6 text-dls-text">Profile</h2>
          <p className="mt-0.5 text-sm leading-5 text-dls-secondary">
            {profileCapability ? capabilitySummary(profileCapability) : "Your account and sign-in status."}
          </p>
        </div>
        <BackendCapabilityStatusBadge status={profileCapability?.status ?? "unavailable"} />
      </div>

      <div className="flex flex-col divide-y divide-dls-border/45 pl-12">
        <BackendCapabilityStatusRow
          label="Account"
          status={accountStatus}
          hint="Cloud account sync status from the backend. Local use needs no account."
          value={
            <BackendCapabilityStatusBadge
              status={accountStatus}
              label={capabilityStatusLabel(accountStatus)}
            />
          }
        />
        <BackendCapabilityStatusRow
          label="Backend version"
          status={profileCapability?.status ?? "unavailable"}
          value={props.capabilities.server.version}
        />
      </div>
    </div>
  );
}
