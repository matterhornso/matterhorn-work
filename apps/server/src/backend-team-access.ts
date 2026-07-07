import type { MatterhornCapability } from "@matterhorn-work/types/backend-capabilities";
import type {
  MatterhornBackendTeamAccessResponse,
  MatterhornBackendTeamAccessSummaryResponse,
  MatterhornTeamAccessConnection,
  MatterhornTeamAccessScopeCapabilities,
  MatterhornTeamAccessSharingMode,
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

function buildScopeCapabilities(): MatterhornTeamAccessScopeCapabilities {
  return {
    owner: {
      scope: "owner",
      label: "Owner",
      description: "Can read and write workspace data. Host-protected token management remains available only to the local host process.",
      canReadWorkspace: true,
      canWriteWorkspace: true,
      canManageLocalTokens: true,
      hostProtected: true,
    },
    collaborator: {
      scope: "collaborator",
      label: "Collaborator",
      description: "Can read and write project notes, memory actions, outputs, feedback, and task evidence through this local server.",
      canReadWorkspace: true,
      canWriteWorkspace: true,
      canManageLocalTokens: false,
      hostProtected: false,
    },
    viewer: {
      scope: "viewer",
      label: "Viewer",
      description: "Can inspect workspace state and evidence but cannot write notes, memory, feedback, outputs, or team tokens.",
      canReadWorkspace: true,
      canWriteWorkspace: false,
      canManageLocalTokens: false,
      hostProtected: false,
    },
  };
}

function buildSharingMode(cloudTeams: MatterhornCapability): MatterhornTeamAccessSharingMode {
  return {
    current: "local_tokens",
    label: "Local token sharing",
    description: "Teammates can use the same Matterhorn interface against this reachable local server when you create and share a viewer or collaborator token.",
    sameInterface: true,
    durableCloudTeams: false,
    requiresReachableLocalServer: true,
    cloudTeamsStatus: cloudTeams.status,
    limitations: [
      "Tokens are scoped to this local server and are not durable cloud org membership.",
      "Token details are host-protected and one-time secrets are returned only when created.",
      "Durable teammate invites, roles, and shared cloud workspaces require Matterhorn Cloud setup.",
    ],
  };
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1" || normalized === "[::1]";
}

function formatServerUrl(host: string, port: number): string {
  const trimmed = host.trim() || "127.0.0.1";
  const hostForUrl = trimmed.includes(":") && !trimmed.startsWith("[") ? `[${trimmed}]` : trimmed;
  return `http://${hostForUrl}:${port}`;
}

export function buildBackendTeamAccessConnection(config: ServerConfig): MatterhornTeamAccessConnection {
  const serverUrl = formatServerUrl(config.host, config.port);
  const reachableFromOtherDevices = !isLoopbackHost(config.host);
  return {
    serverUrl,
    host: config.host,
    port: config.port,
    reachableFromOtherDevices,
    connectSurface: "connect_custom_remote",
    authScheme: "bearer_token",
    tokenFieldLabel: "Access token",
    instructions: [
      "Open Matterhorn Work on the teammate device.",
      "Choose Connect custom remote.",
      "Paste this server URL and the one-time local access token.",
    ],
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
  const cloudTeams = capability(
    "needs_setup",
    "Cloud teams",
    "Durable teammate invites, shared cloud workspaces, and org permissions require Matterhorn Cloud setup.",
  );
  const connection = buildBackendTeamAccessConnection(config);

  return {
    success: true,
    version: "matterhorn.backend.team-access.v1",
    generatedAt: new Date().toISOString(),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      type: workspace.workspaceType,
    },
    sharingMode: buildSharingMode(cloudTeams),
    connection,
    scopeCapabilities: buildScopeCapabilities(),
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
    cloudTeams,
    policy: {
      secretsReturned: false,
      hostProtected: true,
      durableCloudTeams: false,
    },
  };
}

export async function buildBackendTeamAccessSummary(
  config: ServerConfig,
  workspace: WorkspaceInfo,
  tokens: TokenService,
): Promise<MatterhornBackendTeamAccessSummaryResponse> {
  const full = await buildBackendTeamAccess(config, workspace, tokens);
  return {
    success: true,
    version: full.version,
    generatedAt: full.generatedAt,
    workspace: full.workspace,
    sharingMode: full.sharingMode,
    connection: full.connection,
    scopeCapabilities: full.scopeCapabilities,
    localAccess: {
      status: full.localAccess.status,
      label: full.localAccess.label,
      description: "Local sharing uses owner, collaborator, and viewer scopes. Token inventory is host-protected.",
      scopes: full.localAccess.scopes,
      tokenCount: full.localAccess.tokenCount,
      byScope: full.localAccess.byScope,
    },
    cloudTeams: full.cloudTeams,
    policy: {
      secretsReturned: false,
      hostProtected: false,
      fullTokenListRequiresHost: true,
      durableCloudTeams: false,
    },
  };
}
