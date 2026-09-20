/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionErrorCard, parseSessionError } from "../src/react-app/domains/session/surface/session-surface";

describe("ambiguous dispatch error recovery", () => {
  const transportError = () => parseSessionError(new Error(JSON.stringify({
    code: "message_outcome_unknown",
    message: "The request may still be running",
  })));

  test("does not declare failure or cancellation and explains idempotent status recovery", () => {
    const error = transportError();
    const html = renderToStaticMarkup(
      <SessionErrorCard error={error} onDismiss={() => {}} onRetry={() => {}} />,
    );
    expect(error.retryable).toBe(true);
    expect(error.message).toBe("Checking whether your message was received.");
    expect(error.detail).toContain("without starting another run");
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain(">Retry response</button>");
    expect(html).toContain('aria-label="Dismiss error"');
    expect(html).not.toContain("disabled=");
  });

  test("disables retry while a retry is already in progress", () => {
    const html = renderToStaticMarkup(
      <SessionErrorCard error={transportError()} onDismiss={() => {}} onRetry={() => {}} retrying />,
    );
    expect(html).toContain(">Retrying…</button>");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain(">Retry response</button>");
  });
});
