import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChatOptionsControl } from "../src/react-app/domains/session/surface/composer/chat-options-control";

function renderControl(
  props: Partial<React.ComponentProps<typeof ChatOptionsControl>> = {},
) {
  return renderToStaticMarkup(React.createElement(ChatOptionsControl, {
    busy: false,
    executionMode: "work",
    executionModesEnabled: true,
    onExecutionModeChange: () => undefined,
    responsePerspective: "balanced",
    onResponsePerspectiveChange: () => undefined,
    open: false,
    onOpenChange: () => undefined,
    ...props,
  }));
}

describe("Chat options rendered behavior", () => {
  test("keeps expert choices behind one plain-language control", () => {
    const html = renderControl();

    expect(html).toContain("Chat options");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('title="Chat options: Work, Balanced"');
    expect(html).not.toContain("How Matterhorn should help");
    expect(html).not.toContain("Cautious");
    expect(html).not.toContain("Optimistic");
  });

  test("shows mode and response style as two accessible groups when opened", () => {
    const html = renderControl({ open: true });

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Chat options"');
    expect(html).toContain("How Matterhorn should help");
    expect(html).toContain('aria-label="Execution mode"');
    expect(html).toContain("Discuss");
    expect(html).toContain("Plan");
    expect(html).toContain("Work");
    expect(html).toContain("Response style");
    expect(html).toContain('aria-label="Response perspective"');
    expect(html).toContain("Cautious");
    expect(html).toContain("Balanced");
    expect(html).toContain("Optimistic");
    expect(html).toContain('aria-checked="true"');
  });

  test("still offers response style when execution modes are unavailable", () => {
    const html = renderControl({ executionModesEnabled: false, open: true });

    expect(html).not.toContain("How Matterhorn should help");
    expect(html).not.toContain('aria-label="Execution mode"');
    expect(html).toContain("Response style");
    expect(html).toContain('aria-label="Response perspective"');
  });

  test("prevents changes while a response is running", () => {
    const html = renderControl({ busy: true, open: true });

    expect(html).toContain('aria-expanded="true"');
    expect(html.match(/disabled=""/g)?.length).toBe(7);
  });
});
