import { expect, test } from "bun:test";

const questionPanel = await Bun.file(
  "apps/app/src/react-app/domains/session/modals/question-modal.tsx",
).text();
const sessionSurface = await Bun.file(
  "apps/app/src/react-app/domains/session/surface/session-surface.tsx",
).text();

test("questions without preset options expose a custom answer input", () => {
  expect(questionPanel).toContain(
    "Boolean(currentQuestion?.custom) || options.length === 0",
  );
  expect(questionPanel).toContain("aria-label={currentQuestion.header");
  expect(questionPanel).toContain("currentQuestion.multiple || acceptsCustomInput");
});

test("a pending question or approval is presented as waiting, not generating", () => {
  expect(sessionSurface).toContain(
    "const waitingForUser = Boolean(props.activeQuestion || props.activePermission)",
  );
  expect(sessionSurface).toContain("const chatStreaming = !waitingForUser");
});
