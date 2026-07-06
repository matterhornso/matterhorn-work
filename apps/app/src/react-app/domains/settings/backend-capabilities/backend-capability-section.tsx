/** @jsxImportSource react */
import type { ReactNode } from "react";
import {
  Boxes,
  BrainCircuit,
  CircleUser,
  FolderCog,
  Info,
  Lock,
  MessageSquare,
  NotebookPen,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { MatterhornBackendCapabilitiesResponse } from "@matterhorn-work/types/backend-capabilities";
import {
  capabilityStatusLabel,
  capabilitySummary,
  feedbackCapabilityCopy,
  memoryScopeCopy,
  walletCapabilitySummary,
  walletFamilySigningCopy,
} from "./backend-capability-helpers";
import { BackendCapabilityStatusBadge, BackendCapabilityStatusRow } from "./backend-capability-status";

function SectionCard(props: {
  icon: ReactNode;
  title: string;
  description: string;
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 px-3 py-5 first:pt-3 last:pb-3">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--dls-accent-rgb),0.12)] text-dls-text">
          {props.icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-6 text-dls-text">{props.title}</h2>
          <p className="mt-0.5 text-sm leading-5 text-dls-secondary">{props.description}</p>
        </div>
        {props.status ? <div className="ml-auto shrink-0">{props.status}</div> : null}
      </div>
      {props.children ? <div className="flex flex-col divide-y divide-dls-border/45 pl-12">{props.children}</div> : null}
    </section>
  );
}

const sectionIcons: Record<string, LucideIcon> = {
  overview: Info,
  profile: CircleUser,
  models: BrainCircuit,
  providers: Boxes,
  wallet: Wallet,
  memory: BrainCircuit,
  notes: NotebookPen,
  outputs: FolderCog,
  teams: CircleUser,
  security: ShieldCheck,
  feedback: MessageSquare,
  mcp: Boxes,
};

export interface BackendCapabilitiesSectionProps {
  capabilities: MatterhornBackendCapabilitiesResponse | null;
  error?: Error | null;
  isLoading?: boolean;
}

export function BackendCapabilitiesSection(props: BackendCapabilitiesSectionProps) {
  if (props.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-3.5 animate-pulse rounded-full bg-dls-accent" />
        Loading backend capabilities…
      </div>
    );
  }

  if (props.error || props.capabilities == null) {
    return (
      <SectionCard
        icon={<ShieldCheck size={18} />}
        title="Backend status"
        description="Could not load capability information from the backend."
        status={<BackendCapabilityStatusBadge status="unavailable" />}
      >
        <p className="px-1 py-3 text-sm leading-6 text-dls-secondary">
          {props.error?.message ?? "The backend control plane is unavailable. Local defaults are shown where possible."}
        </p>
      </SectionCard>
    );
  }

  const caps = props.capabilities;
  const memory = memoryScopeCopy(caps.memory.scope);
  const feedback = feedbackCapabilityCopy(caps.settings.find((s) => s.section === "feedback"));

  return (
    <div className="divide-y divide-dls-border/45">
      {/* Profile */}
      <SectionCard
        icon={<CircleUser size={18} />}
        title="Profile"
        description="Your account and backend-reported profile status."
        status={<BackendCapabilityStatusBadge status={caps.settings.find((s) => s.section === "profile")?.status ?? "unavailable"} />}
      >
        <BackendCapabilityStatusRow
          label="Account"
          status={caps.settings.find((s) => s.section === "profile")?.status ?? "unavailable"}
          hint={caps.settings.find((s) => s.section === "profile")?.description ?? "Profile status from the backend."}
        />
      </SectionCard>

      {/* Models & Providers */}
      <SectionCard
        icon={<BrainCircuit size={18} />}
        title="Models"
        description={capabilitySummary(caps.models)}
        status={<BackendCapabilityStatusBadge status={caps.models.status} />}
      >
        <BackendCapabilityStatusRow
          label="Default model"
          status={caps.models.status}
          hint="Provider and model selected for agent answers."
          value={`${caps.models.defaultModel.providerId}/${caps.models.defaultModel.modelId}`}
        />
        <BackendCapabilityStatusRow
          label="Provider list source"
          status={caps.models.status}
          hint="Where the model list comes from."
          value={caps.models.providerListSource}
        />
      </SectionCard>

      {/* Memory */}
      <SectionCard
        icon={<BrainCircuit size={18} />}
        title="Memory"
        description={capabilitySummary(caps.memory)}
        status={<BackendCapabilityStatusBadge status={caps.memory.status} label={memory.label} />}
      >
        <BackendCapabilityStatusRow
          label="Memory scope"
          status={caps.memory.status}
          hint={memory.hint}
          value={memory.label}
        />
        <BackendCapabilityStatusRow
          label="Pending suggestions"
          status={caps.memory.status}
          value={String(caps.memory.pendingSuggestionCount ?? 0)}
        />
        <BackendCapabilityStatusRow
          label="Saved memories"
          status={caps.memory.status}
          value={String(caps.memory.confirmedRecordCount ?? 0)}
        />
      </SectionCard>

      {/* Wallets */}
      <SectionCard
        icon={<Wallet size={18} />}
        title="Wallets"
        description={walletCapabilitySummary(caps.wallets)}
        status={<BackendCapabilityStatusBadge status={caps.wallets.status} />}
      >
        {Object.values(caps.wallets.families).map((family) => {
          const copy = walletFamilySigningCopy(family);
          return (
            <BackendCapabilityStatusRow
              key={family.family}
              label={family.label}
              status={family.status}
              hint={copy.hint}
              value={<BackendCapabilityStatusBadge status={family.status} label={copy.label} />}
            />
          );
        })}
      </SectionCard>

      {/* Teams */}
      <SectionCard
        icon={<CircleUser size={18} />}
        title="Teams"
        description={capabilitySummary(caps.teams)}
        status={<BackendCapabilityStatusBadge status={caps.teams.status} />}
      >
        <BackendCapabilityStatusRow
          label="Local token sharing"
          status={caps.teams.localTokenSharing.status}
          hint={caps.teams.localTokenSharing.description}
        />
        <BackendCapabilityStatusRow
          label="Cloud teams"
          status={caps.teams.cloudTeams.status}
          hint={caps.teams.cloudTeams.description}
        />
      </SectionCard>

      {/* Settings summary */}
      <SectionCard
        icon={<Info size={18} />}
        title="Settings sections"
        description="Backend-reported status for each settings area."
      >
        {caps.settings.map((section) => {
          const Icon = sectionIcons[section.section] ?? Info;
          return (
            <BackendCapabilityStatusRow
              key={section.section}
              label={
                <span className="flex items-center gap-2">
                  <Icon size={14} />
                  {section.label}
                </span>
              }
              status={section.status}
              hint={section.description}
            />
          );
        })}
      </SectionCard>
    </div>
  );
}
