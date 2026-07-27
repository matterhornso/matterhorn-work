#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./rc16-control-acceptance.mjs", import.meta.url),
  "utf8",
);

test("RC16 acceptance records observed outcomes instead of click counts", () => {
  assert.match(source, /expected,/);
  assert.match(source, /observed:/);
  assert.match(source, /a click without the expected state/i);
  assert.match(source, /status: "fail"/);
});

test("RC16 acceptance restores mutable preferences and drafts", () => {
  assert.match(source, /did not restore/);
  assert.match(source, /original draft restored/);
  assert.match(source, /Work is restored/);
  assert.match(source, /Normal is restored/);
});

test("RC16 acceptance covers launch-critical settings and chat journeys", () => {
  for (const id of [
    "PREF-REASONING",
    "APPEAR-THEME",
    "AI-PROVIDER",
    "MCP-CUSTOM",
    "WAL-POLICY-INVALID",
    "WAL-MAINNET",
    "OVERVIEW-QUICK-JOT",
    "CHAT-MODES",
    "CHAT-PERSPECTIVE",
    "CHAT-DRAFT",
    "CHAT-COPY",
    "BRAND-CUSTOMER",
  ]) {
    assert.match(source, new RegExp(id));
  }
});

test("RC16 acceptance distinguishes hidden controls and provider-free recovery", () => {
  assert.match(source, /openOverviewControlGroup/);
  assert.match(source, /More workspace controls/);
  assert.match(source, /escapeRegExp/);
  assert.match(source, /Connect a model recovery/);
  assert.match(source, /Add provider recovery/);
  assert.match(source, /Workspace details/);
});

test("RC16 acceptance names boundaries it cannot safely automate", () => {
  for (const gate of [
    "OWNER-WALLET",
    "OWNER-HL",
    "OWNER-OAUTH",
    "OWNER-NATIVE",
    "OWNER-DESTRUCTIVE",
  ]) {
    assert.match(source, new RegExp(gate));
  }
});
