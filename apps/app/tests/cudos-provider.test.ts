import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildCudosProviderConfig,
  CUDOS_INFERENCE_BASE_URL,
  CUDOS_MODELS,
  CUDOS_PROVIDER_ID,
} from "../src/app/lib/cudos-provider";

describe("CUDOS provider preset", () => {
  test("uses the official OpenAI-compatible endpoint and documented model IDs", () => {
    const config = buildCudosProviderConfig();

    expect(CUDOS_PROVIDER_ID).toBe("cudos");
    expect(config.env).toEqual(["CUDOS_API_KEY"]);
    expect(config.npm).toBe("@ai-sdk/openai-compatible");
    expect(config.options.baseURL).toBe(CUDOS_INFERENCE_BASE_URL);
    expect(Object.keys(config.models)).toEqual(CUDOS_MODELS.map((model) => model.id));
    expect(Object.keys(config.models)).toHaveLength(7);
  });

  test("never puts credentials in provider metadata", () => {
    const serialized = JSON.stringify(buildCudosProviderConfig());

    expect(serialized).not.toMatch(/apiKey|authorization|bearer|secret|credential/i);
  });

  test("opens the dedicated masked API-key flow even before the provider list refreshes", () => {
    const storeSource = readFileSync(
      resolve(import.meta.dir, "../src/react-app/domains/connections/provider-auth/store.ts"),
      "utf8",
    );
    const modalSource = readFileSync(
      resolve(import.meta.dir, "../src/react-app/domains/connections/provider-auth/provider-auth-modal.tsx"),
      "utf8",
    );

    expect(storeSource).toContain('preferredProviderId?.toLowerCase() === "cudos"');
    expect(storeSource).toContain('{ type: "api", label: t("providers.api_key_label") }');
    expect(modalSource).toContain('cudos: "CUDOS / ASI:Cloud"');
    expect(modalSource).toContain('setView("api")');
    expect(modalSource).not.toContain("void handleMethodSelect(entry.methods[0])");
  });

  test("installs only after credential save and removes the route on disconnect", () => {
    const storeSource = readFileSync(
      resolve(import.meta.dir, "../src/react-app/domains/connections/provider-auth/store.ts"),
      "utf8",
    );
    const settingsSource = readFileSync(
      resolve(import.meta.dir, "../src/react-app/shell/settings-route.tsx"),
      "utf8",
    );

    expect(storeSource).toContain("formatConfigWithCudosProvider");
    expect(storeSource).toContain("formatConfigWithoutCudosProvider");
    expect(storeSource.indexOf("await c.auth.set")).toBeLessThan(
      storeSource.indexOf("formatConfigWithCudosProvider,"),
    );
    expect(settingsSource).toContain(
      "will be enabled after its API key is saved",
    );
    expect(settingsSource).not.toContain(
      "[CUDOS_PROVIDER_ID]: buildCudosProviderConfig()",
    );
  });
});
