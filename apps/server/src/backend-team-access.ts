import type { MatterhornCapability } from "@matterhorn-work/types/backend-capabilities";
import type {
  MatterhornBackendTeamAccessResponse,
  MatterhornTeamAccessTokenDescriptor,
  MatterhornTeamTokenScope,
} from "@matterhorn-work/types/backend-team-access";
import type { TokenService } from "./tokens.js";
import type { ServerConfig, WorkspaceInfo } from "./types.js";

const SCOPES: MatterhornTeamTokenScope[] = ["owner", "collaborator", "viewer"];

function capability(status: MatterhornCapability["status"], label: string, description: string): MatterhornCapability {
  return { status, label, description };
}

function countByScope(tokens: MatterhornTeamAccessTokenDescriptor[]) {
  return {
    owner: tokens.filter((token) => token.scope === "owner").length,
    collaborator: tokens.filter((token) => token.scope === "collaborator").length,
    viewer: tokens.filter((token) => token.scope === "viewer").length,
  };
}

export async function buildBackendTeamAccess(
  config: ServerConfig,
  workspace: WorkspaceInfo,
  tokens: TokenService,
): Promise<MatterhornBackendTeamAccessResponse> {
  const storedTokens: MatterhornTeamAccessTokenDescriptor[] = (await tokens.list()).map((token) => ({
    id: token.id,
    scope: token.scope,
    createdAt: token.createdAt,
    ...(token.label ? { label: token.label } : {}),
    source: "token_store",
  }));
  const builtInToken: MatterhornTeamAccessTokenDescriptor = {
    id: "built-in-client-token",
    scope: "collaborator",
    createdAt: config.startedAt,
    label: "Built-in client token",
    source: "built_in_client_token",
  };
  const allTokens = [builtInToken, ...storedTokens];
  const byScope = countByScope(allTokens);

  return {
    success: true,
    version: "matterhorn.backend.team-access.v1",
    generatedAt: new Date().toISOString(),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      type: workspace.workspaceType,
    },
    localAccess: {
      ...capability(
        "working",
        "Local token access",
        "Local sharing uses owner, collaborator, and viewer bearer-token scopes for this workspace server.",
      ),
      scopes: SCOPES,
      tokenCount: allTokens.length,
      byScope,
      tokens: allTokens,
    },
    cloudTeams: capability(
      "needs_setup",
      "Cloud teams",
      "Durable teammate invites, shared cloud workspaces, and org permissions require Matterhorn Cloud setup.",
    ),
    policy: {
      secretsReturned: false,
      hostProtected: true,
      durableCloudTeams: false,
    },
  };
}
