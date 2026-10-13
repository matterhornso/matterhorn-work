/** @jsxImportSource react */
import React from "react";
import { createRoot } from "react-dom/client";
import { createMatterhornServerClient } from "../../src/app/lib/matterhorn-server";
import { StmEnvironmentGate } from "../../src/react-app/domains/settings/pages/stm-settings";
import "../../src/app/index.css";

const client = createMatterhornServerClient({ baseUrl: location.origin, hostToken: "disposable-ui-fixture" });
if (new URLSearchParams(location.search).has("dark")) document.documentElement.classList.add("dark");
createRoot(document.getElementById("root")!).render(<main className="p-6 mx-auto max-w-3xl bg-background text-foreground min-h-screen">
  <h1 className="text-lg font-medium mb-6">Environment · isolated test fixture</h1>
  <StmEnvironmentGate client={client} isRemoteWorkspace={false} workspaceId="fixture-workspace" runtimeKey="fixture" legacy={<p>Legacy environment fixture</p>} />
</main>);
