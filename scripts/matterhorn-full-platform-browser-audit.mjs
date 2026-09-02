#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const repoRoot = resolve(import.meta.dirname, "..");
const baseUrl = process.env.MATTERHORN_FULL_AUDIT_URL
  ?? "http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session";
const outputDir = resolve(
  repoRoot,
  process.env.MATTERHORN_FULL_AUDIT_OUTPUT_DIR
    ?? "qa-reports/matterhorn-full-platform-browser-audit",
);
const strict = process.argv.includes("--strict") || process.env.MATTERHORN_FULL_AUDIT_STRICT === "1";
const parsedSurfacePaceMs = Number(process.env.MATTERHORN_FULL_AUDIT_SURFACE_PACE_MS ?? "1500");
const surfacePaceMs = Number.isFinite(parsedSurfacePaceMs)
  ? Math.max(0, Math.floor(parsedSurfacePaceMs))
  : 1_500;
let activeBrowser = null;

function printHelp() {
  process.stdout.write(`Matterhorn full platform browser audit

Usage:
  MATTERHORN_FULL_AUDIT_URL=http://127.0.0.1:<port>/workspace/<id>/session \\
    node scripts/matterhorn-full-platform-browser-audit.mjs --strict

Environment:
  MATTERHORN_FULL_AUDIT_URL                   Workspace session URL to audit.
  MATTERHORN_FULL_AUDIT_OUTPUT_DIR            Evidence directory.
  MATTERHORN_FULL_AUDIT_STRICT=1              Fail on P0/P1, runtime, console, or network issues.
  MATTERHORN_FULL_AUDIT_SURFACE_PACE_MS=1500  Delay between surfaces.
  MATTERHORN_FULL_AUDIT_RESPONSIVE_VIEWPORTS  Optional responsive viewport selection.

Options:
  --strict  Enable strict failure behavior.
  --help    Show this help without starting a browser.
`);
}

const settingsSurfaces = [
  ["settings-general", "settings/general", ["Settings", "Settings at a glance"]],
  ["settings-overview", "settings/overview", ["Workspace health", "Data & privacy"]],
  ["settings-preferences", "settings/preferences", ["Model", "Show model reasoning"]],
  ["settings-permissions", "settings/permissions", ["Authorized folders"]],
  ["settings-wallet", "settings/wallet", ["Wallets", "Save policy"]],
  ["settings-generated-media", "settings/generated-media", ["Production readiness", "Media library"]],
  ["settings-extensions", "settings/extensions", ["Matterhorn MCPs"]],
  ["settings-ai", "settings/ai", ["Models"]],
  ["settings-privacy", "settings/privacy", ["Model processing", "Workspace data", "Complete workspace archive"]],
  ["settings-customization", "settings/shell", ["Customization"]],
  ["settings-appearance", "settings/appearance", ["Appearance"]],
  ["settings-updates", "settings/updates", ["Updates"]],
  ["settings-billing", "settings/billing", ["Billing", "Matterhorn Plus"]],
  ["settings-cloud-account", "settings/cloud-account", ["Account", "Matterhorn Cloud"]],
];

const panelSurfaces = [
  ["panel-profile", "profile", ["Profile"]],
  ["panel-wallet", "wallet", ["Wallets", "Save policy"]],
  ["panel-outputs", "artifacts", ["Outputs"]],
  ["panel-extensions", "extensions", ["MCP connections"]],
  ["panel-memory", "memory", ["Memory", "Review suggestions before saving."]],
  ["panel-notes", "notes", ["Notes", "New note"]],
  ["desk-bittensor", "bittensor", ["Bittensor desk"]],
  ["desk-hyperliquid", "hyperliquid", ["Hyperliquid desk"]],
  ["desk-polymarket", "polymarket", ["Polymarket desk"]],
  ["desk-sui", "sui", ["Sui desk"]],
];

const chatSurfaceMarkers = [
  "Cautious",
  "Perspective",
  "Start work",
  "Choose a desk to begin",
];

function workspaceId() {
  const match = new URL(baseUrl).pathname.match(/^\/workspace\/([^/]+)/);
  if (!match?.[1]) throw new Error(`Workspace id is missing from ${baseUrl}`);
  return decodeURIComponent(match[1]);
}

function workspaceUrl(suffix = "session", query = "") {
  const url = new URL(baseUrl);
  url.pathname = `/workspace/${encodeURIComponent(workspaceId())}/${suffix.replace(/^\/+/, "")}`;
  url.search = query;
  url.hash = "";
  return url.toString();
}

function launchPolicyFallbackForSurface(id) {
  if (
    id.endsWith("settings-billing")
    || id.endsWith("settings-generated-media")
    || id.endsWith("settings-cloud-account")
  ) {
    return workspaceUrl("settings/overview");
  }
  return null;
}

function classifyControl(label, disabled, element) {
  if (disabled) return { classification: "unavailable", skippedReason: "disabled in this runtime/state" };
  if (/delete|remove|disconnect|forget|uninstall|reset|reject|revoke|clear data|sign out/i.test(label)) {
    return { classification: "destructive", skippedReason: "destructive state change" };
  }
  if (/approve|sign|submit|pay|checkout|subscribe|purchase|connect wallet|start trial|upgrade/i.test(label)) {
    return { classification: "financial-or-external", skippedReason: "financial, signer, or external side effect" };
  }
  if (/docs|feedback|discord|report issue|open folder|open outputs|download|support report/i.test(label)) {
    return { classification: "external-or-download", skippedReason: "opens another app/site or downloads a file" };
  }
  if (element === "input" || /toggle|switch|theme|language|auto |reasoning|channel/i.test(label)) {
    return { classification: "stateful", skippedReason: "covered by focused state tests or preserved user preference" };
  }
  return { classification: "safe-control", skippedReason: "inventoried; exercised when part of an audited journey" };
}

async function visibleMarker(page, markers, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    for (const marker of markers) {
      const locator = page.getByText(marker, { exact: true });
      const count = await locator.count();
      for (let index = 0; index < count; index += 1) {
        if (await locator.nth(index).isVisible()) return marker;
      }
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`None of these markers became visible: ${markers.join(", ")}`);
}

function isTransientBrowserNetworkError(value) {
  return /ERR_NETWORK_CHANGED/i.test(String(value));
}

async function gotoWithTransientRetry(page, url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await page.goto(url, options);
    } catch (error) {
      lastError = error;
      if (!isTransientBrowserNetworkError(error) || attempt === 3) throw error;
      await page.waitForTimeout(500 * attempt);
    }
  }
  throw lastError;
}

async function openOverviewSecondaryControls(page) {
  const quickJot = page.getByRole("button", { name: "Quick Jot", exact: true });
  if (await quickJot.isVisible().catch(() => false)) return;

  const disclosure = page.getByRole("button", { name: /More workspace controls/i });
  await disclosure.waitFor({ state: "visible", timeout: 20_000 });
  await clickUnique(disclosure, "More workspace controls");
  const workAndEvidence = page.getByRole("button", { name: /Work & evidence/i });
  await workAndEvidence.waitFor({ state: "visible", timeout: 20_000 });
  await clickUnique(workAndEvidence, "Work & evidence");
  await quickJot.waitFor({ state: "visible", timeout: 20_000 });
}

async function waitForChatComposer(page, timeoutMs = 20_000) {
  // Compact layouts collapse the visual label, but retain the named control users operate.
  const group = page.getByRole("radiogroup", { name: "Response perspective", exact: true });
  await group.waitFor({ state: "visible", timeout: timeoutMs });
  await group.scrollIntoViewIfNeeded();
  if (await group.count() !== 1) {
    throw new Error("Response perspective selector is missing or duplicated.");
  }
  return group;
}

async function waitForVisualSettle(page, timeoutMs = 2_000) {
  await page.waitForFunction(
    () => !document.getAnimations().some((animation) => {
      if (animation.playState !== "running") return false;
      const endTime = animation.effect?.getComputedTiming().endTime;
      return typeof endTime === "number" && Number.isFinite(endTime) && endTime > 0;
    }),
    undefined,
    { timeout: timeoutMs },
  ).catch(() => {});
}

async function inspectSurface(page, report, id, url, markers, viewportName) {
  const startedAt = Date.now();
  try {
    await gotoWithTransientRetry(page, url, { waitUntil: "load", timeout: 30_000 });
    await page.locator("#root").waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForFunction(
      () => (document.querySelector("#root")?.childElementCount ?? 0) > 0,
      undefined,
      { timeout: 20_000 },
    );
    const launchPolicyFallback = launchPolicyFallbackForSurface(id);
    let marker;
    let hiddenByLaunchPolicy = false;
    try {
      // Check the requested surface before looking for its fallback. "Overview"
      // also lives in the persistent sidebar, so looking for it first can turn a
      // still-loading but available launch-gated page into a false redirect.
      marker = await visibleMarker(page, markers, launchPolicyFallback ? 7_500 : 20_000);
    } catch (error) {
      if (!launchPolicyFallback || page.url() !== launchPolicyFallback) throw error;
      marker = await visibleMarker(page, ["Overview"]);
      hiddenByLaunchPolicy = true;
    }
    if (id.endsWith("settings-overview")) {
      await openOverviewSecondaryControls(page);
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll("button")).some(
          (button) => button.textContent?.trim() === "Quick Jot" && !button.disabled,
        ),
        undefined,
        { timeout: 20_000 },
      );
    }
    if (id.endsWith("settings-wallet")) {
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll("button")).some(
          (button) => button.textContent?.trim() === "Save policy" && !button.disabled,
        ),
        undefined,
        { timeout: 20_000 },
      );
    }
    if (id.endsWith("settings-preferences")) {
      await page.waitForFunction(
        () => {
          const autoCompactSwitch = Array.from(document.querySelectorAll('[role="switch"]')).find(
            (element) => element.getAttribute("aria-label") === "Auto context compaction",
          );
          return Boolean(
            autoCompactSwitch
              && !autoCompactSwitch.matches(":disabled")
              && autoCompactSwitch.getAttribute("aria-disabled") !== "true",
          );
        },
        undefined,
        { timeout: 20_000 },
      );
    }
    if (id.endsWith("panel-memory")) {
      await page.waitForTimeout(250);
      await page.waitForFunction(
        () => ["Refresh saved memories", "Refresh memory review"].every((label) => {
          const button = Array.from(document.querySelectorAll("button")).find(
            (candidate) => candidate.getAttribute("aria-label") === label,
          );
          return Boolean(button && !button.disabled);
        }),
        undefined,
        { timeout: 20_000 },
      );
      await page.waitForFunction(
        () => !["Could not load memory", "Could not load memory review"].some((message) =>
          document.body.textContent?.includes(message),
        ),
        undefined,
        { timeout: 20_000 },
      );
    }
    if (id.endsWith("desk-chat")) {
      await waitForChatComposer(page);
    }
    await waitForVisualSettle(page);
    const inspection = await page.evaluate(() => {
      const visible = (element) => {
        if (element.getAttribute("aria-hidden") === "true") return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const controls = Array.from(document.querySelectorAll("button, a[href], input, select, textarea"))
        .filter(visible)
        .slice(0, 250)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const text = (element.getAttribute("aria-label")
            || element.getAttribute("title")
            || element.textContent
            || element.getAttribute("placeholder")
            || element.getAttribute("name")
            || element.tagName).replace(/\s+/g, " ").trim().slice(0, 180);
          return {
            element: element.tagName.toLowerCase(),
            label: text || element.tagName.toLowerCase(),
            disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true",
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            clipped: element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1,
          };
        });
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentWidth: document.documentElement.scrollWidth,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        controls,
      };
    });
    const controls = inspection.controls.map((control) => ({
      ...control,
      ...classifyControl(control.label, control.disabled, control.element),
    }));
    if (inspection.horizontalOverflow) {
      report.issues.push({ severity: "P1", surface: id, category: "responsive", message: "Page has horizontal overflow." });
    }
    report.controls.push(...controls.map((control) => ({ surface: id, viewport: viewportName, ...control })));
    report.surfaces.push({
      id,
      viewport: viewportName,
      url: page.url(),
      marker,
      status: "pass",
      launchPolicy: hiddenByLaunchPolicy ? "hidden_by_launch_policy" : "visible",
      durationMs: Date.now() - startedAt,
      horizontalOverflow: inspection.horizontalOverflow,
      controlCount: controls.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostic = await page.evaluate(() => ({
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
      rootText: (document.querySelector("#root")?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 2_000),
    })).catch(() => null);
    const failureShot = resolve(outputDir, `${id}-failure.png`);
    await page.screenshot({ path: failureShot, fullPage: true }).then(() => {
      report.screenshots.push(failureShot);
    }).catch(() => {});
    report.surfaces.push({
      id,
      viewport: viewportName,
      url,
      status: "fail",
      durationMs: Date.now() - startedAt,
      error: message,
      diagnostic,
    });
    report.issues.push({ severity: "P0", surface: id, category: "journey", message });
  }
  if (surfacePaceMs > 0) {
    await page.waitForTimeout(surfacePaceMs);
  }
}

async function recordInteraction(report, id, action) {
  const startedAt = Date.now();
  try {
    await action();
    report.interactions.push({ id, status: "pass", durationMs: Date.now() - startedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.interactions.push({ id, status: "fail", durationMs: Date.now() - startedAt, error: message });
    report.issues.push({ severity: "P1", surface: id, category: "interaction", message });
  }
}

async function clickUnique(locator, label) {
  const count = await locator.count();
  if (count !== 1) throw new Error(`${label} expected one visible target, found ${count}.`);
  await locator.click();
}

async function discoverProductSmokeReports() {
  const reportsRoot = resolve(repoRoot, "qa-reports");
  try {
    const entries = await readdir(reportsRoot, { withFileTypes: true });
    const candidates = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && (
          entry.name.startsWith("matterhorn-product-browser-smoke")
          || entry.name.endsWith("product-smoke")
        ))
        .map(async (entry) => {
          const path = resolve(reportsRoot, entry.name, "summary.json");
          try {
            return { path, modifiedAt: (await stat(path)).mtimeMs };
          } catch {
            return null;
          }
        }),
    );
    return candidates
      .filter(Boolean)
      .sort((left, right) => right.modifiedAt - left.modifiedAt)
      .map((entry) => entry.path);
  } catch {
    return [];
  }
}

async function productSmokeReportCandidates() {
  const explicitReport = process.env.MATTERHORN_FULL_AUDIT_PRODUCT_REPORT;
  const discoveredReports = await discoverProductSmokeReports();
  return [...new Set([
    explicitReport,
    ...discoveredReports,
    "qa-reports/matterhorn-product-browser-smoke-perspectives/summary.json",
    "qa-reports/matterhorn-product-browser-smoke/summary.json",
  ].filter(Boolean))];
}

async function latestSmokeAuth() {
  const explicitEmail = process.env.MATTERHORN_FULL_AUDIT_AUTH_EMAIL?.trim();
  const explicitPassword = process.env.MATTERHORN_FULL_AUDIT_AUTH_PASSWORD;
  if (explicitEmail && explicitPassword) return { email: explicitEmail, password: explicitPassword };

  for (const candidate of await productSmokeReportCandidates()) {
    try {
      const report = JSON.parse(await readFile(resolve(repoRoot, candidate), "utf8"));
      const auth = report?.artifacts?.auth;
      if (report?.ready === true && auth?.freshAccount === true && typeof auth.email === "string") {
        return {
          email: auth.email,
          password: "matterhorn-product-smoke-password",
        };
      }
    } catch {
      // Try the next local smoke report.
    }
  }
  return null;
}

async function authenticateAuditContext(context) {
  const credentials = await latestSmokeAuth();
  if (!credentials) return false;

  const origin = new URL(baseUrl).origin;
  const response = await context.request.post(
    new URL("/api/auth/sign-in/email", origin).toString(),
    { data: credentials },
  );
  if (!response.ok()) {
    throw new Error(`Full-platform audit sign-in failed (${response.status()}).`);
  }

  const session = await context.request.get(new URL("/api/den/v1/me", origin).toString());
  if (!session.ok()) {
    throw new Error(`Full-platform audit session verification failed (${session.status()}).`);
  }
  return true;
}

function reportSessionUrl(report) {
  if (report?.ready !== true) return null;
  const sessions = report?.artifacts?.startedDeskTaskSessions;
  const value = sessions && Object.values(sessions).find((url) => typeof url === "string");
  if (!value) return null;

  try {
    const candidate = new URL(value);
    const expected = new URL(baseUrl);
    const expectedPrefix = `/workspace/${encodeURIComponent(workspaceId())}/session/`;
    if (candidate.origin !== expected.origin || !candidate.pathname.startsWith(expectedPrefix)) return null;
    return candidate.toString();
  } catch {
    return null;
  }
}

async function latestSmokeSessionUrl() {
  const explicitChatUrl = process.env.MATTERHORN_FULL_AUDIT_CHAT_URL;
  if (explicitChatUrl) {
    const candidate = new URL(explicitChatUrl);
    const expected = new URL(baseUrl);
    const expectedPrefix = `/workspace/${encodeURIComponent(workspaceId())}/session/`;
    if (candidate.origin !== expected.origin || !candidate.pathname.startsWith(expectedPrefix)) {
      throw new Error("MATTERHORN_FULL_AUDIT_CHAT_URL must point to a session in the audited workspace and app origin.");
    }
    return candidate.toString();
  }

  for (const candidate of await productSmokeReportCandidates()) {
    try {
      const report = JSON.parse(await readFile(resolve(repoRoot, candidate), "utf8"));
      const value = reportSessionUrl(report);
      if (value) return value;
    } catch {
      // Try the next local smoke report.
    }
  }
  return null;
}

function isAuditedSessionUrl(value) {
  try {
    const candidate = new URL(value);
    const expected = new URL(baseUrl);
    const expectedPrefix = `/workspace/${encodeURIComponent(workspaceId())}/session/`;
    return candidate.origin === expected.origin && candidate.pathname.startsWith(expectedPrefix);
  } catch {
    return false;
  }
}

async function ensureAuditChat(page, report, existingChatUrl) {
  if (existingChatUrl) return existingChatUrl;

  await gotoWithTransientRetry(page, workspaceUrl("session"), { waitUntil: "load", timeout: 30_000 });
  await visibleMarker(page, ["Open a desk", "Wallet readiness"]);
  const home = page.getByLabel("Workspace home");
  const newChat = home.getByRole("button", { name: "New chat", exact: true });
  await clickUnique(newChat, "Workspace home New chat");
  await page.waitForURL((url) => isAuditedSessionUrl(url.toString()), { timeout: 20_000 });
  await waitForChatComposer(page);
  const chatUrl = page.url();
  report.auditArtifacts.push({
    kind: "blank_chat",
    source: "workspace_home_new_chat",
    url: chatUrl,
  });
  return chatUrl;
}

async function generatedMediaChatControlAvailable(page, report) {
  const generateImage = page.getByRole("button", { name: "Generate image", exact: true });
  if (await generateImage.waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false)) return true;

  const requestedUrl = workspaceUrl("settings/generated-media");
  const fallbackUrl = launchPolicyFallbackForSurface("settings-generated-media");
  await gotoWithTransientRetry(page, requestedUrl, { waitUntil: "load", timeout: 30_000 });
  const marker = await visibleMarker(page, ["Production readiness", "Overview"]);
  if (marker !== "Overview" || page.url() !== fallbackUrl) {
    throw new Error("Generate image is absent even though Generated Media remains available in Settings.");
  }
  report.launchPolicies.push({
    surface: "chat-generated-media-control",
    status: "hidden_by_launch_policy",
    requestedUrl,
    resolvedUrl: page.url(),
  });
  return false;
}

async function inspectResponsiveSurfaceCatalog(page, report, prefix, viewportName, chatUrl) {
  await inspectSurface(
    page,
    report,
    `${prefix}workspace-home`,
    workspaceUrl("session"),
    ["Open a desk", "Wallet readiness"],
    viewportName,
  );
  await inspectSurface(
    page,
    report,
    `${prefix}project-history`,
    workspaceUrl("history"),
    ["Project history"],
    viewportName,
  );
  for (const [id, suffix, markers] of settingsSurfaces) {
    await inspectSurface(page, report, `${prefix}${id}`, workspaceUrl(suffix), markers, viewportName);
  }
  for (const [id, panel, markers] of panelSurfaces) {
    await inspectSurface(
      page,
      report,
      `${prefix}${id}`,
      workspaceUrl("session", `?panel=${panel}`),
      markers,
      viewportName,
    );
  }
  if (chatUrl) {
    await inspectSurface(page, report, `${prefix}desk-chat`, chatUrl, chatSurfaceMarkers, viewportName);
  } else {
    report.issues.push({
      severity: "P1",
      surface: `${prefix}desk-chat`,
      category: "coverage",
      message: `No current smoke-created chat URL was available for ${viewportName} verification.`,
    });
  }
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  const report = {
    version: "matterhorn.full-platform-browser-audit.v1",
    startedAt: new Date().toISOString(),
    baseUrl,
    surfaces: [],
    interactions: [],
    controls: [],
    issues: [],
    consoleErrors: [],
    pageErrors: [],
    networkFailures: [],
    screenshots: [],
    launchPolicies: [],
    auditArtifacts: [],
  };
  const browser = await chromium.launch({ headless: true });
  activeBrowser = browser;
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  await authenticateAuditContext(desktop);
  const page = await desktop.newPage();

  const attachDiagnostics = (target) => {
    target.on("console", (message) => {
      if (
        message.type() === "error"
        && !/Failed to load resource.*404/i.test(message.text())
        && !isTransientBrowserNetworkError(message.text())
      ) {
        report.consoleErrors.push({ url: target.url(), message: message.text() });
      }
    });
    target.on("pageerror", (error) => report.pageErrors.push({ url: target.url(), message: error.message }));
    target.on("response", (response) => {
      const status = response.status();
      if (status < 400) return;
      const url = response.url();
      const pathname = (() => { try { return new URL(url).pathname; } catch { return ""; } })();
      if (status === 404 && /\.(png|svg|ico|woff2?)$/i.test(pathname)) return;
      if (status >= 500 || pathname.startsWith("/api/") || pathname.startsWith("/workspace/")) {
        report.networkFailures.push({ status, method: response.request().method(), url });
      }
    });
  };
  attachDiagnostics(page);
  let chatUrl = await latestSmokeSessionUrl();

  await inspectSurface(page, report, "workspace-home", workspaceUrl("session"), ["Open a desk", "Wallet readiness"], "desktop");
  await recordInteraction(report, "home-new-project-dialog", async () => {
    await gotoWithTransientRetry(page, workspaceUrl("session"), { waitUntil: "load" });
    await visibleMarker(page, ["Open a desk"]);
    const home = page.getByLabel("Workspace home");
    await clickUnique(home.getByRole("button", { name: "New project", exact: true }), "Workspace home New project");
    await visibleMarker(page, ["Create project", "Add a project", "New project"]);
    const close = page.getByRole("button", { name: "Close", exact: true });
    if (await close.count() === 1) await close.click(); else await page.keyboard.press("Escape");
  });
  await recordInteraction(report, "home-jot-note-dialog", async () => {
    await gotoWithTransientRetry(page, workspaceUrl("session"), { waitUntil: "load" });
    await visibleMarker(page, ["Open a desk"]);
    await clickUnique(page.getByRole("button", { name: "Jot a note", exact: true }), "Jot a note");
    await visibleMarker(page, ["Quick note", "Jot a note", "Save note"]);
    await page.keyboard.press("Escape");
  });
  await recordInteraction(report, "command-palette", async () => {
    await gotoWithTransientRetry(page, workspaceUrl("session"), { waitUntil: "load" });
    await page.keyboard.press("Meta+KeyK");
    await visibleMarker(page, ["Go home", "New chat"]);
    await page.keyboard.press("Escape");
  });
  await recordInteraction(report, "sidebar-collapse-expand", async () => {
    await gotoWithTransientRetry(page, workspaceUrl("session"), { waitUntil: "load" });
    await visibleMarker(page, ["Open a desk"]);
    const toggle = page.getByRole("button", { name: "Toggle Sidebar", exact: true });
    await clickUnique(toggle, "Toggle Sidebar");
    await clickUnique(toggle, "Toggle Sidebar");
  });
  chatUrl = await ensureAuditChat(page, report, chatUrl);

  await inspectSurface(page, report, "project-history", workspaceUrl("history"), ["Project history"], "desktop");
  for (const [id, suffix, markers] of settingsSurfaces) {
    await inspectSurface(page, report, id, workspaceUrl(suffix), markers, "desktop");
  }
  await recordInteraction(report, "customization-visibility-controls", async () => {
    const openCustomization = async () => {
      await gotoWithTransientRetry(page, workspaceUrl("settings/shell"), { waitUntil: "load" });
      await visibleMarker(page, ["Customization", "Layout"]);
      const modelPicker = page.getByRole("switch", { name: "Display model picker", exact: true });
      const newWorkspace = page.getByRole("switch", { name: "Display new workspace button", exact: true });
      if (await modelPicker.count() !== 1 || await newWorkspace.count() !== 1) {
        throw new Error("Working Customization visibility controls are missing or duplicated.");
      }
      return { modelPicker, newWorkspace };
    };

    const initial = await openCustomization();
    const initiallyShowingModelPicker = await initial.modelPicker.isChecked();
    const initiallyShowingNewWorkspace = await initial.newWorkspace.isChecked();
    try {
      await initial.modelPicker.setChecked(false);
      await initial.newWorkspace.setChecked(false);

      await gotoWithTransientRetry(page, workspaceUrl("session"), { waitUntil: "load" });
      await visibleMarker(page, ["Open a desk", "Wallet readiness"]);
      const hiddenWorkspaceAction = page.locator('[data-sidebar="footer"]').getByRole("button", { name: "New project", exact: true });
      if (await hiddenWorkspaceAction.count() !== 0) throw new Error("New project sidebar action stayed visible after being hidden.");

      if (!chatUrl) throw new Error("A smoke-created chat is required to verify model picker visibility.");
      await gotoWithTransientRetry(page, chatUrl, { waitUntil: "load" });
      await waitForChatComposer(page);
      const hiddenModelPicker = page.getByRole("button", { name: /^Change model/ });
      if (await hiddenModelPicker.isVisible().catch(() => false)) {
        throw new Error("Model picker stayed visible after being hidden.");
      }
      const composer = page.getByRole("textbox", { name: /Ask Matterhorn/i });
      const composerEditable = await composer.isEditable().catch(() => false);
      let composerUnavailable = !composerEditable;
      if (composerEditable) {
        await composer.fill("Verify the current connected model remains usable.");
        composerUnavailable = await page.getByRole("button", { name: "Ask", exact: true })
          .isDisabled()
          .catch(() => false);
        await composer.fill("");
      }
      if (composerUnavailable
        && !await page.getByRole("button", { name: "Connect a model", exact: true }).isVisible().catch(() => false)) {
        throw new Error("A hidden model picker left no clear model recovery action.");
      }
    } finally {
      const restore = await openCustomization();
      await restore.modelPicker.setChecked(initiallyShowingModelPicker);
      await restore.newWorkspace.setChecked(initiallyShowingNewWorkspace);
    }

    await gotoWithTransientRetry(page, workspaceUrl("session"), { waitUntil: "load" });
    await visibleMarker(page, ["Open a desk", "Wallet readiness"]);
    const restoredWorkspaceAction = page.locator('[data-sidebar="footer"]').getByRole("button", { name: "New project", exact: true });
    const restoredWorkspaceVisible = await restoredWorkspaceAction.isVisible().catch(() => false);
    if (restoredWorkspaceVisible !== initiallyShowingNewWorkspace) {
      throw new Error("New project sidebar action did not return to its original visibility setting.");
    }

    await gotoWithTransientRetry(page, chatUrl, { waitUntil: "load" });
    await waitForChatComposer(page);
    const restoredModelPickerVisible = await page.getByRole("button", { name: /^Change model/ }).isVisible().catch(() => false);
    const restoredRecoveryVisible = await page.getByRole("button", { name: "Connect a model", exact: true }).isVisible().catch(() => false);
    if (initiallyShowingModelPicker && !restoredModelPickerVisible && !restoredRecoveryVisible) {
      throw new Error("Model controls did not return after restoring their original visibility setting.");
    }
    if (!initiallyShowingModelPicker && restoredModelPickerVisible) {
      throw new Error("Model picker became visible even though the original preference kept it hidden.");
    }
  });
  await recordInteraction(report, "settings-overview-quick-jot", async () => {
    await gotoWithTransientRetry(page, workspaceUrl("settings/overview"), { waitUntil: "load" });
    await visibleMarker(page, ["Workspace health", "Data & privacy"]);
    await openOverviewSecondaryControls(page);
    const quickJot = page.getByRole("button", { name: "Quick Jot", exact: true });
    await quickJot.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Quick Jot" && !button.disabled,
      ),
      undefined,
      { timeout: 20_000 },
    );
    await clickUnique(quickJot, "Settings Overview Quick Jot");
    await page.getByPlaceholder("Note title", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    await page.keyboard.press("Escape");
  });
  await recordInteraction(report, "settings-overview-evidence-navigation", async () => {
    await gotoWithTransientRetry(page, workspaceUrl("settings/overview"), { waitUntil: "load" });
    await visibleMarker(page, ["Workspace health", "Data & privacy"]);
    await openOverviewSecondaryControls(page);
    const openNotes = page.getByRole("button", { name: "Open notes", exact: true });
    await openNotes.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Open notes" && !button.disabled,
      ),
      undefined,
      { timeout: 20_000 },
    );
    await clickUnique(openNotes, "Settings Overview Open notes");
    await page.waitForURL(workspaceUrl("session", "?panel=notes"), { timeout: 10_000 });
    await visibleMarker(page, ["Notes"]);

    await gotoWithTransientRetry(page, workspaceUrl("settings/overview"), { waitUntil: "load" });
    await visibleMarker(page, ["Workspace health", "Data & privacy"]);
    await openOverviewSecondaryControls(page);
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Open Memory review" && !button.disabled,
      ),
      undefined,
      { timeout: 20_000 },
    );
    const memoryActions = page.getByRole("button", { name: "Open Memory review", exact: true });
    const memoryActionCount = await memoryActions.count();
    if (memoryActionCount < 1) throw new Error("Settings Overview Open Memory review is missing.");
    await memoryActions.nth(0).click();
    await page.waitForURL(workspaceUrl("session", "?panel=memory"), { timeout: 10_000 });
    await visibleMarker(page, ["Memory review"]);
  });
  await recordInteraction(report, "mcp-rail-availability-and-disclosure", async () => {
    await gotoWithTransientRetry(page, workspaceUrl("session", "?panel=extensions"), { waitUntil: "load" });
    await visibleMarker(page, ["MCP connections"]);
    const configuredServer = page.getByText("Matterhorn Desks MCP", { exact: true });
    const connectedServerSummary = page.locator('[aria-label^="Connected MCP servers:"]');
    const emptySummary = page.getByText("No external MCPs connected.", { exact: true });
    await page.waitForFunction(
      () => Boolean(
        document.querySelector('[aria-label^="Connected MCP servers:"]')
        || Array.from(document.querySelectorAll("*")).some((element) => {
          const text = element.textContent?.trim();
          return text === "Matterhorn Desks MCP" || text === "No external MCPs connected.";
        }),
      ),
      undefined,
      { timeout: 20_000 },
    );
    const connectedSummaryCount = await connectedServerSummary.count();
    const connectedSummaryLabel = connectedSummaryCount > 0
      ? await connectedServerSummary.first().getAttribute("aria-label")
      : null;
    if (connectedSummaryLabel?.startsWith("Connected MCP servers:")) {
      const connectedNames = connectedSummaryLabel
        .replace(/^Connected MCP servers:\s*/, "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      if (connectedNames.length === 0) {
        throw new Error("Connected MCP summary did not name any servers.");
      }
      const readyCount = await page.getByText("Ready", { exact: true }).count();
      if (readyCount < connectedNames.length) {
        throw new Error("Not every connected MCP server is visibly ready.");
      }
    } else if (await configuredServer.isVisible().catch(() => false)) {
      await page.getByText("Ready", { exact: true })
        .waitFor({ state: "visible", timeout: 20_000 });
    } else {
      await emptySummary.waitFor({ state: "visible", timeout: 20_000 });
    }
    if (await page.getByText("Available MCPs & connectors", { exact: true }).count() !== 0) {
      throw new Error("Embedded MCP rail exposed the full connector catalog.");
    }
    await clickUnique(page.getByRole("button", { name: "Manage MCPs", exact: true }), "Manage MCPs");
    await page.waitForURL(workspaceUrl("settings/extensions"), { timeout: 10_000 });
    await visibleMarker(page, ["Matterhorn MCPs"]);
  });
  for (const [id, panel, markers] of panelSurfaces) {
    await inspectSurface(page, report, id, workspaceUrl("session", `?panel=${panel}`), markers, "desktop");
  }
  await recordInteraction(report, "stale-session-recovery", async () => {
    await gotoWithTransientRetry(page, workspaceUrl("session/ses_missing_browser_audit"), { waitUntil: "load" });
    await visibleMarker(page, ["Chat no longer available"]);
    await page.waitForURL(workspaceUrl("session"), { timeout: 10_000 });
    await visibleMarker(page, ["Open a desk", "Wallet readiness"]);
    const staleDeskHeading = page.getByRole("heading", { name: "Sui desk", exact: true });
    if (await staleDeskHeading.isVisible().catch(() => false)) {
      throw new Error("Recovered stale chat reopened the previously focused desk instead of Project Home.");
    }
  });

  if (chatUrl) {
    await inspectSurface(page, report, "desk-chat", chatUrl, chatSurfaceMarkers, "desktop");
    await recordInteraction(report, "session-model-provider-recovery", async () => {
      await gotoWithTransientRetry(page, chatUrl, { waitUntil: "load" });
      await waitForChatComposer(page);

      const recovery = page.getByRole("button", { name: "Connect a model", exact: true });
      if (!await recovery.isVisible().catch(() => false)) return;

      await clickUnique(recovery, "Connect a model recovery");
      await page.waitForURL(workspaceUrl("settings/ai"), { timeout: 10_000 });
      await visibleMarker(page, ["Models", "Model provider setup"]);
    });
    await recordInteraction(report, "response-perspective-controls", async () => {
      await gotoWithTransientRetry(page, chatUrl, { waitUntil: "load" });
      const group = await waitForChatComposer(page);
      for (const label of ["Cautious", "Balanced", "Optimistic"]) {
        const radio = group.getByRole("radio", { name: label, exact: true });
        await clickUnique(radio, `${label} perspective`);
        if (!await radio.isChecked()) throw new Error(`${label} perspective did not become selected.`);
      }
    });
    await recordInteraction(report, "generate-image-panel", async () => {
      await gotoWithTransientRetry(page, chatUrl, { waitUntil: "load" });
      if (!await generatedMediaChatControlAvailable(page, report)) return;
      await clickUnique(page.getByRole("button", { name: "Generate image", exact: true }), "Generate image");
      await visibleMarker(page, [
        "Create image",
        "Recent images",
        "Generated image",
        "Image generation requires Matterhorn setup. Review its status in Settings.",
      ]);
      await page.keyboard.press("Escape");
    });
  } else {
    report.issues.push({ severity: "P1", surface: "desk-chat", category: "coverage", message: "No current smoke-created chat URL was available." });
  }

  const cloudAccountUrl = workspaceUrl("settings/cloud-account");
  const cloudAccountFallback = launchPolicyFallbackForSurface("settings-cloud-account");
  await gotoWithTransientRetry(page, cloudAccountUrl, { waitUntil: "load" });
  const cloudAccountMarker = await visibleMarker(page, ["Account", "Matterhorn Cloud", "Overview"]);
  const cloudAccountHidden = cloudAccountMarker === "Overview";
  if (cloudAccountHidden && page.url() !== cloudAccountFallback) {
    throw new Error(`Hidden Cloud Account route resolved to ${page.url()} instead of ${cloudAccountFallback}.`);
  }
  await waitForVisualSettle(page);
  const desktopShot = resolve(
    outputDir,
    cloudAccountHidden ? "desktop-settings-overview-launch-policy.png" : "desktop-settings-cloud-account.png",
  );
  await page.screenshot({ path: desktopShot, fullPage: true });
  report.screenshots.push(desktopShot);
  await desktop.close();

  const responsiveViewportFilter = new Set(
    (process.env.MATTERHORN_FULL_AUDIT_RESPONSIVE_VIEWPORTS ?? "compact-laptop,tablet,mobile")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const responsiveViewports = [
    { prefix: "compact-", name: "compact-laptop", width: 1280, height: 800 },
    { prefix: "tablet-", name: "tablet", width: 820, height: 1180 },
    { prefix: "mobile-", name: "mobile", width: 390, height: 844 },
  ].filter((viewport) => responsiveViewportFilter.has(viewport.name));
  for (const viewport of responsiveViewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      acceptDownloads: true,
    });
    await authenticateAuditContext(context);
    const responsivePage = await context.newPage();
    attachDiagnostics(responsivePage);
    await inspectResponsiveSurfaceCatalog(
      responsivePage,
      report,
      viewport.prefix,
      viewport.name,
      chatUrl,
    );

    await responsivePage.goto(cloudAccountUrl, { waitUntil: "load" });
    const responsiveCloudMarker = await visibleMarker(responsivePage, ["Account", "Matterhorn Cloud", "Overview"]);
    const responsiveCloudHidden = responsiveCloudMarker === "Overview";
    if (responsiveCloudHidden && responsivePage.url() !== cloudAccountFallback) {
      throw new Error(`Hidden Cloud Account route resolved to ${responsivePage.url()} instead of ${cloudAccountFallback}.`);
    }
    await waitForVisualSettle(responsivePage);
    const accountShot = resolve(
      outputDir,
      responsiveCloudHidden
        ? `${viewport.name}-settings-overview-launch-policy.png`
        : `${viewport.name}-settings-cloud-account.png`,
    );
    await responsivePage.screenshot({ path: accountShot, fullPage: true });
    report.screenshots.push(accountShot);

    if (chatUrl) {
      await responsivePage.goto(chatUrl, { waitUntil: "load" });
      await waitForChatComposer(responsivePage);
      await waitForVisualSettle(responsivePage);
      const chatShot = resolve(outputDir, `${viewport.name}-desk-chat.png`);
      await responsivePage.screenshot({ path: chatShot, fullPage: true });
      report.screenshots.push(chatShot);
    }
    await context.close();
  }
  await browser.close();
  activeBrowser = null;

  for (const error of report.consoleErrors) {
    report.issues.push({ severity: "P1", surface: error.url, category: "console", message: error.message });
  }
  for (const error of report.pageErrors) {
    report.issues.push({ severity: "P0", surface: error.url, category: "runtime", message: error.message });
  }
  for (const failure of report.networkFailures) {
    report.issues.push({ severity: "P1", surface: failure.url, category: "network", message: `${failure.method} returned ${failure.status}` });
  }

  report.finishedAt = new Date().toISOString();
  report.summary = {
    ready: report.surfaces.every((item) => item.status === "pass")
      && report.interactions.every((item) => item.status === "pass")
      && report.issues.every((item) => item.severity !== "P0" && item.severity !== "P1"),
    surfaceCount: report.surfaces.length,
    interactionCount: report.interactions.length,
    controlCount: report.controls.length,
    controlsByClass: Object.fromEntries(
      Object.entries(Object.groupBy(report.controls, (control) => control.classification))
        .map(([key, values]) => [key, values.length]),
    ),
    issueCount: report.issues.length,
    issuesBySeverity: Object.fromEntries(
      Object.entries(Object.groupBy(report.issues, (issue) => issue.severity))
        .map(([key, values]) => [key, values.length]),
    ),
  };
  const reportPath = resolve(outputDir, "summary.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ reportPath, ...report.summary }, null, 2));
  if (strict && !report.summary.ready) process.exitCode = 1;
}

if (process.argv.includes("--help")) {
  printHelp();
} else {
  run().catch(async (error) => {
    console.error(error);
    await activeBrowser?.close().catch(() => {});
    activeBrowser = null;
    process.exitCode = 1;
  });
}
