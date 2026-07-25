import type { DenUser } from "@/app/lib/den";

export type PersonalWorkspaceIdentity = {
  name: string;
  slug: string;
};

export type PersonalWorkspaceOnboardingStep =
  | "provision"
  | "resources"
  | "auto_select"
  | "choose";

function normalizeWorkspaceSlugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
}

export function buildPersonalWorkspaceIdentity(
  user: DenUser,
): PersonalWorkspaceIdentity {
  const firstName = user.name?.trim().split(/\s+/)[0] ?? "";
  const stableUserId = normalizeWorkspaceSlugPart(user.id);

  return {
    name: firstName ? `${firstName}'s workspace` : "My workspace",
    slug: `workspace-${stableUserId || "personal"}`,
  };
}

export function resolvePersonalWorkspaceOnboardingStep(input: {
  organizationCount: number;
  hasActiveOrganization: boolean;
  hasSelectedOrganization: boolean;
}): PersonalWorkspaceOnboardingStep {
  if (input.hasSelectedOrganization || input.hasActiveOrganization) {
    return "resources";
  }
  if (input.organizationCount === 0) {
    return "provision";
  }
  if (input.organizationCount === 1) {
    return "auto_select";
  }
  return "choose";
}
