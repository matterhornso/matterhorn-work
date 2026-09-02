import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  isPrivateModeModel,
  privateModeModelFromProviders,
  standardModeModelFromProviders,
} from "../src/react-app/domains/session/private-model-mode";

describe("private model mode", () => {
  test("selects the first server-approved Venice model only when connected", () => {
    const providers = [
      { id: "cudos", models: { "asi1-mini": {} } },
      {
        id: "venice",
        models: {
          "z-ai-glm-5-3-flash": {},
          "private-tools": {},
        },
      },
    ];

    expect(privateModeModelFromProviders(providers, ["cudos", "venice"])).toEqual({
      providerID: "venice",
      modelID: "z-ai-glm-5-3-flash",
    });
    expect(privateModeModelFromProviders(providers, ["cudos"])).toBeNull();
  });

  test("selects a connected non-private fallback when private mode is turned off", () => {
    const providers = [
      { id: "venice", models: { "private-tools": {} } },
      { id: "cudos", models: { "asi1-mini": {} } },
    ];

    expect(standardModeModelFromProviders(providers, ["venice", "cudos"])).toEqual({
      providerID: "cudos",
      modelID: "asi1-mini",
    });
    expect(standardModeModelFromProviders(providers, ["venice"])).toBeNull();
  });

  test("recognizes Venice selections without treating other providers as private mode", () => {
    expect(isPrivateModeModel({ providerID: "VENICE", modelID: "private-tools" })).toBe(true);
    expect(isPrivateModeModel({ providerID: "cudos", modelID: "asi1-mini" })).toBe(false);
    expect(isPrivateModeModel(null)).toBe(false);
  });

  test("keeps private mode discoverable, accessible, and bound to private workspace mode", () => {
    const composer = readFileSync(
      new URL(
        "../src/react-app/domains/session/surface/composer/composer.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const sessionSurface = readFileSync(
      new URL(
        "../src/react-app/domains/session/surface/session-surface.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(composer).toContain('aria-label="Set up a private model"');
    expect(composer).toContain('aria-label={props.privateModeEnabled ? "Turn off private model" : "Turn on private model"}');
    expect(composer).toContain('role="switch"');
    expect(composer).toContain("aria-checked={Boolean(props.privateModeEnabled)}");
    expect(composer).toContain('<span>{props.privateModeEnabled ? "Private on" : "Private"}</span>');
    expect(composer).toContain("props.onPrivateModeChange?.(true)");
    expect(sessionSurface).toContain('mode: "private_workspace"');
    expect(sessionSurface).toContain("Private mode · Venice does not retain this prompt or response.");
    expect(sessionSurface).toContain("Matterhorn does not train on your chats");
  });
});
