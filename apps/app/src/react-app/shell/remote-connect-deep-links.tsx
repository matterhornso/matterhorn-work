/** @jsxImportSource react */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import {
  resolveWorkspaceListSelectedId,
  workspaceCreateRemote,
  workspaceSetRuntimeActive,
  workspaceSetSelected,
} from "../../app/lib/desktop";
import type { WorkspaceList } from "../../app/lib/desktop-types";
import {
  deepLinkBridgeEvent,
  takePendingDeepLinks,
  type DeepLinkBridgeDetail,
} from "../../app/lib/deep-link-bridge";
import {
  parseRemoteConnectDeepLink,
  stripRemoteConnectQuery,
} from "../../app/lib/matterhorn-links";
import { isPublicBetaWebDeployment } from "../../app/lib/matterhorn-deployment";
import { useStatusToasts } from "../domains/shell-feedback/status-toasts";
import { useLocal } from "../kernel/local-provider";
import { writeActiveWorkspaceId } from "./session-memory";
import { workspaceSessionRoute } from "./workspace-routes";

export function RemoteConnectDeepLinkHandler() {
  const navigate = useNavigate();
  const local = useLocal();
  const { showToast } = useStatusToasts();
  const handledUrlsRef = useRef(new Set<string>());

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isPublicBetaWebDeployment()) {
      // A public browser session is authenticated by Matterhorn Cloud. Never
      // accept a worker URL or bearer token from a link, and remove one from
      // the address bar before it can be copied or retained in browser history.
      const sanitized = stripRemoteConnectQuery(window.location.href);
      if (sanitized) {
        window.history.replaceState(window.history.state, document.title, sanitized);
      }
      return;
    }

    const takeRemoteLinks = () =>
      takePendingDeepLinks(window, (url) => Boolean(parseRemoteConnectDeepLink(url)));

    const handleUrls = async (urls: readonly string[]) => {
      for (const rawUrl of [...new Set(urls)]) {
        const parsed = parseRemoteConnectDeepLink(rawUrl);
        if (!parsed || handledUrlsRef.current.has(rawUrl)) continue;
        handledUrlsRef.current.add(rawUrl);

        try {
          const list = await workspaceCreateRemote({
            baseUrl: parsed.matterhornHostUrl,
            matterhornHostUrl: parsed.matterhornHostUrl,
            matterhornToken: parsed.matterhornToken,
            displayName: parsed.displayName,
            directory: parsed.directory,
            remoteType: "matterhorn",
          }) as WorkspaceList;
          const workspaceId =
            resolveWorkspaceListSelectedId(list) ||
            list.workspaces[list.workspaces.length - 1]?.id ||
            "";
          if (!workspaceId) throw new Error("Workspace connection returned no workspace.");

          await workspaceSetSelected(workspaceId).catch(() => undefined);
          await workspaceSetRuntimeActive(workspaceId).catch(() => undefined);
          writeActiveWorkspaceId(workspaceId);
          local.setPrefs((previous) => ({
            ...previous,
            hasCompletedOnboarding: true,
          }));
          navigate(workspaceSessionRoute(workspaceId), { replace: true });
        } catch {
          handledUrlsRef.current.delete(rawUrl);
          showToast({
            title: "Could not connect workspace",
            description: "Open Matterhorn and try the connection link again.",
            tone: "error",
          });
        }
      }
    };

    void handleUrls(takeRemoteLinks());
    const handleDeepLink = (event: Event) => {
      const eventUrls = ((event as CustomEvent<DeepLinkBridgeDetail>).detail?.urls ?? []) as string[];
      void handleUrls([...takeRemoteLinks(), ...eventUrls]);
    };

    window.addEventListener(deepLinkBridgeEvent, handleDeepLink);
    return () => window.removeEventListener(deepLinkBridgeEvent, handleDeepLink);
  }, [local, navigate, showToast]);

  return null;
}
