/** @jsxImportSource react */
import * as React from "react";
import ReactDOM from "react-dom/client";

import {
  getMatterhornDeployment,
  isPublicBetaWebDeployment,
} from "./app/lib/matterhorn-deployment";
import { readPublicCloudConfig } from "./app/lib/public-cloud-config";
import { bootstrapTheme } from "./app/theme";
import { initLocale } from "./i18n";
import "./app/bootstrap.css";

bootstrapTheme();
initLocale();
const publicBetaWeb = isPublicBetaWebDeployment();
const publicCloudConfig = readPublicCloudConfig();
const bootstrapConfig = publicBetaWeb
  ? publicCloudConfig
  : await import("./app/lib/den").then((module) =>
      module.initializeDenBootstrapConfig(),
    );

const AuthenticatedApp = React.lazy(
  () => import("./react-app/shell/authenticated-app"),
);
const PublicSigninBootstrap = React.lazy(
  () => import("./react-app/shell/public-signin-bootstrap"),
);

const root = document.getElementById("root");

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

function MatterhornEntry() {
  const publicSigninGate =
    publicBetaWeb && bootstrapConfig.requireSignin;
  const [publicSessionVerified, setPublicSessionVerified] =
    React.useState(!publicSigninGate);
  const markPublicSessionVerified = React.useCallback(() => {
    setPublicSessionVerified(true);
  }, []);

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

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <MatterhornEntry />
  </React.StrictMode>,
);
