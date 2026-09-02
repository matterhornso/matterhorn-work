import { openworkExtensionsPreviewPluginPath } from "./openwork-extensions-plugin-path.js";
import { buildManagedCudosProviderConfig, CUDOS_PROVIDER_ID } from "./cudos-provider.js";
import { matterhornGuardPluginPath } from "./matterhorn-guard-plugin-path.js";
import {
  buildManagedVeniceProviderConfig,
  VENICE_PROVIDER_ID,
  type VenicePrivateModel,
} from "./venice-provider.js";

const BUILTIN_MCP_NAME = "matterhorn-work";

/**
 * Hosted workspaces run an untrusted model against user-owned project data.
 * Keep the runtime fail-closed even when a prompt does not select one of the
 * generated desk agents. The explicitly exposed Matterhorn MCP is the only
 * unattended action surface; file edits and browser automation still require
 * a human permission reply, while shell, delegation, network fetches, and
 * workspace escapes stay unavailable.
 */
export const MANAGED_OPENCODE_PERMISSION_POLICY = {
  "*": "deny",
  question: "allow",
  read: "allow",
  glob: "allow",
  grep: "allow",
  list: "allow",
  todowrite: "allow",
  skill: "allow",
  edit: "ask",
  doom_loop: "ask",
  "chrome-devtools_*": "ask",
  "matterhorn-work_*": "allow",
  bash: "deny",
  task: "deny",
  webfetch: "deny",
  websearch: "deny",
  external_directory: "deny",
} as const;

export function buildManagedOpencodeRuntimeConfig(input: {
  serverUrl: string;
  clientToken: string;
  enableCudosProvider?: boolean;
  venicePrivateModels?: readonly VenicePrivateModel[];
}): string {
  const serverUrl = input.serverUrl.trim().replace(/\/+$/, "");
  const clientToken = input.clientToken.trim();
  if (!serverUrl || !clientToken) {
    throw new Error("Managed OpenCode requires a Matterhorn server URL and client token");
  }

  const managedProviders = {
    ...(input.enableCudosProvider
      ? { [CUDOS_PROVIDER_ID]: buildManagedCudosProviderConfig() }
      : {}),
    ...(input.venicePrivateModels?.length
      ? {
          [VENICE_PROVIDER_ID]: buildManagedVeniceProviderConfig(
            input.venicePrivateModels,
          ),
        }
      : {}),
  };

  return JSON.stringify({
    permission: MANAGED_OPENCODE_PERMISSION_POLICY,
    // OpenCode defaults auto-compaction on, but old tool outputs are retained
    // unless pruning is explicit. Pruning starts only after protected recent
    // turns and preserves the full output on disk, reducing repeat input
    // tokens without weakening the audit trail.
    compaction: {
      auto: true,
      prune: true,
    },
    plugin: [
      "opencode-chrome-devtools",
      openworkExtensionsPreviewPluginPath(),
      matterhornGuardPluginPath(),
    ],
    ...(Object.keys(managedProviders).length ? { provider: managedProviders } : {}),
    mcp: {
      [BUILTIN_MCP_NAME]: {
        type: "remote",
        url: `${serverUrl}/mcp/opencode`,
        headers: {
          Authorization: `Bearer ${clientToken}`,
        },
        enabled: true,
      },
    },
  });
}
