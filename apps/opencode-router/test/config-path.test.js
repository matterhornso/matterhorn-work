import assert from "node:assert/strict";
import test from "node:test";

import { setConfigPathValue } from "../dist/config-path.js";

test("config path updates preserve dotted settings and existing arrays", () => {
  const config = { version: 1, channels: { telegram: { bots: [{ id: "bot", token: "synthetic" }] } } };
  const enabled = setConfigPathValue(config, "channels.telegram.enabled", false);
  assert.equal(enabled.channels.telegram.enabled, false);
  assert.equal(enabled.version, 1);
  const renamed = setConfigPathValue(enabled, "channels.telegram.bots.0.id", "renamed");
  assert.deepEqual(renamed.channels.telegram.bots, [{ id: "renamed", token: "synthetic" }]);
  assert.deepEqual(setConfigPathValue({ version: 1 }, "channels.slack.enabled", true), {
    version: 1,
    channels: { slack: { enabled: true } },
  });
});

test("config path rejects prototype-related segments anywhere before mutation", () => {
  const prototype = Object.getOwnPropertyDescriptors(Object.prototype);
  for (const segment of ["__proto__", "constructor", "prototype"]) {
    for (const key of [segment, `${segment}.routerRegression`, `channels.${segment}`, `channels.new.${segment}.routerRegression`]) {
      const config = { version: 1, channels: { telegram: { enabled: true } } };
      const original = structuredClone(config);
      assert.throws(() => setConfigPathValue(config, key, { routerRegression: true }), /forbidden path segment/);
      assert.deepEqual(config, original);
      assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), prototype);
    }
  }
});

test("config path does not traverse inherited objects", () => {
  const inherited = { enabled: false };
  const channels = Object.create({ telegram: inherited });
  const result = setConfigPathValue({ version: 1, channels }, "channels.telegram.enabled", true);
  assert.deepEqual(inherited, { enabled: false });
  assert.equal(Object.hasOwn(result.channels, "telegram"), true);
  assert.deepEqual(result.channels.telegram, { enabled: true });
});
