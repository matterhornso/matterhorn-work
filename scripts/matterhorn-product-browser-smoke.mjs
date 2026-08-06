#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const repoRoot = resolve(import.meta.dirname, "..");
const DEFAULT_URL = "http://127.0.0.1:5182/workspace/ws_9d76fd6566f5/session";
const DEFAULT_OUTPUT_DIR = "qa-reports/matterhorn-product-browser-smoke";

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
    headed:
      flags.has("--headed") ||
      process.env.MATTERHORN_PRODUCT_BROWSER_HEADED === "1",
    json: flags.has("--json"),
    strict:
      flags.has("--strict") ||
      process.env.MATTERHORN_PRODUCT_BROWSER_STRICT === "1",
    requireDeskResults:
      flags.has("--require-desk-results") ||
      process.env.MATTERHORN_PRODUCT_BROWSER_REQUIRE_DESK_RESULTS === "1",
    hostedAccount:
      flags.has("--hosted-account") ||
      process.env.MATTERHORN_PRODUCT_BROWSER_HOSTED_ACCOUNT === "1",
    deskResultTimeoutMs: Number(
      values.get("--desk-result-timeout-ms") ||
        process.env.MATTERHORN_PRODUCT_BROWSER_DESK_RESULT_TIMEOUT_MS ||
        120_000,
    ),
    url:
      values.get("--url") ||
      process.env.MATTERHORN_PRODUCT_BROWSER_URL ||
      DEFAULT_URL,
    serverUrl:
      values.get("--server-url") ||
      process.env.MATTERHORN_PRODUCT_BROWSER_SERVER_URL ||
      "",
    outputDir: resolve(
      repoRoot,
      values.get("--output-dir") ||
        process.env.MATTERHORN_PRODUCT_BROWSER_OUTPUT_DIR ||
        DEFAULT_OUTPUT_DIR,
    ),
  };
}

function printHelp() {
  console.log(`Matterhorn product browser smoke

Usage:
  pnpm dev:generated-media-smoke
  node scripts/matterhorn-product-browser-smoke.mjs --strict --json
  node scripts/matterhorn-product-browser-smoke.mjs --url http://127.0.0.1:<app-port>/workspace/<id>/session

Options:
  --url <url>          Matterhorn app URL. Defaults to the dev-generated-media-smoke app URL.
  --server-url <url>   Engine URL when local development serves the API on a separate port.
                       Production web deployments should omit this to use the app origin.
  --output-dir <dir>   Evidence directory. Default: ${DEFAULT_OUTPUT_DIR}
  --strict             Exit nonzero on smoke failure or browser console/page errors.
  --require-desk-results
                       Wait for every desk task to finish with assistant output.
                       Use this against a real managed-engine stack, not the fixture stack.
  --hosted-account     Create a fresh account and certify its isolated hosted workspace.
                       Omit this for the local generated-media fixture stack.
  --desk-result-timeout-ms <ms>
                       Per-desk completion timeout. Default: 120000.
  --json               Print the full JSON report.
  --headed             Show the Chromium window while running.
  --help               Show this message.

Expected stack:
  Run scripts/dev-generated-media-smoke.mjs first. It provides fake OpenCode,
  fake Walrus, mock image generation, Sui/Kiosk preview ids, the Matterhorn server,
  and the Vite app. This product smoke checks the platform shell around the
  generated-media lane: desk launch, activity/history, Notes, Memory, Wallet,
  Settings, Generated media, and support-report download.
`);
}

function makeReport(config) {
  return {
    name: "matterhorn-product-browser-smoke",
    url: config.url,
    startedAt: new Date().toISOString(),
    ready: false,
    stages: [],
    artifacts: {},
    warnings: [],
    errors: [],
  };
}

async function stage(report, id, label, action) {
  const startedAt = Date.now();
  try {
    const result = await action();
    report.stages.push({
      id,
      label,
      status: "pass",
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.stages.push({
      id,
      label,
      status: "fail",
      durationMs: Date.now() - startedAt,
      error: message,
    });
    throw error;
  }
}

function workspaceIdFromUrl(appUrl) {
  const match = new URL(appUrl).pathname.match(/^\/workspace\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function workspaceUrl(appUrl, pathSuffix = "session") {
  const url = new URL(appUrl);
  const workspaceId = workspaceIdFromUrl(appUrl);
  if (!workspaceId)
    throw new Error(`Could not parse workspace id from ${appUrl}`);
  url.pathname = `/workspace/${encodeURIComponent(workspaceId)}/${pathSuffix.replace(/^\/+/, "")}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function workspaceUrlForId(appUrl, workspaceId, pathSuffix = "session") {
  const url = new URL(appUrl);
  url.pathname = `/workspace/${encodeURIComponent(workspaceId)}/${pathSuffix.replace(/^\/+/, "")}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function assertCurrentWorkspaceRoute(page, expectedWorkspaceId, label) {
  const actualWorkspaceId = workspaceIdFromUrl(page.url());
  if (actualWorkspaceId !== expectedWorkspaceId) {
    throw new Error(
      `${label} left the expected workspace. Expected ${expectedWorkspaceId}, received ${actualWorkspaceId || "no workspace"} at ${page.url()}.`,
    );
  }
}

async function createQaAccount(context, appUrl, serverUrl = "") {
  const origin = new URL(appUrl).origin;
  const apiBase = serverUrl || origin;
  const email = `product-smoke-${Date.now()}-${process.pid}@example.test`;
  const response = await context.request.post(
    new URL("/api/auth/sign-up/email", apiBase).toString(),
    {
      data: {
        email,
        password: "matterhorn-product-smoke-password",
        name: "Product Browser QA",
      },
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok()) {
    const detail =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : await response.text().catch(() => "");
    throw new Error(
      `Fresh-user signup failed (${response.status()}): ${detail || "no response body"}`,
    );
  }

  const organizationId =
    payload &&
    typeof payload === "object" &&
    payload.organization &&
    typeof payload.organization === "object" &&
    typeof payload.organization.id === "string"
      ? payload.organization.id
      : "";
  if (!organizationId) {
    throw new Error("Fresh-user signup did not return an organization.");
  }

  const sessionResponse = await context.request.get(
    new URL("/api/den/v1/me", apiBase).toString(),
  );
  if (!sessionResponse.ok()) {
    throw new Error(
      `Fresh-user session was not restored after signup (${sessionResponse.status()}).`,
    );
  }

  const workspacesResponse = await context.request.get(
    new URL("/workspaces", apiBase).toString(),
  );
  const workspacesPayload = await workspacesResponse.json().catch(() => null);
  if (!workspacesResponse.ok()) {
    throw new Error(
      `Fresh-user workspace provisioning failed (${workspacesResponse.status()}).`,
    );
  }
  const workspaceId =
    workspacesPayload &&
    typeof workspacesPayload === "object" &&
    typeof workspacesPayload.activeId === "string"
      ? workspacesPayload.activeId.trim()
      : "";
  const items =
    workspacesPayload &&
    typeof workspacesPayload === "object" &&
    Array.isArray(workspacesPayload.items)
      ? workspacesPayload.items
      : [];
  if (!workspaceId || items.length !== 1 || items[0]?.id !== workspaceId) {
    throw new Error(
      "Fresh-user workspace provisioning did not return one isolated active workspace.",
    );
  }

  return {
    email,
    organizationId,
    workspaceId,
  };
}

function isWorkspaceSessionDetailUrl(appUrl) {
  try {
    const workspaceId = workspaceIdFromUrl(appUrl);
    if (!workspaceId) return false;
    const pathname = new URL(appUrl).pathname;
    return new RegExp(
      `^/workspace/${workspaceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/session/[^/]+$`,
    ).test(pathname);
  } catch {
    return false;
  }
}

function isWorkspaceSettingsAiUrl(appUrl) {
  try {
    return (
      new URL(appUrl).pathname ===
      new URL(workspaceUrl(appUrl, "settings/ai")).pathname
    );
  } catch {
    return false;
  }
}

async function clickFirstVisible(locator, label) {
  const count = await locator.count();
  if (count < 1) throw new Error(`Could not find ${label}.`);
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      return;
    }
  }
  throw new Error(`${label} exists but is not visible.`);
}

async function firstVisible(locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) return candidate;
  }
  return null;
}

async function waitForAnyVisible(page, locators, label, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    for (const locator of locators) {
      if ((await locator.count()) > 0 && (await locator.first().isVisible())) {
        return locator.first();
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Could not find ${label}.`);
}

async function assertNoVisible(locator, label) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible()) {
      throw new Error(`${label} should not be visible by default.`);
    }
  }
}

async function ensureWorkspaceHomeVisible(page, timeoutMs = 20_000) {
  const home = page.getByLabel("Workspace home");
  try {
    await home.waitFor({ state: "visible", timeout: 3_000 });
    return;
  } catch {
    // A slow local engine can leave the focused desk mounted after navigation.
  }

  const backHome = page.getByRole("button", {
    name: "Back to Home",
    exact: true,
  });
  if ((await backHome.count()) > 0 && (await backHome.first().isVisible())) {
    await backHome.first().click();
  }
  await home.waitFor({ state: "visible", timeout: timeoutMs });
}

async function waitForDeskPromptSentEvent(page, taskTitle, timeoutMs = 30_000) {
  const eventHandle = await page.waitForFunction(
    (title) => {
      const api = window.__matterhorn ?? window.__openwork;
      const events = typeof api?.events === "function" ? api.events(120) : [];
      return (
        events.find(
          (entry) =>
            entry?.name === "desk.task_launch.prompt_sent" &&
            entry?.data &&
            typeof entry.data === "object" &&
            entry.data.title === title &&
            typeof entry.data.sessionId === "string" &&
            entry.data.sessionId.length > 0,
        ) ?? null
      );
    },
    taskTitle,
    { timeout: timeoutMs },
  );
  return await eventHandle.jsonValue();
}

async function stopVerifiedDeskRun(page) {
  const stop = page.getByRole("button", {
    name: "Stop generating",
    exact: true,
  });
  if ((await stop.count()) < 1 || !(await stop.first().isVisible()))
    return false;
  await stop.first().click();
  await stop
    .first()
    .waitFor({ state: "hidden", timeout: 15_000 })
    .catch(() => undefined);
  return true;
}

async function waitForCompletedDeskResult(page, deskName, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid desk result timeout: ${timeoutMs}`);
  }
  const startedAt = Date.now();
  const assistantMessages = page.locator('[data-message-role="assistant"]');
  const stop = page.getByRole("button", {
    name: "Stop generating",
    exact: true,
  });
  const questionPanel = page.getByTestId("question-panel");
  const questionCounter = page.getByText(/^Question \d+ of \d+$/);

  while (Date.now() - startedAt < timeoutMs) {
    const visibleQuestionPanel = await firstVisible(questionPanel);
    const visibleQuestionCounter = await firstVisible(questionCounter);
    const actionableQuestionInput = visibleQuestionPanel
      ? await firstVisible(
          visibleQuestionPanel.locator('input[type="text"]:not([disabled])'),
        )
      : null;
    const actionableQuestionButton = visibleQuestionPanel
      ? await firstVisible(
          visibleQuestionPanel.locator("button:not([disabled])"),
        )
      : null;
    if (
      visibleQuestionPanel &&
      visibleQuestionCounter &&
      (actionableQuestionInput || actionableQuestionButton)
    ) {
      return {
        outcome: "waiting_for_user",
        checkpoint:
          (await visibleQuestionCounter.textContent())?.trim() || "Question",
        durationMs: Date.now() - startedAt,
      };
    }
    const stopVisible =
      (await stop.count()) > 0 && (await stop.first().isVisible());
    const messageCount = await assistantMessages.count();
    const messageText =
      messageCount > 0
        ? (await assistantMessages.allInnerTexts()).join("\n").trim()
        : "";
    if (!stopVisible && messageText.length > 0) {
      if (/\bfetch failed\b/i.test(messageText)) {
        throw new Error(
          `${deskName} completed with a backend transport failure.`,
        );
      }
      return {
        outcome: "completed",
        assistantMessageCount: messageCount,
        assistantTextLength: messageText.length,
        durationMs: Date.now() - startedAt,
      };
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(
    `${deskName} did not finish an assistant response within ${timeoutMs}ms.`,
  );
}

function isStaticMissingResource(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(?:avif|bmp|gif|ico|jpg|jpeg|png|svg|webp|woff2?)$/.test(
      pathname,
    );
  } catch {
    return false;
  }
}

function isWorkspaceOrApiRequest(url) {
  try {
    const pathname = new URL(url).pathname;
    return (
      pathname === "/api" ||
      pathname.startsWith("/api/") ||
      pathname.startsWith("/workspace/") ||
      pathname.startsWith("/w/")
    );
  } catch {
    return false;
  }
}

function isOptionalDevWorkspace404(url) {
  try {
    const parsed = new URL(url);
    if (
      /^\/workspace\/[^/]+\/files\/content$/.test(parsed.pathname) &&
      parsed.searchParams.get("path") === ".opencode/agents/opencode-router.md"
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function networkFailureMessage(failure) {
  return `${failure.method} ${failure.url} -> ${failure.status}`;
}

function shouldFailOnNetworkResponse(failure) {
  if (failure.status < 400) return false;
  if (failure.status === 404 && isStaticMissingResource(failure.url))
    return false;
  if (failure.status === 404 && isOptionalDevWorkspace404(failure.url))
    return false;
  return isWorkspaceOrApiRequest(failure.url) || failure.status >= 500;
}

const primaryDeskSmokeScenarios = [
  {
    id: "bittensor",
    name: "Bittensor",
    openLabel: "Open Bittensor",
    heading: "Bittensor desk",
    expectedTask: "Explore subnets",
  },
  {
    id: "hyperliquid",
    name: "Hyperliquid",
    openLabel: "Open Hyperliquid",
    heading: "Hyperliquid desk",
    expectedTask: "Read market overview",
  },
  {
    id: "polymarket",
    name: "Polymarket",
    openLabel: "Open Polymarket",
    heading: "Polymarket desk",
    expectedTask: "Check compliance",
    inputFixture: {
      actionLabel: "Describe market",
      fieldLabel: "Describe the market or trade",
      value: "Preview YES on Bitcoin reaching $150,000 before 2027 with $50",
    },
  },
  {
    id: "sui",
    name: "Sui",
    openLabel: "Open Sui",
    heading: "Sui desk",
    expectedTask: "Review transfer fees",
  },
];

const primaryDeskSmokeStageIds = [
  "desk_bittensor_task_start",
  "desk_hyperliquid_task_start",
  "desk_polymarket_task_start",
  "desk_sui_task_start",
];

async function startPrimaryDeskTask(page, config, desk) {
  await page.goto(workspaceUrl(config.url, "session"), {
    waitUntil: "load",
    timeout: 30_000,
  });
  await ensureWorkspaceHomeVisible(page);
  await page
    .getByText("Open a desk", { exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  await clickFirstVisible(
    page.getByTestId(`open-${desk.id}-desk`),
    `${desk.openLabel} desk card`,
  );
  await page
    .getByText(desk.heading, { exact: true })
    .waitFor({ state: "visible", timeout: 15_000 });
  await assertNoVisible(
    page.getByText("Show technical prompt", { exact: false }),
    `${desk.name} technical prompt disclosure`,
  );
  await assertNoVisible(
    page.getByText("Boundary:", { exact: false }),
    `${desk.name} boundary copy`,
  );
  await assertNoVisible(
    page.getByText(/Can submit:/),
    `${desk.name} submit-policy copy`,
  );
  const agentTasks = page.getByLabel("Agent tasks");
  await agentTasks.waitFor({ state: "visible", timeout: 15_000 });
  const taskGroup = agentTasks
    .locator("[data-workflow-stage]")
    .filter({ has: page.getByText(desk.expectedTask, { exact: true }) })
    .first();
  await taskGroup.waitFor({ state: "visible", timeout: 15_000 });
  if (desk.inputFixture) {
    await clickFirstVisible(
      taskGroup.getByRole("button", {
        name: desk.inputFixture.actionLabel,
        exact: true,
      }),
      `${desk.name} ${desk.inputFixture.actionLabel} button`,
    );
    const input = page.getByLabel(desk.inputFixture.fieldLabel, {
      exact: true,
    });
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await input.fill(desk.inputFixture.value);
    const inputForm = input.locator("xpath=ancestor::form");
    await inputForm
      .getByRole("button", { name: "Start task", exact: true })
      .click();
  } else {
    await clickFirstVisible(
      taskGroup.getByRole("button", { name: /^Start task/ }),
      `${desk.name} Start task button`,
    );
  }
  const currentUrlAfterTaskLaunch = page.url();
  if (
    !isWorkspaceSessionDetailUrl(currentUrlAfterTaskLaunch) &&
    !isWorkspaceSettingsAiUrl(currentUrlAfterTaskLaunch)
  ) {
    await page.waitForURL(
      (url) => {
        const currentUrl = url.toString();
        return (
          isWorkspaceSessionDetailUrl(currentUrl) ||
          isWorkspaceSettingsAiUrl(currentUrl)
        );
      },
      { timeout: 30_000, waitUntil: "commit" },
    );
  }

  if (isWorkspaceSettingsAiUrl(page.url())) {
    const handoff = page.getByTestId("pending-desk-task-handoff");
    await handoff.waitFor({ state: "visible", timeout: 15_000 });
    await handoff
      .getByText(`Finish setting up ${desk.expectedTask}`, { exact: true })
      .waitFor({
        state: "visible",
        timeout: 10_000,
      });
    await handoff.getByText(/Nothing has been sent\./).waitFor({
      state: "visible",
      timeout: 10_000,
    });
    if (config.requireDeskResults) {
      throw new Error(
        `${desk.name} needs a configured model provider before its agent task can run. The task was not sent.`,
      );
    }
    await handoff
      .getByRole("button", { name: "Return to desk", exact: true })
      .click();
    const workspaceSessionPath = new URL(workspaceUrl(config.url, "session"))
      .pathname;
    if (new URL(page.url()).pathname !== workspaceSessionPath) {
      await page.waitForURL(
        (url) => new URL(url.toString()).pathname === workspaceSessionPath,
        { timeout: 15_000, waitUntil: "commit" },
      );
    }
    await page
      .getByText(desk.heading, { exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });
    await page
      .getByText(
        "Connect a model before starting a stage. Nothing has been sent.",
        { exact: true },
      )
      .waitFor({ state: "visible", timeout: 15_000 });
    return {
      outcome: "provider_setup_required",
      sessionUrl: null,
      launchEvent: null,
      result: null,
      stoppedAfterVerification: false,
    };
  }

  await waitForAnyVisible(
    page,
    [
      page.getByTestId("session-composer-shell"),
      page.getByRole("button", { name: /Stop generating|Ask/i }),
      page.getByText(`${desk.expectedTask} started`, { exact: false }),
      page.getByText("The agent is working in this session.", { exact: false }),
    ],
    `active ${desk.name} desk session`,
    30_000,
  );
  const perspectiveSelector = page.getByRole("radiogroup", {
    name: "Response perspective",
  });
  await perspectiveSelector.waitFor({ state: "visible", timeout: 15_000 });
  await perspectiveSelector
    .getByRole("radio", { name: "Cautious", exact: true })
    .waitFor({ state: "visible", timeout: 10_000 });
  await perspectiveSelector
    .getByRole("radio", { name: "Balanced", exact: true })
    .waitFor({ state: "visible", timeout: 10_000 });
  await perspectiveSelector
    .getByRole("radio", { name: "Optimistic", exact: true })
    .waitFor({ state: "visible", timeout: 10_000 });
  const launchEvent = await waitForDeskPromptSentEvent(page, desk.expectedTask);
  if (!isWorkspaceSessionDetailUrl(page.url())) {
    throw new Error(
      `${desk.name} did not navigate into a concrete chat session after Start task.`,
    );
  }
  const result = config.requireDeskResults
    ? await waitForCompletedDeskResult(
        page,
        desk.name,
        config.deskResultTimeoutMs,
      )
    : null;
  const stoppedAfterVerification =
    !result || result.outcome === "waiting_for_user"
      ? await stopVerifiedDeskRun(page)
      : false;
  return {
    outcome: "started",
    sessionUrl: page.url(),
    launchEvent,
    result,
    stoppedAfterVerification,
  };
}

async function verifyReviewedActionChatHandoff(page, config) {
  const draft =
    "Buy <size> BTC on Hyperliquid testnet as a market order with 100 bps max slippage.";
  const exactRequest =
    "Buy 0.001 BTC on Hyperliquid testnet as a market order with 100 bps max slippage.";
  const workspaceId = workspaceIdFromUrl(config.url);
  if (!workspaceId) throw new Error(`Could not parse workspace id from ${config.url}`);

  await page.goto(workspaceUrl(config.url, "session"), {
    waitUntil: "load",
    timeout: 30_000,
  });
  await ensureWorkspaceHomeVisible(page);
  await clickFirstVisible(
    page.getByTestId("open-hyperliquid-desk"),
    "Open Hyperliquid desk card",
  );
  const taskGroup = page
    .getByLabel("Agent tasks")
    .locator("[data-workflow-stage]")
    .filter({ has: page.getByText("Place an order", { exact: true }) })
    .first();
  await taskGroup.waitFor({ state: "visible", timeout: 15_000 });
  await taskGroup
    .getByRole("button", { name: "Prepare in chat", exact: true })
    .click();
  await page.waitForURL(
    (url) => isWorkspaceSessionDetailUrl(url.toString()),
    { timeout: 30_000, waitUntil: "commit" },
  );

  const sessionId = new URL(page.url()).pathname.split("/").at(-1);
  if (!sessionId) throw new Error("Reviewed action did not create a concrete chat id.");
  const composer = page.getByTestId("session-composer-shell");
  await composer.waitFor({ state: "visible", timeout: 20_000 });
  const editor = composer.getByRole("textbox", {
    name: /Ask Matterhorn about Bittensor, markets, longevity, files, or workflows/,
  });
  await editor.waitFor({ state: "visible", timeout: 15_000 });
  const savedDraft = (await editor.innerText()).trim();
  if (savedDraft !== draft) {
    throw new Error(
      `Reviewed action chat did not preserve its editable draft. Received: ${savedDraft || "empty"}`,
    );
  }

  const creationEvidence = await page.evaluate(
    ({ expectedWorkspaceId, expectedSessionId }) => {
      let agents = {};
      try {
        agents = JSON.parse(
          window.localStorage.getItem("matterhorn.session-agents.v1") || "{}",
        );
      } catch {
        agents = {};
      }
      const events = window.__matterhorn?.events?.(160) ?? [];
      return {
        agent: agents[`${expectedWorkspaceId}:${expectedSessionId}`] ?? null,
        draftSaved: events.some(
          (entry) =>
            entry?.name === "desk.task_launch.draft_saved" &&
            entry?.data?.sessionId === expectedSessionId,
        ),
        promptSent: events.some(
          (entry) =>
            entry?.name === "desk.task_launch.prompt_sent" &&
            entry?.data?.sessionId === expectedSessionId,
        ),
      };
    },
    { expectedWorkspaceId: workspaceId, expectedSessionId: sessionId },
  );
  if (creationEvidence.agent !== "matterhorn-hyperliquid") {
    throw new Error(
      `Reviewed action chat lost its session-scoped agent. Received: ${creationEvidence.agent || "none"}`,
    );
  }
  if (!creationEvidence.draftSaved || creationEvidence.promptSent) {
    throw new Error(
      "Reviewed action starter must save an editable draft without sending it to the model.",
    );
  }

  await editor.fill(exactRequest);
  await composer.getByRole("button", { name: "Ask", exact: true }).click();
  await page
    .getByText("Hyperliquid order prepared", { exact: true })
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(
    (expectedSessionId) =>
      (window.__matterhorn?.events?.(160) ?? []).some(
        (entry) =>
          entry?.name === "session.reviewed_action.staged_from_composer" &&
          entry?.data?.sessionId === expectedSessionId &&
          entry?.data?.protocol === "hyperliquid",
      ),
    sessionId,
    { timeout: 15_000 },
  );
  const finalUrl = new URL(page.url());
  if (finalUrl.searchParams.get("panel") !== "hyperliquid") {
    throw new Error("Exact reviewed action did not open the Hyperliquid wallet review panel.");
  }

  return {
    sessionId,
    sessionUrl: page.url(),
    agent: creationEvidence.agent,
    editableDraft: draft,
    exactRequest,
    modelPromptSent: false,
    walletReviewPanel: finalUrl.searchParams.get("panel"),
  };
}

async function runSmoke(config) {
  const report = makeReport(config);
  let browser;
  let page;
  const consoleErrors = [];
  const resourceWarnings = [];
  const networkFailures = [];
  const pageErrors = [];

  try {
    browser = await chromium.launch({ headless: !config.headed });
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1360, height: 920 },
    });
    page = await context.newPage();

    page.on("response", (response) => {
      const status = response.status();
      if (status < 400) return;
      const request = response.request();
      networkFailures.push({
        status,
        method: request.method(),
        url: response.url(),
        resourceType: request.resourceType(),
      });
    });
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (
        /^Failed to load resource: the server responded with a status of 404/i.test(
          text,
        )
      ) {
        const location = message.location();
        if (isOptionalDevWorkspace404(location.url)) return;
        const matchingFailure = networkFailures.find(
          (failure) => failure.url === location.url,
        );
        resourceWarnings.push({
          message: text,
          location,
          ...(matchingFailure ? { network: matchingFailure } : {}),
        });
        return;
      }
      const location = message.location();
      consoleErrors.push(location.url ? `${text} (${location.url})` : text);
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    await stage(
      report,
      "auth_signup",
      "Establish the QA workspace identity",
      async () => {
        if (config.hostedAccount) {
          const account = await createQaAccount(
            context,
            config.url,
            config.serverUrl,
          );
          config.url = workspaceUrlForId(config.url, account.workspaceId);
          report.url = config.url;
          report.artifacts.auth = {
            mode: "email-password",
            freshAccount: true,
            email: account.email,
            organizationId: account.organizationId,
            workspaceId: account.workspaceId,
          };
          return;
        }

        const workspaceId = workspaceIdFromUrl(config.url);
        if (!workspaceId) {
          throw new Error(
            `Fixture smoke URL must contain a workspace id: ${config.url}`,
          );
        }
        // Fixture coverage uses the launcher's preconfigured bearer-scoped
        // workspace. Creating a hosted account in this browser context would
        // install an account cookie whose isolated workspace intentionally
        // cannot access the fixture route. Hosted identity and tenant
        // isolation are exercised separately by --hosted-account.
        report.artifacts.auth = {
          mode: "fixture-workspace",
          freshAccount: false,
          workspaceId,
        };
      },
    );

    await stage(report, "open_app", "Open Matterhorn app", async () => {
      const expectedWorkspaceId = workspaceIdFromUrl(config.url);
      if (!expectedWorkspaceId) {
        throw new Error(`Could not parse workspace id from ${config.url}`);
      }
      await page.goto(config.url, { waitUntil: "load", timeout: 30_000 });
      await page.locator("body").waitFor({ state: "visible", timeout: 15_000 });
      await page.waitForFunction(
        () => (document.querySelector("#root")?.childElementCount ?? 0) > 0,
        undefined,
        { timeout: 30_000 },
      );
      await page
        .getByLabel("Workspace home")
        .waitFor({ state: "visible", timeout: 20_000 });
      assertCurrentWorkspaceRoute(page, expectedWorkspaceId, "App open");
      report.artifacts.workspaceId = expectedWorkspaceId;
    });

    await stage(
      report,
      "home_shell",
      "Check workspace home shell",
      async () => {
        await page
          .getByText(
            "Chats, desks, notes, and saved outputs for this project.",
            { exact: true },
          )
          .waitFor({ state: "visible", timeout: 15_000 });
        await page
          .getByRole("button", { name: "New chat", exact: true })
          .waitFor({ state: "visible", timeout: 15_000 });
        await page
          .getByRole("button", { name: "New note", exact: true })
          .waitFor({ state: "visible", timeout: 15_000 });
        await page
          .getByText("Open a desk", { exact: true })
          .waitFor({ state: "visible", timeout: 15_000 });
        await page
          .getByLabel("Jot a note about outputs")
          .waitFor({ state: "visible", timeout: 15_000 });
        if (await page.getByLabel("Copy project path").count()) {
          throw new Error(
            "The web workspace home exposed a local project path control.",
          );
        }
        if (await page.getByLabel("Open outputs folder").count()) {
          throw new Error(
            "The web workspace home exposed a local outputs-folder control.",
          );
        }
      },
    );

    await stage(
      report,
      "wallet_readiness",
      "Check compact wallet readiness",
      async () => {
        await page
          .getByText("Wallet readiness", { exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .getByText(
            /Sui: (Working|Limited release|Needs setup|Not supported here)/,
          )
          .waitFor({
            state: "visible",
            timeout: 20_000,
          });
        await page.getByLabel("Wallet readiness details").click();
        await page
          .getByText(/review and sign every transaction in your wallet/i)
          .first()
          .waitFor({ state: "visible", timeout: 10_000 });
        await page
          .getByRole("button", { name: "Open wallet settings", exact: true })
          .waitFor({ state: "visible", timeout: 10_000 });
      },
    );

    for (const desk of primaryDeskSmokeScenarios) {
      await stage(
        report,
        `desk_${desk.id}_task_start`,
        `Start a ${desk.name} desk task`,
        async () => {
          const {
            outcome,
            sessionUrl,
            launchEvent,
            result,
            stoppedAfterVerification,
          } = await startPrimaryDeskTask(page, config, desk);
          if (outcome === "provider_setup_required") {
            report.warnings.push(
              `${desk.name} task correctly paused at model setup; no task was sent without a configured provider.`,
            );
            report.artifacts.deskTasksAwaitingModelSetup = [
              ...(report.artifacts.deskTasksAwaitingModelSetup ?? []),
              desk.name,
            ];
            return;
          }
          report.artifacts.startedDeskTasks = [
            ...(report.artifacts.startedDeskTasks ?? []),
            desk.name,
          ];
          report.artifacts.startedDeskTaskSessions = {
            ...(report.artifacts.startedDeskTaskSessions ?? {}),
            [desk.name]: sessionUrl,
          };
          report.artifacts.startedDeskTaskEvents = {
            ...(report.artifacts.startedDeskTaskEvents ?? {}),
            [desk.name]: launchEvent,
          };
          report.artifacts.stoppedDeskTasks = {
            ...(report.artifacts.stoppedDeskTasks ?? {}),
            [desk.name]: stoppedAfterVerification,
          };
          if (result) {
            report.artifacts.completedDeskTasks = [
              ...(report.artifacts.completedDeskTasks ?? []),
              desk.name,
            ];
            report.artifacts.deskTaskResults = {
              ...(report.artifacts.deskTaskResults ?? {}),
              [desk.name]: result,
            };
          }
        },
      );
    }

    await stage(
      report,
      "desk_reviewed_action_chat_handoff",
      "Prepare a reviewed action in chat, then hand it to Wallet",
      async () => {
        report.artifacts.reviewedActionChatHandoff =
          await verifyReviewedActionChatHandoff(page, config);
      },
    );

    await stage(
      report,
      "session_direct_link_reload",
      "Open a persisted chat in a fresh browser context",
      async () => {
        const directSessionUrl =
          report.artifacts.startedDeskTaskSessions?.Bittensor;
        if (typeof directSessionUrl !== "string") {
          report.warnings.push(
            "Skipped direct-link chat reload because no model provider was configured and Bittensor correctly did not create a chat.",
          );
          return;
        }
        const storageState = await context.storageState();
        const refreshContext = await browser.newContext({
          storageState,
          viewport: { width: 390, height: 844 },
        });
        try {
          const refreshPage = await refreshContext.newPage();
          await refreshPage.goto(directSessionUrl, {
            waitUntil: "load",
            timeout: 30_000,
          });
          try {
            await refreshPage
              .getByTestId("session-composer-shell")
              .waitFor({ state: "visible", timeout: 20_000 });
          } catch (error) {
            const screenshotPath = resolve(
              config.outputDir,
              "persisted-chat-fresh-context-failed.png",
            );
            await refreshPage.screenshot({ path: screenshotPath, fullPage: true });
            const diagnostics = await refreshPage.evaluate(() => ({
              url: window.location.href,
              bodyText: document.body.innerText.slice(0, 4_000),
              inspector: window.__matterhorn?.snapshot?.() ?? null,
              events: window.__matterhorn?.events?.(50) ?? [],
            }));
            report.artifacts.directSessionReloadFailure = {
              screenshot: screenshotPath,
              diagnostics,
            };
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(
              `${message}\nFresh-context diagnostics: ${JSON.stringify(diagnostics)}`,
            );
          }
          await refreshPage
            .getByRole("radiogroup", { name: "Response perspective" })
            .waitFor({ state: "visible", timeout: 20_000 });
          if (refreshPage.url() !== directSessionUrl) {
            throw new Error(
              `Persisted chat redirected to ${refreshPage.url()} instead of remaining on its direct URL.`,
            );
          }
          report.artifacts.directSessionReloadUrl = refreshPage.url();
        } finally {
          await refreshContext.close();
        }
      },
    );

    await stage(
      report,
      "desk_longevity_workflow_start",
      "Start the Longevity workflow desk",
      async () => {
        await page.goto(workspaceUrl(config.url, "session"), {
          waitUntil: "load",
          timeout: 30_000,
        });
        await ensureWorkspaceHomeVisible(page);
        await page
          .getByText("Open a desk", { exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await clickFirstVisible(
          page.getByTestId("open-wellness-desk"),
          "Open Longevity desk card",
        );
        await page
          .getByText("Longevity Agent", { exact: true })
          .first()
          .waitFor({ state: "visible", timeout: 20_000 });
        await waitForAnyVisible(
          page,
          [
            page.getByText("7 stages", { exact: true }),
            page.getByText("Run in chat", { exact: true }),
            page.getByText(
              "Ready. Stage outputs will save under outputs/longevity/",
              { exact: false },
            ),
          ],
          "Longevity workflow stages",
          30_000,
        );
        report.artifacts.startedDeskTasks = [
          ...(report.artifacts.startedDeskTasks ?? []),
          "Longevity",
        ];
      },
    );

    await stage(
      report,
      "activity_summary",
      "Check compact Project Activity",
      async () => {
        await page.goto(workspaceUrl(config.url, "session"), {
          waitUntil: "load",
          timeout: 30_000,
        });
        await page
          .getByText("Project Activity", { exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        await waitForAnyVisible(
          page,
          [
            page.getByText("Run history", { exact: true }),
            page.getByText("Run started", { exact: false }),
            page.getByText("Bittensor", { exact: false }),
          ],
          "compact project activity",
          30_000,
        );
        await page
          .getByText("Project Activity", { exact: true })
          .scrollIntoViewIfNeeded();
      },
    );

    await stage(
      report,
      "project_history",
      "Open full Project history",
      async () => {
        const historyUrl = workspaceUrl(config.url, "history");
        const expectedWorkspaceId = workspaceIdFromUrl(config.url);
        await page.goto(historyUrl, { waitUntil: "load", timeout: 30_000 });
        assertCurrentWorkspaceRoute(
          page,
          expectedWorkspaceId,
          "Project history",
        );
        await page
          .locator("main")
          .getByRole("heading", { name: "Project history", exact: true })
          .last()
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .getByLabel("Project history filters")
          .waitFor({ state: "visible", timeout: 20_000 });
        await waitForAnyVisible(
          page,
          [
            page.getByText(/actual event(s)? shown/),
            page.getByText("Run started", { exact: false }),
            page.getByText("No runs recorded yet", { exact: false }),
          ],
          "project history rows or empty state",
          20_000,
        );
        report.artifacts.projectHistoryUrl = page.url();
      },
    );

    await stage(
      report,
      "notes_panel",
      "Open Notes inside session shell",
      async () => {
        await page.goto(`${workspaceUrl(config.url, "session")}?panel=notes`, {
          waitUntil: "load",
          timeout: 30_000,
        });
        const notesPanel = page.getByRole("region", { name: "Notes panel" });
        await notesPanel.waitFor({ state: "visible", timeout: 20_000 });
        await notesPanel
          .getByRole("heading", { name: "Notes", exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await notesPanel
          .getByRole("button", { name: "New note", exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        const notesSearch = notesPanel.getByPlaceholder(/Search notes/);
        if (!(await notesSearch.isVisible().catch(() => false))) {
          const createFirstNote = notesPanel.getByRole("button", {
            name: "Create first note",
            exact: true,
          });
          await createFirstNote.waitFor({ state: "visible", timeout: 20_000 });
          await createFirstNote.click();
          const notesEditor = page.getByRole("region", {
            name: "Notes editor",
          });
          await notesEditor.waitFor({ state: "visible", timeout: 20_000 });
          await notesEditor
            .getByRole("button", { name: "Back to notes", exact: true })
            .click();
          report.artifacts.createdFirstNote = true;
        }
        await notesSearch.waitFor({ state: "visible", timeout: 20_000 });
        await notesPanel
          .getByRole("combobox", { name: "Filter notes", exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .getByLabel("Back to chat")
          .waitFor({ state: "visible", timeout: 20_000 });
        report.artifacts.notesPanelUrl = page.url();
      },
    );

    await stage(
      report,
      "memory_panel",
      "Open Memory review inside session shell",
      async () => {
        await page.goto(`${workspaceUrl(config.url, "session")}?panel=memory`, {
          waitUntil: "load",
          timeout: 30_000,
        });
        await page
          .getByText("Memory", { exact: true })
          .first()
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .getByText("Review suggestions before saving.", { exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .getByText("Memory review", { exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .getByLabel("Memory inbox filters")
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .getByRole("button", { name: "Refresh memory review", exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        report.artifacts.memoryPanelUrl = page.url();
      },
    );

    await stage(
      report,
      "wallet_panel",
      "Open unified Wallet panel",
      async () => {
        await page.goto(`${workspaceUrl(config.url, "session")}?panel=wallet`, {
          waitUntil: "load",
          timeout: 30_000,
        });
        await page
          .getByText("Wallets", { exact: true })
          .first()
          .waitFor({ state: "visible", timeout: 20_000 });
        await waitForAnyVisible(
          page,
          [
            page.getByText("Install or enable Phantom for Sui", {
              exact: true,
            }),
            page.getByText("Connect Phantom for Sui", { exact: true }),
            page.getByText("Connected wallet", { exact: true }),
          ],
          "Phantom connection action or connected state",
          20_000,
        );
        report.artifacts.walletPanelUrl = page.url();
      },
    );

    await stage(
      report,
      "settings_overview_support_report",
      "Check Settings overview and support report download",
      async () => {
        await page.goto(workspaceUrl(config.url, "settings/overview"), {
          waitUntil: "load",
          timeout: 30_000,
        });
        await page
          .getByRole("heading", { name: "Settings", exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .getByText("Workspace health", { exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .getByText("Data & privacy", { exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        const moreWorkspaceControls = page.getByRole("button", {
          name: /More workspace controls/i,
        });
        await moreWorkspaceControls.waitFor({
          state: "visible",
          timeout: 20_000,
        });
        await moreWorkspaceControls.click();
        const workAndEvidence = page.getByRole("button", {
          name: /Work & evidence/i,
        });
        await workAndEvidence.waitFor({ state: "visible", timeout: 20_000 });
        await workAndEvidence.click();
        await page
          .getByText("Task History", { exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .getByText("Project Activity", { exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        const workspaceDiagnostics = page.getByRole("button", {
          name: /Workspace & diagnostics/i,
        });
        await workspaceDiagnostics.waitFor({
          state: "visible",
          timeout: 20_000,
        });
        await workspaceDiagnostics.click();
        const supportButtons = [
          page.getByRole("button", { name: "Support report", exact: true }),
          page.getByRole("button", { name: "Download report", exact: true }),
        ];
        await waitForAnyVisible(
          page,
          [
            ...supportButtons,
            page.getByRole("button", { name: "Copy command", exact: true }),
          ],
          "Support report or offline diagnostics button",
        );

        const supportButton =
          (await firstVisible(supportButtons[0])) ??
          (await firstVisible(supportButtons[1]));
        if (supportButton) {
          await supportButton.scrollIntoViewIfNeeded();
          await supportButton.waitFor({ state: "visible", timeout: 10_000 });
          const handle = await supportButton.elementHandle();
          if (!handle)
            throw new Error("Support report button disappeared before click.");
          await page.waitForFunction(
            (element) =>
              !(element instanceof HTMLButtonElement) || !element.disabled,
            handle,
            { timeout: 15_000 },
          );
          const downloadPromise = page.waitForEvent("download", {
            timeout: 15_000,
          });
          await supportButton.click();
          const download = await downloadPromise;
          const suggestedFilename = download.suggestedFilename();
          if (!/matterhorn-backend-support.*\.json$/i.test(suggestedFilename)) {
            throw new Error(
              `Unexpected support report filename: ${suggestedFilename}`,
            );
          }
          report.artifacts.supportReport = { suggestedFilename };
        } else {
          const copyCommand = await firstVisible(
            page.getByRole("button", { name: "Copy command", exact: true }),
          );
          if (!copyCommand)
            throw new Error(
              "Could not find support report download or offline copy command.",
            );
          await copyCommand.scrollIntoViewIfNeeded();
          await page
            .getByText(
              "Copy and run this in your terminal to capture a redacted readiness report.",
              { exact: true },
            )
            .waitFor({ state: "visible", timeout: 10_000 });
          report.artifacts.supportReport = { offlineDiagnostics: true };
        }
      },
    );

    await stage(
      report,
      "settings_wallet",
      "Check unified Wallet settings",
      async () => {
        await page.goto(workspaceUrl(config.url, "settings/wallet"), {
          waitUntil: "load",
          timeout: 30_000,
        });
        await page
          .getByText("Wallets", { exact: true })
          .first()
          .waitFor({ state: "visible", timeout: 20_000 });
        await waitForAnyVisible(
          page,
          [
            page.getByText("Install or enable Phantom for Sui", {
              exact: true,
            }),
            page.getByText("Connect Phantom for Sui", { exact: true }),
            page.getByText("Connected wallet", { exact: true }),
          ],
          "wallet settings Phantom connection action or connected state",
          20_000,
        );
        report.artifacts.walletSettingsUrl = page.url();
      },
    );

    await stage(
      report,
      "settings_ai_models",
      "Check AI provider state and model picker",
      async () => {
        await page.goto(workspaceUrl(config.url, "settings/ai"), {
          waitUntil: "load",
          timeout: 30_000,
        });
        await page
          .getByRole("heading", { name: "Models", exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        const availableModels = page.getByRole("heading", {
          name: "Available models",
          exact: true,
        });
        const modelProviders = page.getByRole("heading", {
          name: "Model providers",
          exact: true,
        });
        const addCudosKey = page.getByRole("button", {
          name: "Add CUDOS API key",
          exact: true,
        });
        await waitForAnyVisible(
          page,
          [availableModels, modelProviders],
          "connected model catalog or explicit provider setup state",
          20_000,
        );

        if (await availableModels.isVisible().catch(() => false)) {
          await page
            .getByText("Connected model catalog", { exact: true })
            .waitFor({ state: "visible", timeout: 20_000 });
          await page
            .getByRole("button", { name: "Browse models", exact: true })
            .click();
          const modelDialog = page.getByRole("dialog", { name: "Models" });
          await modelDialog.waitFor({ state: "visible", timeout: 20_000 });
          const smokeProvider = modelDialog.getByText(
            "Matterhorn smoke provider",
            { exact: true },
          );
          await smokeProvider.waitFor({ state: "visible", timeout: 20_000 });
          await smokeProvider.click();
          const smokeModel = modelDialog.getByRole("button", {
            name: /Smoke model/,
          });
          await smokeModel.waitFor({ state: "visible", timeout: 20_000 });
          await smokeModel.click();
          // Selection can close this picker immediately. Escape is also the
          // supported keyboard dismissal when it remains open.
          if (await modelDialog.isVisible().catch(() => false)) {
            await page.keyboard.press("Escape");
            await modelDialog.waitFor({ state: "hidden", timeout: 20_000 });
          }
          report.artifacts.aiProviderState = "connected";
        } else {
          await modelProviders.waitFor({ state: "visible", timeout: 20_000 });
          await page
            .getByText("ASI:Cloud", { exact: true })
            .waitFor({ state: "visible", timeout: 20_000 });
          const deploymentUnavailable = page.getByText(
            "Unavailable in this deployment",
            { exact: true },
          );
          if (await deploymentUnavailable.isVisible().catch(() => false)) {
            if (await addCudosKey.count()) {
              throw new Error(
                "The web build exposed a raw provider-key control.",
              );
            }
            report.artifacts.aiProviderState = "deployment-managed-unavailable";
            report.warnings.push(
              "ASI:Cloud is not configured in this deployment. Live model responses remain an owner acceptance prerequisite.",
            );
          } else {
            await addCudosKey.waitFor({ state: "visible", timeout: 20_000 });
            await addCudosKey.click();
            const providerDialog = page.getByRole("dialog", {
              name: "Add a model provider",
            });
            await providerDialog.waitFor({ state: "visible", timeout: 20_000 });
            await providerDialog
              .getByText("CUDOS / ASI:Cloud", { exact: true })
              .waitFor({ state: "visible", timeout: 20_000 });
            await page.keyboard.press("Escape");
            await providerDialog.waitFor({ state: "hidden", timeout: 20_000 });
            report.artifacts.aiProviderState = "local-setup-required";
            report.warnings.push(
              "No local model provider is connected. The provider setup flow works, but live model responses remain an owner acceptance prerequisite.",
            );
          }
        }
        report.artifacts.aiSettingsUrl = page.url();
      },
    );

    await stage(
      report,
      "settings_mcp_connections",
      "Check live MCP connection names",
      async () => {
        await page.goto(workspaceUrl(config.url, "settings/extensions/mcp"), {
          waitUntil: "load",
          timeout: 30_000,
        });
        await page
          .getByRole("heading", { name: "MCPs & Tools", exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await page.getByText("Your apps", { exact: true }).waitFor({
          state: "visible",
          timeout: 20_000,
        });
        const configuredServer = page.getByText("Matterhorn Desks MCP", {
          exact: true,
        });
        const emptySummary = page.getByText("No apps connected yet", {
          exact: true,
        });
        await waitForAnyVisible(
          page,
          [configuredServer, emptySummary],
          "configured MCP server or explicit empty state",
          20_000,
        );
        if (await configuredServer.isVisible().catch(() => false)) {
          await page.getByText("Ready", { exact: true }).waitFor({
            state: "visible",
            timeout: 20_000,
          });
          report.artifacts.connectedMcpServers = ["Matterhorn Desks MCP"];
        } else {
          await emptySummary.waitFor({ state: "visible", timeout: 20_000 });
          await page
            .getByText("Bittensor MCP", { exact: true })
            .waitFor({ state: "visible", timeout: 20_000 });
          await page
            .getByText("Hyperliquid MCP", { exact: true })
            .waitFor({ state: "visible", timeout: 20_000 });
          report.artifacts.connectedMcpServers = [];
        }
        report.artifacts.mcpSettingsUrl = page.url();
      },
    );

    await stage(
      report,
      "settings_billing",
      "Check Billing settings payment flow copy",
      async () => {
        const requestedBillingUrl = workspaceUrl(
          config.url,
          "settings/billing",
        );
        await page.goto(requestedBillingUrl, {
          waitUntil: "load",
          timeout: 30_000,
        });
        const billingHeading = page
          .locator("main")
          .getByRole("heading", { name: "Billing", exact: true })
          .last();
        const billingVisible = await billingHeading
          .isVisible({ timeout: 2_000 })
          .catch(() => false);
        if (!billingVisible) {
          const overviewUrl = workspaceUrl(config.url, "settings/overview");
          await page
            .locator("main")
            .getByRole("heading", { name: "Overview", exact: true })
            .last()
            .waitFor({
              state: "visible",
              timeout: 20_000,
            });
          if (page.url() !== overviewUrl) {
            throw new Error(
              `Hidden Billing route resolved to ${page.url()} instead of the safe Overview fallback.`,
            );
          }
          report.artifacts.billing = {
            status: "hidden_by_launch_policy",
            requestedUrl: requestedBillingUrl,
            resolvedUrl: page.url(),
          };
          return;
        }
        await page
          .locator("main")
          .getByRole("heading", { name: "Matterhorn Plus", exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .locator("main")
          .getByRole("heading", { name: "Matterhorn Max", exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .getByText("$9.99/month", { exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .getByText("$89.99/month", { exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await waitForAnyVisible(
          page,
          [
            page.getByText("Live charges off", { exact: true }),
            page.getByText("Live payments disabled", { exact: true }),
          ],
          "billing live-payment safety state",
          20_000,
        );
        await page
          .getByText("What billing changes", { exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        report.artifacts.billing = { status: "visible", url: page.url() };
      },
    );

    await stage(
      report,
      "settings_generated_media",
      "Check Generated media settings surface",
      async () => {
        const requestedGeneratedMediaUrl = workspaceUrl(
          config.url,
          "settings/generated-media",
        );
        await page.goto(requestedGeneratedMediaUrl, {
          waitUntil: "load",
          timeout: 30_000,
        });
        const productionReadiness = page.getByText("Production readiness", {
          exact: true,
        });
        const generatedMediaHeading = page.getByRole("heading", {
          name: "Generated media",
          exact: true,
        });
        const overviewHeading = page.getByRole("heading", {
          name: "Overview",
          exact: true,
        });
        await waitForAnyVisible(
          page,
          [productionReadiness, generatedMediaHeading, overviewHeading],
          "Generated media settings or the safe Overview fallback",
          20_000,
        );
        const generatedMediaVisible =
          (await productionReadiness.isVisible().catch(() => false)) ||
          (await generatedMediaHeading.isVisible().catch(() => false));
        if (!generatedMediaVisible) {
          const overviewUrl = workspaceUrl(config.url, "settings/overview");
          await page
            .locator("main")
            .getByRole("heading", { name: "Overview", exact: true })
            .last()
            .waitFor({
              state: "visible",
              timeout: 20_000,
            });
          if (page.url() !== overviewUrl) {
            throw new Error(
              `Hidden Generated media route resolved to ${page.url()} instead of the safe Overview fallback.`,
            );
          }
          report.artifacts.generatedMedia = {
            status: "hidden_by_launch_policy",
            requestedUrl: requestedGeneratedMediaUrl,
            resolvedUrl: page.url(),
          };
          return;
        }
        await productionReadiness.waitFor({
          state: "visible",
          timeout: 20_000,
        });
        await page
          .getByText("Media library", { exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .getByRole("button", { name: "Generate image", exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .getByText("Diagnostics and readiness report", { exact: true })
          .click();
        await page
          .getByRole("button", { name: "Run diagnostics", exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        await page
          .getByText("Storage and data controls", { exact: true })
          .waitFor({ state: "visible", timeout: 20_000 });
        report.artifacts.generatedMedia = {
          status: "visible",
          url: page.url(),
        };
      },
    );

    const screenshotPath = resolve(
      config.outputDir,
      "matterhorn-product-browser-smoke.png",
    );
    await mkdir(config.outputDir, { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    report.artifacts.screenshot = screenshotPath;
    report.artifacts.finalUrl = page.url();
    report.warnings = resourceWarnings;
    const actionableNetworkFailures = networkFailures.filter(
      shouldFailOnNetworkResponse,
    );
    const networkErrors = actionableNetworkFailures.map(networkFailureMessage);
    report.networkFailures = actionableNetworkFailures;
    report.ignoredNetworkResponses = networkFailures.filter(
      (failure) => !shouldFailOnNetworkResponse(failure),
    );
    report.errors = [...consoleErrors, ...pageErrors, ...networkErrors];
    report.ready =
      report.stages.every((item) => item.status === "pass") &&
      report.errors.length === 0;
  } catch (error) {
    report.ready = false;
    report.error = error instanceof Error ? error.message : String(error);
    report.warnings = resourceWarnings;
    const actionableNetworkFailures = networkFailures.filter(
      shouldFailOnNetworkResponse,
    );
    const networkErrors = actionableNetworkFailures.map(networkFailureMessage);
    report.networkFailures = actionableNetworkFailures;
    report.ignoredNetworkResponses = networkFailures.filter(
      (failure) => !shouldFailOnNetworkResponse(failure),
    );
    report.errors = [...consoleErrors, ...pageErrors, ...networkErrors];
    if (page) {
      try {
        await mkdir(config.outputDir, { recursive: true });
        const failedScreenshot = resolve(
          config.outputDir,
          "matterhorn-product-browser-smoke-failed.png",
        );
        await page.screenshot({ path: failedScreenshot, fullPage: true });
        report.artifacts.failedScreenshot = failedScreenshot;
      } catch {
        // Best-effort evidence only.
      }
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    if (browser) await browser.close();
  }

  await mkdir(config.outputDir, { recursive: true });
  const reportPath = resolve(config.outputDir, "summary.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  report.artifacts.report = reportPath;
  return report;
}

function emitReport(report, config) {
  if (config.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `Matterhorn product browser smoke: ${report.ready ? "PASS" : "FAIL"}\n`,
  );
  for (const stageItem of report.stages) {
    process.stdout.write(
      `- ${stageItem.status.toUpperCase()} ${stageItem.id}: ${stageItem.label}${stageItem.error ? ` (${stageItem.error})` : ""}\n`,
    );
  }
  if (report.errors.length) {
    process.stdout.write(`Browser errors: ${report.errors.length}\n`);
    for (const error of report.errors) process.stdout.write(`  - ${error}\n`);
  }
  if (report.warnings.length) {
    process.stdout.write(`Browser warnings: ${report.warnings.length}\n`);
  }
  if (report.networkFailures?.length) {
    process.stdout.write(
      `Network failures: ${report.networkFailures.length}\n`,
    );
    for (const failure of report.networkFailures) {
      process.stdout.write(`  - ${networkFailureMessage(failure)}\n`);
    }
  }
  process.stdout.write(`Report: ${report.artifacts.report}\n`);
  if (report.artifacts.screenshot || report.artifacts.failedScreenshot) {
    process.stdout.write(
      `Screenshot: ${report.artifacts.screenshot || report.artifacts.failedScreenshot}\n`,
    );
  }
}

const config = parseArgs();
if (config.help) {
  printHelp();
  process.exit(0);
}

runSmoke(config)
  .then((report) => {
    emitReport(report, config);
    if (config.strict && !report.ready) process.exit(1);
  })
  .catch((error) => {
    console.error(
      error instanceof Error ? error.stack || error.message : String(error),
    );
    process.exit(1);
  });
