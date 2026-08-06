import { describe, expect, it } from "bun:test";

import { resolveForcedWebConnectionFromEnv } from "../src/react-app/shell/matterhorn-connection";

describe("forced local web connection", () => {
  const env = {
    VITE_MATTERHORN_WORK_FORCE_SETTINGS: "1",
    VITE_MATTERHORN_WORK_URL: "http://127.0.0.1:4106/",
    VITE_MATTERHORN_WORK_TOKEN: "client-token",
    VITE_MATTERHORN_WORK_HOST_TOKEN: "host-token",
  };

  it("uses the authoritative development connection without browser storage", () => {
    expect(
      resolveForcedWebConnectionFromEnv(env, { desktop: false, publicBetaWeb: false }),
    ).toEqual({
      normalizedBaseUrl: "http://127.0.0.1:4106",
      resolvedToken: "client-token",
      resolvedHostToken: "host-token",
      hostInfo: null,
      source: "environment",
    });
  });

  it("uses the same-origin development proxy when a browser origin is available", () => {
    expect(
      resolveForcedWebConnectionFromEnv(env, {
        desktop: false,
        publicBetaWeb: false,
        browserOrigin: "http://127.0.0.1:5182/",
      }),
    ).toEqual({
      normalizedBaseUrl: "http://127.0.0.1:5182",
      resolvedToken: "client-token",
      resolvedHostToken: "host-token",
      hostInfo: null,
      source: "environment",
    });
  });

  it("does not expose local development credentials to public web", () => {
    expect(
      resolveForcedWebConnectionFromEnv(env, { desktop: false, publicBetaWeb: true }),
    ).toBeNull();
  });

  it("keeps the desktop runtime authoritative", () => {
    expect(
      resolveForcedWebConnectionFromEnv(env, { desktop: true, publicBetaWeb: false }),
    ).toBeNull();
  });

  it("ignores incomplete or non-authoritative environment settings", () => {
    expect(
      resolveForcedWebConnectionFromEnv(
        { ...env, VITE_MATTERHORN_WORK_FORCE_SETTINGS: "0" },
        { desktop: false, publicBetaWeb: false },
      ),
    ).toBeNull();
    expect(
      resolveForcedWebConnectionFromEnv(
        { ...env, VITE_MATTERHORN_WORK_TOKEN: "" },
        { desktop: false, publicBetaWeb: false },
      ),
    ).toBeNull();
  });
});
