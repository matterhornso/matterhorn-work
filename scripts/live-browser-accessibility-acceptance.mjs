#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const REPORT_VERSION = "matterhorn.live-browser-accessibility-acceptance.v1";
const DEFAULT_APP_URL = "https://matterhorn-desks-canary.vercel.app/";

export function parseArgs(argv) {
  const config = {
    appUrl: process.env.MATTERHORN_BROWSER_ACCEPTANCE_URL ?? DEFAULT_APP_URL,
    browser: "firefox",
    webdriverUrl: "",
    jsonOutput: "",
    screenshotOutput: "",
    strict: false,
    allowLoopbackHttp: false,
    headed: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    switch (arg) {
      case "--app-url":
        config.appUrl = next();
        break;
      case "--browser":
        config.browser = next().toLowerCase();
        break;
      case "--webdriver-url":
        config.webdriverUrl = next();
        break;
      case "--json-output":
        config.jsonOutput = next();
        break;
      case "--screenshot-output":
        config.screenshotOutput = next();
        break;
      case "--strict":
        config.strict = true;
        break;
      case "--allow-loopback-http":
        config.allowLoopbackHttp = true;
        break;
      case "--headed":
        config.headed = true;
        break;
      case "--help":
      case "-h":
        config.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return config;
}

export function validateConfig(config) {
  if (!["firefox", "safari"].includes(config.browser)) {
    throw new Error("--browser must be firefox or safari.");
  }
  const appUrl = new URL(config.appUrl);
  if (appUrl.username || appUrl.password)
    throw new Error("--app-url must not contain credentials.");
  if (!["http:", "https:"].includes(appUrl.protocol))
    throw new Error("--app-url must use HTTP or HTTPS.");
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    appUrl.hostname,
  );
  if (appUrl.protocol !== "https:" && !(config.allowLoopbackHttp && loopback)) {
    throw new Error(
      "--app-url must use HTTPS. Use --allow-loopback-http only for local testing.",
    );
  }
  if (config.webdriverUrl) {
    const webdriverUrl = new URL(config.webdriverUrl);
    if (
      !["localhost", "127.0.0.1", "::1", "[::1]"].includes(
        webdriverUrl.hostname,
      )
    ) {
      throw new Error(
        "--webdriver-url must be loopback so browser automation stays on this machine.",
      );
    }
  }
  return appUrl;
}

function help() {
  return [
    "Matterhorn live browser accessibility acceptance",
    "",
    "Runs credential-free responsive, keyboard, and semantic checks in real Firefox or Safari.",
    "It never reads cookies, local storage, passwords, wallet data, or browser history.",
    "",
    "Usage:",
    "  pnpm accept:live-browser -- --browser firefox --strict",
    "  pnpm accept:live-browser -- --browser safari --strict",
    "",
    "Safari requires Safari > Settings > Developer > Allow remote automation.",
    "Use --webdriver-url only when a loopback WebDriver is already running.",
  ].join("\n");
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local WebDriver port."));
        return;
      }
      server.close((error) =>
        error ? reject(error) : resolvePort(address.port),
      );
    });
  });
}

async function waitForDriver(origin, child, readLogs) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `WebDriver exited before becoming ready. ${readLogs()}`.trim(),
      );
    }
    try {
      const response = await fetch(new URL("/status", origin), {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // The driver may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`WebDriver did not become ready. ${readLogs()}`.trim());
}

async function startDriver(browser) {
  const port = await freePort();
  const command = browser === "firefox" ? "geckodriver" : "safaridriver";
  const args =
    browser === "firefox"
      ? ["--host", "127.0.0.1", "--port", String(port)]
      : ["-p", String(port)];
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  const append = (chunk) => {
    logs = `${logs}${chunk.toString()}`.slice(-2_000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.once("error", append);
  const origin = new URL(`http://127.0.0.1:${port}`);
  await waitForDriver(origin, child, () => logs.trim());
  return { origin, child, readLogs: () => logs.trim() };
}

async function webdriver(origin, path, init = {}) {
  const response = await fetch(new URL(path, origin), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.value?.error) {
    const message =
      body.value?.message ?? `WebDriver returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body.value;
}

async function createSession(origin, browser, headed) {
  const alwaysMatch =
    browser === "firefox"
      ? {
          browserName: "firefox",
          "moz:firefoxOptions": { args: headed ? [] : ["-headless"] },
        }
      : { browserName: "safari" };
  const value = await webdriver(origin, "/session", {
    method: "POST",
    body: JSON.stringify({ capabilities: { alwaysMatch } }),
  });
  if (!value.sessionId)
    throw new Error("WebDriver did not return a session id.");
  return value.sessionId;
}

async function execute(origin, sessionId, script, args = []) {
  return webdriver(origin, `/session/${sessionId}/execute/sync`, {
    method: "POST",
    body: JSON.stringify({ script, args }),
  });
}

async function waitForApp(origin, sessionId) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const mounted = await execute(
      origin,
      sessionId,
      `
      const root = document.querySelector("#root");
      return document.readyState !== "loading" && Boolean(root && root.childElementCount > 0);
    `,
    );
    if (mounted) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Matterhorn did not mount within 20 seconds.");
}

function check(id, label, pass, summary, details = {}) {
  return { id, label, status: pass ? "pass" : "fail", summary, ...details };
}

const PAGE_AUDIT_SCRIPT = `
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  };
  const accessibleName = (element) => {
    const labelledBy = element.getAttribute("aria-labelledby");
    const labelledText = labelledBy
      ? labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ")
      : "";
    const label = element.id
      ? [...document.querySelectorAll("label")].find((candidate) => candidate.htmlFor === element.id)?.textContent ?? ""
      : "";
    return [
      element.getAttribute("aria-label"), labelledText, label, element.getAttribute("alt"),
      element.getAttribute("title"), element.getAttribute("placeholder"), element.textContent,
    ].find((value) => value && value.trim())?.trim() ?? "";
  };
  const controls = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')]
    .filter(visible);
  const unnamed = controls.filter((element) => !accessibleName(element));
  const inputs = [...document.querySelectorAll("input")].filter(visible);
  return {
    title: document.title,
    headingCount: document.querySelectorAll("h1, h2, h3, [role=heading]").length,
    mainCount: document.querySelectorAll("main, [role=main]").length,
    visibleControlCount: controls.length,
    unnamedControlCount: unnamed.length,
    unnamedControls: unnamed.slice(0, 5).map((element) => element.outerHTML.slice(0, 180)),
    inputNames: inputs.map(accessibleName),
    horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    bodyText: document.body.innerText.slice(0, 4_000),
  };
`;

async function runAcceptance(config) {
  const appUrl = validateConfig(config);
  const started = config.webdriverUrl
    ? null
    : await startDriver(config.browser);
  const origin = config.webdriverUrl
    ? new URL(config.webdriverUrl)
    : started.origin;
  let sessionId = "";
  try {
    sessionId = await createSession(origin, config.browser, config.headed);
    await webdriver(origin, `/session/${sessionId}/url`, {
      method: "POST",
      body: JSON.stringify({ url: appUrl.toString() }),
    });
    await waitForApp(origin, sessionId);

    const viewportResults = [];
    for (const width of [320, 375, 768, 1024, 1440]) {
      await webdriver(origin, `/session/${sessionId}/window/rect`, {
        method: "POST",
        body: JSON.stringify({ width, height: 900, x: 0, y: 0 }),
      });
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      const audit = await execute(origin, sessionId, PAGE_AUDIT_SCRIPT);
      viewportResults.push({
        width,
        horizontalOverflow: audit.horizontalOverflow,
        unnamedControlCount: audit.unnamedControlCount,
      });
    }

    await webdriver(origin, `/session/${sessionId}/window/rect`, {
      method: "POST",
      body: JSON.stringify({ width: 1280, height: 900, x: 0, y: 0 }),
    });
    const page = await execute(origin, sessionId, PAGE_AUDIT_SCRIPT);
    const focusStops = [];
    for (let index = 0; index < 8; index += 1) {
      await webdriver(origin, `/session/${sessionId}/actions`, {
        method: "POST",
        body: JSON.stringify({
          actions: [
            {
              type: "key",
              id: "keyboard",
              actions: [
                { type: "keyDown", value: "\uE004" },
                { type: "keyUp", value: "\uE004" },
              ],
            },
          ],
        }),
      });
      const focus = await execute(
        origin,
        sessionId,
        `
        const element = document.activeElement;
        const style = getComputedStyle(element);
        return {
          tag: element?.tagName ?? "",
          name: element?.getAttribute?.("aria-label") || element?.textContent?.trim().slice(0, 80) || element?.getAttribute?.("placeholder") || "",
          visibleIndicator: style.outlineStyle !== "none" || style.boxShadow !== "none",
        };
      `,
      );
      if (focus.tag && focus.tag !== "BODY") focusStops.push(focus);
    }

    if (config.screenshotOutput) {
      await execute(origin, sessionId, "window.scrollTo(0, 0); return true;");
      const screenshot = await webdriver(
        origin,
        `/session/${sessionId}/screenshot`,
      );
      const output = resolve(config.screenshotOutput);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, Buffer.from(screenshot, "base64"));
    }

    const uniqueFocusNames = new Set(
      focusStops.map((stop) => `${stop.tag}:${stop.name}`),
    );
    const checks = [
      check(
        "page_title",
        "Page title",
        page.title.trim().length > 0,
        `Document title is ${page.title || "missing"}.`,
      ),
      check(
        "landmark",
        "Main landmark",
        page.mainCount === 1,
        `Found ${page.mainCount} main landmarks.`,
      ),
      check(
        "headings",
        "Heading structure",
        page.headingCount > 0,
        `Found ${page.headingCount} headings.`,
      ),
      check(
        "control_names",
        "Control names",
        page.unnamedControlCount === 0,
        `Found ${page.unnamedControlCount} unnamed visible controls.`,
        { examples: page.unnamedControls },
      ),
      check(
        "input_names",
        "Input names",
        page.inputNames.every(Boolean),
        `Found ${page.inputNames.length} visible inputs and all have names.`,
      ),
      check(
        "responsive",
        "Responsive layout",
        viewportResults.every((result) => result.horizontalOverflow <= 1),
        "No tested viewport has horizontal overflow.",
        { viewports: viewportResults },
      ),
      check(
        "responsive_names",
        "Responsive control names",
        viewportResults.every((result) => result.unnamedControlCount === 0),
        "No tested viewport exposes unnamed controls.",
      ),
      check(
        "keyboard_order",
        "Keyboard order",
        uniqueFocusNames.size >= 4,
        `Keyboard traversal reached ${uniqueFocusNames.size} distinct controls.`,
      ),
      check(
        "focus_visible",
        "Visible focus",
        focusStops.length > 0 &&
          focusStops.every((stop) => stop.visibleIndicator),
        "Every inspected keyboard stop has a visible focus indicator.",
      ),
      check(
        "auth_or_workspace",
        "Application shell",
        /sign in|create account|workspace|home/i.test(page.bodyText),
        "Matterhorn auth or workspace shell is visible.",
      ),
    ];
    const passed = checks.every((item) => item.status === "pass");
    return {
      version: REPORT_VERSION,
      generatedAt: new Date().toISOString(),
      browser: config.browser,
      appUrl: appUrl.origin,
      status: passed ? "pass" : "fail",
      checks,
      focusStops,
    };
  } finally {
    if (sessionId) {
      await webdriver(origin, `/session/${sessionId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    if (started?.child && started.child.exitCode === null) {
      started.child.kill("SIGTERM");
    }
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    console.log(help());
    return;
  }
  const report = await runAcceptance(config);
  if (config.jsonOutput) {
    const output = resolve(config.jsonOutput);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(
    `Matterhorn ${report.browser} live acceptance: ${report.status.toUpperCase()}`,
  );
  for (const item of report.checks)
    console.log(
      `${item.status === "pass" ? "PASS" : "FAIL"}: ${item.label} — ${item.summary}`,
    );
  if (config.strict && report.status !== "pass") process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(
      `Live browser acceptance failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
