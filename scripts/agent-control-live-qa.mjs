#!/usr/bin/env node

const args = process.argv.slice(2);

const arg = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  const inline = args.find((item) => item.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
};

const values = (name) => {
  const matches = [];
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === name && args[index + 1]) {
      matches.push(args[index + 1]);
      index += 1;
      continue;
    }
    if (item.startsWith(`${name}=`)) {
      matches.push(item.slice(name.length + 1));
    }
  }
  return matches;
};

const flag = (name) => args.includes(name);

const expectedEvents = [...values("--expect-event"), ...values("--require-event")]
  .flatMap((value) => value.split(","))
  .map((value) => value.trim())
  .filter(Boolean);

const config = {
  serverUrl: (arg("--server-url") || arg("--openwork-url") || process.env.MATTERHORN_WORK_SERVER_URL || process.env.OPENWORK_SERVER_URL || "http://127.0.0.1:8787").replace(/\/+$/, ""),
  token: arg("--token") || arg("--openwork-token") || process.env.MATTERHORN_WORK_TOKEN || process.env.OPENWORK_TOKEN || "",
  hostToken: arg("--host-token") || arg("--openwork-host-token") || process.env.MATTERHORN_WORK_HOST_TOKEN || process.env.OPENWORK_HOST_TOKEN || "",
  workspaceId: arg("--workspace-id") || "",
  sessionId: arg("--session-id") || "",
  filePath: arg("--path") || arg("--file-path") || "",
  prompt: arg("--message") || arg("--prompt") || "Matterhorn Desks live QA: reply with a short ok.",
  title: arg("--title") || `Agent control live QA ${new Date().toISOString()}`,
  maxEvents: Number(arg("--max-events", "5")),
  ttlSeconds: Number(arg("--ttl-seconds", "300")),
  timeoutMs: Number(arg("--timeout-ms", "15000")),
  json: flag("--json"),
  strict: flag("--strict"),
  keepSession: flag("--keep-session"),
  skipReply: flag("--skip-reply") || flag("--no-reply"),
  expectedEvents,
};

const stages = [];
const artifacts = {};

function add(status, id, label, extra = {}) {
  stages.push({ id, label, status, observedAt: new Date().toISOString(), ...extra });
}

function headers(kind = "client", hasBody = false, accept = undefined) {
  const value = {};
  if (hasBody) value["Content-Type"] = "application/json";
  if (accept) value.Accept = accept;
  if (kind === "client") value.Authorization = `Bearer ${config.token}`;
  if (kind === "host") {
    value["X-Matterhorn-Host-Token"] = config.hostToken;
    value["X-OpenWork-Host-Token"] = config.hostToken;
  }
  return value;
}

async function request(path, options = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.serverUrl}${path}`, {
      method: options.method || "GET",
      headers: headers(options.auth || "client", Boolean(options.body), options.accept),
      signal: controller.signal,
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      const message = typeof body === "object" ? body?.message || body?.error : body;
      throw new Error(`${options.method || "GET"} ${path} failed: HTTP ${response.status}${message ? ` ${message}` : ""}`);
    }
    return { body: body ?? { ok: true }, text, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function parseSse(text) {
  return text.trim().split(/\n\n+/).filter(Boolean).map((block) => {
    const event = {};
    for (const line of block.split("\n")) {
      if (line.startsWith("id: ")) event.id = line.slice(4);
      if (line.startsWith("event: ")) event.event = line.slice(7);
      if (line.startsWith("data: ")) {
        const raw = line.slice(6);
        try {
          event.data = JSON.parse(raw);
        } catch {
          event.data = raw;
        }
      }
    }
    return event;
  });
}

function firstWorkspaceId(payload) {
  if (config.workspaceId) return config.workspaceId;
  if (payload?.activeId) return payload.activeId;
  if (payload?.items?.[0]?.id) return payload.items[0].id;
  if (payload?.workspaces?.[0]?.id) return payload.workspaces[0].id;
  return "";
}

function firstFilePath(payload) {
  if (config.filePath) return config.filePath;
  return payload?.items?.find((item) => item?.kind !== "dir" && item?.path)?.path || "README.md";
}

async function runCoreReadiness() {
  if (!config.token) {
    add("fail", "auth.client", "Client token configured", { hint: "Pass --token or set MATTERHORN_WORK_TOKEN." });
    return "";
  }

  try {
    const health = await request("/health", { auth: "none" });
    add("pass", "server.health", "Matterhorn Desks server health", { latencyMs: health.latencyMs });
  } catch (error) {
    add("fail", "server.health", "Matterhorn Desks server health", { error: error.message });
    return "";
  }

  try {
    const [status, capabilities, workspaces, bittensor] = await Promise.all([
      request("/status"),
      request("/capabilities"),
      request("/workspaces"),
      request("/api/bittensor/readiness"),
    ]);
    add("pass", "server.status", "Server status route", { latencyMs: status.latencyMs });
    add("pass", "server.capabilities", "Server capabilities route", { latencyMs: capabilities.latencyMs });
    add("pass", "workspaces.list", "Workspace listing route", { latencyMs: workspaces.latencyMs });
    add("pass", "bittensor.readiness", "Bittensor readiness route", { latencyMs: bittensor.latencyMs });
    const workspaceId = firstWorkspaceId(workspaces.body);
    artifacts.workspaceId = workspaceId || null;
    return workspaceId;
  } catch (error) {
    add("fail", "readiness.core", "Core readiness routes", { error: error.message });
    return "";
  }
}

async function runSessionFlow(workspaceId) {
  let sessionId = config.sessionId;
  const createdSession = !sessionId;
  try {
    if (!sessionId) {
      const created = await request(`/workspace/${encodeURIComponent(workspaceId)}/sessions`, {
        method: "POST",
        body: { title: config.title },
      });
      sessionId = created.body?.item?.id || created.body?.session?.id || created.body?.id || "";
      add(sessionId ? "pass" : "fail", "session.create", "Create temporary chat session", { latencyMs: created.latencyMs, sessionId: sessionId || null });
    } else {
      add("skip", "session.create", "Create temporary chat session", { hint: "Using provided --session-id." });
    }
    if (!sessionId) throw new Error("session id missing after session creation");
    artifacts.sessionId = sessionId;

    const prompt = await request(`/workspace/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: "POST",
      body: { message: config.prompt, ...(config.skipReply ? { noReply: true } : {}) },
    });
    add("pass", "session.prompt", "Submit harmless prompt", { latencyMs: prompt.latencyMs, skipReply: config.skipReply });

    const status = await request(`/workspace/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/status`);
    add("pass", "session.status", "Read session status", { latencyMs: status.latencyMs });

    const events = await request(`/workspace/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/events?snapshot=true&details=true&maxEvents=${encodeURIComponent(String(config.maxEvents))}`, {
      accept: "text/event-stream",
    });
    const parsed = parseSse(events.text);
    const eventTypes = parsed.map((event) => event.event).filter(Boolean);
    add(parsed.length ? "pass" : "warn", "session.events", "Read bounded session event stream", {
      latencyMs: events.latencyMs,
      eventCount: parsed.length,
      eventTypes,
    });
    if (config.expectedEvents.length) {
      const missing = config.expectedEvents.filter((eventType) => !eventTypes.includes(eventType));
      add(missing.length ? "fail" : "pass", "session.event-expectations", "Validate expected session event types", {
        expectedEvents: config.expectedEvents,
        missingEvents: missing,
      });
    }
  } catch (error) {
    add("fail", "session.flow", "Chat session prompt/event flow", { error: error.message });
  } finally {
    if (createdSession && sessionId && !config.keepSession) {
      try {
        await request(`/workspace/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
        add("pass", "session.cleanup", "Delete temporary chat session");
      } catch (error) {
        add("warn", "session.cleanup", "Delete temporary chat session", { error: error.message });
      }
    } else if (sessionId) {
      add("skip", "session.cleanup", "Delete temporary chat session", { hint: "Session preserved because --keep-session or --session-id was supplied." });
    }
  }
}

async function runFileFlow(workspaceId) {
  let fileSessionId = "";
  try {
    const created = await request(`/workspace/${encodeURIComponent(workspaceId)}/files/sessions`, {
      method: "POST",
      body: { write: false, ttlSeconds: config.ttlSeconds },
    });
    fileSessionId = created.body?.session?.id || created.body?.item?.id || created.body?.id || "";
    add(fileSessionId ? "pass" : "fail", "files.session", "Create read-only file session", { latencyMs: created.latencyMs, fileSessionId: fileSessionId || null });
    if (!fileSessionId) throw new Error("file session id missing after creation");
    artifacts.fileSessionId = fileSessionId;

    const catalog = await request(`/files/sessions/${encodeURIComponent(fileSessionId)}/catalog/snapshot?limit=20`);
    add("pass", "files.catalog", "Read file catalog", { latencyMs: catalog.latencyMs });

    const path = firstFilePath(catalog.body);
    artifacts.filePath = path;
    const read = await request(`/files/sessions/${encodeURIComponent(fileSessionId)}/read-batch`, {
      method: "POST",
      body: { paths: [path] },
    });
    const item = Array.isArray(read.body?.items) ? read.body.items[0] : null;
    add(item?.ok === false ? "warn" : "pass", "files.read", "Read one workspace file", {
      latencyMs: read.latencyMs,
      path,
      bytes: item?.bytes ?? null,
      warning: item?.ok === false ? item?.error || "read returned ok=false" : undefined,
    });
  } catch (error) {
    add("fail", "files.flow", "Read-only file session flow", { error: error.message });
  } finally {
    if (fileSessionId) {
      try {
        await request(`/files/sessions/${encodeURIComponent(fileSessionId)}`, { method: "DELETE" });
        add("pass", "files.cleanup", "Close file session");
      } catch (error) {
        add("warn", "files.cleanup", "Close file session", { error: error.message });
      }
    }
  }
}

async function runApprovalsProbe() {
  if (!config.hostToken) {
    add("skip", "approvals.list", "List host approvals", { hint: "Pass --host-token or set MATTERHORN_WORK_HOST_TOKEN." });
    return;
  }
  try {
    const approvals = await request("/approvals", { auth: "host" });
    add("pass", "approvals.list", "List host approvals", { latencyMs: approvals.latencyMs });
  } catch (error) {
    add("warn", "approvals.list", "List host approvals", { error: error.message });
  }
}

function summarize() {
  return stages.reduce((counts, item) => {
    counts[item.status] += 1;
    return counts;
  }, { pass: 0, warn: 0, fail: 0, skip: 0 });
}

function report() {
  const summary = summarize();
  return {
    ok: summary.fail === 0,
    ready: summary.fail === 0,
    serverUrl: config.serverUrl,
    checkedAt: new Date().toISOString(),
    summary,
    stages,
    artifacts,
    nextSteps: stages.map((item) => item.hint || item.error).filter(Boolean),
  };
}

function printReport(value) {
  console.log(`Matterhorn Desks agent-control live QA: ${value.ready ? "ready" : "not ready"}`);
  console.log(`Checks: ${value.summary.pass} pass, ${value.summary.warn} warn, ${value.summary.fail} fail, ${value.summary.skip} skip`);
  for (const item of value.stages) {
    const latency = typeof item.latencyMs === "number" ? ` ${item.latencyMs}ms` : "";
    console.log(`- ${item.status.toUpperCase()} ${item.label}${latency}`);
    if (item.error) console.log(`  ${item.error}`);
    if (item.hint) console.log(`  ${item.hint}`);
  }
}

const workspaceId = await runCoreReadiness();
if (workspaceId) {
  await runSessionFlow(workspaceId);
  await runFileFlow(workspaceId);
  await runApprovalsProbe();
}

const value = report();
if (config.json) {
  console.log(JSON.stringify(value, null, 2));
} else {
  printReport(value);
}

if (/seed|mnemonic|privateKey|private_key|wallet export/i.test(JSON.stringify(value))) {
  console.error("Live QA report contains secret-shaped fields.");
  process.exitCode = 1;
} else if (config.strict && !value.ready) {
  process.exitCode = 1;
}
