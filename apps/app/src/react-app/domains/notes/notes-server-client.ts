import { useMemo } from "react";

import {
  createMatterhornServerClient,
  DEFAULT_OPENWORK_SERVER_PORT,
  normalizeMatterhornServerUrl,
  readMatterhornServerSettings,
  type MatterhornServerClient,
} from "../../../app/lib/matterhorn-server";

export function createFallbackNotesClient(): MatterhornServerClient | null {
  const settings = readMatterhornServerSettings();
  const baseUrl =
    settings.urlOverride ??
    normalizeMatterhornServerUrl(`127.0.0.1:${settings.portOverride ?? DEFAULT_OPENWORK_SERVER_PORT}`);
  if (!baseUrl) return null;
  return createMatterhornServerClient({
    baseUrl,
    token: settings.token,
    hostToken: settings.hostToken,
  });
}

export function useNotesServerClient(
  explicitClient?: MatterhornServerClient | null,
): MatterhornServerClient | null {
  return useMemo(() => explicitClient ?? createFallbackNotesClient(), [explicitClient]);
}
