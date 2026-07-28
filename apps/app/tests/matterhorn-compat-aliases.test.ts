import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  parseDebugDeepLinkInput,
  parseDenAuthDeepLink,
  parseRemoteConnectDeepLink,
} from "../src/app/lib/matterhorn-links";
import {
  clearMatterhornServerSettings,
  readMatterhornServerSettings,
} from "../src/app/lib/matterhorn-server";

const originalWindow = globalThis.window;

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("Matterhorn compatibility aliases", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: memoryStorage(),
        sessionStorage: memoryStorage(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  test("accepts the primary Matterhorn Desks deep-link scheme alongside compatibility aliases", () => {
    const primaryRemote = parseRemoteConnectDeepLink(
      "matterhorn-desks://connect-remote?matterhornHostUrl=http%3A%2F%2F127.0.0.1%3A8787&matterhornToken=primary-token",
    );
    expect(primaryRemote?.matterhornHostUrl).toBe("http://127.0.0.1:8787");
    expect(primaryRemote?.matterhornToken).toBe("primary-token");

    const primaryAuth = parseDenAuthDeepLink("matterhorn-desks://den-auth?grant=primary-grant");
    expect(primaryAuth?.grant).toBe("primary-grant");

    const remote = parseRemoteConnectDeepLink(
      "matterhorn-work://connect-remote?matterhornHostUrl=http%3A%2F%2F127.0.0.1%3A8787&matterhornToken=abc",
    );
    expect(remote?.matterhornHostUrl).toBe("http://127.0.0.1:8787");
    expect(remote?.matterhornToken).toBe("abc");

    const auth = parseDenAuthDeepLink("matterhorn-work://den-auth?grant=one-time");
    expect(auth?.grant).toBe("one-time");

    const legacyAuth = parseDenAuthDeepLink("openwork://den-auth?grant=legacy-grant");
    expect(legacyAuth?.grant).toBe("legacy-grant");

    const debug = parseDebugDeepLinkInput(
      "Paste this: matterhorn-desks://den-auth?grant=debug-grant",
    );
    expect(debug).toEqual({
      kind: "auth",
      link: expect.objectContaining({ grant: "debug-grant" }),
    });
  });

  test("migrates legacy OpenWork server settings into Matterhorn storage keys", () => {
    window.localStorage.setItem("openwork.server.urlOverride", "http://127.0.0.1:8787/");
    window.localStorage.setItem("openwork.server.port", "8787");
    window.localStorage.setItem("openwork.server.token", "client-token");
    window.localStorage.setItem("openwork.server.hostToken", "host-token");
    window.localStorage.setItem("openwork.server.remoteAccessEnabled", "1");

    const settings = readMatterhornServerSettings();

    expect(settings).toMatchObject({
      urlOverride: "http://127.0.0.1:8787",
      portOverride: 8787,
      token: "client-token",
      hostToken: "host-token",
      remoteAccessEnabled: true,
    });
    expect(window.localStorage.getItem("matterhorn-work.server.urlOverride")).toBe("http://127.0.0.1:8787/");
    expect(window.localStorage.getItem("matterhorn-work.server.hostToken")).toBe("host-token");

    clearMatterhornServerSettings();
    expect(window.localStorage.getItem("matterhorn-work.server.hostToken")).toBeNull();
    expect(window.localStorage.getItem("openwork.server.hostToken")).toBeNull();
  });
});
