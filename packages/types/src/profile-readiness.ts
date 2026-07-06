// Profile/account readiness contract
// Declares auth/cloud/account/support state for the profile panel.

export const PROFILE_AUTH_STATES = [
  "signed_out",
  "signed_in",
  "cloud_unconfigured",
  "cloud_only",
  "unavailable",
] as const;
export type ProfileAuthState = (typeof PROFILE_AUTH_STATES)[number];

export interface ProfileSupportLinks {
  docsUrl: string;
  feedbackUrl: string;
  issueUrl: string;
  accountUrl?: string;
}

export interface ProfileReadiness {
  version: "matterhorn.profile.readiness.v1";
  authState: ProfileAuthState;
  supportLinks: ProfileSupportLinks;
  cloudSyncEnabled: boolean;
  requiresCloudAccount: boolean;
  externalLinkLabels: string[];
  stateCopy: {
    headline: string;
    body: string;
  };
}

function matterhornLink(path: string): string {
  return `https://matterhorn.so${path}`;
}

export const PROFILE_READINESS_SIGNED_OUT: ProfileReadiness = {
  version: "matterhorn.profile.readiness.v1",
  authState: "signed_out",
  supportLinks: {
    docsUrl: matterhornLink("/docs"),
    feedbackUrl: matterhornLink("/feedback"),
    issueUrl: matterhornLink("/support/issue"),
  },
  cloudSyncEnabled: false,
  requiresCloudAccount: true,
  externalLinkLabels: [],
  stateCopy: {
    headline: "Sign in to Matterhorn",
    body: "Cloud sync, preferences, and support require a Matterhorn account.",
  },
};

export const PROFILE_READINESS_SIGNED_IN: ProfileReadiness = {
  version: "matterhorn.profile.readiness.v1",
  authState: "signed_in",
  supportLinks: {
    docsUrl: matterhornLink("/docs"),
    feedbackUrl: matterhornLink("/feedback"),
    issueUrl: matterhornLink("/support/issue"),
    accountUrl: matterhornLink("/account"),
  },
  cloudSyncEnabled: true,
  requiresCloudAccount: true,
  externalLinkLabels: [],
  stateCopy: {
    headline: "Account active",
    body: "Your cloud account is active. Local project memory stays on this device unless a workspace policy says otherwise.",
  },
};

export const PROFILE_READINESS_CLOUD_UNCONFIGURED: ProfileReadiness = {
  version: "matterhorn.profile.readiness.v1",
  authState: "cloud_unconfigured",
  supportLinks: {
    docsUrl: matterhornLink("/docs"),
    feedbackUrl: matterhornLink("/feedback"),
    issueUrl: matterhornLink("/support/issue"),
    accountUrl: matterhornLink("/account/cloud"),
  },
  cloudSyncEnabled: false,
  requiresCloudAccount: true,
  externalLinkLabels: [],
  stateCopy: {
    headline: "Cloud sync paused",
    body: "Sign in or configure cloud settings to sync shared workspaces. Local project memory stays on this device.",
  },
};

export const PROFILE_READINESS_CLOUD_ONLY: ProfileReadiness = {
  version: "matterhorn.profile.readiness.v1",
  authState: "cloud_only",
  supportLinks: {
    docsUrl: matterhornLink("/docs"),
    feedbackUrl: matterhornLink("/feedback"),
    issueUrl: matterhornLink("/support/issue"),
    accountUrl: matterhornLink("/account"),
  },
  cloudSyncEnabled: true,
  requiresCloudAccount: true,
  externalLinkLabels: ["cloud_console"],
  stateCopy: {
    headline: "Cloud-managed account",
    body: "This session is running against the cloud. Some desktop-only settings are hidden.",
  },
};

export const PROFILE_READINESS_UNAVAILABLE: ProfileReadiness = {
  version: "matterhorn.profile.readiness.v1",
  authState: "unavailable",
  supportLinks: {
    docsUrl: matterhornLink("/docs"),
    feedbackUrl: matterhornLink("/feedback"),
    issueUrl: matterhornLink("/support/issue"),
  },
  cloudSyncEnabled: false,
  requiresCloudAccount: false,
  externalLinkLabels: [],
  stateCopy: {
    headline: "Account state unavailable",
    body: "We cannot reach the auth service. Local features still work; sign-in is disabled until service recovers.",
  },
};

export const PROFILE_READINESS_REGISTRY: Record<ProfileAuthState, ProfileReadiness> = {
  signed_out: PROFILE_READINESS_SIGNED_OUT,
  signed_in: PROFILE_READINESS_SIGNED_IN,
  cloud_unconfigured: PROFILE_READINESS_CLOUD_UNCONFIGURED,
  cloud_only: PROFILE_READINESS_CLOUD_ONLY,
  unavailable: PROFILE_READINESS_UNAVAILABLE,
};

export function getProfileReadiness(authState: ProfileAuthState): ProfileReadiness {
  return PROFILE_READINESS_REGISTRY[authState] ?? PROFILE_READINESS_UNAVAILABLE;
}
