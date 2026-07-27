import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import {
  pushPendingDeepLinks,
  takePendingDeepLinks,
} from "../src/app/lib/deep-link-bridge";
import { parseDenAuthDeepLink, parseRemoteConnectDeepLink } from "../src/app/lib/matterhorn-links";

describe("desktop deep-link runtime", () => {
  test("keeps auth and remote links available to their own consumers", () => {
    const target = new EventTarget() as Window;
    target.__OPENWORK__ = {};
    const remote = "matterhorn-desks://connect-remote?matterhornHostUrl=http%3A%2F%2F127.0.0.1%3A4126&matterhornToken=test-token";
    const auth = "matterhorn-desks://den-auth?grant=one-time-grant";

    pushPendingDeepLinks(target, [remote, auth]);

    expect(takePendingDeepLinks(target, (url) => Boolean(parseDenAuthDeepLink(url)))).toEqual([auth]);
    expect(takePendingDeepLinks(target, (url) => Boolean(parseRemoteConnectDeepLink(url)))).toEqual([remote]);
    expect(target.__OPENWORK__?.deepLinks).toEqual([]);
  });

  test("uses the Matterhorn native event and mounts the remote handler", () => {
    const main = readFileSync("apps/desktop/electron/main.mjs", "utf8");
    const preload = readFileSync("apps/desktop/electron/preload.mjs", "utf8");
    const root = readFileSync("apps/app/src/react-app/shell/app-root.tsx", "utf8");
    const handler = readFileSync("apps/app/src/react-app/shell/remote-connect-deep-links.tsx", "utf8");

    expect(main).toContain('const NATIVE_DEEP_LINK_EVENT = "matterhorn:deep-link-native"');
    expect(preload).toContain('const NATIVE_DEEP_LINK_EVENT = "matterhorn:deep-link-native"');
    expect(preload).toContain('const LEGACY_NATIVE_DEEP_LINK_EVENT = "openwork:deep-link-native"');
    expect(root).toContain("<RemoteConnectDeepLinkHandler />");
    expect(handler).toContain("workspaceCreateRemote");
    expect(handler).not.toContain("parsed.matterhornToken}");
    expect(main).toContain("input.matterhornHostUrl");
    expect(main).toContain("input.matterhornToken");
  });
});
