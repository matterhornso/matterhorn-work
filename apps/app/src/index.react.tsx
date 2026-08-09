/** @jsxImportSource react */
import * as React from "react";
import ReactDOM from "react-dom/client";

import {
  getMatterhornDeployment,
  isPublicBetaWebDeployment,
} from "./app/lib/matterhorn-deployment";
import {
  denSessionUpdatedEvent,
  type DenSessionUpdatedDetail,
} from "./app/lib/den-session-events";
import { readPublicCloudConfig } from "./app/lib/public-cloud-config";
import { bootstrapTheme } from "./app/theme";
import { initLocale } from "./i18n";
import {
  isPublicTrustPath,
  shouldGatePublicWebEntry,
} from "./react-app/domains/public/public-trust-content";
import "./app/bootstrap.css";

bootstrapTheme();
initLocale();
const publicBetaWeb = isPublicBetaWebDeployment();
const publicCloudConfig = readPublicCloudConfig();
const publicTrustEntry = isPublicTrustPath(window.location.pathname);
const bootstrapConfig = publicTrustEntry
  ? null
  : await import("./app/lib/den").then((denModule) => (
      publicBetaWeb
        ? denModule.setDenBootstrapConfig(publicCloudConfig)
        : denModule.initializeDenBootstrapConfig()
    ));

const AuthenticatedApp = React.lazy(
  () => import("./react-app/shell/authenticated-app"),
);
const PublicSigninBootstrap = React.lazy(
  () => import("./react-app/shell/public-signin-bootstrap"),
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

root.dataset.matterhornDeployment = getMatterhornDeployment();

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
      <React.Suspense fallback={<AppLoadingFallback />}>
        <PublicSigninBootstrap
          config={publicCloudConfig}
          onSignedIn={markPublicSessionVerified}
        />
      </React.Suspense>
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
