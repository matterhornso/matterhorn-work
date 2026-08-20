/** @jsxImportSource react */
import * as React from "react";
import ReactDOM from "react-dom/client";

import { readPublicCloudConfig } from "./app/lib/public-cloud-config";
import { bootstrapTheme } from "./app/theme";
import {
  isPublicTrustPath,
  shouldGatePublicWebEntry,
} from "./react-app/domains/public/public-trust-content";
import PublicSigninBootstrap from "./react-app/shell/public-signin-bootstrap";
bootstrapTheme();
const deployment = (
  import.meta.env.VITE_MATTERHORN_DEPLOYMENT
  ?? import.meta.env.VITE_OPENWORK_DEPLOYMENT
  ?? "desktop"
).trim().toLowerCase() === "web" ? "web" : "desktop";
const publicBetaWeb = deployment === "web" && /^(1|true|yes|on)$/i.test(
  import.meta.env.VITE_MATTERHORN_PUBLIC_BETA?.trim() ?? "",
);
const denSessionUpdatedEvent = "matterhorn-den-session-updated";
type DenSessionUpdatedDetail = { status?: "signed_out" | "success" | string };
const publicCloudConfig = readPublicCloudConfig();
const publicTrustEntry = isPublicTrustPath(window.location.pathname);
const bootstrapConfig = publicTrustEntry
  ? null
  : publicBetaWeb
    ? publicCloudConfig
    : await import("./app/lib/den").then((denModule) => denModule.initializeDenBootstrapConfig());

const AuthenticatedApp = React.lazy(
  async () => {
    const [appModule, denModule] = await Promise.all([
      import("./react-app/shell/authenticated-app"),
      import("./app/lib/den"),
    ]);
    if (publicBetaWeb) await denModule.setDenBootstrapConfig(publicCloudConfig);
    return appModule;
  },
);
const PublicTrustBootstrap = React.lazy(
  () => import("./react-app/shell/public-trust-bootstrap"),
);

type MatterhornRootElement = HTMLElement & {
  __matterhornReactRoot?: ReturnType<typeof ReactDOM.createRoot>;
};

const root = document.getElementById("root") as MatterhornRootElement | null;

if (!root) {
  throw new Error("Root element not found");
}

root.dataset.matterhornDeployment = deployment;

function AppLoadingFallback() {
  return (
    <main
      className="matterhorn-entry-fallback"
      role="status"
      aria-live="polite"
    >
      Opening Matterhorn Desks...
    </main>
  );
}

function MatterhornWorkspaceEntry() {
  const publicSigninGate = shouldGatePublicWebEntry({
    publicBetaWeb,
    requireSignin: bootstrapConfig?.requireSignin ?? false,
    pathname: window.location.pathname,
  });
  const [publicSessionVerified, setPublicSessionVerified] =
    React.useState(!publicSigninGate);
  const markPublicSessionVerified = React.useCallback(() => {
    setPublicSessionVerified(true);
  }, []);

  React.useEffect(() => {
    if (!publicSigninGate) return;

    const handleSessionUpdated = (
      event: CustomEvent<DenSessionUpdatedDetail>,
    ) => {
      if (event.detail?.status === "signed_out") {
        setPublicSessionVerified(false);
      } else if (event.detail?.status === "success") {
        setPublicSessionVerified(true);
      }
    };

    window.addEventListener(
      denSessionUpdatedEvent,
      handleSessionUpdated as EventListener,
    );
    return () => {
      window.removeEventListener(
        denSessionUpdatedEvent,
        handleSessionUpdated as EventListener,
      );
    };
  }, [publicSigninGate]);

  if (!publicSessionVerified) {
    return (
      <PublicSigninBootstrap
        config={publicCloudConfig}
        onSignedIn={markPublicSessionVerified}
      />
    );
  }

  return (
    <React.Suspense fallback={<AppLoadingFallback />}>
      <AuthenticatedApp />
    </React.Suspense>
  );
}

function MatterhornEntry() {
  if (publicTrustEntry) {
    return (
      <React.Suspense fallback={<AppLoadingFallback />}>
        <PublicTrustBootstrap />
      </React.Suspense>
    );
  }

  return <MatterhornWorkspaceEntry />;
}

const appRoot = root.__matterhornReactRoot ?? (root.__matterhornReactRoot = ReactDOM.createRoot(root));

appRoot.render(
  <React.StrictMode>
    <MatterhornEntry />
  </React.StrictMode>,
);
