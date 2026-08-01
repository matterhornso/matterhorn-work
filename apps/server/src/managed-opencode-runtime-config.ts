import { openworkExtensionsPreviewPluginPath } from "./openwork-extensions-plugin-path.js";
import { buildManagedCudosProviderConfig, CUDOS_PROVIDER_ID } from "./cudos-provider.js";

const BUILTIN_MCP_NAME = "matterhorn-work";

export function buildManagedOpencodeRuntimeConfig(input: {
  serverUrl: string;
  clientToken: string;
  enableCudosProvider?: boolean;
}): string {
  const serverUrl = input.serverUrl.trim().replace(/\/+$/, "");
  const clientToken = input.clientToken.trim();
  if (!serverUrl || !clientToken) {
    throw new Error("Managed OpenCode requires a Matterhorn server URL and client token");
  }

  return JSON.stringify({
    plugin: [
      "opencode-chrome-devtools",
      openworkExtensionsPreviewPluginPath(),
    ],
    ...(input.enableCudosProvider
      ? {
          provider: {
            [CUDOS_PROVIDER_ID]: buildManagedCudosProviderConfig(),
          },
        }
      : {}),
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
