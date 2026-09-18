import { describe, expect, test } from "bun:test";

import { deriveSessionRenderModel } from "../src/react-app/domains/session/sync/transition-controller";

describe("session render transitions", () => {
  test("keeps an already-rendered chat usable when its background refresh fails", () => {
    for (const isFetching of [false, true]) {
      expect(deriveSessionRenderModel({
        intendedSessionId: "session-current",
        renderedSessionId: "session-current",
        hasSnapshot: true,
        isFetching,
        isError: true,
      })).toEqual({
        intendedSessionId: "session-current",
        renderedSessionId: "session-current",
        transitionState: "idle",
        renderSource: "error",
      });
    }
  });

  test("does not unlock a failed switch while another chat is rendered", () => {
    expect(deriveSessionRenderModel({
      intendedSessionId: "session-next",
      renderedSessionId: "session-current",
      hasSnapshot: true,
      isFetching: false,
      isError: true,
    })).toEqual({
      intendedSessionId: "session-next",
      renderedSessionId: "session-current",
      transitionState: "recovering",
      renderSource: "recovering",
    });
  });

  test("keeps failed first loads blocked without a matching cached snapshot", () => {
    for (const renderedSessionId of [null, "session-current"]) {
      expect(deriveSessionRenderModel({
        intendedSessionId: "session-current",
        renderedSessionId,
        hasSnapshot: false,
        isFetching: false,
        isError: true,
      }).transitionState).toBe("failed");
    }
    expect(deriveSessionRenderModel({
      intendedSessionId: "session-current",
      renderedSessionId: null,
      hasSnapshot: true,
      isFetching: false,
      isError: true,
    }).transitionState).toBe("failed");
  });

  test("preserves pending, empty and successful transitions", () => {
    const current = {
      intendedSessionId: "session-current",
      renderedSessionId: "session-current",
      hasSnapshot: true,
      isFetching: false,
      isError: false,
    };
    expect(deriveSessionRenderModel(current).transitionState).toBe("idle");
    expect(deriveSessionRenderModel({ ...current, isFetching: true }).transitionState).toBe("switching");
    expect(deriveSessionRenderModel({ ...current, hasSnapshot: false }).renderSource).toBe("empty");
    expect(deriveSessionRenderModel({ ...current, intendedSessionId: "session-next" }).transitionState).toBe("switching");
  });
});
