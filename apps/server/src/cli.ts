#!/usr/bin/env bun

import { mkdir } from "node:fs/promises";

import { parseCliArgs, printHelp, resolveServerConfig } from "./config.js";
import {
  createManagedOpencodeServer,
  type ManagedOpencodeEvent,
  type ManagedOpencodeServer,
} from "./managed-opencode.js";
import { createServerLogger, startServer } from "./server.js";
import { ensureWorkspaceFiles } from "./workspace-init.js";
import { buildManagedOpencodeRuntimeConfig } from "./managed-opencode-runtime-config.js";
import {
  resolveManagedVenicePrivateModels,
  startManagedVenicePrivateModelRegistryRefresh,
} from "./venice-provider.js";
import pkg from "../package.json" with { type: "json" };

const args = parseCliArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (args.version) {
  console.log(pkg.version);
  process.exit(0);
}

const config = await resolveServerConfig(args);
const logger = createServerLogger(config);
const serverUrl = `http://${config.host === "0.0.0.0" ? "127.0.0.1" : config.host}:${config.port}`;
let managedOpencode: ManagedOpencodeServer | null = null;
let stopVenicePrivateModelRefresh: () => void = () => undefined;

function logManagedOpencodeEvent(event: ManagedOpencodeEvent) {
  if (event.type === "health_failure" && event.consecutiveFailures < event.threshold) return;
  if (event.type === "health_failure") {
    logger.log("warn", `Managed OpenCode failed ${event.consecutiveFailures} consecutive health checks`);
    return;
  }
  if (event.type === "restarted") {
    logger.log("info", `Managed OpenCode recovered after ${event.reason} (restart ${event.restartCount})`);
    return;
  }
  if (event.type === "restart_scheduled") {
    logger.log("warn", `Managed OpenCode restart scheduled after ${event.reason} in ${event.delayMs}ms`);
    return;
  }
  logger.log("warn", `Managed OpenCode restart failed after ${event.reason}; retrying`);
}

if (!config.readOnly) {
  for (const workspace of config.workspaces) {
    await ensureWorkspaceFiles(workspace.path, workspace.preset ?? "starter");
  }
}

if (!config.opencodeBaseUrl && process.env.OPENWORK_MANAGE_OPENCODE === "1") {
  const workspace = config.workspaces[0];
  if (workspace?.path) {
    const venicePrivateModels = await resolveManagedVenicePrivateModels();
    stopVenicePrivateModelRefresh = startManagedVenicePrivateModelRegistryRefresh().stop;
    const managedRuntimeConfig = buildManagedOpencodeRuntimeConfig({
      serverUrl,
      clientToken: config.token,
      enableCudosProvider: Boolean(process.env.CUDOS_API_KEY?.trim()),
      venicePrivateModels,
    });
    const managedOpencodeCwd = process.env.OPENWORK_MANAGED_OPENCODE_CWD?.trim() || workspace.path;
    await mkdir(managedOpencodeCwd, { recursive: true });
    managedOpencode = await createManagedOpencodeServer({
      bin: process.env.OPENWORK_OPENCODE_BIN,
      cwd: managedOpencodeCwd,
      env: {
        ...(process.env.OPENWORK_DEV_MODE ? { OPENWORK_DEV_MODE: process.env.OPENWORK_DEV_MODE } : {}),
        OPENWORK_SERVER_URL: serverUrl,
        OPENWORK_SERVER_TOKEN: config.token,
        OPENCODE_CONFIG_CONTENT: managedRuntimeConfig,
        ...(process.env.MATTERHORN_MODELS_URL?.trim()
          ? { OPENCODE_MODELS_URL: process.env.MATTERHORN_MODELS_URL.trim() }
          : {}),
      },
      onEvent: logManagedOpencodeEvent,
    });
    config.opencodeBaseUrl = managedOpencode.url;
    config.managedOpencodeMcp = true;
    config.opencodeUsername = managedOpencode.username;
    config.opencodePassword = managedOpencode.password;
    for (const entry of config.workspaces) {
      entry.baseUrl ??= managedOpencode.url;
      entry.opencodeUsername ??= managedOpencode.username;
      entry.opencodePassword ??= managedOpencode.password;
      entry.directory ??= entry.path;
    }
    logger.log("info", `Managed OpenCode listening on ${managedOpencode.url}`);
  }
}

const server = await startServer(config);

const url = `http://${config.host}:${server.port}`;
  logger.log("info", `Matterhorn Desks server listening on ${url}`);

if (config.tokenSource === "generated") {
  logger.log("info", "Client access token generated and kept in process memory");
}

if (config.hostTokenSource === "generated") {
  logger.log("info", "Host access token generated and kept in process memory");
}

if (config.workspaces.length === 0) {
  logger.log("info", "No workspaces configured. Add --workspace or update server.json.");
} else {
  logger.log("info", `Workspaces: ${config.workspaces.length}`);
}

if (args.verbose) {
  logger.log("info", `Config path: ${config.configPath ?? "unknown"}`);
  logger.log("info", `Read-only: ${config.readOnly ? "true" : "false"}`);
  logger.log("info", `Approval: ${config.approval.mode} (${config.approval.timeoutMs}ms)`);
  logger.log("info", `CORS origins: ${config.corsOrigins.join(", ")}`);
  logger.log("info", `Authorized roots: ${config.authorizedRoots.join(", ")}`);
  logger.log("info", `Token source: ${config.tokenSource}`);
  logger.log("info", `Host token source: ${config.hostTokenSource}`);
}

const shutdown = async () => {
  stopVenicePrivateModelRefresh();
  await managedOpencode?.close();
  (server as { stop?: (closeActiveConnections?: boolean) => void }).stop?.(true);
};

process.once("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});
process.once("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});
