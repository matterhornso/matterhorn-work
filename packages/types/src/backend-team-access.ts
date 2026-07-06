import type { MatterhornCapability } from "./backend-capabilities.js";

export const MATTERHORN_BACKEND_TEAM_ACCESS_VERSION = "matterhorn.backend.team-access.v1" as const;

export type MatterhornTeamTokenScope = "owner" | "collaborator" | "viewer";

export interface MatterhornTeamAccessTokenDescriptor {
  id: string;
  scope: MatterhornTeamTokenScope;
  createdAt: number;
  label?: string;
  source: "built_in_client_token" | "token_store";
}

export interface MatterhornBackendTeamAccessResponse {
  success: true;
  version: typeof MATTERHORN_BACKEND_TEAM_ACCESS_VERSION;
  generatedAt: string;
  workspace: {
    id: string;
    name: string;
    type: "local" | "remote";
  };
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
