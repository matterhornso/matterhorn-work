import { beforeEach, describe, expect, test } from "bun:test";

import {
  capturePendingCoworkerInvite,
  hasPendingCoworkerInvite,
  resetPendingCoworkerInviteForTests,
  takeCoworkerInviteFromFragment,
  takePendingCoworkerInvite,
} from "../src/react-app/domains/coworkers/coworker-invite-fragment";

const INVITE = `mhci_${"z".repeat(43)}`;

describe("coworker invite fragment", () => {
  beforeEach(() => resetPendingCoworkerInviteForTests());

  test("takes one valid invite and immediately removes it from the visible URL", () => {
    const replacements: string[] = [];
    expect(takeCoworkerInviteFromFragment({
      hash: `#invite=${INVITE}`,
      pathname: "/coworker-access",
      search: "",
      replaceUrl: (url) => replacements.push(url),
    })).toEqual({ detected: true, token: INVITE });
    expect(replacements).toEqual(["/coworker-access"]);
  });

  test("clears malformed or ambiguous fragments without accepting them", () => {
    const replacements: string[] = [];
    expect(takeCoworkerInviteFromFragment({
      hash: "#invite=bad&forward=attacker",
      pathname: "/coworker-access",
      search: "?safe=1",
      replaceUrl: (url) => replacements.push(url),
    })).toEqual({ detected: true, token: null });
    expect(replacements).toEqual(["/coworker-access?safe=1"]);
    expect(takeCoworkerInviteFromFragment({
      hash: `#invite=${INVITE}%0A`,
      pathname: "/coworker-access",
      search: "",
      replaceUrl: () => {},
    })).toEqual({ detected: true, token: null });
  });

  test("holds an invite only in memory across sign-in navigation and consumes it once", () => {
    capturePendingCoworkerInvite({
      hash: `#invite=${INVITE}`,
      pathname: "/coworker-access",
      search: "",
      replaceUrl: () => {},
    });
    expect(hasPendingCoworkerInvite()).toBe(true);
    expect(takePendingCoworkerInvite()).toEqual({ detected: true, token: INVITE });
    expect(hasPendingCoworkerInvite()).toBe(false);
    expect(takePendingCoworkerInvite()).toEqual({ detected: false, token: null });
  });
});
