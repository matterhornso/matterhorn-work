#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";

const REPORT_VERSION = "matterhorn.workspace-backup-restore-drill.v1";

function parseArgs(argv) {
  const config = {
    serverUrl: process.env.MATTERHORN_WORK_SERVER_URL ?? "",
    token: process.env.MATTERHORN_WORK_TOKEN ?? "",
    hostToken: process.env.MATTERHORN_WORK_HOST_TOKEN ?? "",
    sourceWorkspaceId: process.env.MATTERHORN_WORKSPACE_ID ?? "",
    targetWorkspaceId: "",
    confirmTarget: "",
    outputDir: "qa-reports/product-hunt/backup-restore",
    apply: false,
    json: false,
    jsonOutput: "",
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    switch (arg) {
      case "--server-url": config.serverUrl = next(); break;
      case "--token": config.token = next(); break;
      case "--host-token": config.hostToken = next(); break;
      case "--source-workspace": config.sourceWorkspaceId = next(); break;
      case "--target-workspace": config.targetWorkspaceId = next(); break;
      case "--confirm-target": config.confirmTarget = next(); break;
      case "--output-dir": config.outputDir = next(); break;
      case "--apply": config.apply = true; break;
      case "--json": config.json = true; break;
      case "--json-output": config.jsonOutput = next(); break;
      case "--help":
      case "-h": config.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return config;
}

function help() {
  return [
    "Matterhorn workspace backup and restore drill",
    "",
    "Exports a secret-excluding backup, previews it against a separate restore workspace, and optionally applies and verifies the restore.",
    "Tokens are accepted only through arguments or environment variables and are never written to output.",
    "",
    "Usage:",
    "  pnpm drill:workspace-backup-restore -- --source-workspace ws_source --target-workspace ws_restore --confirm-target ws_restore --apply --json-output report.json",
    "",
    "Safety:",
    "  The restore target must differ from the source. --apply requires --confirm-target to exactly match the target.",
    "  The drill always exports with sensitive=exclude and only approves the matching config.import request.",
  ].join("\n");
}

function cleanServerUrl(value) {
  if (!value) throw new Error("--server-url is required.");
  const url = new URL(value);
  if (url.username || url.password) throw new Error("--server-url must not contain credentials.");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function validate(config) {
  if (!config.token) throw new Error("A client token is required through --token or MATTERHORN_WORK_TOKEN.");
  if (!config.sourceWorkspaceId) throw new Error("--source-workspace is required.");
  if (!config.targetWorkspaceId) throw new Error("--target-workspace is required.");
  if (config.sourceWorkspaceId === config.targetWorkspaceId) throw new Error("Restore target must differ from the source workspace.");
  if (config.apply && config.confirmTarget !== config.targetWorkspaceId) {
    throw new Error("--apply requires --confirm-target to exactly match --target-workspace.");
  }
  if (config.apply && !config.hostToken) {
    throw new Error("--apply requires a host token so the matching manual approval can be completed.");
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function portablePayload(value) {
  const { workspaceId: _workspaceId, exportedAt: _exportedAt, previewFingerprint: _previewFingerprint, ...rest } = value;
  return rest;
}

function portableDigest(value) {
  return sha256(JSON.stringify(stableValue(portablePayload(value))));
}

function safeFilename(value) {
  const sanitized = value.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return sanitized.slice(0, 120) || "workspace";
}

function approvalSummary(summary) {
  const parts = [
    summary.create > 0 ? `add ${summary.create}` : null,
    summary.update + summary.replace > 0 ? `update ${summary.update + summary.replace}` : null,
    summary.delete > 0 ? `remove ${summary.delete}` : null,
  ].filter(Boolean);
  return parts.length ? `Import workspace config (${parts.join(", ")})` : "Import workspace config (no changes)";
}

async function requestJson(url, init, label) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}: ${body.message ?? body.code ?? "Unknown error"}`);
  return body;
}

function clientHeaders(config) {
  return { authorization: `Bearer ${config.token}`, "content-type": "application/json" };
}

function hostHeaders(config) {
  return { "x-matterhorn-host-token": config.hostToken, "content-type": "application/json" };
}

async function approveMatchingImport(config, serverUrl, targetWorkspaceId, startedAt, expectedSummary, importState) {
  const clientTokenHash = sha256(config.token);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (importState.done) return false;
    const approvals = await requestJson(`${serverUrl}/approvals`, { headers: hostHeaders(config) }, "Approval list");
    const match = approvals.items?.find((item) =>
      item.workspaceId === targetWorkspaceId
      && item.action === "config.import"
      && item.createdAt >= startedAt
      && item.summary === expectedSummary
      && item.actor?.tokenHash === clientTokenHash
    );
    if (match) {
      await requestJson(`${serverUrl}/approvals/${encodeURIComponent(match.id)}`, {
        method: "POST",
        headers: hostHeaders(config),
        body: JSON.stringify({ reply: "allow" }),
      }, "Restore approval");
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the matching restore approval.");
}

async function runDrill(config) {
  validate(config);
  const serverUrl = cleanServerUrl(config.serverUrl);
  const startedAt = Date.now();
  mkdirSync(config.outputDir, { recursive: true });

  const sourceId = encodeURIComponent(config.sourceWorkspaceId);
  const targetId = encodeURIComponent(config.targetWorkspaceId);
  const backup = await requestJson(
    `${serverUrl}/workspace/${sourceId}/export?sensitive=exclude`,
    { headers: clientHeaders(config) },
    "Secret-excluding workspace export",
  );
  const backupSerialized = `${JSON.stringify(backup, null, 2)}\n`;
  const backupSha256 = sha256(backupSerialized);
  const timestamp = new Date(startedAt).toISOString().replaceAll(":", "-");
  const backupPath = join(config.outputDir, `${safeFilename(config.sourceWorkspaceId)}-${timestamp}.json`);
  writeFileSync(backupPath, backupSerialized);

  const preview = await requestJson(`${serverUrl}/workspace/${targetId}/import/preview`, {
    method: "POST",
    headers: clientHeaders(config),
    body: JSON.stringify(backup),
  }, "Restore preview");

  let approvalCompleted = false;
  let restoredDigest = null;
  let exactPortableDigestMatch = false;
  let verificationSummary = null;
  let verified = false;
  if (config.apply) {
    const importState = { done: false };
    const importStartedAt = Date.now();
    const importPromise = requestJson(`${serverUrl}/workspace/${targetId}/import`, {
      method: "POST",
      headers: clientHeaders(config),
      body: JSON.stringify({ ...backup, previewFingerprint: preview.fingerprint }),
    }, "Restore import").finally(() => { importState.done = true; });
    approvalCompleted = await approveMatchingImport(
      config,
      serverUrl,
      config.targetWorkspaceId,
      importStartedAt,
      approvalSummary(preview.summary),
      importState,
    );
    await importPromise;
    const restored = await requestJson(
      `${serverUrl}/workspace/${targetId}/export?sensitive=exclude`,
      { headers: clientHeaders(config) },
      "Restored workspace export",
    );
    restoredDigest = portableDigest(restored);
    exactPortableDigestMatch = restoredDigest === portableDigest(backup);
    const verificationPreview = await requestJson(`${serverUrl}/workspace/${targetId}/import/preview`, {
      method: "POST",
      headers: clientHeaders(config),
      body: JSON.stringify(backup),
    }, "Restored workspace verification preview");
    verificationSummary = verificationPreview.summary;
    verified = Boolean(
      verificationSummary
      && verificationSummary.create === 0
      && verificationSummary.update === 0
      && verificationSummary.replace === 0
      && verificationSummary.delete === 0
      && verificationSummary.unchanged === verificationSummary.total,
    );
    if (!verified) {
      throw new Error("Restored workspace is not idempotent against the source backup.");
    }
  }

  const report = {
    version: REPORT_VERSION,
    status: config.apply && verified ? "pass" : "preview_only",
    ready: config.apply && verified,
    capturedAt: new Date().toISOString(),
    sourceWorkspaceId: config.sourceWorkspaceId,
    targetWorkspaceId: config.targetWorkspaceId,
    sensitiveMode: "exclude",
    backup: {
      file: basename(backupPath),
      sha256: backupSha256,
      portableDigest: portableDigest(backup),
    },
    preview: {
      fingerprint: preview.fingerprint,
      summary: preview.summary,
    },
    restore: {
      applied: config.apply,
      approvalCompleted,
      verified,
      portableDigest: restoredDigest,
      exactPortableDigestMatch,
      verificationSummary,
    },
    durationMs: Date.now() - startedAt,
  };
  const reportPath = config.jsonOutput || join(config.outputDir, `backup-restore-report-${timestamp}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { report, reportPath };
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(`${help()}\n`);
    return;
  }
  const { report, reportPath } = await runDrill(config);
  if (config.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`Workspace backup/restore drill: ${report.ready ? "PASS" : "PREVIEW ONLY"}\nReport: ${reportPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
