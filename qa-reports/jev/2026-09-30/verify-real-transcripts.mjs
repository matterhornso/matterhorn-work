// Read-only browser verification of already completed disposable QA conversations.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
const data = process.env.MATTERHORN_JEV_QA_ACCOUNT_DIR;
if (!data || !/^\/private\/tmp\/matterhorn-account-demo-[a-zA-Z0-9]+$/.test(data)) throw new Error("Disposable QA directory required");
const login = JSON.parse(readFileSync(`${data}/test-login.json`, "utf8"));
const results = JSON.parse(readFileSync(new URL("./real-chat-results.json", import.meta.url), "utf8"));
if (!["[::1]", "localhost", "127.0.0.1"].includes(new URL(login.url).hostname)) throw new Error("Loopback only");
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const auth = await context.request.post(`${login.url}/api/auth/sign-in/email`, { data: { email: login.email, password: login.password } });
  if (!auth.ok()) throw new Error(`Sign-in failed: ${auth.status()}`);
  const page = await context.newPage();
  await page.goto(login.url);
  await page.getByRole("navigation", { name: "Desks" }).waitFor();
  const workspace = new URL(page.url()).pathname.match(/workspace\/([^/]+)/)?.[1];
  if (!workspace) throw new Error("Workspace route missing");
  for (const row of results.evidence) {
    await page.goto(`${login.url}/workspace/${workspace}/session/${row.sessionId}`);
    await page.getByText(row.answer.slice(0, 60), { exact: false }).first().waitFor({ timeout: 45_000 });
    await page.getByText("Loading transcript...", { exact: true }).waitFor({ state: "hidden" });
    await page.screenshot({ path: new URL(`./real-chat-captures/${row.desk.toLowerCase().replaceAll(" ", "-")}.png`, import.meta.url).pathname, fullPage: true });
    console.log(`${row.desk}: persisted real answer visible`);
  }
} finally { await browser.close(); }
