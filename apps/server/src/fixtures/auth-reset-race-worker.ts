import { parentPort } from "node:worker_threads";
import { MatterhornAuthError, MatterhornAuthStore } from "../auth-store.js";

const port = parentPort;
if (!port) throw new Error("Reset race fixture requires a worker");

port.once("message", (input: unknown) => {
  if (!input || typeof input !== "object"
    || !("path" in input) || typeof input.path !== "string"
    || !("token" in input) || typeof input.token !== "string"
    || !("password" in input) || typeof input.password !== "string"
    || !("barrier" in input) || !(input.barrier instanceof SharedArrayBuffer)) {
    throw new Error("Invalid reset race fixture input");
  }
  const store = new MatterhornAuthStore(input.path);
  const barrier = new Int32Array(input.barrier);
  const clock = Date.now;
  let armed = true;
  let checks = 0;
  // resetPassword reads its challenge before checking time. Pause exactly at
  // that check, after the old challenge is read and before any password write.
  Date.now = () => {
    checks += 1;
    if (armed) {
      armed = false;
      port.postMessage({ phase: "challenge-read" });
      if (Atomics.wait(barrier, 0, 0, 5000) === "timed-out") {
        throw new Error("Reset race fixture barrier timed out");
      }
    }
    // A separate expiry case advances only this disposable worker's clock
    // after initial validation; no machine or main-thread clock is changed.
    return clock() + ("expireAtCommit" in input && input.expireAtCommit === true && checks > 1 ? 2 * 60 * 60_000 : 0);
  };
  let result: { phase: "result"; ok: boolean; code?: string };
  try {
    store.resetPassword(input.token, input.password);
    result = { phase: "result", ok: true };
  } catch (error) {
    result = { phase: "result", ok: false,
      code: error instanceof MatterhornAuthError ? error.code : "fixture_failure" };
  } finally {
    Date.now = clock;
    store.close();
  }
  port.postMessage(result);
  port.close();
});
