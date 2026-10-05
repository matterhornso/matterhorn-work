import { expect, test } from "bun:test";
import { ServerResourceScope } from "./server-resource-scope.js";

test("resource shutdown is joined, drains before releasing stores, and closes once", async () => {
  const scope = new ServerResourceScope();
  const events: string[] = [];
  let finish: (() => void) | undefined;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  scope.onStop(() => { events.push("stop"); });
  scope.onDrain(async () => { await pending; events.push("drain"); });
  scope.onClose(() => { events.push("first-store"); });
  scope.onClose(() => { events.push("second-store"); });
  const closing = scope.close();
  expect(scope.close()).toBe(closing);
  await Bun.sleep(0);
  expect(events).toEqual(["stop"]);
  finish?.();
  await closing;
  expect(events).toEqual(["stop", "drain", "second-store", "first-store"]);
  await scope.close();
  expect(events).toHaveLength(4);
});

test("cleanup failure does not skip other resources or erase startup failure", async () => {
  const scope = new ServerResourceScope();
  const events: string[] = [];
  scope.onStop(() => { throw new Error("stop failure"); });
  scope.onStop(() => { events.push("stop"); });
  scope.onDrain(() => { throw new Error("drain failure"); });
  scope.onClose(() => { events.push("store"); });
  scope.onClose(() => { throw new Error("store failure"); });
  const original = new Error("startup failure");
  try { await scope.fail(original); throw new Error("Unexpected success"); }
  catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    if (!(error instanceof AggregateError)) throw error;
    expect(error.cause).toBe(original);
    expect(error.errors[0]).toBe(original);
    expect(error.errors[1]).toBeInstanceOf(AggregateError);
    expect(error.errors[1].errors).toHaveLength(3);
  }
  expect(events).toEqual(["stop", "store"]);
});

test("successful cleanup preserves the original startup error", async () => {
  const scope = new ServerResourceScope();
  const original = new Error("bind failure");
  await expect(scope.fail(original)).rejects.toBe(original);
});
