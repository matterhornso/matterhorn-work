// Normal auth against one disposable local QA runtime. No admin token or DB seeding.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
if (!root || !root.includes("/matterhorn-pr1032-functional-")) throw new Error("Expected disposable QA root");
const runtime = JSON.parse(readFileSync(join(root, "runtime.json"), "utf8"));
const origin = new URL(runtime.url);
if (origin.protocol !== "http:" || !["localhost", "model-qa.localhost", "desks-qa.localhost", "approval-qa.localhost", "final-qa.localhost"].includes(origin.hostname)) throw new Error("Expected isolated localhost origin");
const transport = new URL(origin);
transport.hostname = "127.0.0.1";
const credentials = { email: `desk-ui-${Date.now()}@example.test`, password: randomBytes(24).toString("base64url"), name: "Desk interface QA" };
let cookie = "";
async function request(path, body) {
  const response = await fetch(new URL(path, transport), {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", host: origin.host, origin: origin.origin, ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000), redirect: "error",
  });
  const result = await response.json();
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  if (!response.ok) throw new Error(`Local auth step ${path} failed HTTP ${response.status}`);
  return { status: response.status, result };
}
const config = await request("/api/auth/config");
if (!config.result.emailVerificationRequired) throw new Error("Verification must remain enabled");
const signup = await request("/api/auth/sign-up/email", { ...credentials, legalAccepted: true });
if (signup.status !== 202 || !signup.result.verificationRequired || cookie) throw new Error("Signup did not require verification");
const preview = JSON.parse(readFileSync(runtime.privateEmailPreview, "utf8"));
if (preview.template !== "verification" || !/^\d{6}$/.test(String(preview.props.verificationCode))) throw new Error("Expected local verification delivery");
const verify = await request("/api/auth/verify-email", { email: credentials.email, code: String(preview.props.verificationCode) });
if (!verify.result.user?.emailVerified || !cookie) throw new Error("Normal verification failed");
const workspaces = await request("/workspaces");
writeFileSync(join(root, "private-ui-account.json"), JSON.stringify({ ...credentials, cookie }), { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ signupStatus: signup.status, verificationStatus: verify.status, localEmailFixture: true, workspaceStatus: workspaces.status, workspaceIds: workspaces.result.items?.map(item => item.id) ?? [], inferenceRequests: 0 }));
