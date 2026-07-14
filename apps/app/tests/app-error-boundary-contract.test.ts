import { readFileSync } from "node:fs";
import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AppErrorBoundary } from "../src/react-app/shell/app-error-boundary";
import { SurfaceErrorBoundary } from "../src/react-app/shell/surface-error-boundary";

function readReactAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Matterhorn route error boundary", () => {
  test("app root wraps routes in a navigation-resetting error boundary", () => {
    const source = readReactAppSource("shell/app-root.tsx");

    expect(source).toContain("import { AppErrorBoundary } from \"./app-error-boundary\"");
    expect(source).toContain("<AppErrorBoundary resetKey={`${location.pathname}${location.search}`}>");
    expect(source).toContain("</AppErrorBoundary>");
  });

  test("fallback is user-facing and does not expose component stacks", () => {
    const source = readReactAppSource("shell/app-error-boundary.tsx");
    const routeEventBlock = source.slice(
      source.indexOf("window.dispatchEvent(new CustomEvent(\"matterhorn:route-error\""),
      source.indexOf("console.error(\"[Matterhorn] route render failed\")"),
    );

    expect(source).toContain("import { recordDebugLog } from \"./debug-logger\"");
    expect(source).toContain("source: \"AppErrorBoundary\"");
    expect(source).toContain("This Matterhorn view stopped working");
    expect(source).toContain("componentStackPresent");
    expect(routeEventBlock).toContain("message: \"Route render failed\"");
    expect(source).toContain("console.error(\"[Matterhorn] route render failed\")");
    expect(source).not.toContain("info.componentStack,");
    expect(source).not.toContain("{info.componentStack}");
    expect(routeEventBlock).not.toContain("message: error.message,");
    expect(source).not.toContain("console.error(\"[Matterhorn] route render failed\", error)");
    expect(source).toContain("rounded-lg bg-dls-surface-muted/[0.08]");
  });

  test("fallback renders recovery copy without leaking the thrown error", () => {
    const boundary = new AppErrorBoundary({
      children: React.createElement("div", null, "normal route"),
      resetKey: "/workspace/ws_demo/session",
    });
    boundary.state = { error: new Error("raw database password leaked in stack") };

    const html = renderToStaticMarkup(boundary.render() as React.ReactElement);

    expect(html).toContain("This Matterhorn view stopped working");
    expect(html).toContain("The rest of the app is still running");
    expect(html).toContain("Back to Home");
    expect(html).not.toContain("raw database password leaked in stack");
    expect(html).not.toContain("componentStack");
  });

  test("fallback keeps route-crash copy even when the error looks network-related", () => {
    const boundary = new AppErrorBoundary({
      children: React.createElement("div", null, "normal route"),
      resetKey: "/workspace/ws_demo/session",
    });
    boundary.state = { error: new Error("Failed to fetch while rendering") };

    const html = renderToStaticMarkup(boundary.render() as React.ReactElement);

    expect(html).toContain("This Matterhorn view stopped working");
    expect(html).not.toContain("Matterhorn Work engine is offline");
    expect(html).not.toContain("Failed to fetch while rendering");
  });

  test("navigation reset clears a captured route error", () => {
    const boundary = new AppErrorBoundary({
      children: React.createElement("div", null, "normal route"),
      resetKey: "/workspace/ws_demo/settings",
    });
    boundary.state = { error: new Error("route failed") };
    boundary.setState = ((nextState: Partial<typeof boundary.state>) => {
      boundary.state = { ...boundary.state, ...nextState };
    }) as typeof boundary.setState;

    boundary.componentDidUpdate({
      children: React.createElement("div", null, "previous route"),
      resetKey: "/workspace/ws_demo/session",
    });

    expect(boundary.state.error).toBeNull();
  });
});

describe("Matterhorn surface error boundary", () => {
  test("session side panels are wrapped in a resettable local boundary", () => {
    const source = readReactAppSource("domains/session/chat/session-page.tsx");

    expect(source).toContain("import { SurfaceErrorBoundary } from \"../../../shell/surface-error-boundary\"");
    expect(source).toContain("const guardedSidePanelContent = sidePanelContent ? (");
    expect(source).toContain("<SurfaceErrorBoundary");
    expect(source).toContain("source={`SessionSidePanel:${visibleSidePanel ?? \"unknown\"}`}");
    expect(source).toContain("title={`${sidePanelTitle} stopped working`}");
    expect(source.match(/\{guardedSidePanelContent\}/g)?.length).toBe(2);
    expect(source).not.toContain("{sidePanelContent}\n                  </Suspense>");
  });

  test("fallback logs telemetry but does not expose raw thrown errors", () => {
    const source = readReactAppSource("shell/surface-error-boundary.tsx");
    const surfaceEventBlock = source.slice(
      source.indexOf("window.dispatchEvent(new CustomEvent(\"matterhorn:surface-error\""),
      source.indexOf("console.error(\"[Matterhorn] surface render failed\")"),
    );

    expect(source).toContain("import { recordDebugLog } from \"./debug-logger\"");
    expect(source).toContain("source: this.props.source");
    expect(source).toContain("Surface render failed");
    expect(source).toContain("componentStackPresent");
    expect(surfaceEventBlock).toContain("message: \"Surface render failed\"");
    expect(surfaceEventBlock).not.toContain("message: error.message,");
    expect(source).not.toContain("info.componentStack,");
    expect(source).not.toContain("{info.componentStack}");
    expect(source).not.toContain("console.error(\"[Matterhorn] surface render failed\", error)");
    expect(source).toContain("rounded-lg bg-dls-surface-muted/[0.08]");
  });

  test("fallback renders recovery copy without leaking the thrown error", () => {
    const boundary = new SurfaceErrorBoundary({
      children: React.createElement("div", null, "normal panel"),
      resetKey: "memory:ws_demo:ses_demo",
      title: "Memory stopped working",
      source: "SessionSidePanel:memory",
    });
    boundary.state = { error: new Error("raw wallet token leaked in panel stack") };

    const html = renderToStaticMarkup(boundary.render() as React.ReactElement);

    expect(html).toContain("Memory stopped working");
    expect(html).toContain("The workspace is still running");
    expect(html).not.toContain("raw wallet token leaked in panel stack");
    expect(html).not.toContain("componentStack");
  });

  test("panel reset clears a captured surface error", () => {
    const boundary = new SurfaceErrorBoundary({
      children: React.createElement("div", null, "normal panel"),
      resetKey: "notes:ws_demo:ses_demo",
      title: "Notes stopped working",
      source: "SessionSidePanel:notes",
    });
    boundary.state = { error: new Error("panel failed") };
    boundary.setState = ((nextState: Partial<typeof boundary.state>) => {
      boundary.state = { ...boundary.state, ...nextState };
    }) as typeof boundary.setState;

    boundary.componentDidUpdate({
      children: React.createElement("div", null, "previous panel"),
      resetKey: "memory:ws_demo:ses_demo",
      title: "Memory stopped working",
      source: "SessionSidePanel:memory",
    });

    expect(boundary.state.error).toBeNull();
  });
});
