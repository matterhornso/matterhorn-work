/** @jsxImportSource react */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MatterhornBackendCapabilitiesResponse } from "@matterhorn-work/types/backend-capabilities";
import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
import {
  backendCapabilitiesFixtures,
  type BackendCapabilitiesFixtureKey,
} from "./backend-capability-fixtures";

export type BackendCapabilitiesSource = "mock" | "fetch";

type BackendCapabilityClient = Pick<MatterhornServerClient, "backendCapabilities">;

export interface UseBackendCapabilitiesOptions {
  source?: BackendCapabilitiesSource;
  fixture?: BackendCapabilitiesFixtureKey;
  client?: BackendCapabilityClient | null;
  enabled?: boolean;
}

export interface UseBackendCapabilitiesResult {
  data: MatterhornBackendCapabilitiesResponse | null;
  error: Error | null;
  isLoading: boolean;
}

export function getBackendCapabilitiesResult(
  options: UseBackendCapabilitiesOptions = {},
): UseBackendCapabilitiesResult {
  const { source = "mock", fixture = "working" } = options;

  if (source === "fetch") {
    return {
      data: null,
      error: options.client ? null : new Error("Matterhorn Work engine client is required to fetch backend capabilities."),
      isLoading: false,
    };
  }

  return {
    data: backendCapabilitiesFixtures[fixture],
    error: null,
    isLoading: false,
  };
}

export function useBackendCapabilities(
  options: UseBackendCapabilitiesOptions = {},
): UseBackendCapabilitiesResult {
  const { source = "mock", fixture = "working", client = null, enabled = true } = options;

  const fetchQuery = useQuery({
    queryKey: ["backend-capabilities", client ? "matterhorn-server" : "missing-client"],
    enabled: source === "fetch" && enabled && Boolean(client),
    queryFn: async () => {
      if (!client) throw new Error("Matterhorn Work engine client is required to fetch backend capabilities.");
      return client.backendCapabilities();
    },
    staleTime: 30_000,
  });

  const mockResult = useMemo<UseBackendCapabilitiesResult>(
    () => getBackendCapabilitiesResult({ source: "mock", fixture }),
    [fixture],
  );

  if (source !== "fetch") return mockResult;
  if (!client) return getBackendCapabilitiesResult({ source: "fetch", client });

  return {
    data: fetchQuery.data ?? null,
    error: fetchQuery.error instanceof Error ? fetchQuery.error : null,
    isLoading: fetchQuery.isLoading,
  };
}
