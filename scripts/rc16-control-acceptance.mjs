#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const repoRoot = resolve(import.meta.dirname, "..");
const DEFAULT_URL = "http://127.0.0.1:5212/workspace/ws_9d76fd6566f5/session";
const DEFAULT_CHAT_URL =
  "http://127.0.0.1:5212/workspace/ws_9d76fd6566f5/session/ses_06e1901f4ffekqyPdUCe1x6zCI";
const DEFAULT_OUTPUT_DIR = "qa-reports/rc16-control-acceptance";
const LEGACY_BRANDS = /\b(?:OpenWork|OpenCode|openwork)\b/i;

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set();
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [name, inlineValue] = arg.split("=", 2);
    if (inlineValue !== undefined) {
      values.set(name, inlineValue);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(name, next);
      index += 1;
      continue;
    }
    flags.add(name);
  }
  return {
    help: flags.has("--help") || flags.has("-h"),
    headed: flags.has("--headed") || process.env.MATTERHORN_RC16_HEADED === "1",
    json: flags.has("--json"),
    strict: flags.has("--strict") || process.env.MATTERHORN_RC16_STRICT === "1",
    url: values.get("--url") || process.env.MATTERHORN_RC16_URL || DEFAULT_URL,
    chatUrl:
      values.get("--chat-url") ||
      process.env.MATTERHORN_RC16_CHAT_URL ||
      DEFAULT_CHAT_URL,
    outputDir: resolve(
      repoRoot,
      values.get("--output-dir") ||
        process.env.MATTERHORN_RC16_OUTPUT_DIR ||
        DEFAULT_OUTPUT_DIR,
    ),
  };
}

function printHelp() {
  console.log(`Matterhorn Desks RC16 control acceptance

Usage:
  node scripts/rc16-control-acceptance.mjs --strict

Options:
  --url <url>          Workspace session URL.
  --chat-url <url>     Existing chat URL used for non-destructive chat checks.
  --output-dir <dir>   Evidence directory.
  --strict             Exit nonzero if any automated case fails.
  --json               Print the full report.
  --headed             Show Chromium.

This runner verifies observed outcomes, restores preferences and draft text, and
does not connect real wallets, complete OAuth, download files, delete data, or
submit financial transactions. Those boundaries are recorded as owner gates.
`);
}

function workspaceId(appUrl) {
  const match = new URL(appUrl).pathname.match(/^\/workspace\/([^/]+)/);
  if (!match?.[1]) throw new Error(`Workspace id is missing from ${appUrl}`);
  return decodeURIComponent(match[1]);
}

function workspaceUrl(appUrl, suffix = "session", query = "") {
  const url = new URL(appUrl);
  url.pathname = `/workspace/${encodeURIComponent(workspaceId(appUrl))}/${suffix.replace(/^\/+/, "")}`;
  url.search = query;
  url.hash = "";
  return url.toString();
}

function visibleControlName(element) {
  return (
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    element.textContent ||
    element.getAttribute("placeholder") ||
    element.getAttribute("name") ||
    element.tagName
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function classifyControl(name, disabled) {
  if (disabled) return "unavailable";
  if (/delete|remove|disconnect|forget|revoke|clear data|sign out/i.test(name)) {
    return "destructive";
  }
  if (/connect wallet|approve|sign|submit|pay|checkout|subscribe|purchase|upgrade/i.test(name)) {
    return "owner-gated";
  }
  if (/download|open externally|docs|discord|report issue/i.test(name)) {
    return "external";
  }
  return "safe";
}

async function mounted(page) {
  await page.locator("#root").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForFunction(
    () => (document.querySelector("#root")?.childElementCount ?? 0) > 0,
    undefined,
    { timeout: 20_000 },
  );
}

async function settle(page, delay = 350) {
  await page.waitForTimeout(delay);
  await page
    .waitForFunction(
      () =>
        !document.getAnimations().some((animation) => {
          if (animation.playState !== "running") return false;
          const endTime = animation.effect?.getComputedTiming().endTime;
          return typeof endTime === "number" && Number.isFinite(endTime) && endTime > 0;
        }),
      undefined,
      { timeout: 1_500 },
    )
    .catch(() => {});
}

async function open(page, url) {
  await page.goto(url, { waitUntil: "load", timeout: 30_000 });
  await mounted(page);
  await settle(page, 1_100);
}

async function reload(page) {
  await page.reload({ waitUntil: "load", timeout: 30_000 });
  await mounted(page);
  await settle(page, 1_100);
}

async function waitForUrl(page, pattern, label) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && !pattern.test(page.url())) {
    await page.waitForTimeout(100);
  }
  await mounted(page);
  await settle(page, 700);
  if (!pattern.test(page.url())) {
    throw new Error(`${label}: expected ${pattern}, observed ${page.url()}.`);
  }
}

async function firstVisible(locator, label, timeout = 12_000) {
  const deadline = Date.now() + timeout;
  let count = 0;
  while (Date.now() < deadline) {
    count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible()) return candidate;
    }
    await locator.page().waitForTimeout(120);
  }
  throw new Error(`${label} is missing or not visible after ${timeout}ms (matched ${count}).`);
}

async function visibleOrNull(locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) return candidate;
  }
  return null;
}

async function clickVisible(locator, label) {
  const candidate = await firstVisible(locator, label);
  await candidate.click();
  await settle(candidate.page());
  return candidate;
}

async function ensureExpanded(page, locator, label) {
  const trigger = await firstVisible(locator, label);
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
    await settle(page);
  }
  return trigger;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function openOverviewControlGroup(page, title) {
  const main = page.locator("main");
  await ensureExpanded(
    page,
    main.getByRole("button", { name: /More workspace controls/i }),
    "More workspace controls",
  );
  await ensureExpanded(
    page,
    main.getByRole("button", {
      name: new RegExp(`^${escapeRegExp(title)}(?:\\s|$)`),
    }),
    title,
  );
}

async function openChat(page) {
  await open(page, workspaceUrl(config.url, "session"));
  const existingEditor = await visibleOrNull(
    page.locator('[contenteditable="true"]').first(),
  );
  if (existingEditor) return;

  await clickVisible(
    page.getByRole("button", { name: "New chat", exact: true }),
    "New chat",
  );
  await waitForUrl(page, /\/session\/[^/?]+(?:\?|$)/, "New chat");
  await firstVisible(
    page.locator('[contenteditable="true"]').first(),
    "chat composer",
  );
}

async function chatEditorOrRecovery(page) {
  const editor = await visibleOrNull(
    page.locator('[contenteditable="true"]').first(),
  );
  if (editor) return { editor, recovery: null };

  const recovery = await visibleOrNull(
    page.getByRole("button", { name: "Connect a model", exact: true }),
  );
  if (!recovery) {
    throw new Error(
      "Chat composer is unavailable and does not offer the Connect a model recovery action.",
    );
  }
  return { editor: null, recovery };
}

async function chatEditorOrVerifyRecovery(page, control) {
  const { editor, recovery } = await chatEditorOrRecovery(page);
  if (editor) return editor;

  await recovery.click();
  await waitForUrl(page, /\/settings\/ai(?:\?|$)/, `${control} model recovery`);
  await firstVisible(
    page.getByRole("button", { name: "Add provider", exact: true }),
    "Add provider recovery",
  );
  return null;
}

async function verifyChatProviderRecovery(page, control) {
  const recovery = await firstVisible(
    page.getByRole("button", { name: "Connect a model", exact: true }),
    `${control} model recovery`,
  );
  await recovery.click();
  await waitForUrl(page, /\/settings\/ai(?:\?|$)/, `${control} model recovery`);
  await firstVisible(
    page.getByRole("button", { name: "Add provider", exact: true }),
    "Add provider recovery",
  );
}

async function assertText(page, text) {
  await firstVisible(page.getByText(text, { exact: true }), `"${text}"`);
}

async function assertUrl(page, pattern, label) {
  if (!pattern.test(page.url())) {
    throw new Error(`${label}: expected ${pattern}, observed ${page.url()}.`);
  }
}

async function assertSingleMain(page) {
  const count = await page.locator("main").count();
  if (count !== 1) throw new Error(`Expected one main landmark, observed ${count}.`);
}

async function inventorySurface(page, report, id) {
  const controls = await page
    .locator("button, a[href], input, select, textarea, [role=switch], [role=radio]")
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          if (element.getAttribute("aria-hidden") === "true") return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        })
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          name:
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            element.textContent?.replace(/\s+/g, " ").trim() ||
            element.getAttribute("placeholder") ||
            element.getAttribute("name") ||
            element.tagName.toLowerCase(),
          disabled:
            element.matches(":disabled") ||
            element.getAttribute("aria-disabled") === "true",
          role: element.getAttribute("role"),
        })),
    );

  for (const control of controls) {
    const normalized = {
      surface: id,
      tag: control.tag,
      name: String(control.name).slice(0, 180),
      disabled: control.disabled,
      role: control.role,
    };
    report.inventory.push({
      ...normalized,
      classification: classifyControl(normalized.name, normalized.disabled),
    });
  }
}

function reportMarkdown(report) {
  const counts = report.cases.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const inventoryCounts = report.inventory.reduce(
    (acc, item) => {
      acc[item.classification] = (acc[item.classification] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const rows = report.cases
    .map(
      (item) =>
        `| ${item.id} | ${item.status.toUpperCase()} | ${item.control} | ${item.observed.replace(/\|/g, "\\|")} |`,
    )
    .join("\n");
  const ownerRows = report.ownerGates
    .map((item) => `| ${item.id} | ${item.control} | ${item.reason} |`)
    .join("\n");
  return `# Matterhorn Desks RC16 Control Acceptance

- Started: ${report.startedAt}
- Finished: ${report.finishedAt}
- URL: ${report.url}
- Automated: ${counts.pass ?? 0} passed, ${counts.fail ?? 0} failed
- Visible control inventory: ${report.inventory.length}
- Safe: ${inventoryCounts.safe ?? 0}
- Owner-gated: ${inventoryCounts["owner-gated"] ?? 0}
- External: ${inventoryCounts.external ?? 0}
- Destructive: ${inventoryCounts.destructive ?? 0}
- Unavailable: ${inventoryCounts.unavailable ?? 0}

## Automated Outcomes

| ID | Result | Control or journey | Observed outcome |
| --- | --- | --- | --- |
${rows}

## Owner Acceptance Boundaries

| ID | Control or journey | Why it is not automated against real accounts |
| --- | --- | --- |
${ownerRows}

## Browser Diagnostics

- Page errors: ${report.browserDiagnostics.pageErrors.length}
- Console errors: ${report.browserDiagnostics.consoleErrors.length}
- Failed requests: ${report.browserDiagnostics.requestFailures.length}

The release rule is outcome-based: a click without the expected state, route,
persistence, validation, dialog, or clipboard result is a failure.
`;
}

const config = parseArgs();
if (config.help) {
  printHelp();
  process.exit(0);
}

await mkdir(config.outputDir, { recursive: true });
const attachmentFixturePath = resolve(config.outputDir, "chat-attachment-fixture.txt");
await writeFile(
  attachmentFixturePath,
  "Matterhorn Desks chat attachment acceptance fixture.\n",
  "utf8",
);

const report = {
  name: "rc16-control-acceptance",
  startedAt: new Date().toISOString(),
  finishedAt: null,
  url: config.url,
  chatUrl: config.chatUrl,
  ready: false,
  cases: [],
  inventory: [],
  ownerGates: [
    {
      id: "OWNER-WALLET",
      control: "MetaMask, Coinbase, Injected, and Phantom connection lifecycles",
      reason: "Requires installed owner extensions and test accounts; mock-wallet safety is covered separately.",
    },
    {
      id: "OWNER-HL",
      control: "Hyperliquid exact-order review, wallet signature, testnet submission, and receipt",
      reason: "Requires owner-controlled testnet assets and explicit financial approval.",
    },
    {
      id: "OWNER-OAUTH",
      control: "Launch OAuth connector connect, revoke, reconnect, and disconnect",
      reason: "Requires owner test accounts and provider consent screens.",
    },
    {
      id: "OWNER-NATIVE",
      control: "macOS native folder, reveal, download, update, signing, and notarization flows",
      reason: "Requires the packaged signed desktop candidate on a clean Mac.",
    },
    {
      id: "OWNER-DESTRUCTIVE",
      control: "Delete, forget, disconnect, revoke, and reset actions",
      reason: "Intentionally excluded from the shared release workspace; use disposable owner fixtures.",
    },
  ],
  browserDiagnostics: {
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
  },
  artifacts: {},
};

const browser = await chromium.launch({ headless: !config.headed });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: "dark",
});
await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
const page = await context.newPage();

page.on("pageerror", (error) => {
  report.browserDiagnostics.pageErrors.push(error.message);
});
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const text = message.text();
  if (text.includes("Failed to load resource") && text.includes("404")) return;
  report.browserDiagnostics.consoleErrors.push(text);
});
page.on("requestfailed", (request) => {
  const url = request.url();
  if (!/^https?:\/\/127\.0\.0\.1:/.test(url)) return;
  if (request.failure()?.errorText === "net::ERR_ABORTED") return;
  report.browserDiagnostics.requestFailures.push(
    `${request.method()} ${url}: ${request.failure()?.errorText ?? "unknown"}`,
  );
});

async function acceptanceCase(id, control, expected, action) {
  const startedAt = Date.now();
  try {
    const observed = (await action()) || expected;
    report.cases.push({
      id,
      control,
      expected,
      observed: String(observed),
      status: "pass",
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const observed = error instanceof Error ? error.message : String(error);
    const screenshot = resolve(config.outputDir, `${id.toLowerCase()}-failure.png`);
    await page.screenshot({ path: screenshot, fullPage: false }).catch(() => {});
    report.cases.push({
      id,
      control,
      expected,
      observed,
      status: "fail",
      durationMs: Date.now() - startedAt,
      screenshot,
    });
  }
}

const settingsRoutes = [
  ["NAV-GENERAL", "Settings", "general", "Settings"],
  ["NAV-PREFERENCES", "Preferences", "preferences", "Preferences"],
  ["NAV-PERMISSIONS", "Permissions", "permissions", "Permissions"],
  ["NAV-WALLET", "Wallet", "wallet", "Wallet"],
  ["NAV-MCP", "MCPs & Tools", "extensions", "MCPs & Tools"],
  ["NAV-OVERVIEW", "Overview", "overview", "Overview"],
  ["NAV-MODELS", "Models", "ai", "Models"],
  ["NAV-CUSTOMIZATION", "Customization", "shell", "Customization"],
  ["NAV-APPEARANCE", "Appearance", "appearance", "Appearance"],
  ["NAV-UPDATES", "Updates", "updates", "Updates"],
];

await open(page, workspaceUrl(config.url, "settings/general"));
for (const [id, control, route, heading] of settingsRoutes) {
  await acceptanceCase(
    id,
    `Settings sidebar: ${control}`,
    `Routes to ${route}, exposes ${heading}, and has one main landmark`,
    async () => {
      await clickVisible(page.getByRole("button", { name: control, exact: true }), control);
      await waitForUrl(
        page,
        new RegExp(`/settings/${route.replace("/", "\\/")}(?:\\?|$)`),
        control,
      );
      await assertText(page, heading);
      await assertSingleMain(page);
      await inventorySurface(page, report, `settings-${route.replace("/", "-")}`);
      return `${page.url()} · main=1`;
    },
  );
}

await acceptanceCase(
  "NAV-BACK",
  "Back to app",
  "Returns to the workspace session",
  async () => {
    await clickVisible(page.getByRole("button", { name: "Back to app", exact: true }), "Back to app");
    await waitForUrl(page, /\/session(?:\/[^/?]+)?(?:\?|$)/, "Back to app");
    return page.url();
  },
);

await open(page, workspaceUrl(config.url, "settings/preferences"));
for (const [id, label] of [
  ["PREF-REASONING", "Show model reasoning"],
  ["PREF-COMPACTION", "Auto context compaction"],
]) {
  await acceptanceCase(
    id,
    label,
    "Toggles, persists after reload, and restores the original value",
    async () => {
      let toggle = await firstVisible(page.getByRole("switch", { name: label, exact: true }), label);
      const original = await toggle.getAttribute("aria-checked");
      await toggle.click();
      await settle(page, 500);
      const changed = await toggle.getAttribute("aria-checked");
      if (changed === original) throw new Error(`${label} did not change.`);
      await reload(page);
      toggle = await firstVisible(page.getByRole("switch", { name: label, exact: true }), label);
      if ((await toggle.getAttribute("aria-checked")) !== changed) {
        throw new Error(`${label} did not persist after reload.`);
      }
      await toggle.click();
      await settle(page, 500);
      await reload(page);
      toggle = await firstVisible(page.getByRole("switch", { name: label, exact: true }), label);
      if ((await toggle.getAttribute("aria-checked")) !== original) {
        throw new Error(`${label} did not restore.`);
      }
      return `${original} → ${changed} → reload ${changed} → restored ${original}`;
    },
  );
}

await open(page, workspaceUrl(config.url, "settings/overview"));
await acceptanceCase(
  "APPEAR-THEME",
  "Light, Dark, and System theme controls",
  "Each selection is pressed, persists on reload, and original theme is restored",
  async () => {
    await openOverviewControlGroup(page, "Appearance");
    let actualOriginal = "System";
    for (const name of ["Light", "Dark", "System"]) {
      const button = await firstVisible(page.getByRole("button", { name, exact: true }), name);
      if ((await button.getAttribute("aria-pressed")) === "true") actualOriginal = name;
    }
    for (const name of ["Light", "Dark", "System"]) {
      const button = await firstVisible(page.getByRole("button", { name, exact: true }), name);
      await button.click();
      await settle(page, 250);
      if ((await button.getAttribute("aria-pressed")) !== "true") {
        throw new Error(`${name} theme did not become selected.`);
      }
    }
    await reload(page);
    await openOverviewControlGroup(page, "Appearance");
    const system = await firstVisible(page.getByRole("button", { name: "System", exact: true }), "System");
    if ((await system.getAttribute("aria-pressed")) !== "true") {
      throw new Error("System theme did not persist after reload.");
    }
    await clickVisible(
      page.getByRole("button", { name: actualOriginal, exact: true }),
      `${actualOriginal} theme`,
    );
    return `Light, Dark, System selected; restored ${actualOriginal}`;
  },
);

await open(page, workspaceUrl(config.url, "settings/overview"));
await acceptanceCase(
  "APPEAR-DENSITY",
  "Comfortable and Compact density",
  "Both states select correctly and original density is restored",
  async () => {
    await openOverviewControlGroup(page, "Appearance");
    let original = "Comfortable";
    for (const name of ["Comfortable", "Compact"]) {
      const button = await firstVisible(page.getByRole("button", { name, exact: true }), name);
      if ((await button.getAttribute("aria-pressed")) === "true") original = name;
    }
    for (const name of ["Compact", "Comfortable"]) {
      const button = await firstVisible(page.getByRole("button", { name, exact: true }), name);
      await button.click();
      await settle(page, 250);
      if ((await button.getAttribute("aria-pressed")) !== "true") {
        throw new Error(`${name} density did not become selected.`);
      }
    }
    if (original !== "Comfortable") {
      await clickVisible(page.getByRole("button", { name: original, exact: true }), original);
    }
    return `Compact and Comfortable selected; restored ${original}`;
  },
);

await open(page, workspaceUrl(config.url, "settings/ai"));
await acceptanceCase(
  "AI-MODELS",
  "Browse models",
  "Opens a searchable model dialog without legacy branding and cancel changes nothing",
  async () => {
    const browseModels = await visibleOrNull(
      page.getByRole("button", { name: "Browse models", exact: true }),
    );
    if (!browseModels) {
      const addProvider = await firstVisible(
        page.getByRole("button", { name: "Add provider", exact: true }),
        "Add provider recovery",
      );
      return `No model catalog is connected; ${await addProvider.innerText()} is available to recover.`;
    }
    await browseModels.click();
    await settle(page);
    const dialog = await firstVisible(page.getByRole("dialog"), "Models dialog");
    const body = await dialog.innerText();
    if (LEGACY_BRANDS.test(body)) throw new Error("Legacy engine branding is visible in Models.");
    const search = await firstVisible(
      dialog.getByPlaceholder("Search providers and models..."),
      "model search",
    );
    await search.fill("Smoke");
    await assertText(page, "Smoke model");
    await clickVisible(dialog.getByRole("button", { name: "Done", exact: true }), "Done");
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });
    return "Models dialog opened, filtered to the current smoke model, and closed";
  },
);

await acceptanceCase(
  "AI-PROVIDER",
  "Provider catalog or managed provider state",
  "Opens the provider catalog when available, otherwise shows a truthful deployment-managed state",
  async () => {
    const chooseProvider = await visibleOrNull(
      page.getByRole("button", { name: "Choose provider", exact: true }),
    );
    if (chooseProvider) {
      await chooseProvider.click();
      const dialog = await firstVisible(page.getByRole("dialog"), "provider dialog");
      if (LEGACY_BRANDS.test(await dialog.innerText())) {
        throw new Error("Legacy engine provider is visible in the provider catalog.");
      }
      const search = await firstVisible(
        dialog.getByPlaceholder("Search all providers"),
        "provider search",
      );
      await search.fill("CUDOS");
      await settle(page, 250);
      if (LEGACY_BRANDS.test(await dialog.innerText())) {
        throw new Error("Legacy engine branding appeared after filtering providers.");
      }
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden", timeout: 10_000 });
      return "Provider catalog opened, filtered, and closed without exposing a credential";
    }

    await assertText(page, "Model providers");
    await assertText(page, "ASI:Cloud");
    await firstVisible(
      page.getByText(
        "Matterhorn manages the provider used by this web workspace.",
        { exact: true },
      ),
      "deployment-managed provider description",
    );
    const providerText = await page.locator("main").innerText();
    if (!/(?:Unavailable in this deployment|Connected|models? available through Matterhorn)/i.test(providerText)) {
      throw new Error(`Managed provider status is unclear: ${providerText}`);
    }
    if (LEGACY_BRANDS.test(providerText)) {
      throw new Error("Legacy engine branding is visible in the managed provider state.");
    }
    if (/sk-[A-Za-z0-9_-]{12,}/.test(providerText)) {
      throw new Error("Managed provider state exposes a credential.");
    }
    return "Deployment-managed provider availability is clear and exposes no credential";
  },
);

const cudosButton = page.getByRole("button", { name: /Connect CUDOS|Connect ASI/i });
if ((await cudosButton.count()) > 0) {
  await acceptanceCase(
    "AI-CUDOS",
    "Connect CUDOS / ASI:Cloud",
    "Opens secure key entry and prevents blank submission",
    async () => {
      await clickVisible(cudosButton, "Connect CUDOS");
      const dialog = await firstVisible(page.getByRole("dialog"), "CUDOS key dialog");
      const save = await firstVisible(dialog.getByRole("button", { name: "Save key", exact: true }), "Save key");
      if (!(await save.isDisabled())) throw new Error("Blank CUDOS key can be submitted.");
      await clickVisible(dialog.getByRole("button", { name: "Close", exact: true }), "Close");
      return "Secure CUDOS key dialog opened; blank Save key disabled";
    },
  );
}

await open(page, workspaceUrl(config.url, "settings/extensions/mcp"));
await acceptanceCase(
  "MCP-REFRESH",
  "Refresh MCP status",
  "Refresh completes and retains a truthful active server count",
  async () => {
    const currentMcpStatus = async () => {
      const body = await page.locator("body").innerText();
      return body.match(/\d+ MCP servers? active/)?.[0]
        ?? (body.includes("No external MCPs connected.") ? "No external MCPs connected" : "");
    };
    const before = await currentMcpStatus();
    await clickVisible(page.getByRole("button", { name: /Refresh/i }), "Refresh MCP status");
    const after = await currentMcpStatus();
    if (!after) throw new Error("MCP connection status disappeared after refresh.");
    return `${before || "status loaded"} → ${after}`;
  },
);

await acceptanceCase(
  "MCP-CLIENTS",
  "Coding client selector and Copy command",
  "Each client produces a non-empty, secret-free command and clipboard copy",
  async () => {
    const select = await firstVisible(page.locator("select"), "MCP client selector");
    const options = await select.locator("option").allTextContents();
    if (options.length < 4) throw new Error(`Expected four coding clients, observed ${options.length}.`);
    for (let index = 0; index < options.length; index += 1) {
      await select.selectOption({ index });
      await settle(page, 150);
      await clickVisible(
        page.getByRole("button", { name: /Copy .* config command/i }),
        "Copy config command",
      );
      const clipboard = await page.evaluate(() => navigator.clipboard.readText());
      if (!clipboard.trim()) throw new Error(`Copied command is empty for ${options[index]}.`);
      if (/sk-[A-Za-z0-9_-]{12,}/.test(clipboard)) {
        throw new Error(`Copied command contains a secret for ${options[index]}.`);
      }
    }
    return `${options.length} clients generated and copied secret-free commands`;
  },
);

await acceptanceCase(
  "MCP-DEFINITIONS",
  "Matterhorn MCP definition disclosures",
  "Every visible definition expands and collapses",
  async () => {
    const definitions = [
      "Bittensor MCP",
      "Hyperliquid MCP",
      "Polymarket MCP",
      "Memory MCP",
      "Core Agent MCP",
    ];
    let exercised = 0;
    for (const name of definitions) {
      const button = page.getByRole("button", { name: new RegExp(name, "i") });
      if ((await button.count()) < 1) continue;
      const candidate = await firstVisible(button, name);
      await candidate.click();
      await settle(page, 150);
      await candidate.click();
      exercised += 1;
    }
    if (exercised < 5) throw new Error(`Only ${exercised} MCP definitions were available.`);
    return `${exercised} definition disclosures expanded and collapsed`;
  },
);

await acceptanceCase(
  "MCP-CUSTOM",
  "Add Custom MCP",
  "Blank submission stays open and shows a specific validation message",
  async () => {
    await clickVisible(page.getByRole("button", { name: /Add Custom MCP|Add a custom MCP/i }), "Add Custom MCP");
    const dialog = await firstVisible(page.getByRole("dialog"), "custom MCP dialog");
    await clickVisible(dialog.getByRole("button", { name: "Add MCP", exact: true }), "Add MCP");
    await assertText(page, "Enter a server name.");
    if (!(await dialog.isVisible())) throw new Error("Invalid custom MCP closed the dialog.");
    await clickVisible(dialog.getByRole("button", { name: "Cancel", exact: true }), "Cancel");
    return "Blank submission blocked with “Enter a server name.”";
  },
);

await open(page, workspaceUrl(config.url, "settings/wallet"));
await acceptanceCase(
  "WAL-POLICY-INVALID",
  "Save policy with an invalid per-transaction limit",
  "Specific validation appears and the invalid value does not persist",
  async () => {
    const perTransaction = await firstVisible(
      page.getByRole("spinbutton", { name: "Per transaction (USD)", exact: true }),
      "Per transaction (USD)",
    );
    const original = await perTransaction.inputValue();
    await perTransaction.fill("0");
    await clickVisible(page.getByRole("button", { name: "Save policy", exact: true }), "Save policy");
    await firstVisible(
      page.getByText(/Per-transaction limit must be between \$1 and \$1,000,000\./),
      "policy validation",
    );
    await reload(page);
    const reloaded = await firstVisible(
      page.getByRole("spinbutton", { name: "Per transaction (USD)", exact: true }),
      "Per transaction (USD)",
    );
    if ((await reloaded.inputValue()) !== original) {
      throw new Error("Invalid policy value persisted after reload.");
    }
    return `Invalid 0 rejected; persisted value remained ${original}`;
  },
);

await acceptanceCase(
  "WAL-POLICY-PERSIST",
  "Save valid wallet policy",
  "Current valid values save and remain exact after reload",
  async () => {
    const labels = ["Per transaction (USD)", "Daily limit (USD)", "Max slippage (bps)"];
    const before = {};
    for (const label of labels) {
      before[label] = await (
        await firstVisible(page.getByRole("spinbutton", { name: label, exact: true }), label)
      ).inputValue();
    }
    await clickVisible(page.getByRole("button", { name: "Save policy", exact: true }), "Save policy");
    await settle(page, 700);
    await reload(page);
    for (const label of labels) {
      const value = await (
        await firstVisible(page.getByRole("spinbutton", { name: label, exact: true }), label)
      ).inputValue();
      if (value !== before[label]) {
        throw new Error(`${label} changed from ${before[label]} to ${value}.`);
      }
    }
    return labels.map((label) => `${label}=${before[label]}`).join(", ");
  },
);

await acceptanceCase(
  "WAL-MAINNET",
  "Base mainnet",
  "Selecting Mainnet keeps it blocked until typed confirmation",
  async () => {
    const sepolia = await firstVisible(
      page.getByRole("button", { name: "Sepolia", exact: true }),
      "Sepolia",
    );
    const mainnet = await firstVisible(
      page.getByRole("button", { name: "Mainnet", exact: true }),
      "Mainnet",
    );
    const originalNetwork =
      (await mainnet.getAttribute("aria-pressed")) === "true"
        ? "Mainnet"
        : "Sepolia";

    if (originalNetwork === "Mainnet") {
      await sepolia.click();
    }
    await mainnet.click();
    const dialog = await firstVisible(
      page.getByRole("alertdialog"),
      "Enable Base mainnet confirmation",
    );
    await firstVisible(
      dialog.getByRole("textbox", { name: "Type ENABLE MAINNET to confirm" }),
      "mainnet confirmation phrase",
    );
    const enable = await firstVisible(
      dialog.getByRole("button", { name: "Enable mainnet", exact: true }),
      "Enable mainnet",
    );
    if (!(await enable.isDisabled())) {
      throw new Error("Mainnet can be enabled without typing the confirmation phrase.");
    }
    await clickVisible(
      dialog.getByRole("button", { name: "Keep blocked", exact: true }),
      "Keep blocked",
    );
    const mainnetGate = await firstVisible(
      page.getByRole("button", { name: "Mainnet blocked", exact: true }),
      "Mainnet blocked",
    );
    if ((await mainnetGate.getAttribute("aria-pressed")) !== "false") {
      throw new Error("Cancelling the mainnet gate changed the enabled state.");
    }
    if ((await mainnet.getAttribute("aria-pressed")) === "true") {
      throw new Error("Cancelling the mainnet gate selected Mainnet.");
    }

    return "Mainnet remained blocked and unselected without the typed confirmation phrase";
  },
);

await open(page, workspaceUrl(config.url, "settings/overview"));
await acceptanceCase(
  "OVERVIEW-DETAILS",
  "Workspace details",
  "Expands and collapses the backend readiness disclosure",
  async () => {
    const button = await firstVisible(
      page.getByRole("button", { name: /Workspace details/i }),
      "Workspace details",
    );
    await button.click();
    await assertText(page, "Workspace setup");
    await button.click();
    return "Readiness details exposed, then collapsed";
  },
);

await acceptanceCase(
  "OVERVIEW-FILTERS",
  "Feedback review filters",
  "Every filter becomes the selected filter",
  async () => {
    await openOverviewControlGroup(page, "Work & evidence");
    const all = await firstVisible(
      page.getByRole("button", { name: /^All\s+\d+$/ }),
      "All feedback",
    );
    const labels = ["Worked well", "Felt rough", "Rating", "Comment", "Bug", "Request"];
    let exercised = 0;
    await all.click();
    if ((await all.getAttribute("aria-pressed")) !== "true") {
      throw new Error("All feedback did not become selected.");
    }
    exercised += 1;
    for (const label of labels) {
      const button = page.getByRole("button", { name: label, exact: true });
      if ((await button.count()) < 1) continue;
      const candidate = await firstVisible(button, label);
      await candidate.click();
      if ((await candidate.getAttribute("aria-pressed")) !== "true") {
        throw new Error(`${label} did not become selected.`);
      }
      exercised += 1;
    }
    await all.click();
    return `${exercised} filters selected; restored All`;
  },
);

await acceptanceCase(
  "OVERVIEW-QUICK-JOT",
  "Quick Jot",
  "Opens the note composer and Cancel writes nothing",
  async () => {
    await openOverviewControlGroup(page, "Work & evidence");
    await clickVisible(page.getByRole("button", { name: "Quick Jot", exact: true }), "Quick Jot");
    const dialog = await firstVisible(page.getByRole("dialog"), "Quick Jot dialog");
    await firstVisible(dialog.getByPlaceholder("Note title"), "Note title");
    await clickVisible(dialog.getByRole("button", { name: "Cancel", exact: true }), "Cancel");
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });
    return "Quick Jot opened with editor fields; Cancel closed it";
  },
);

await acceptanceCase(
  "OVERVIEW-NOTES",
  "Open notes",
  "Opens the workspace Notes panel",
  async () => {
    await openOverviewControlGroup(page, "Work & evidence");
    await clickVisible(page.getByRole("button", { name: "Open notes", exact: true }), "Open notes");
    await waitForUrl(page, /(?:\?|&)panel=notes(?:&|$)/, "Open notes");
    await assertText(page, "Notes");
    return page.url();
  },
);

await open(page, workspaceUrl(config.url, "settings/overview"));
await acceptanceCase(
  "OVERVIEW-MEMORY",
  "Open Memory review",
  "Opens the workspace Memory panel",
  async () => {
    await openOverviewControlGroup(page, "Work & evidence");
    await clickVisible(
      page.getByRole("button", { name: "Open Memory review", exact: true }),
      "Open Memory review",
    );
    await waitForUrl(page, /(?:\?|&)panel=memory(?:&|$)/, "Open Memory review");
    await assertText(page, "Memory");
    return page.url();
  },
);

await open(page, config.chatUrl);
await acceptanceCase(
  "CHAT-PANELS",
  "Profile, Wallet, MCPs, and Notes right-rail controls",
  "Each opens the matching panel URL and heading",
  async () => {
    const panels = [
      ["Profile and account", "profile", "Profile"],
      ["Wallet details", "wallet", "Wallet"],
      ["MCPs & Connectors", "extensions", "MCPs & Tools"],
      ["Project notes", "notes", "Notes"],
    ];
    for (const [control, panel, heading] of panels) {
      await openChat(page);
      await clickVisible(page.getByRole("button", { name: control, exact: true }), control);
      await waitForUrl(
        page,
        new RegExp(`(?:\\?|&)panel=${panel}(?:&|$)`),
        control,
      );
      await assertText(page, heading);
    }
    return `${panels.length} right-rail panels opened with matching routes and headings`;
  },
);

await openChat(page);
await acceptanceCase(
  "CHAT-MODES",
  "Discuss, Plan, and Work modes",
  "Every mode becomes the visible current mode; Work is restored",
    async () => {
    for (const name of ["Discuss", "Plan", "Work"]) {
      await clickVisible(page.getByRole("button", { name: /^Mode\s+/ }), "Mode menu");
      await clickVisible(
        page.getByRole("menuitemradio", { name: new RegExp(`^${name}`) }),
        name,
      );
      await firstVisible(
        page.getByRole("button", { name: new RegExp(`^Mode\\s+${name}$`) }),
        `Mode ${name}`,
      );
    }
    return "Discuss → Plan → Work; Work restored";
  },
);

await acceptanceCase(
  "CHAT-PERSPECTIVE",
  "Less optimistic, Normal, and Optimistic perspective controls",
  "Every perspective becomes checked; Normal is restored",
  async () => {
    await openChat(page);
    const labels = ["Cautious", "Balanced", "Optimistic"];
    for (const label of labels) {
      const radio = await firstVisible(
        page.getByRole("radio", { name: label, exact: true }),
        label,
      );
      await radio.click();
      if ((await radio.getAttribute("aria-checked")) !== "true") {
        throw new Error(`${label} did not become checked.`);
      }
    }
    await clickVisible(
      page.getByRole("radio", { name: "Balanced", exact: true }),
      "Balanced",
    );
    return "Cautious → Balanced → Optimistic → Balanced";
  },
);

await acceptanceCase(
  "CHAT-MODEL",
  "Model selection or first-run recovery",
  "Opens a searchable branded model picker when available, or routes to provider setup when no catalog is connected",
  async () => {
    await openChat(page);
    const changeModel = await visibleOrNull(
      page.getByRole("button", { name: "Change model", exact: true }),
    );
    if (!changeModel) {
      await verifyChatProviderRecovery(page, "Chat model selection");
      return "No model catalog is connected; Connect a model routed to Add provider setup";
    }
    await changeModel.click();
    await settle(page);
    const dialog = await firstVisible(page.getByRole("dialog"), "Models dialog");
    try {
      const search = await firstVisible(
        dialog.getByPlaceholder(/Search (?:providers and )?models/i),
        "model search",
      );
      if (LEGACY_BRANDS.test(await dialog.innerText())) {
        throw new Error("Legacy engine branding is visible in the model picker.");
      }
      await search.fill("Smoke");
      await firstVisible(dialog.getByText(/Smoke model/i), "filtered model result");
    } finally {
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(async () => {
        await clickVisible(dialog.getByRole("button", { name: "Done", exact: true }), "Done");
      });
    }
    return "Branded model picker opened, filtered, and closed";
  },
);

await acceptanceCase(
  "CHAT-TOOLS",
  "Available composer tool categories",
  "Every enabled category loads without legacy branding and dismisses with Escape",
  async () => {
    await openChat(page);
    await clickVisible(
      page.getByRole("button", { name: "Commands, skills, and MCPs", exact: true }),
      "Commands, skills, and MCPs",
    );
    const dialog = await firstVisible(
      page.getByRole("dialog", { name: "Commands, skills, and MCPs" }),
      "Commands, skills, and MCPs dialog",
    );
    const visibleLabels = [];
    for (const label of ["Commands", "Skills", "Extensions", "MCPs"]) {
      const tab = dialog.getByRole("tab", { name: label, exact: true });
      if (!(await tab.count())) continue;
      visibleLabels.push(label);
      await tab.click();
      await settle(page, 300);
      const content = await dialog.innerText();
      if (LEGACY_BRANDS.test(content)) {
        throw new Error(`Legacy engine branding is visible in the ${label} tab.`);
      }
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });
    if (!visibleLabels.includes("Extensions") || !visibleLabels.includes("MCPs")) {
      throw new Error(`Expected Extensions and MCPs tabs, found ${visibleLabels.join(", ") || "none"}.`);
    }
    return `${visibleLabels.join(", ")} loaded with Matterhorn-only copy`;
  },
);

await acceptanceCase(
  "CHAT-TOOL-INSERT",
  "Insert a command from the composer menu",
  "The selected command is inserted into the editor and the original draft is restored",
  async () => {
    await openChat(page);
    const editor = await chatEditorOrVerifyRecovery(page, "Command insertion");
    if (!editor) {
      return "No model catalog is connected; command insertion stays unavailable until Add provider completes";
    }
    const original = (await editor.textContent()) ?? "";
    await clickVisible(
      page.getByRole("button", { name: "Commands, skills, and MCPs", exact: true }),
      "Commands, skills, and MCPs",
    );
    const dialog = await firstVisible(
      page.getByRole("dialog", { name: "Commands, skills, and MCPs" }),
      "Commands, skills, and MCPs dialog",
    );
    const commandsTab = dialog.getByRole("tab", { name: "Commands", exact: true });
    if (!(await commandsTab.count())) {
      await page.keyboard.press("Escape");
      return "Commands are intentionally unavailable outside Work mode";
    }
    await clickVisible(commandsTab, "Commands");
    const commandList = dialog.locator(".matterhorn-tool-menu-list");
    await commandList.waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForFunction(
      (element) => element?.getAttribute("aria-busy") === "false",
      await commandList.elementHandle(),
      { timeout: 20_000 },
    );
    const commands = commandList.getByRole("button").filter({ hasText: /\/\w+/ });
    if (!(await commands.count())) {
      await page.keyboard.press("Escape");
      return "No workspace commands are configured for this workspace";
    }
    const command = await firstVisible(commands, "workspace command");
    const commandMatch = ((await command.innerText()) ?? "").match(/\/[-\w]+/);
    const commandLabel = commandMatch?.[0] ?? "";
    if (!commandLabel) throw new Error("Command label is missing.");
    await command.click();
    const inserted = (await editor.textContent()) ?? "";
    if (!inserted.includes(commandLabel)) {
      throw new Error(`Command was not inserted into the editor: ${JSON.stringify(inserted)}.`);
    }
    await editor.fill(original);
    return `${commandLabel} inserted through the menu; original draft restored`;
  },
);

await acceptanceCase(
  "CHAT-DRAFT",
  "Chat composer draft",
  "Draft survives reload, then is cleared and remains cleared",
  async () => {
    await openChat(page);
    const editor = await chatEditorOrVerifyRecovery(page, "Draft editing");
    if (!editor) {
      return "No model catalog is connected; draft editing stays unavailable until Add provider completes";
    }
    const original = (await editor.textContent()) ?? "";
    const marker = `RC16 draft ${Date.now()}`;
    await editor.fill(marker);
    await settle(page, 500);
    await reload(page);
    const restoredEditor = await firstVisible(page.locator('[contenteditable="true"]').first(), "chat editor");
    if (!((await restoredEditor.textContent()) ?? "").includes(marker)) {
      throw new Error("Draft did not survive reload.");
    }
    await restoredEditor.fill(original);
    await settle(page, 500);
    await reload(page);
    const clearedEditor = await firstVisible(page.locator('[contenteditable="true"]').first(), "chat editor");
    if (((await clearedEditor.textContent()) ?? "") !== original) {
      throw new Error("Draft did not restore to its original value.");
    }
    return `Draft ${marker} persisted; original draft restored`;
  },
);

await acceptanceCase(
  "CHAT-MULTILINE",
  "Shift+Enter multiline composer input",
  "Adds a new line without sending or changing the chat route",
  async () => {
    await openChat(page);
    const editor = await chatEditorOrVerifyRecovery(page, "Multiline draft editing");
    if (!editor) {
      return "No model catalog is connected; multiline draft editing stays unavailable until Add provider completes";
    }
    const original = (await editor.textContent()) ?? "";
    const originalUrl = page.url();
    const firstLine = `RC16 multiline ${Date.now()}`;
    await editor.fill(firstLine);
    await editor.press("Shift+Enter");
    await editor.type("second line");
    const multilineText = await editor.innerText();
    if (!multilineText.includes(firstLine) || !multilineText.includes("second line")) {
      throw new Error(`Multiline text was not retained: ${JSON.stringify(multilineText)}.`);
    }
    if (!multilineText.includes("\n")) {
      throw new Error("Shift+Enter did not add a visible line break.");
    }
    if (page.url() !== originalUrl) {
      throw new Error(`Shift+Enter changed the chat route to ${page.url()}.`);
    }
    await editor.fill(original);
    return "Shift+Enter added a line break without sending; original draft restored";
  },
);

await acceptanceCase(
  "CHAT-ATTACHMENT",
  "Chat file attachment",
  "A real local file appears in the composer and can be removed cleanly",
  async () => {
    await openChat(page);
    const fileInput = page.locator('input[type="file"]').first();
    if ((await fileInput.count()) !== 1) {
      throw new Error("Chat file input is missing.");
    }
    await fileInput.setInputFiles(attachmentFixturePath);
    const fileName = await firstVisible(
      page.getByText("chat-attachment-fixture.txt", { exact: true }),
      "attachment filename",
    );
    const attachmentChip = fileName.locator("xpath=../..");
    await clickVisible(
      attachmentChip.getByRole("button", { name: "Remove", exact: true }),
      "Remove attachment",
    );
    await fileName.waitFor({ state: "hidden", timeout: 10_000 });
    return "Local text file attached, rendered with metadata, and removed";
  },
);

await acceptanceCase(
  "CHAT-COPY",
  "Copy message",
  "Copies non-empty message text to the clipboard",
  async () => {
    await openChat(page);
    const copy = await visibleOrNull(
      page.getByRole("button", { name: "Copy message", exact: true }),
    );
    if (!copy) {
      await verifyChatProviderRecovery(page, "Message copy");
      return "No assistant response exists in this provider-free workspace; Connect a model routed to Add provider setup";
    }
    await copy.click();
    await settle(page, 150);
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    if (!clipboard.trim()) throw new Error("Clipboard is empty after Copy message.");
    return `${clipboard.length} characters copied`;
  },
);

await inventorySurface(page, report, "chat");
const pageText = await page.locator("body").innerText();
await acceptanceCase(
  "BRAND-CUSTOMER",
  "Customer-facing branding",
  "No legacy OpenWork/OpenCode branding is visible",
  async () => {
    if (LEGACY_BRANDS.test(pageText)) {
      throw new Error(`Legacy brand is visible: ${pageText.match(LEGACY_BRANDS)?.[0]}`);
    }
    return "Matterhorn-only customer-facing copy";
  },
);

report.finishedAt = new Date().toISOString();
report.ready = report.cases.every((item) => item.status === "pass");

const screenshotPath = resolve(config.outputDir, "rc16-control-acceptance.png");
await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
report.artifacts.screenshot = screenshotPath;

const summaryPath = resolve(config.outputDir, "summary.json");
const ledgerPath = resolve(config.outputDir, "control-acceptance.md");
report.artifacts.summary = summaryPath;
report.artifacts.ledger = ledgerPath;
await writeFile(summaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(ledgerPath, reportMarkdown(report), "utf8");

await browser.close();

const passed = report.cases.filter((item) => item.status === "pass").length;
const failed = report.cases.filter((item) => item.status === "fail").length;
console.log(
  `RC16 control acceptance: ${passed} passed, ${failed} failed, ${report.inventory.length} controls inventoried.`,
);
console.log(`Evidence: ${summaryPath}`);
if (config.json) console.log(JSON.stringify(report, null, 2));
if (config.strict && !report.ready) process.exitCode = 1;
