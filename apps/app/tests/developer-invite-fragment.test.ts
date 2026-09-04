import { beforeEach, describe, expect, test } from "bun:test";

import {
  capturePendingDeveloperInvite,
  hasPendingDeveloperInvite,
  resetPendingDeveloperInviteForTests,
  takeDeveloperInviteFromFragment,
  takePendingDeveloperInvite,
} from "../src/react-app/domains/developer/developer-invite-fragment";

const INVITE = `mhdi_${"z".repeat(43)}`;

describe("developer invite fragment", () => {
  beforeEach(() => resetPendingDeveloperInviteForTests());

  test("takes one valid invite and immediately removes it from the visible URL", () => {
    const replacements: string[] = [];
    expect(takeDeveloperInviteFromFragment({
      hash: `#invite=${INVITE}`,
      pathname: "/developer/crypto-apps",
      search: "",
      replaceUrl: (url) => replacements.push(url),
    })).toEqual({ detected: true, token: INVITE });
    expect(replacements).toEqual(["/developer/crypto-apps"]);
  });

  test("clears malformed invite fragments without accepting them", () => {
    const replacements: string[] = [];
    expect(takeDeveloperInviteFromFragment({
      hash: "#invite=bad&forward=attacker",
      pathname: "/developer/crypto-apps",
      search: "?safe=1",
      replaceUrl: (url) => replacements.push(url),
    })).toEqual({ detected: true, token: null });
    expect(replacements).toEqual(["/developer/crypto-apps?safe=1"]);

    expect(takeDeveloperInviteFromFragment({
      hash: `#invite=${INVITE}%0A`,
      pathname: "/developer/crypto-apps",
      search: "",
      replaceUrl: () => {},
    })).toEqual({ detected: true, token: null });
  });

  test("leaves unrelated fragments untouched", () => {
    let replaced = false;
    expect(takeDeveloperInviteFromFragment({
      hash: "#submitted-revisions",
      pathname: "/developer/crypto-apps",
      search: "",
      replaceUrl: () => { replaced = true; },
    })).toEqual({ detected: false, token: null });
    expect(replaced).toBe(false);
  });

  test("holds an invite in memory across sign-in navigation and consumes it once", () => {
    const replacements: string[] = [];
    expect(capturePendingDeveloperInvite({
      hash: `#invite=${INVITE}`,
      pathname: "/developer/crypto-apps",
      search: "",
      replaceUrl: (url) => replacements.push(url),
    })).toEqual({ detected: true, token: INVITE });

    expect(hasPendingDeveloperInvite()).toBe(true);
    expect(takePendingDeveloperInvite()).toEqual({ detected: true, token: INVITE });
    expect(hasPendingDeveloperInvite()).toBe(false);
    expect(takePendingDeveloperInvite()).toEqual({ detected: false, token: null });
    expect(replacements).toEqual(["/developer/crypto-apps"]);
  });
});
