/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionErrorCard, parseSessionError } from "../src/react-app/domains/session/surface/session-surface";

for (const code of ["agent_unavailable", "agent_permission_unavailable"]) {
  test(`${code} renders an announced setup error without an ineffective retry`, () => {
    const error = parseSessionError(new Error(JSON.stringify({ code })));
    const html = renderToStaticMarkup(
      <SessionErrorCard error={error} onDismiss={() => {}} onRetry={() => {}} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('aria-label="Dismiss error"');
    expect(html).toContain("workspace owner");
    expect(html).toContain("Your draft is preserved");
    expect(html).not.toContain(">Retry response</button>");
    expect(html).not.toContain(code);
  });
}
