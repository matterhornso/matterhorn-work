import type { MatterhornCapability } from "./backend-capabilities.js";

export const MATTERHORN_BACKEND_TEAM_ACCESS_VERSION = "matterhorn.backend.team-access.v1" as const;

export type MatterhornTeamTokenScope = "owner" | "collaborator" | "viewer";
export type MatterhornTeamShareableTokenScope = Exclude<MatterhornTeamTokenScope, "owner">;

export interface MatterhornTeamAccessTokenDescriptor {
  id: string;
  scope: MatterhornTeamTokenScope;
  createdAt: number;
  label?: string;
  source: "built_in_client_token" | "token_store";
}

export interface MatterhornTeamAccessSharingMode {
  current: "local_tokens";
  label: string;
  description: string;
  sameInterface: true;
  durableCloudTeams: false;
  requiresReachableLocalServer: true;
  cloudTeamsStatus: MatterhornCapability["status"];
  limitations: string[];
}

export interface MatterhornTeamAccessScopeCapability {
  scope: MatterhornTeamTokenScope;
  label: string;
  description: string;
  canReadWorkspace: boolean;
  canWriteWorkspace: boolean;
  canManageLocalTokens: boolean;
  hostProtected: boolean;
}

export type MatterhornTeamAccessScopeCapabilities = Record<
  MatterhornTeamTokenScope,
  MatterhornTeamAccessScopeCapability
>;

export interface MatterhornBackendTeamAccessResponse {
  success: true;
  version: typeof MATTERHORN_BACKEND_TEAM_ACCESS_VERSION;
  generatedAt: string;
  workspace: {
    id: string;
    name: string;
    type: "local" | "remote";
  };
  sharingMode: MatterhornTeamAccessSharingMode;
  scopeCapabilities: MatterhornTeamAccessScopeCapabilities;
  localAccess: MatterhornCapability & {
    scopes: MatterhornTeamTokenScope[];
    tokenCount: number;
    byScope: Record<MatterhornTeamTokenScope, number>;
    tokens: MatterhornTeamAccessTokenDescriptor[];
  };
  cloudTeams: MatterhornCapability;
  policy: {
    secretsReturned: false;
    hostProtected: true;
    durableCloudTeams: false;
  };
}

export interface MatterhornBackendTeamAccessSummaryResponse {
  success: true;
  version: typeof MATTERHORN_BACKEND_TEAM_ACCESS_VERSION;
  generatedAt: string;
  workspace: MatterhornBackendTeamAccessResponse["workspace"];
  sharingMode: MatterhornTeamAccessSharingMode;
  scopeCapabilities: MatterhornTeamAccessScopeCapabilities;
  localAccess: MatterhornCapability & {
    scopes: MatterhornTeamTokenScope[];
    tokenCount: number;
    byScope: Record<MatterhornTeamTokenScope, number>;
  };
  cloudTeams: MatterhornCapability;
  policy: {
    secretsReturned: false;
    hostProtected: false;
    fullTokenListRequiresHost: true;
    durableCloudTeams: false;
  };
}

export interface MatterhornTeamAccessTokenCreateRequest {
  scope: MatterhornTeamShareableTokenScope;
  label?: string;
}

export interface MatterhornTeamAccessTokenCreateResponse {
  success: true;
  version: typeof MATTERHORN_BACKEND_TEAM_ACCESS_VERSION;
  generatedAt: string;
  workspace: MatterhornBackendTeamAccessResponse["workspace"];
  token: MatterhornTeamAccessTokenDescriptor & {
    token: string;
    source: "token_store";
  };
  policy: {
    secretsReturned: "one_time_token";
    hostProtected: true;
    auditLogged: true;
    allowedScopes: MatterhornTeamShareableTokenScope[];
  };
}

export interface MatterhornTeamAccessTokenRevokeResponse {
  success: true;
  version: typeof MATTERHORN_BACKEND_TEAM_ACCESS_VERSION;
  generatedAt: string;
  workspace: MatterhornBackendTeamAccessResponse["workspace"];
  revoked: MatterhornTeamAccessTokenDescriptor;
  policy: {
    secretsReturned: false;
    hostProtected: true;
    auditLogged: true;
  };
}
