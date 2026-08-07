import { describe, expect, test } from "bun:test";

import {
  SESSION_DOCKED_PANE_BREAKPOINT,
  SESSION_FULL_SCREEN_PANE_BREAKPOINT,
  resolveSessionSidePanelPresentation,
} from "../src/react-app/domains/session/chat/session-layout-policy";

describe("session desktop density policy", () => {
  test("uses one focused surface below the desktop shell breakpoint", () => {
    expect(resolveSessionSidePanelPresentation(320)).toBe("full-screen");
    expect(resolveSessionSidePanelPresentation(SESSION_FULL_SCREEN_PANE_BREAKPOINT - 1)).toBe("full-screen");
  });

  test("uses a non-destructive side sheet on compact desktop widths", () => {
    expect(resolveSessionSidePanelPresentation(SESSION_FULL_SCREEN_PANE_BREAKPOINT)).toBe("sheet");
    expect(resolveSessionSidePanelPresentation(SESSION_DOCKED_PANE_BREAKPOINT - 1)).toBe("sheet");
  });

  test("docks the secondary pane only when chat retains useful working width", () => {
    expect(resolveSessionSidePanelPresentation(SESSION_DOCKED_PANE_BREAKPOINT)).toBe("docked");
    expect(resolveSessionSidePanelPresentation(1920)).toBe("docked");
  });
});
