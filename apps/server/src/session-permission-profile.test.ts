import { describe, expect, test } from "bun:test";

import {
  buildMatterhornSessionPermissionProfile,
  matterhornPermissionProfileIsActive,
  normalizeMatterhornPermissionRules,
  restrictMatterhornClientToolHints,
} from "./session-permission-profile.js";

describe("session permission profiles", () => {
  const agentPermission = [
    { permission: "*", pattern: "*", action: "deny" as const },
    { permission: "read", pattern: "*", action: "allow" as const },
    { permission: "edit", pattern: "*", action: "ask" as const },
  ];

  test("restores the complete agent policy when a Work turn has no request override", () => {
    expect(buildMatterhornSessionPermissionProfile({ agentPermission })).toEqual(agentPermission);
  });

  test("applies request-scoped restrictions after the authoritative agent policy", () => {
    expect(buildMatterhornSessionPermissionProfile({
      agentPermission,
      requestTools: { "*": false, read: true },
    })).toEqual([
      ...agentPermission,
      { permission: "*", pattern: "*", action: "deny" },
      { permission: "read", pattern: "*", action: "allow" },
    ]);
  });

  test("detects only an exact active suffix", () => {
    const profile = buildMatterhornSessionPermissionProfile({ agentPermission });
    expect(matterhornPermissionProfileIsActive(profile, profile)).toBe(true);
    expect(matterhornPermissionProfileIsActive([
      { permission: "*", pattern: "*", action: "deny" },
      ...profile,
    ], profile)).toBe(true);
    expect(matterhornPermissionProfileIsActive(profile.slice(0, -1), profile)).toBe(false);
    expect(matterhornPermissionProfileIsActive([
      ...profile.slice(0, -1),
      { permission: "edit", pattern: "*", action: "allow" },
    ], profile)).toBe(false);
  });

  test("rejects malformed upstream permission entries", () => {
    expect(normalizeMatterhornPermissionRules([
      ...agentPermission,
      { permission: "bash", pattern: "*", action: "sometimes" },
      null,
    ])).toEqual(agentPermission);
  });

  test("allows client tool hints to restrict but never broaden the agent", () => {
    expect(restrictMatterhornClientToolHints({
      "*": false,
      custom_read: true,
      custom_write: false,
    })).toEqual({ "*": false, custom_write: false });
    expect(restrictMatterhornClientToolHints({ custom_read: true })).toBeUndefined();
  });
});
