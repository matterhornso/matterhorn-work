/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LayoutStack } from "../src/react-app/domains/settings/settings-layout";

test("settings layout forwards loading announcements and accessible labels", () => {
  const html = renderToStaticMarkup(<LayoutStack aria-busy="true" aria-label="Privacy controls">Loading</LayoutStack>);
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('aria-label="Privacy controls"');
  expect(html).toContain('data-slot="settings-stack"');
});
