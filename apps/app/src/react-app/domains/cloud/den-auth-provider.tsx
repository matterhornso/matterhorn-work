/** @jsxImportSource react */
import {
  createContext,
  useCallback,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  clearDenSession,
  createDenClient,
  DenApiError,
  ensureDenActiveOrganization,
  readDenSettings,
  writeDenSettings,
  type DenUser,
} from "../../../app/lib/den";
import {
  denSessionUpdatedEvent,
  dispatchDenSessionUpdated,
} from "../../../app/lib/den-session-events";
import {
  deepLinkBridgeEvent,
  takePendingDeepLinks,
  type DeepLinkBridgeDetail,
} from "../../../app/lib/deep-link-bridge";
import { parseDenAuthDeepLink } from "../../../app/lib/matterhorn-links";
import { isPublicBetaWebDeployment } from "../../../app/lib/matterhorn-deployment";

export type DenAuthStatus = "checking" | "signed_in" | "signed_out";

export type DenAuthStore = {
  status: DenAuthStatus;
  user: DenUser | null;
  error: string | null;
  isSignedIn: boolean;
  refresh: () => Promise<void>;
};

const DenAuthContext = createContext<DenAuthStore | undefined>(undefined);

type DenAuthProviderProps = {
  children: ReactNode;
};

function userFacingCloudSessionError(error: unknown): string | null {
  // An expired or missing browser session is an ordinary signed-out state, not
  // an error the user needs to diagnose. Other failures stay deliberately
  // generic so browser/network internals are never surfaced in the product.
  if (error instanceof DenApiError && error.status === 401) return null;
  return "Matterhorn Cloud could not be reached. Check your connection and try again.";
}

/**
 * React port of the Solid `DenAuthProvider` (`apps/app/src/app/cloud/den-auth-provider.tsx`
 * on dev). Drives the Den auth status signal the forced-signin gate and
 * desktop-config reader rely on, and syncs Better-Auth's active organization
 * on every refresh so subsequent requests resolve against the right org.
 */
export function DenAuthProvider({ children }: DenAuthProviderProps) {
  const [status, setStatus] = useState<DenAuthStatus>("checking");
  const [user, setUser] = useState<DenUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Monotonic token so stale async refreshes can't clobber a newer result.
  const refreshTokenRef = useRef(0);
  const handledGrantsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const currentRun = ++refreshTokenRef.current;
    const settings = readDenSettings();
    const token = settings.authToken?.trim() ?? "";
    const publicBetaWeb = isPublicBetaWebDeployment();

    if (!token && !publicBetaWeb) {
      setUser(null);
      setError(null);
      setStatus("signed_out");
      return;
    }

    setStatus("checking");

    try {
      const nextUser = await createDenClient({
        baseUrl: settings.baseUrl,
        apiBaseUrl: settings.apiBaseUrl,
        token: token || undefined,
      }).getSession();

      if (currentRun !== refreshTokenRef.current) return;

      await ensureDenActiveOrganization({
        forceServerSync:
          !settings.activeOrgId?.trim() || !settings.activeOrgSlug?.trim(),
      }).catch(() => null);

      if (currentRun !== refreshTokenRef.current) return;

      setUser(nextUser);
      setError(null);
      setStatus("signed_in");
    } catch (nextError) {
      if (currentRun !== refreshTokenRef.current) return;

      if (nextError instanceof DenApiError && nextError.status === 401) {
        clearDenSession();
      }

      setUser(null);
      setError(userFacingCloudSessionError(nextError));
      setStatus("signed_out");
    }
  }, []);

  useEffect(() => {
    void refresh();

    if (typeof window === "undefined") return;

    const handleSessionUpdated = () => {
      void refresh();
    };

    window.addEventListener(denSessionUpdatedEvent, handleSessionUpdated);
    return () => {
      window.removeEventListener(denSessionUpdatedEvent, handleSessionUpdated);
    };
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isPublicBetaWebDeployment()) return;

    const handleUrls = (urls: readonly string[]) => {
      for (const rawUrl of urls) {
        const parsed = parseDenAuthDeepLink(rawUrl);
        if (!parsed || handledGrantsRef.current.has(parsed.grant)) continue;
        handledGrantsRef.current.add(parsed.grant);

        void createDenClient({ baseUrl: parsed.denBaseUrl })
          .exchangeDesktopHandoff(parsed.grant)
          .then((result) => {
            if (!result.token) {
              throw new Error("Failed to sign in to Matterhorn Cloud.");
            }

            writeDenSettings({
              baseUrl: parsed.denBaseUrl,
              authToken: result.token,
              activeOrgId: null,
              activeOrgSlug: null,
              activeOrgName: null,
            });

            dispatchDenSessionUpdated({
              status: "success",
              baseUrl: parsed.denBaseUrl,
              token: result.token,
              user: result.user,
              email: result.user?.email ?? null,
            });
          })
          .catch((error) => {
            handledGrantsRef.current.delete(parsed.grant);
            dispatchDenSessionUpdated({
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to sign in to Matterhorn Cloud.",
            });
          });
      }
    };

    const takeAuthLinks = () =>
      takePendingDeepLinks(window, (url) => Boolean(parseDenAuthDeepLink(url)));

    handleUrls(takeAuthLinks());
    const handleDeepLink = (event: Event) => {
      const eventUrls = ((event as CustomEvent<DeepLinkBridgeDetail>).detail?.urls ?? []) as string[];
      handleUrls([...new Set([...takeAuthLinks(), ...eventUrls])]);
    };

    window.addEventListener(deepLinkBridgeEvent, handleDeepLink);
    return () => window.removeEventListener(deepLinkBridgeEvent, handleDeepLink);
  }, []);

  const value = useMemo<DenAuthStore>(
    () => ({
      status,
      user,
      error,
      isSignedIn: status === "signed_in",
      refresh,
    }),
    [error, refresh, status, user],
  );

  return (
    <DenAuthContext.Provider value={value}>{children}</DenAuthContext.Provider>
  );
}

export function useDenAuth(): DenAuthStore {
  const context = use(DenAuthContext);
  if (!context) {
    throw new Error("useDenAuth must be used within a DenAuthProvider");
  }
  return context;
}
