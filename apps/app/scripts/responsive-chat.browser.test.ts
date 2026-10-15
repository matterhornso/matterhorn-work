import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, firefox, webkit, type Browser, type Locator, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { startResponsiveChatFixture } from "./responsive-chat-fixture";

let browser: Browser;
let server: Awaited<ReturnType<typeof startResponsiveChatFixture>>;
beforeAll(async () => {
  server = await startResponsiveChatFixture();
  const engine = process.env.UI_QA_BROWSER ?? "chromium";
  if (!["chromium", "firefox", "webkit"].includes(engine)) throw new Error("Unknown QA browser engine");
  browser = await (engine === "firefox" ? firefox : engine === "webkit" ? webkit : chromium).launch();
}, 60_000);
afterAll(async () => { await browser?.close(); server?.stop(true); });

async function fitsHorizontally(locator: Locator, width: number) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Missing control bounds");
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
}

async function openFixture(page: Page, theme: string) {
  await page.route("**/*", route => new URL(route.request().url()).origin === server.url.origin ? route.continue() : route.abort());
  await page.goto(`${server.url}?theme=${theme}`);
  await page.getByText("Response details", { exact: true }).waitFor();
  await page.getByText("Jev needs operator setup. Regular chat still works.", { exact: true }).waitFor();
}

const viewports = [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 523, height: 725 },
  { width: 768, height: 900 },
  { width: 1280, height: 900 },
  { width: 640, height: 450 }, // Effective CSS viewport of a 1280x900 window at 200% browser zoom.
  { width: 844, height: 390 }, // Phone landscape / on-screen keyboard height.
];

for (const theme of ["light", "dark"]) {
  test(`${theme}: transcript, receipt and composer reflow without hiding controls`, async () => {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
      page.setDefaultTimeout(5000);
      try {
        await openFixture(page, theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const header = page.locator(".matterhorn-workspace-header");
        for (const control of await header.locator("button:visible").all()) {
          await fitsHorizontally(control, viewport.width);
          expect(await control.evaluate(el => {
            const box = el.getBoundingClientRect();
            const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
            return Boolean(hit && (el === hit || el.contains(hit)));
          })).toBe(true);
        }
        expect(await header.getByRole("button", { name: "Rename chat", exact: true }).isVisible()).toBe(true);
        expect(await header.getByRole("button", { name: "Jot a note", exact: true }).isVisible()).toBe(true);
        const transcript = page.locator(".matterhorn-chat-transcript");
        const transcriptBox = await transcript.boundingBox();
        expect(transcriptBox?.height).toBeGreaterThanOrEqual(viewport.height <= 540 ? 190 : 140);
        const receipt = page.getByText("Response details", { exact: true }).locator("..");
        await receipt.scrollIntoViewIfNeeded();
        await fitsHorizontally(receipt, viewport.width);
        expect(await receipt.innerText()).toContain("7,098 tokens");
        await receipt.click();
        expect(await page.getByText("The provider's training policy has not been verified.", { exact: false }).isVisible()).toBe(true);
        await receipt.click();
        const navigation = page.getByRole("navigation", { name: "Conversation navigation" });
        const receiptBox = await receipt.boundingBox();
        const navBox = await navigation.boundingBox();
        if (receiptBox && navBox) expect(receiptBox.y + receiptBox.height).toBeLessThanOrEqual(navBox.y + 1);
        for (const control of [
          page.getByRole("button", { name: "Privacy details", exact: true }),
          page.getByRole("button", { name: "Chat options", exact: true }),
          page.getByRole("button", { name: "Set up a private model", exact: true }),
          page.getByRole("button", { name: "Change model", exact: true }),
          page.getByRole("button", { name: "Attach files", exact: true }),
          page.getByRole("button", { name: "Commands, skills, and MCPs", exact: true }),
        ]) {
          await control.scrollIntoViewIfNeeded();
          expect(await control.isVisible()).toBe(true);
          await fitsHorizontally(control, viewport.width);
        }
        const editor = page.getByRole("textbox");
        await editor.fill("Keep this synthetic draft while opening model and privacy controls.");
        await page.getByRole("button", { name: "Change model", exact: true }).click();
        await page.getByRole("combobox", { name: "Search models", exact: true }).waitFor();
        await page.keyboard.press("Escape");
        expect(await editor.innerText()).toBe("Keep this synthetic draft while opening model and privacy controls.");
        for (const [control, title] of [["Privacy details", "Provider privacy"], ["Set up a private model", "Private model setup"]]) {
          await page.getByRole("button", { name: control, exact: true }).click();
          await page.getByRole("heading", { name: title, exact: true }).waitFor();
          await page.getByRole("button", { name: "Close fixture dialog", exact: true }).click();
          expect(await editor.innerText()).toBe("Keep this synthetic draft while opening model and privacy controls.");
        }
        const options = page.getByRole("button", { name: "Chat options", exact: true });
        await options.click();
        const menu = page.getByRole("dialog", { name: "Chat options", exact: true });
        await fitsHorizontally(menu, viewport.width);
        const option = menu.getByRole("radio").first();
        await option.scrollIntoViewIfNeeded();
        await option.click();
        if (await page.getByRole("button", { name: "Close Chat options", exact: true }).isVisible()) await page.getByRole("button", { name: "Close Chat options", exact: true }).click();
        else await options.click();
        expect(await editor.innerText()).toBe("Keep this synthetic draft while opening model and privacy controls.");
        const captureRoot = process.env.UI_QA_CAPTURE_DIR;
        if (captureRoot) {
          await mkdir(captureRoot, { recursive: true });
          await editor.fill("");
          await transcript.evaluate(el => { el.scrollTop = el.scrollHeight; });
          await page.screenshot({ path: `${captureRoot}/responsive-chat-${theme}-${viewport.width}x${viewport.height}.png`, fullPage: true });
        }
      } finally { await page.close(); }
    }
  }, 120_000);
}

test("narrow chat retains draft through resize and exposes Stop for an active synthetic request", async () => {
  const page = await browser.newPage({ viewport: { width: 523, height: 725 }, reducedMotion: "reduce" });
  page.setDefaultTimeout(5000);
  try {
    await openFixture(page, "dark");
    const editor = page.getByRole("textbox");
    await editor.fill("Explain public Bittensor data in this synthetic test.");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await editor.innerText()).toBe("Explain public Bittensor data in this synthetic test.");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    const stop = page.getByRole("button", { name: "Stop generating", exact: true });
    await stop.waitFor();
    await fitsHorizontally(stop, 390);
    await stop.click();
    await page.getByRole("button", { name: "Ask", exact: true }).waitFor();
    const evidence = await (await page.request.get(`${server.url}__qa/evidence`)).json();
    expect(evidence.dispatched).toBe(1);
    expect(evidence.aborted).toBe(1);
    expect(await page.getByText("Jev needs operator setup. Regular chat still works.", { exact: true }).isVisible()).toBe(true);
  } finally { await page.close(); }
}, 20_000);

test("tall mobile and narrow desktop columns keep tool/options menus unclipped", async () => {
  for (const width of [320, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    page.setDefaultTimeout(5000);
    try {
      await openFixture(page, "dark");
      const column = page.locator(".matterhorn-chat-column");
      if (width === 1280) await column.evaluate(el => { el.style.width = "360px"; el.style.maxWidth = "360px"; });
      const editor = page.getByRole("textbox");
      await editor.fill("Keep this narrow-column draft.");
      for (const label of ["Commands, skills, and MCPs", "Chat options"]) {
        const trigger = page.getByRole("button", { name: label, exact: true });
        await trigger.click();
        const menu = page.getByRole("dialog", { name: label, exact: true });
        await menu.waitFor();
        await page.getByRole("button", { name: `Close ${label}`, exact: true }).waitFor();
        await fitsHorizontally(menu, width);
        const actions = label === "Chat options" ? menu.getByRole("radio") : menu.locator(".matterhorn-tool-menu-list button");
        for (const action of [actions.first(), actions.last()]) {
          await action.scrollIntoViewIfNeeded();
          expect(await action.evaluate(el => {
            const box = el.getBoundingClientRect();
            const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
            return Boolean(hit && (el === hit || el.contains(hit)));
          })).toBe(true);
        }
        // Changing the viewport while the popup is open must not strand it or the draft.
        await page.setViewportSize({ width, height: 700 });
        await fitsHorizontally(menu, width);
        if (width === 1280) {
          await column.evaluate(el => { el.style.width = "700px"; el.style.maxWidth = "700px"; });
          await page.getByRole("button", { name: `Close ${label}`, exact: true }).waitFor({ state: "hidden" });
          await menu.waitFor();
          await column.evaluate(el => { el.style.width = "360px"; el.style.maxWidth = "360px"; });
          await page.getByRole("button", { name: `Close ${label}`, exact: true }).waitFor();
        }
        await page.keyboard.press("Escape");
        await menu.waitFor({ state: "hidden" });
        expect(await trigger.evaluate(el => el === document.activeElement)).toBe(true);
        expect(await editor.innerText()).toBe("Keep this narrow-column draft.");
        await page.setViewportSize({ width, height: 900 });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally { await page.close(); }
  }
}, 30_000);

test("empty placeholder and long draft fit narrow columns at enlarged root text size", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  page.setDefaultTimeout(5000);
  try {
    await openFixture(page, "light");
    await page.locator("html").evaluate(el => { el.style.fontSize = "200%"; });
    const editor = page.getByRole("textbox");
    await editor.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const editorBox = await editor.boundingBox();
    const placeholder = page.getByText("Ask about a market, wallet, transaction, or risk...", { exact: true });
    const placeholderBox = await placeholder.boundingBox();
    expect(editorBox).not.toBeNull();
    expect(placeholderBox).not.toBeNull();
    if (editorBox && placeholderBox) expect(editorBox.height).toBeGreaterThanOrEqual(placeholderBox.height - 1);
    const longDraft = Array.from({ length: 30 }, (_, index) => `Synthetic draft line ${index + 1}, retained when the viewport changes.`).join("\n");
    await editor.fill(longDraft);
    expect(await editor.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await editor.innerText()).toBe(longDraft);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Chat options", exact: true }).scrollIntoViewIfNeeded();
    expect(await page.getByRole("button", { name: "Chat options", exact: true }).isVisible()).toBe(true);
  } finally { await page.close(); }
}, 20_000);
