import type { Page } from "playwright";

// Hold only native image decoding; all composer/session code remains real.
export async function delayImagePreparation(page: Page) {
  await page.evaluate(() => {
    const decode = window.createImageBitmap.bind(window);
    Object.defineProperty(window, "createImageBitmap", { configurable: true, value: async (image: Blob) => {
      document.documentElement.dataset.imagePreparing = "true";
      await new Promise<void>(resolve => {
        const release = (event: Event) => {
          if (event instanceof CustomEvent && event.detail && (!(image instanceof File) || event.detail !== image.name)) return;
          window.removeEventListener("qa-release-image", release);
          resolve();
        };
        window.addEventListener("qa-release-image", release);
      });
      try {
        const bitmap = await decode(image);
        const close = bitmap.close.bind(bitmap);
        Object.defineProperty(bitmap, "close", { value: () => {
          close();
          document.documentElement.dataset.imageSettled = "true";
        } });
        return bitmap;
      } catch (error) {
        document.documentElement.dataset.imageSettled = "true";
        throw error;
      }
    } });
  });
}

export async function releaseImagePreparation(page: Page, filename?: string) {
  await page.evaluate(name => {
    delete document.documentElement.dataset.imageSettled;
    window.dispatchEvent(new CustomEvent("qa-release-image", { detail: name }));
  }, filename);
  await page.waitForFunction(() => document.documentElement.dataset.imageSettled === "true");
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

export async function delayedImage(page: Page, corrupt = false) {
  // Padding crosses the compressor threshold while retaining a valid tiny PNG.
  const buffer = Buffer.alloc(1_600_000);
  if (!corrupt) {
    const base64 = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 2;
      return canvas.toDataURL("image/png").split(",")[1];
    });
    Buffer.from(base64, "base64").copy(buffer);
  }
  return { name: "pending.png", mimeType: "image/png", buffer };
}
