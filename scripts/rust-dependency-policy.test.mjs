import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRustDependencyPolicy, validateRustDependencyGraph } from "./rust-dependency-policy.mjs";

const root = "microsandbox-openwork-rust v0.1.0 (/fixture)\n";

test("known patched and unaffected Rust graphs pass", () => {
  for (const version of ["0.23.12", "0.23.45", "0.23.46"]) {
    assert.doesNotThrow(() => validateRustDependencyGraph(`${root}rustls v${version}\nlru v0.16.4\n`));
  }
});

test("reachable RSA and vulnerable LRU cannot be exempted", () => {
  assert.throws(() => validateRustDependencyGraph(`${root}rsa v0.9.10\n`), /RUSTSEC-2023-0071/);
  assert.throws(() => validateRustDependencyGraph(`${root}lru v0.16.3 (*)\n`), /RUSTSEC-2026-0253/);
});

test("both ends of the affected rustls range and duplicate graph entries fail", () => {
  for (const version of ["0.23.13", "0.23.37", "0.23.44"]) {
    assert.throws(() => validateRustDependencyGraph(`${root}rustls v0.23.45\nrustls v${version} (*)\n`), /RUSTSEC-2026-0285/);
  }
});

test("empty, non-text and incomplete output cannot count as clean", () => {
  for (const output of [undefined, null, "", "warning: nothing to print", "rustls v0.23.45"]) {
    assert.throws(() => validateRustDependencyGraph(output), /missing or incomplete/);
  }
});

test("cargo errors, timeout and abnormal termination fail closed even with partial safe output", () => {
  for (const result of [
    { status: 101 }, { status: null }, { status: 0, error: new Error("timeout") }, { status: 0, signal: "SIGTERM" },
  ]) {
    assert.throws(() => checkRustDependencyPolicy(() => ({ stdout: `${root}rustls v0.23.45`, ...result })), /failed closed/);
  }
});

test("graph resolution is locked and includes all target platforms", () => {
  checkRustDependencyPolicy((command, args, options) => {
    assert.equal(command, "cargo");
    assert.deepEqual(args, ["tree", "--locked", "--target", "all", "--prefix", "none", "--manifest-path", "examples/microsandbox-openwork-rust/Cargo.toml"]);
    assert.ok(options.timeout > 0);
    return { status: 0, stdout: `${root}rustls v0.23.45\n` };
  });
});
