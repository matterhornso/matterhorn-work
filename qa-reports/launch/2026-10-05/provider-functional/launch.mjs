// Disposable local acceptance launcher; provider secrets stay in its child environment.
import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { constants, openSync, closeSync, fstatSync, readSync, readFileSync, mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";

const { values } = parseArgs({ options: {
  "env-file": { type: "string" }, "opencode-bin": { type: "string" },
  "wiring-only": { type: "boolean" }, "check-only": { type: "boolean" },
  "training-opt-out-confirmed": { type: "boolean" },
  "operator-review": { type: "boolean" },
  "browser-host": { type: "string", default: "localhost" },
  "bittensor-sidecar-url": { type: "string" },
  "bittensor-network": { type: "string" },
} });
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repo = resolve(scriptDirectory, "../../../..");
const binary = values["opencode-bin"] ?? "/private/tmp/matterhorn-fixture-isolated-runtime.DgRjK5/opencode";
const expectedDigest = "f0a85ae874e3f45c11ace836e46ee7775f955abef215be308cd5395a2c859679";
const providerNames = [
  "CUDOS_API_KEY", "MATTERHORN_CUDOS_TRAINING_USE", "MATTERHORN_CUDOS_TRAINING_OPTED_IN",
  "MATTERHORN_CUDOS_PROMPT_RETENTION_DAYS", "MATTERHORN_CUDOS_PROMPT_RETENTION_POLICY",
  "MATTERHORN_CUDOS_PRIVACY_POLICY_URL", "MATTERHORN_CUDOS_PRIVACY_VERIFIED_AT",
];
function stop(message) { console.error(message); process.exit(1); }
if (!["localhost", "model-qa.localhost", "desks-qa.localhost", "approval-qa.localhost", "final-qa.localhost"].includes(values["browser-host"])) stop("Browser host must be localhost, model-qa.localhost, desks-qa.localhost, approval-qa.localhost or final-qa.localhost.");
const bittensorSidecarEnv = {};
const bittensorSidecarUrl = values["bittensor-sidecar-url"];
const bittensorNetwork = values["bittensor-network"];
if (bittensorSidecarUrl !== undefined || bittensorNetwork !== undefined) {
  if (bittensorSidecarUrl === undefined || bittensorNetwork === undefined) stop("Bittensor sidecar URL and network must be provided together.");
  if (!["finney", "test"].includes(bittensorNetwork)) stop("Bittensor network must be finney or test.");
  const port = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})$/.exec(bittensorSidecarUrl)?.[1];
  if (!port || Number(port) > 65535) stop("Bittensor sidecar URL must be exactly http://127.0.0.1:port with a valid port and no path, query, fragment, or credentials.");
  // Explicit QA-only read-provider wiring. Never inherit sidecar or execution flags.
  bittensorSidecarEnv.BITTENSOR_SUBTENSOR_SIDECAR_URL = bittensorSidecarUrl;
  bittensorSidecarEnv.BITTENSOR_NETWORK = bittensorNetwork;
}
let source = {};
if (values["wiring-only"] && values["env-file"]) stop("Wiring-only mode must not load a real provider env file.");
if (!values["wiring-only"] && !values["env-file"]) stop("Missing --env-file: provide an existing owner-only file containing CUDOS_API_KEY. Do not paste the key into chat or command arguments.");
if (values["env-file"]) {
  let descriptor;
  try {
    descriptor = openSync(resolve(values["env-file"]), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.uid !== process.getuid?.() || (before.mode & 0o077) !== 0 || before.nlink !== 1 || before.size > 65536) stop("Provider env file must be an owner-only regular file, not a symlink, and at most 64 KiB.");
    const bytes = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(descriptor, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    const raw = bytes.subarray(0, length).toString("utf8");
    const after = fstatSync(descriptor);
    if (Buffer.byteLength(raw) !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) stop("Provider env file changed while being read.");
    source = parseEnv(raw);
  } catch { stop("Provider env file could not be safely read. No file contents were printed."); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
  if (!source.CUDOS_API_KEY?.trim() || source.CUDOS_API_KEY.trim().length < 16) stop("Provider env file has no nonempty CUDOS_API_KEY of the expected minimum length.");
}
let digest;
try { digest = createHash("sha256").update(readFileSync(binary)).digest("hex"); }
catch { stop("Maintained runtime binary is unavailable."); }
if (digest !== expectedDigest) stop("Maintained runtime digest mismatch; refusing to start.");
if (values["check-only"]) {
  console.log(JSON.stringify({ sourceSafetyAndBinaryValidated: true, providerKeyTextPresent: Boolean(source.CUDOS_API_KEY), binaryDigest: digest, credentialValidityAndProviderPolicyUnverified: true, bittensorReadOnlySidecar: bittensorSidecarEnv }));
  process.exit(0);
}
const root = mkdtempSync(join(tmpdir(), "matterhorn-pr1032-functional-"));
for (const directory of ["home", "config", "data", "cache", "state", "matterhorn", "workspace", "memory", "tmp"]) mkdirSync(join(root, directory), { mode: 0o700 });
const env = {
  PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: join(root, "home"), NODE_ENV: "development",
  MATTERHORN_QA_ROOT: root, MATTERHORN_QA_REPO: repo, MATTERHORN_QA_BINARY: binary,
  MATTERHORN_QA_BROWSER_HOST: values["browser-host"],
  MATTERHORN_QA_OPERATOR_REVIEW: values["operator-review"] ? "1" : "0",
  MATTERHORN_QA_WIRING_ONLY: values["wiring-only"] ? "1" : "0",
  XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"),
  XDG_CACHE_HOME: join(root, "cache"), XDG_STATE_HOME: join(root, "state"), TMPDIR: join(root, "tmp"),
  OPENCODE_CONFIG_DIR: join(root, "config", "opencode"),
  OPENCODE_DISABLE_PROJECT_CONFIG: "true", OPENCODE_DISABLE_AUTOUPDATE: "true",
  MATTERHORN_WORK_DATA_DIR: join(root, "matterhorn"), OPENWORK_DATA_DIR: join(root, "matterhorn"),
  MATTERHORN_WORK_ENV_STORE: join(root, "env.json"), OPENWORK_ENV_STORE: join(root, "env.json"),
  MATTERHORN_AUTH_DB: join(root, "auth.db"), OPENWORK_TOKEN_STORE: join(root, "tokens.json"),
  MATTERHORN_WORK_MEMORY_ROOT: join(root, "memory"), MATTERHORN_MODEL_USAGE_DB: join(root, "usage.db"),
  MATTERHORN_GUARDED_RUNTIME_MODE: "enforce", MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED: "1",
  MATTERHORN_AGENT_RUNTIME_SECRET: randomBytes(32).toString("hex"), MATTERHORN_CAPABILITY_SIGNING_SECRET: randomBytes(32).toString("hex"),
  MATTERHORN_MODEL_USAGE_ENFORCEMENT: "hard", MATTERHORN_MODEL_USAGE_DAILY_LIMIT: "100000",
  MATTERHORN_MODEL_USAGE_MONTHLY_LIMIT: "100000", MATTERHORN_MODEL_USAGE_GLOBAL_DAILY_LIMIT: "100000",
  MATTERHORN_MODEL_USAGE_GLOBAL_MONTHLY_LIMIT: "100000", MATTERHORN_MODEL_USAGE_RESERVATION_TOKENS: "10000",
  MATTERHORN_PROVIDER_PRIVACY_MODE: "verified-only", MATTERHORN_SIGNUPS_ENABLED: "1",
  MATTERHORN_EMAIL_DEV_MODE: "1", MATTERHORN_EMAIL_VERIFICATION_REQUIRED: "1",
  MATTERHORN_SIGNUP_MAX_ACCOUNTS: "2", MATTERHORN_JEV_ENABLED: "0", MATTERHORN_STM_ENABLED: "0",
  VITE_MATTERHORN_DEPLOYMENT: "web", VITE_MATTERHORN_PUBLIC_BETA: "1", VITE_MATTERHORN_RETRO_UI: "1",
  VITE_MATTERHORN_MINIMAL_UI: "1",
  ...bittensorSidecarEnv,
};
for (const name of providerNames) if (source[name]) env[name] = source[name];
// An explicit owner declaration is not provider-policy verification.
if (values["training-opt-out-confirmed"]) env.MATTERHORN_CUDOS_TRAINING_OPTED_IN = "false";
const log = openSync(join(root, "private-runtime.log"), "wx", 0o600);
const located = spawnSync("pnpm", ["exec", "bun", "--no-env-file", "--eval", "process.stdout.write(process.execPath)"], { cwd: repo, env, encoding: "utf8" });
if (located.status !== 0 || !located.stdout.startsWith("/")) stop("Could not locate the workspace Bun runtime.");
const child = spawn(located.stdout.trim(), ["--no-env-file", join(scriptDirectory, "launch-child.ts")], { cwd: repo, env, detached: true, stdio: ["ignore", log, log] });
closeSync(log);
let announced = false;
const timer = setInterval(() => {
  const metadata = join(root, "runtime.json");
  if (!announced && existsSync(metadata)) { announced = true; console.log(readFileSync(metadata, "utf8")); }
}, 250);
console.log(JSON.stringify({ initializing: true, root, privateLog: join(root, "private-runtime.log"), launcherDoesNotPersistProviderKey: true }));
let groupClosing;
function groupExists() { if (!child.pid) return false; try { process.kill(-child.pid, 0); return true; } catch { return false; } }
function closeGroup() {
  groupClosing ??= (async () => {
    if (!groupExists()) return;
    // Only the newly created process group is eligible for cleanup.
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already exited. */ }
    for (let attempt = 0; attempt < 100 && groupExists(); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
    if (groupExists()) {
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already exited. */ }
      for (let attempt = 0; attempt < 10 && groupExists(); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (groupExists()) { console.error("Owned runtime process group still exists after bounded cleanup."); process.exitCode = 1; }
  })();
  return groupClosing;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void closeGroup(); });
child.once("error", () => { clearInterval(timer); console.error("Launcher child could not start; no secret values printed."); process.exitCode = 1; });
child.once("exit", code => { clearInterval(timer); if (!announced) console.error("Runtime did not become ready; inspect only the new private runtime log with secret-safe filtering."); process.exitCode = code ?? 1; void closeGroup(); });
