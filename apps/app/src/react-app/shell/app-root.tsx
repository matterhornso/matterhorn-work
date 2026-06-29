/** @jsxImportSource react */

import { Suspense, lazy, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { readDenBootstrapConfig, readDenSettings } from "../../app/lib/den";
import { denSettingsChangedEvent, denSessionUpdatedEvent } from "../../app/lib/den-session-events";
import { useDenAuth } from "../domains/cloud/den-auth-provider";
import { ForcedSigninPage } from "../domains/cloud/forced-signin-page";
import { OrgOnboardingPage } from "../domains/cloud/org-onboarding-page";
import { NewProvidersToast } from "./new-providers-toast";
import { useDesktopFontZoomBehavior } from "./font-zoom";
import { LoadingOverlay } from "./loading-overlay";
import { DevProfiler, DevProfilerOverlay } from "./dev-profiler";
import { ReactRenderWatchdogOverlay } from "./react-render-watchdog-overlay";
import { AppMenuProvider } from "./app-menu";
import { MatterhornControlProvider, MatterhornRouteControlActions } from "./control/control-provider";
import { ShellConfigProvider } from "./shell-config";

const OrgOnboardingPageRoute = lazy(() => import("../domains/cloud/org-onboarding-page").then((module) => ({
  default: module.OrgOnboardingPage,
})));
const SessionRoute = lazy(() => import("./session-route").then((module) => ({ default: module.SessionRoute })));
const SettingsRoute = lazy(() => import("./settings-route").then((module) => ({ default: module.SettingsRoute })));
const WelcomeRoute = lazy(() => import("./welcome-route").then((module) => ({ default: module.WelcomeRoute })));

type DenSigninGateProps = {
  children: ReactNode;
};

function RouteFallback() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      Loading Matterhorn Work...
    </div>
  );
}

const readRequireSigninSnapshot = () => readDenBootstrapConfig().requireSignin;

const subscribeToRequireSignin = (onStoreChange: () => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(denSettingsChangedEvent, onStoreChange);
  return () => {
    window.removeEventListener(denSettingsChangedEvent, onStoreChange);
  };
};

/**
 * Forced-signin gate ported from the Solid shell.
 *
 * When the desktop bootstrap config has `requireSignin: true` (persisted by
 * the Tauri shell via `desktop-bootstrap.json`), the UI is held at `/signin`
 * until the user authenticates with Den. When sign-in is NOT required, we
 * never let users land on `/signin` — redirect them to `/session` instead.
 *
 * While we're still checking the Den session AND sign-in is required, we
 * render nothing so the transcript/settings never flash behind the gate.
 */
function DenSigninGate({ children }: DenSigninGateProps) {
  const denAuth = useDenAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const requireSignin = useSyncExternalStore(
    subscribeToRequireSignin,
    readRequireSigninSnapshot,
    readRequireSigninSnapshot,
  );

  useEffect(() => {
    // Wait for the first auth check so we don't bounce the user between
    // `/session` and `/signin` every navigation while we figure out if
    // their cached token is still valid.
    if (denAuth.status === "checking") return;

    const path = location.pathname.toLowerCase();
    const onSignin = path === "/signin" || path.startsWith("/signin/");

    const onOnboarding = path === "/onboarding" || path.startsWith("/onboarding/");

    if (requireSignin) {
      if (!denAuth.isSignedIn && !onSignin) {
        navigate("/signin", { replace: true });
      } else if (denAuth.isSignedIn && onSignin) {
        // Signed in — route to onboarding so the user sees their org resources.
        navigate("/onboarding", { replace: true });
      }
    } else if (onSignin) {
      navigate("/session", { replace: true });
    }

    // If on /onboarding but not signed in, bounce to signin or session
    if (onOnboarding && !denAuth.isSignedIn) {
      navigate(requireSignin ? "/signin" : "/session", { replace: true });
    }
  }, [
    denAuth.isSignedIn,
    denAuth.status,
    location,
    navigate,
    requireSignin,
  ]);

  // After a fresh sign-in, navigate to the onboarding page so the
  // user sees what their org provides.
  // Poll for activeOrgId (set asynchronously by refreshOrgs) rather
  // than using a fixed delay — handles both fast and slow org lookups.
  useEffect(() => {
    const handler = (event: WindowEventMap[typeof denSessionUpdatedEvent]) => {
      if (event.detail?.status !== "success") return;
      let attempts = 0;
      const check = () => {
        attempts++;
        const settings = readDenSettings();
        if (settings.authToken?.trim() && settings.activeOrgId?.trim()) {
          navigate("/onboarding", { replace: true });
        } else if (attempts < 10) {
          // Org not selected yet — retry (max ~5 seconds)
          setTimeout(check, 500);
        }
      };
      // First check after a short delay for the auth to settle
      setTimeout(check, 500);
    };
    window.addEventListener(denSessionUpdatedEvent, handler);
    return () => window.removeEventListener(denSessionUpdatedEvent, handler);
  }, [navigate]);

  if (requireSignin && denAuth.status === "checking") {
    return <ForcedSigninPage developerMode={false} />;
  }

  return <>{children}</>;
}

export function AppRoot() {
  useDesktopFontZoomBehavior();

  return (
    <>
      <DevProfiler id="AppRoot">
        <ShellConfigProvider>
        <AppMenuProvider>
        <MatterhornControlProvider>
          <MatterhornRouteControlActions />
          <DenSigninGate>
            <Routes>
              <Route
                path="/signin"
                element={
                  <DevProfiler id="SigninRoute">
                    <ForcedSigninPage developerMode={false} />
                  </DevProfiler>
                }
              />
              <Route
                path="/onboarding"
                element={
                  <DevProfiler id="OrgOnboarding">
                    <Suspense fallback={<RouteFallback />}>
                      <OrgOnboardingPageRoute />
                    </Suspense>
                  </DevProfiler>
                }
              />
              <Route
                path="/welcome"
                element={
                  <DevProfiler id="WelcomeRoute">
                    <Suspense fallback={<RouteFallback />}>
                      <WelcomeRoute />
                    </Suspense>
                  </DevProfiler>
                }
              />
              <Route
                path="/session"
                element={
                  <DevProfiler id="SessionRoute">
                    <Suspense fallback={<RouteFallback />}>
                      <SessionRoute />
                    </Suspense>
                  </DevProfiler>
                }
              />
              <Route
                path="/session/:sessionId"
                element={
                  <DevProfiler id="SessionRoute">
                    <Suspense fallback={<RouteFallback />}>
                      <SessionRoute />
                    </Suspense>
                  </DevProfiler>
                }
              />
              <Route
                path="/workspace/:workspaceId/session"
                element={
                  <DevProfiler id="SessionRoute">
                    <Suspense fallback={<RouteFallback />}>
                      <SessionRoute />
                    </Suspense>
                  </DevProfiler>
                }
              />
              <Route
                path="/workspace/:workspaceId/session/:sessionId"
                element={
                  <DevProfiler id="SessionRoute">
                    <Suspense fallback={<RouteFallback />}>
                      <SessionRoute />
                    </Suspense>
                  </DevProfiler>
                }
              />
              <Route
                path="/workspace/:workspaceId/settings/*"
                element={
                  <DevProfiler id="SettingsRoute">
                    <Suspense fallback={<RouteFallback />}>
                      <SettingsRoute />
                    </Suspense>
                  </DevProfiler>
                }
              />
              <Route
                path="/settings/*"
                element={
                  <DevProfiler id="SettingsRoute">
                    <Suspense fallback={<RouteFallback />}>
                      <SettingsRoute />
                    </Suspense>
                  </DevProfiler>
                }
              />
              {/* Default + fallback: land on the session view. Users open
                  settings deliberately via the sidebar or command palette. */}
              <Route path="/" element={<Navigate to="/session" replace />} />
              <Route path="*" element={<Navigate to="/session" replace />} />
            </Routes>
          </DenSigninGate>
        </MatterhornControlProvider>
        </AppMenuProvider>
        </ShellConfigProvider>
        <LoadingOverlay />
      </DevProfiler>
      {/*
        DevProfilerOverlay sits OUTSIDE the AppRoot <Profiler> zone on
        purpose. The overlay re-renders on every emit() to refresh its
        table, and any commit inside a <Profiler> is recorded as a
        commit on that zone. Mounting the overlay inside AppRoot would
        inflate AppRoot's commit count by hundreds of overlay
        self-renders for every real user-visible commit, masking the
        true app-level signal.
      */}
      <NewProvidersToast />
      <DevProfilerOverlay />
      <ReactRenderWatchdogOverlay />
    </>
  );
}
