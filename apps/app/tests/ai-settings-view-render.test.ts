import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AiSettingsView } from "../src/react-app/domains/settings/pages/ai-view";

function renderReadySettings(overrides: Record<string, unknown> = {}) {
  const queryClient = new QueryClient();
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(AiSettingsView, {
        busy: false,
        providerAuthBusy: false,
        defaultModelLabel: "ASI1 Mini",
        defaultModelRef: "cudos/asi1-mini",
        defaultModelProviderId: "cudos",
        defaultModelId: "asi1-mini",
        connectedModelCount: 7,
        providerStatusLabel: "Connected",
        providerStatusStyle: "ready",
        providerSummary: "Seven models available",
        connectedProviders: [{ id: "cudos", name: "ASI:Cloud", modelCount: 7 }],
        disconnectingProviderId: null,
        providerConnectError: null,
        providerDisconnectStatus: null,
        providerDisconnectError: null,
        cudosConnected: true,
        providerCredentialsManaged: true,
        onOpenModelPicker: () => undefined,
        onOpenProviderAuth: () => undefined,
        onDisconnectProvider: () => undefined,
        canDisconnectProvider: () => false,
        ...overrides,
      }),
    ),
  );
}

describe("AI settings rendered hierarchy", () => {
  test("leads with one model choice and hides expert settings by default", () => {
    const html = renderReadySettings();

    expect(html).toContain("Choose a model");
    expect(html).toContain(
      "Pick the AI that answers your chats. You can change it any time.",
    );
    expect(html).toContain("Choose model");
    expect(html).toContain("More model settings");
    expect(html).toContain("Provider connection");
    expect(html).toContain("How provider data is handled");
    expect(html).not.toContain("Default model");
    expect(html).not.toContain("New chats</div>");
    expect(html).not.toContain("Connected model catalog");
    expect(html).not.toContain("Browse models");
  });


  test("never offers hosted users a provider action the web runtime forbids", () => {
    const html = renderReadySettings({
      connectedModelCount: 0,
      defaultModelLabel: "Connect provider",
      defaultModelRef: "",
      connectedProviders: [],
      pendingDeskTask: { deskId: "bittensor", title: "Explore subnets" },
    });
    const handoff = html.slice(
      html.indexOf('data-testid="pending-desk-task-handoff"'),
      html.indexOf("Selected model"),
    );

    expect(handoff).toContain("AI is not available in this workspace yet.");
    expect(handoff).toContain("Return to desk");
    expect(html).not.toContain("Connect AI");
    expect(html).not.toContain("Choose model");
    expect(html).toContain("No models are currently available in this workspace.");
  });

  test("lets hosted users choose a model when the managed catalog is ready", () => {
    const html = renderReadySettings({
      pendingDeskTask: { deskId: "bittensor", title: "Explore subnets" },
    });

    expect(html).toContain("Choose model");
    expect(html).toContain("Return to desk");
    expect(html).not.toContain("Connect AI");
  });
});
