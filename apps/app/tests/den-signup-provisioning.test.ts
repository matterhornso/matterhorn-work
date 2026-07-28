import { afterEach, describe, expect, test } from "bun:test";

import { createDenClient } from "../src/app/lib/den";
import {
  buildPersonalWorkspaceIdentity,
  resolvePersonalWorkspaceOnboardingStep,
} from "../src/react-app/domains/cloud/personal-workspace";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("self-service account workspace provisioning", () => {
  test("routes new and returning users through the correct workspace step", () => {
    expect(
      resolvePersonalWorkspaceOnboardingStep({
        organizationCount: 0,
        hasActiveOrganization: false,
        hasSelectedOrganization: false,
      }),
    ).toBe("provision");
    expect(
      resolvePersonalWorkspaceOnboardingStep({
        organizationCount: 1,
        hasActiveOrganization: false,
        hasSelectedOrganization: false,
      }),
    ).toBe("auto_select");
    expect(
      resolvePersonalWorkspaceOnboardingStep({
        organizationCount: 3,
        hasActiveOrganization: false,
        hasSelectedOrganization: false,
      }),
    ).toBe("choose");
    expect(
      resolvePersonalWorkspaceOnboardingStep({
        organizationCount: 1,
        hasActiveOrganization: true,
        hasSelectedOrganization: false,
      }),
    ).toBe("resources");
  });

  test("builds a private personal workspace identity without using the email address", () => {
    const workspace = buildPersonalWorkspaceIdentity({
      id: "usr_7VY1-Rc16",
      email: "new.user@example.test",
      name: "Avery Example",
    });

    expect(workspace).toEqual({
      name: "Avery's workspace",
      slug: "workspace-usr-7vy1-rc16",
    });
    expect(workspace.slug).not.toContain("new");
    expect(workspace.slug).not.toContain("example");
  });

  test("creates an organization with cookie credentials and an explicit inactive state", async () => {
    let request: { url: string; init?: RequestInit } | null = null;
    globalThis.fetch = (async (input, init) => {
      request = { url: String(input), init };
      return new Response(
        JSON.stringify({
          organization: {
            id: "org_personal",
            name: "Avery's workspace",
            slug: "workspace-usr-7vy1-rc16",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;

    const client = createDenClient({
      baseUrl: "https://cloud.matterhorn.test",
      token: "desktop-token",
    });
    await expect(
      client.createOrganization({
        name: "Avery's workspace",
        slug: "workspace-usr-7vy1-rc16",
      }),
    ).resolves.toEqual({
      id: "org_personal",
      name: "Avery's workspace",
      slug: "workspace-usr-7vy1-rc16",
      role: "owner",
    });

    expect(request?.url).toBe(
      "https://cloud.matterhorn.test/api/auth/organization/create",
    );
    expect(request?.init?.method).toBe("POST");
    expect(request?.init?.credentials).toBe("include");
    expect(request?.init?.headers).toMatchObject({
      Authorization: "Bearer desktop-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      name: "Avery's workspace",
      slug: "workspace-usr-7vy1-rc16",
      keepCurrentActiveOrganization: false,
    });
  });

  test("rejects malformed organization responses instead of entering the app", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ organization: { name: "Missing id" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    const client = createDenClient({
      baseUrl: "https://cloud.matterhorn.test",
      token: "desktop-token",
    });

    await expect(
      client.createOrganization({
        name: "My workspace",
        slug: "workspace-user",
      }),
    ).rejects.toThrow("Workspace setup returned an invalid organization.");
  });

  test("revokes a returning user's server session before local sign-out", async () => {
    let request: { url: string; init?: RequestInit } | null = null;
    globalThis.fetch = (async (input, init) => {
      request = { url: String(input), init };
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const client = createDenClient({
      baseUrl: "https://cloud.matterhorn.test",
      token: "desktop-token",
    });
    await expect(client.signOut()).resolves.toBeUndefined();

    expect(request?.url).toBe(
      "https://cloud.matterhorn.test/api/auth/sign-out",
    );
    expect(request?.init?.method).toBe("POST");
    expect(request?.init?.credentials).toBe("include");
    expect(request?.init?.headers).toMatchObject({
      Authorization: "Bearer desktop-token",
      "Content-Type": "application/json",
    });
  });

  test("keeps the user signed in when the server cannot revoke the session", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "sign_out_failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    const client = createDenClient({
      baseUrl: "https://cloud.matterhorn.test",
      token: "desktop-token",
    });

    await expect(client.signOut()).rejects.toMatchObject({
      status: 500,
      code: "sign_out_failed",
    });
  });
});
