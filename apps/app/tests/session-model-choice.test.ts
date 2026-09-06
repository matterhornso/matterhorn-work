import { describe, expect, test } from "bun:test";

import {
  inheritSessionChoiceOverride,
  parseSessionChoiceOverrides,
  serializeSessionChoiceOverrides,
  withSessionChoiceOverride,
} from "../src/react-app/kernel/model-config";

describe("session model choices", () => {
  test("keeps model and reasoning choices isolated by chat", () => {
    const first = withSessionChoiceOverride({}, "ses_private", {
      model: { providerID: "venice", modelID: "private-tools" },
      variant: "high",
    });
    const second = withSessionChoiceOverride(first, "ses_public", {
      model: { providerID: "cudos", modelID: "asi1-mini" },
      variant: null,
    });

    expect(second.ses_private).toEqual({
      model: { providerID: "venice", modelID: "private-tools" },
      variant: "high",
    });
    expect(second.ses_public).toEqual({
      model: { providerID: "cudos", modelID: "asi1-mini" },
      variant: null,
    });
  });

  test("inherits an explicit choice only when a chat is deliberately forked", () => {
    const source = withSessionChoiceOverride({}, "ses_source", {
      model: { providerID: "venice", modelID: "private-tools" },
      variant: "medium",
    });
    const inherited = inheritSessionChoiceOverride(source, "ses_source", "ses_fork");

    expect(inherited.ses_fork).toEqual(source.ses_source);
    expect(inherited).not.toBe(source);
    expect(source.ses_fork).toBeUndefined();
  });

  test("does not leave a stale target choice when the source has no override", () => {
    const current = withSessionChoiceOverride({}, "ses_target", {
      model: { providerID: "cudos", modelID: "asi1-mini" },
    });
    const inherited = inheritSessionChoiceOverride(current, "ses_missing", "ses_target");

    expect(inherited.ses_target).toBeUndefined();
  });

  test("removes deleted-chat choices and erases an empty storage payload", () => {
    const current = withSessionChoiceOverride({}, "ses_deleted", {
      model: { providerID: "venice", modelID: "private-tools" },
      variant: null,
    });
    const removed = withSessionChoiceOverride(current, "ses_deleted", null);

    expect(removed).toEqual({});
    expect(serializeSessionChoiceOverrides(removed)).toBeNull();
  });

  test("round-trips the existing workspace-scoped storage format", () => {
    const choices = {
      ses_private: {
        model: { providerID: "venice", modelID: "private-tools" },
        variant: "high",
      },
      ses_public: {
        model: { providerID: "cudos", modelID: "asi1-mini" },
        variant: null,
      },
    };
    const serialized = serializeSessionChoiceOverrides(choices);

    expect(parseSessionChoiceOverrides(serialized)).toEqual(choices);
  });
});
