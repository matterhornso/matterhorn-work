import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createPythonBridge } from "./python-process.mjs";

function harness(timeoutMs = 1000) {
  const children = [];
  const bridge = createPythonBridge({ script: "fixture.py", network: "test", timeoutMs,
    spawnProcess(_bin, args, options) {
      assert.deepEqual(options.stdio, ["pipe", "pipe", "ignore"], "never buffer or return SDK stderr");
      assert.equal(args[0], "fixture.py");
      assert.equal(options.env.BITTENSOR_NETWORK, "test");
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stdin = new PassThrough();
      child.kills = [];
      child.kill = signal => { child.kills.push(signal); };
      children.push(child);
      return child;
    },
  });
  return { bridge, children };
}

{
  const { bridge, children } = harness();
  const pending = bridge("health", {});
  children[0].emit("exit", 0);
  children[0].stdout.write('{"ok":true}');
  children[0].emit("close", 0);
  assert.deepEqual(await pending, { ok: true }, "wait for complete stdout, not process exit");
}
{
  const { bridge, children } = harness();
  const pending = Array.from({ length: 4 }, () => bridge("wallet", {}));
  await assert.rejects(bridge("wallet", {}), { status: 503 });
  for (const child of children) {
    child.stdout.write("{}");
    child.emit("close", 0);
  }
  await Promise.all(pending);
  const next = bridge("health", {});
  children[4].stdout.write("{}");
  children[4].emit("close", 0);
  await next;
}
{
  const { bridge, children } = harness();
  const pending = bridge("metagraph", {});
  children[0].stdout.write(Buffer.alloc(4 * 1024 * 1024 + 1));
  await assert.rejects(pending, { status: 502, message: "Bittensor chain response exceeded the supported size." });
  assert.deepEqual(children[0].kills, ["SIGKILL"]);
  children[0].emit("close", null);
}
{
  const { bridge, children } = harness(5);
  await assert.rejects(bridge("health", {}), { status: 504 });
  assert.deepEqual(children[0].kills, ["SIGKILL"]);
  children[0].emit("close", null);
}
for (const kind of ["start", "stdin", "exit", "json"]) {
  const { bridge, children } = harness();
  const pending = bridge("health", {});
  if (kind === "start") children[0].emit("error", new Error("sensitive-marker"));
  if (kind === "stdin") children[0].stdin.emit("error", new Error("sensitive-marker"));
  if (kind === "json") children[0].stdout.write("sensitive-marker");
  children[0].emit("close", kind === "exit" ? 1 : 0);
  await assert.rejects(pending, error => error.status === 502 && !error.message.includes("sensitive-marker"));
}
console.log("Python process bounds, lifecycle and error sanitization: PASS");
