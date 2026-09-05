import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrivateModelControl } from "../src/react-app/domains/session/surface/composer/composer";

function renderControl(
  props: Partial<React.ComponentProps<typeof PrivateModelControl>> = {},
) {
  return renderToStaticMarkup(React.createElement(PrivateModelControl, {
    busy: false,
    privateModeAvailable: false,
    privateModeEnabled: false,
    privateModeUnavailableReason: null,
    onPrivateModeChange: () => undefined,
    ...props,
  }));
}

describe("Private model control rendered behavior", () => {
  test("stays absent when the route does not provide a private-mode action", () => {
    expect(renderControl({ onPrivateModeChange: undefined })).toBe("");
  });

  test("offers setup without claiming that Private mode is available", () => {
    const html = renderControl();

    expect(html).toContain('aria-label="Set up a private model"');
    expect(html).toContain('title="Set up a Venice private model"');
    expect(html).toContain("Set up Private");
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain("Private on");
  });

  test("exposes the fail-closed verification reason to assistive technology", () => {
    const reason = "Matterhorn could not verify the current Venice model list.";
    const html = renderControl({ privateModeUnavailableReason: reason });

    expect(html).toContain('aria-label="Review private model setup"');
    expect(html).toContain('aria-describedby="composer-private-model-unavailable"');
    expect(html).toContain('id="composer-private-model-unavailable"');
    expect(html).toContain('class="sr-only"');
    expect(html).toContain(reason);
    expect(html).toContain("Review Private");
    expect(html).not.toContain('role="switch"');
  });

  test("renders an ordinary off switch only after server verification", () => {
    const html = renderControl({ privateModeAvailable: true });

    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('aria-label="Turn on private model"');
    expect(html).toContain(">Private</span>");
    expect(html).not.toContain(' disabled=""');
  });

  test("renders the enabled and busy state without allowing another click", () => {
    const html = renderControl({
      busy: true,
      privateModeAvailable: true,
      privateModeEnabled: true,
    });

    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Turn off private model"');
    expect(html).toContain("disabled");
    expect(html).toContain("Private on");
    expect(html).toContain("Venice does not retain this request or response.");
  });
});
