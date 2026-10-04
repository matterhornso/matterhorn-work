/** @jsxImportSource react */
// Production shell and providers, with synthetic same-origin HTTP services.
import { createRoot } from "react-dom/client";
import AuthenticatedApp from "../../src/react-app/shell/authenticated-app";
import { writeDenSettings } from "../../src/app/lib/den";
import { applyRetroUi } from "../../src/app/lib/retro-ui";
import { bootstrapTheme } from "../../src/app/theme";

writeDenSettings(
  { baseUrl: location.origin, apiBaseUrl: location.origin },
  { persistBootstrap: false },
);
applyRetroUi(document.documentElement, true);
bootstrapTheme();
const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<AuthenticatedApp />);
