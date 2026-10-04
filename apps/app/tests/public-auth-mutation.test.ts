import { describe, expect, test } from "bun:test";
import { createPublicAuthMutationScope } from "../src/app/lib/public-auth-mutation";

describe("public auth mutation lifetime", () => {
  test("overlapping submissions cannot start before React renders the busy state", () => {
    const scope = createPublicAuthMutationScope();
    const first = scope.begin(() => true);
    expect(first?.current()).toBe(true);
    expect(scope.begin(() => true)).toBeNull();
    first?.finish();
    expect(first?.current()).toBe(false);
    expect(scope.begin(() => true)?.current()).toBe(true);
  });

  test("connection change or unmount aborts old work without cancelling its replacement", () => {
    const scope = createPublicAuthMutationScope();
    const old = scope.begin(() => true);
    scope.cancel();
    expect(old?.signal.aborted).toBe(true);
    expect(old?.current()).toBe(false);
    const replacement = scope.begin(() => true);
    old?.finish();
    expect(replacement?.current()).toBe(true);
    expect(replacement?.signal.aborted).toBe(false);
  });

  test("a changed account generation rejects late success and failure before cleanup runs", async () => {
    const scope = createPublicAuthMutationScope();
    let sameAccount = true;
    const operation = scope.begin(() => sameAccount);
    let showSuccess = 0;
    let showError = 0;
    let release = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    const success = held.then(() => { if (operation?.current()) showSuccess++; });
    const failure = held.then(() => { throw new Error("synthetic old request"); })
      .catch(() => { if (operation?.current()) showError++; });
    sameAccount = false;
    release();
    await Promise.all([success, failure]);
    expect(showSuccess).toBe(0);
    expect(showError).toBe(0);
    expect(scope.begin(() => false)).toBeNull();
    scope.cancel();
    expect(operation?.signal.aborted).toBe(true);
  });
});
