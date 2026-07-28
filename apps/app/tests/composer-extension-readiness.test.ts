import { describe, expect, test } from "bun:test";

import { OPENWORK_EXTENSION_CATALOG } from "../src/app/constants";
import { getComposerExtensionReadiness } from "../src/react-app/domains/session/surface/composer/extension-readiness";

function extension(id: string) {
  const entry = OPENWORK_EXTENSION_CATALOG.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Missing extension fixture: ${id}`);
  return entry;
}

describe("composer extension readiness", () => {
  test("keeps trusted protocol prompt shortcuts available on the web", () => {
    for (const id of ["bittensor", "hyperliquid", "polymarket"]) {
      expect(getComposerExtensionReadiness(extension(id), {
        enabled: true,
        desktopRuntime: false,
      })).toEqual({
        visible: true,
        ready: true,
        setupMessage: null,
      });
    }
  });

  test("hides desktop browser automation from the web composer", () => {
    expect(getComposerExtensionReadiness(extension("matterhorn-browser"), {
      enabled: true,
      desktopRuntime: false,
      loadedPlugins: ["opencode-chrome-devtools"],
    }).visible).toBe(false);
  });

  test("requires the browser plugin in desktop builds", () => {
    expect(getComposerExtensionReadiness(extension("matterhorn-browser"), {
      enabled: true,
      desktopRuntime: true,
    })).toMatchObject({
      visible: true,
      ready: false,
      setupMessage: "Finish extension setup in Settings.",
    });
    expect(getComposerExtensionReadiness(extension("matterhorn-browser"), {
      enabled: true,
      desktopRuntime: true,
      loadedPlugins: ["opencode-chrome-devtools"],
    }).ready).toBe(true);
  });

  test("hides generated media extensions in the stable launch policy", () => {
    expect(getComposerExtensionReadiness(extension("openai-image-gen"), {
      enabled: true,
      desktopRuntime: false,
      configuredEnvKeys: ["OPENAI_API_KEY"],
      loadedPlugins: ["openwork-image-generation"],
    }).visible).toBe(false);
  });

  test("routes Ollama users to setup until its provider is connected", () => {
    expect(getComposerExtensionReadiness(extension("ollama"), {
      enabled: true,
      desktopRuntime: false,
    })).toEqual({
      visible: true,
      ready: false,
      setupMessage: "Connect Ollama in Settings.",
    });
    expect(getComposerExtensionReadiness(extension("ollama"), {
      enabled: true,
      desktopRuntime: false,
      connectedProviderIds: ["ollama"],
    }).ready).toBe(true);
  });

  test("does not surface disabled extensions", () => {
    expect(getComposerExtensionReadiness(extension("ollama"), {
      enabled: false,
      desktopRuntime: false,
      connectedProviderIds: ["ollama"],
    }).visible).toBe(false);
  });
});
