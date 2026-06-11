import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(root, "..", "..");
const outdir = resolve(root, "dist", "sidecars");

const orchestratorPkg = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
const orchestratorVersion = String(orchestratorPkg.version ?? "").trim();
if (!orchestratorVersion) {
  throw new Error(
    "matterhorn-work-orchestrator version missing in apps/orchestrator/package.json",
  );
}

const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH
  ? Number(process.env.SOURCE_DATE_EPOCH)
  : null;
const generatedAt = Number.isFinite(sourceDateEpoch)
  ? new Date(sourceDateEpoch * 1000).toISOString()
  : new Date().toISOString();

const serverPkg = JSON.parse(
  readFileSync(resolve(repoRoot, "apps", "server", "package.json"), "utf8"),
);
const serverVersion = String(serverPkg.version ?? "").trim();
if (!serverVersion) {
  throw new Error(
    "matterhorn-work-server version missing in apps/server/package.json",
  );
}

const routerPkg = JSON.parse(
  readFileSync(
    resolve(repoRoot, "apps", "opencode-router", "package.json"),
    "utf8",
  ),
);
const routerVersion = String(routerPkg.version ?? "").trim();
if (!routerVersion) {
  throw new Error(
    "opencode-router version missing in apps/opencode-router/package.json",
  );
}

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run("pnpm", ["--filter", "matterhorn-work-server", "build:bin:all"], repoRoot);
run("pnpm", ["--filter", "opencode-router", "build:bin:all"], repoRoot);

const targets = [
  { id: "darwin-arm64", bun: "bun-darwin-arm64" },
  { id: "darwin-x64", bun: "bun-darwin-x64" },
  { id: "linux-x64", bun: "bun-linux-x64" },
  { id: "linux-arm64", bun: "bun-linux-arm64" },
  { id: "windows-x64", bun: "bun-windows-x64" },
];

const sha256File = (path) => {
  const data = readFileSync(path);
  return createHash("sha256").update(data).digest("hex");
};

const serverDir = resolve(repoRoot, "apps", "server", "dist", "bin");
const routerDir = resolve(repoRoot, "apps", "opencode-router", "dist", "bin");

mkdirSync(outdir, { recursive: true });

const entries = {
  "matterhorn-work-server": { version: serverVersion, targets: {} },
  "openwork-server": { version: serverVersion, targets: {} },
  "opencode-router": { version: routerVersion, targets: {} },
};

for (const target of targets) {
  const ext = target.id.startsWith("windows") ? ".exe" : "";
  const serverSrc = join(serverDir, `matterhorn-work-server-${target.bun}${ext}`);
  if (!existsSync(serverSrc)) {
    throw new Error(`Missing matterhorn-work-server binary at ${serverSrc}`);
  }
  const canonicalServerDest = join(outdir, `matterhorn-work-server-${target.id}${ext}`);
  const legacyServerDest = join(outdir, `openwork-server-${target.id}${ext}`);
  copyFileSync(serverSrc, canonicalServerDest);
  copyFileSync(serverSrc, legacyServerDest);

  const routerSrc = join(routerDir, `opencode-router-${target.bun}${ext}`);
  if (!existsSync(routerSrc)) {
    throw new Error(`Missing opencode-router binary at ${routerSrc}`);
  }
  const routerDest = join(outdir, `opencode-router-${target.id}${ext}`);
  copyFileSync(routerSrc, routerDest);

  entries["matterhorn-work-server"].targets[target.id] = {
    asset: basename(canonicalServerDest),
    sha256: sha256File(canonicalServerDest),
    size: statSync(canonicalServerDest).size,
  };
  entries["openwork-server"].targets[target.id] = {
    asset: basename(legacyServerDest),
    sha256: sha256File(legacyServerDest),
    size: statSync(legacyServerDest).size,
  };
  entries["opencode-router"].targets[target.id] = {
    asset: basename(routerDest),
    sha256: sha256File(routerDest),
    size: statSync(routerDest).size,
  };
}

const manifest = {
  version: orchestratorVersion,
  generatedAt,
  entries,
};

writeFileSync(
  join(outdir, "openwork-orchestrator-sidecars.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
