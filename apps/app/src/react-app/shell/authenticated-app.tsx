/** @jsxImportSource react */
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter } from "react-router-dom";

import { TooltipProvider } from "@/components/ui/tooltip";
import "../../app/index.css";
import { isDesktopRuntime } from "../../app/utils";
import { getReactQueryClient } from "../infra/query-client";
import {
  createDefaultPlatform,
  PlatformProvider,
} from "../kernel/platform";
import { AppRoot } from "./app-root";
import { AppProviders } from "./providers";
import { startDeepLinkBridge } from "./startup-deep-links";

const queryClient = getReactQueryClient();
const platform = createDefaultPlatform();
const Router = isDesktopRuntime() ? HashRouter : BrowserRouter;
startDeepLinkBridge();

/**
 * The authenticated workspace shell is intentionally a lazy route boundary.
 * Signed-out public visitors should not download workspace, notes, MCP, or
 * wallet runtime code before they can use any of it.
 */
export default function AuthenticatedApp() {
  return (
    <PlatformProvider value={platform}>
      <Router>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AppProviders>
              <AppRoot />
            </AppProviders>
          </TooltipProvider>
        </QueryClientProvider>
      </Router>
    </PlatformProvider>
  );
}
