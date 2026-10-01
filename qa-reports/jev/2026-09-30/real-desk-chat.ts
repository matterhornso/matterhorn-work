// Disposable local-account browser probe. Credentials stay in memory and outside reports.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const data = process.env.MATTERHORN_JEV_QA_ACCOUNT_DIR;
if (!data || !/^\/private\/tmp\/matterhorn-account-demo-[a-zA-Z0-9]+$/.test(data)) throw new Error("Exact disposable QA account directory required");
const login = JSON.parse(readFileSync(`${data}/test-login.json`, "utf8"));
const diagnostics = JSON.parse(readFileSync(`${data}/local-diagnostics.json`, "utf8"));
if (!["[::1]", "localhost", "127.0.0.1"].includes(new URL(login.url).hostname)) throw new Error("Loopback account only");
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const signed = await context.request.post(`${login.url}/api/auth/sign-in/email`, { data: { email: login.email, password: login.password } });
  if (!signed.ok()) throw new Error(`Normal QA sign-in failed: ${signed.status()}`);
  const apiLogin = await fetch(`${diagnostics.backend}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: login.email, password: login.password }) });
  const cookie = apiLogin.headers.get("set-cookie")?.split(";")[0];
  if (!apiLogin.ok || !cookie) throw new Error("QA evidence login failed");
  const evidence = [];
  const captureDir = new URL("./real-chat-captures/", import.meta.url).pathname;
  mkdirSync(captureDir, { recursive: true });
  const page = await context.newPage();
  await page.goto(login.url);
  await page.waitForTimeout(1500);
  for (const desk of ["Private AI", "Bittensor", "Hyperliquid", "Polymarket", "Sui"]) {
    const previousUrl = page.url();
    await page.getByRole("navigation", { name: "Desks" }).getByRole("button", { name: `${desk} logo ${desk}`, exact: true }).click();
    await page.waitForURL(url => url.href !== previousUrl && /\/session\/ses_/.test(url.pathname));
    // Test persisted desk deep links, not an editor retained during route hydration.
    await page.reload();
    const composer = page.locator('[contenteditable="true"][role="textbox"]');
    try { await composer.waitFor(); } catch (error) {
      await page.screenshot({ path: `${captureDir}/failure.png`, fullPage: true });
      console.log(JSON.stringify({ desk, url: page.url(), visibleText: (await page.locator("body").innerText()).slice(-6000) }));
      throw error;
    }
    await page.getByRole("button", { name: "Change model" }).filter({ hasText: "ASI1" }).waitFor();
    const prompt = desk === "Private AI" ? "In two sentences, explain the difference between a public wallet address and a private key. Do not use tools."
      : `In two sentences, explain what ${desk} is. General concepts only; do not use tools, quote current data, give investment advice or propose a transaction.`;
    await composer.fill(prompt);
    if (desk === "Private AI") {
      await page.reload(); await composer.waitFor();
      if (!(await composer.innerText()).includes(prompt)) throw new Error("Draft lost on reload");
    }
    const dispatch = page.waitForResponse(response => response.request().method() === "POST" && /\/messages$/.test(new URL(response.url()).pathname), { timeout: 125_000 });
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    let response;
    try { response = await dispatch; } catch (error) {
      await page.screenshot({ path: `${captureDir}/dispatch-failure.png`, fullPage: true });
      console.log(JSON.stringify({ desk, url: page.url(), visibleText: (await page.locator("body").innerText()).slice(-6000) }));
      throw error;
    }
    const match = new URL(page.url()).pathname.match(/workspace\/([^/]+)\/session\/([^/]+)/);
    if (!match) throw new Error("Expected real session URL");
    let answer;
    for (let attempt = 0; attempt < 90; attempt++) {
      const snapshot = await fetch(`${diagnostics.backend}/workspace/${match[1]}/sessions/${match[2]}/messages`, { headers: { cookie } });
      if (!snapshot.ok) throw new Error(`Readback failed: ${snapshot.status}`);
      const history = await snapshot.json();
      answer = history.items?.filter(item => item.info?.role === "assistant").at(-1);
      if (answer?.info?.finish || answer?.info?.error || response.status() !== 202) break;
      await page.waitForTimeout(1000);
    }
    const text = answer?.parts?.filter(part => part.type === "text").map(part => part.text).join("\n") ?? "";
    const row = { desk, sessionId: match[2], dispatch: response.status(), finish: answer?.info?.finish, error: answer?.info?.error?.name,
      model: answer?.info?.modelID, provider: answer?.info?.providerID, tokens: answer?.info?.tokens, answer: text,
      jevDisabled: await page.getByRole("button", { name: "Jev: Off", exact: true }).isDisabled() };
    evidence.push(row);
    writeFileSync(new URL("./real-chat-results.json", import.meta.url), JSON.stringify({ scope: "In progress: disposable local CUDOS chat; no live Jev or chain reads", evidence }, null, 2) + "\n");
    console.log(JSON.stringify({ ...row, answer: text.slice(0, 180) }));
    if (text) await page.getByText(text.slice(0, 60), { exact: false }).first().waitFor({ timeout: 45_000 });
    await page.screenshot({ path: `${captureDir}/${desk.toLowerCase().replaceAll(" ", "-")}.png`, fullPage: true });
    if (response.status() !== 202 || answer?.info?.error || !text || answer?.info?.finish !== "stop") break;
  }
  const w = await fetch(`${diagnostics.backend}/workspaces`, { headers: { cookie } });
  const workspaceId = (await w.json()).items[0].id;
  const usage = await fetch(`${diagnostics.backend}/workspace/${workspaceId}/model-usage/status`, { headers: { cookie } });
  const status = (await usage.json()).status;
  const totals = { used: status?.monthly?.usedTokens, charged: status?.monthly?.chargedTokens, pending: status?.pendingRequests };
  console.log(JSON.stringify({ totals }));
  writeFileSync(new URL("./real-chat-results.json", import.meta.url), JSON.stringify({ scope: "Disposable local account; real CUDOS inference, enforcing guard; Jev unavailable, no live chain reads", evidence, totals }, null, 2) + "\n");
  if (evidence.length !== 5 || evidence.some(row => row.dispatch !== 202 || row.finish !== "stop" || row.error || !row.answer) || totals.pending !== 0) process.exitCode = 1;
} finally { await browser.close(); }
