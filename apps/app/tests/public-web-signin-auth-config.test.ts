import { describe, expect, test } from "bun:test";

import { DenApiError } from "../src/app/lib/public-auth-client";
import { loadPublicAuthConfig } from "../src/react-app/domains/cloud/public-web-signin-page";

const OPEN_CONFIG = {
  signupsAvailable: true,
  signupStatus: "open" as const,
  emailVerificationRequired: true,
  passwordResetAvailable: true,
  legalAcceptanceRequired: true,
  minimumPasswordLength: 12,
  turnstileSiteKey: null,
};

function counted(...outcomes: Array<"ok" | Error>) {
  const calls = { count: 0 };
  const load = () => {
    const outcome = outcomes[Math.min(calls.count, outcomes.length - 1)];
    calls.count += 1;
    return outcome === "ok" ? Promise.resolve(OPEN_CONFIG) : Promise.reject(outcome);
  };
  return { load, calls };
}

const timeout = () => new Error("Request timed out.");
const badGateway = () => new DenApiError(502, "bad_gateway", "Bad gateway.");

describe("loadPublicAuthConfig", () => {
  test("returns the config on first success without retrying", async () => {
    const { load, calls } = counted("ok");
    expect(await loadPublicAuthConfig(load)).toEqual(OPEN_CONFIG);
    expect(calls.count).toBe(1);
  });

  test("recovers a transient edge failure instead of reporting setup_required", async () => {
    const { load, calls } = counted(timeout(), "ok");
    expect(await loadPublicAuthConfig(load)).toEqual(OPEN_CONFIG);
    expect(calls.count).toBe(2);
  });

  test("retries a 502 from the edge", async () => {
    const { load, calls } = counted(badGateway(), badGateway(), "ok");
    expect(await loadPublicAuthConfig(load)).toEqual(OPEN_CONFIG);
    expect(calls.count).toBe(3);
  });

  test("stays fail-closed when every attempt fails", async () => {
    const { load, calls } = counted(timeout());
    const config = await loadPublicAuthConfig(load);
    expect(config.signupsAvailable).toBe(false);
    expect(config.signupStatus).toBe("setup_required");
    expect(config.passwordResetAvailable).toBe(false);
    expect(calls.count).toBe(3);
  });

  test("does not retry a 4xx, which is the service answering", async () => {
    const { load, calls } = counted(new DenApiError(404, "not_found", "Not found."));
    expect((await loadPublicAuthConfig(load)).signupStatus).toBe("setup_required");
    expect(calls.count).toBe(1);
  });

  test("stops early and stays fail-closed once the caller aborts", async () => {
    const controller = new AbortController();
    const calls = { count: 0 };
    const load = () => {
      calls.count += 1;
      controller.abort();
      return Promise.reject(timeout());
    };
    const config = await loadPublicAuthConfig(load, controller.signal);
    expect(config.signupStatus).toBe("setup_required");
    expect(calls.count).toBe(1);
  });
});
