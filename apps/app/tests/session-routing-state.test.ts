import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  readSessionPanelFromSearch,
  resolveSessionPanelNavigation,
} from "../src/react-app/shell/session-panel-route";
import {
  unavailablePageToast,
  unavailableWorkspaceToast,
} from "../src/react-app/shell/route-recovery";

function readAppSource(path: string) {
  return readFileSync(
    new URL(`../src/react-app/${path}`, import.meta.url),
    "utf8",
  );
}

describe("session panel route state", () => {
  test("round-trips a supported panel while preserving unrelated query state", () => {
    const transition = resolveSessionPanelNavigation(
      "?qa=acceptance",
      "profile",
    );

    expect(transition).toEqual({
      search: "?qa=acceptance&panel=profile",
      replace: false,
    });
    expect(readSessionPanelFromSearch(transition!.search)).toBe("profile");
  });

  test("restores supported panels on reload and ignores unavailable panel state", () => {
    expect(readSessionPanelFromSearch("?panel=wallet")).toBe("wallet");
    expect(readSessionPanelFromSearch("?panel=profile")).toBe("profile");
    expect(readSessionPanelFromSearch("?panel=unknown")).toBeNull();
    expect(
      readSessionPanelFromSearch("?panel=notes", { notesAvailable: false }),
    ).toBeNull();
  });

  test("makes Back and Forward reversible without creating close loops", () => {
    const opened = resolveSessionPanelNavigation("", "wallet");
    expect(opened).toEqual({ search: "?panel=wallet", replace: false });

    // Browser Back returns to the plain URL; Forward restores the panel URL.
    expect(readSessionPanelFromSearch("")).toBeNull();
    expect(readSessionPanelFromSearch(opened!.search)).toBe("wallet");

    const switched = resolveSessionPanelNavigation(opened!.search, "profile");
    expect(switched).toEqual({ search: "?panel=profile", replace: true });

    const closed = resolveSessionPanelNavigation(switched!.search, null);
    expect(closed).toEqual({ search: "", replace: true });
    expect(resolveSessionPanelNavigation("", null)).toBeNull();
  });

  test("removes stale or unavailable panel parameters when closing", () => {
    expect(resolveSessionPanelNavigation("?qa=acceptance&panel=unknown", null)).toEqual({
      search: "?qa=acceptance",
      replace: true,
    });
    expect(resolveSessionPanelNavigation("?panel=notes", null)).toEqual({
      search: "",
      replace: true,
    });
  });

  test("the URL synchronization effect cannot navigate recursively", () => {
    const source = readAppSource("domains/session/chat/session-page.tsx");
    const syncBlock = source.slice(
      source.indexOf("// The URL is the shareable source of truth"),
      source.indexOf("setActiveWorkflowDeskId(null)"),
    );

    expect(syncBlock).toContain("setSidePanelState(");
    expect(syncBlock).toContain("routeSidePanel");
    expect(syncBlock).not.toContain("setCurrentSidePanel(");
    expect(syncBlock).not.toContain("navigate(");
  });
});

describe("route recovery feedback", () => {
  test("names unavailable pages and workspaces in non-blocking messages", () => {
    expect(unavailablePageToast("/missing/page")).toMatchObject({
      title: "Page unavailable",
      description: "/missing/page is not available. Returned to your project.",
      tone: "warning",
    });
    expect(
      unavailableWorkspaceToast("ws_missing", "Launch workspace"),
    ).toMatchObject({
      title: "Workspace unavailable",
      description:
        "ws_missing could not be opened. Opened Launch workspace instead.",
      tone: "warning",
    });
  });

  test("unknown routes and stale workspaces recover visibly", () => {
    const appRootSource = readAppSource("shell/app-root.tsx");
    const sessionRouteSource = readAppSource("shell/session-route.tsx");

    expect(appRootSource).toContain(
      '<Route path="*" element={<UnknownRouteRecovery />} />',
    );
    expect(sessionRouteSource).toContain(
      "showToast(unavailableWorkspaceToast(routeWorkspaceId, workspaceLabel(fallbackWorkspace)))",
    );
    expect(sessionRouteSource).toContain(
      "`${workspaceSessionRoute(fallbackWorkspace.id, selectedSessionId)}${location.search}`",
    );
    expect(sessionRouteSource).toContain(
      "staleWorkspaceRecoveryRef.current !== routeWorkspaceId",
    );
  });
});
