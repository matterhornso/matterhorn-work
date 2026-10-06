import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, test } from "bun:test";
import { accountClientState, captureAccountGeneration } from "../src/app/lib/account-client-state";

// Execute the production callbacks, not a copied model of their control flow.
// Dependencies are synthetic; this verifies callbacks, not a mounted browser.
const source = ts.createSourceFile("session-route.tsx", readFileSync(
  new URL("../src/react-app/shell/session-route.tsx", import.meta.url), "utf8",
), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function loadCallback(name: string, dependencies: Record<string, unknown>) {
  const matches: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === name) matches.push(node.initializer.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(matches).toHaveLength(1);
  const compiled = ts.transpileModule(`const callback = ${matches[0]};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const callback: unknown = new Function(...Object.keys(dependencies), `${compiled}\nreturn callback;`)(...Object.values(dependencies));
  if (typeof callback !== "function") throw new Error("Missing production callback");
  return () => callback("message_fixture");
}
function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("session action lifetime", () => {
  const cases = ["account", "route", "unchanged"].flatMap(boundary =>
    ["resolve", "reject"].map(delivery => ({ boundary, delivery })));
  for (const action of ["fork", "revert"]) {
    const steps = action === "fork" ? ["fork", "binding", "inherit"] : ["abort", "revert", "snapshot"];
    for (const heldStep of steps) {
      for (const { boundary, delivery } of cases) {
        test(`${action} at ${heldStep} after ${boundary} change with ${delivery}`, async () => {
          const reached = deferred();
          const release = deferred();
          const calls: string[] = [];
          const sessionActionScope = { current: true };
          const step = async (name: string) => {
            calls.push(name);
            if (name === heldStep) {
              reached.resolve();
              await release.promise;
              if (delivery === "reject") throw new Error("Synthetic delayed rejection");
            }
          };
          const callback = loadCallback(action === "fork" ? "onForkAtMessage" : "onRevertToMessage", {
            executionMode: "work", isCurrentAccount: captureAccountGeneration(), sessionActionScope,
            selectedSessionId: "ses_fixture", selectedWorkspaceId: "ws_fixture",
            opencodeClient: { session: { abort: () => step("abort") } },
            forkSession: async () => { await step("fork"); return { id: "ses_fork" }; },
            revertSession: () => step("revert"),
            selectedWorkspaceEndpoint: { workspaceId: "ws_fixture", client: {
              getCoworkerSessionBinding: async () => { await step("binding"); return { binding: { id: "binding" }, active: true }; },
              inheritCoworkerSessionBinding: () => step("inherit"),
              getSessionSnapshot: async () => { await step("snapshot"); return { item: { private: "synthetic" } }; },
            } },
            getReactQueryClient: () => ({ setQueryData: () => calls.push("cache") }),
            inheritStoredSessionModelChoice: () => calls.push("model"),
            writeLastSessionFor: () => calls.push("last-session"),
            rememberPendingCreatedSession: () => calls.push("pending"),
            setSessionsByWorkspaceId: () => calls.push("sessions"),
            navigateToWorkspaceSession: () => calls.push("navigate"),
            refreshRouteState: () => calls.push("refresh"),
            showToast: () => calls.push("toast"), describeRouteError: () => "Synthetic error",
            console: { warn: () => calls.push("warning") },
          });
          const completion = callback();
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([reached.promise, new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("Callback did not reach fixture")), 1000);
            })]);
            if (boundary === "account") accountClientState.clear();
            if (boundary === "route") sessionActionScope.current = false;
          } finally { clearTimeout(timer); release.resolve(); }
          await completion;
          // Fork intentionally returns void while its internal async work runs.
          await new Promise(done => setTimeout(done, 0));
          let expected = boundary === "unchanged"
            ? [...steps, ...(action === "fork" ? ["model", "last-session", "pending", "sessions", "navigate", "refresh"] : ["cache", "toast"])]
            : steps.slice(0, steps.indexOf(heldStep) + 1);
          if (boundary === "unchanged" && delivery === "reject") {
            const completed = steps.slice(0, steps.indexOf(heldStep) + 1);
            if (action === "fork") expected = heldStep === "fork" ? [...completed, "toast"]
              : [...completed, "model", "last-session", "pending", "sessions", "navigate", "refresh", "toast"];
            else if (heldStep !== "abort") expected = [...completed, "toast"];
          }
          expect(calls).toEqual(expected);
        });
      }
    }
  }
});
