import { expect, spyOn, test } from "bun:test";
import { Worker } from "node:worker_threads";
import { trackFixtureWorker } from "./fixtures/worker-lifecycle.js";

test("fixture cleanup observes natural exit without terminating a completed worker", async () => {
  const worker = new Worker("", { eval: true });
  const lifecycle = trackFixtureWorker(worker);
  const terminate = spyOn(worker, "terminate");
  try {
    await lifecycle.waitForExit();
    await lifecycle.stop();
    expect(terminate).not.toHaveBeenCalled();
  } finally {
    await lifecycle.stop();
    terminate.mockRestore();
  }
});

test("fixture cleanup rejects a nonzero natural exit", async () => {
  const worker = new Worker("process.exit(7)", { eval: true });
  const lifecycle = trackFixtureWorker(worker);
  try {
    await expect(lifecycle.waitForExit()).rejects.toThrow("Fixture worker exited with code 7");
  } finally {
    await lifecycle.stop();
  }
});

test("fixture cleanup bounds orderly shutdown and terminates a stuck worker", async () => {
  const worker = new Worker("setInterval(() => {}, 100)", { eval: true });
  const lifecycle = trackFixtureWorker(worker);
  const terminate = spyOn(worker, "terminate");
  try {
    await expect(lifecycle.waitForExit()).rejects.toThrow("Fixture worker did not exit after reporting its result");
    await lifecycle.stop();
    expect(terminate).toHaveBeenCalledTimes(1);
  } finally {
    await lifecycle.stop();
    terminate.mockRestore();
  }
});
