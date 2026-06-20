import { readFileSync, statSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");
const readBuffer = (path) => readFileSync(path);

function assertPng(path, width, height) {
  const bytes = readBuffer(path);
  assert.equal(bytes.toString("hex", 0, 8), "89504e470d0a1a0a", `${path} must be a PNG`);
  assert.equal(bytes.readUInt32BE(16), width, `${path} width`);
  assert.equal(bytes.readUInt32BE(20), height, `${path} height`);
}

function assertSvgUsesMatterhornLogo(path) {
  const svg = read(path);
  assert.match(svg, /<title>Matterhorn Work<\/title>/, `${path} should identify Matterhorn Work`);
  assert.match(svg, /data:image\/png;base64,/, `${path} should embed the supplied Matterhorn mark`);
  assert.doesNotMatch(svg, /#7c3aed|#257CE9|font-family="monospace"|>MATTERHORN</i, `${path} should not use the old OpenWork-style logo treatment`);
}

const packageJson = JSON.parse(read("package.json"));
assert.equal(
  packageJson.scripts["test:matterhorn-brand-assets"],
  "node scripts/matterhorn-brand-assets.test.mjs",
  "package.json should expose the brand asset gate",
);

const css = read("apps/app/src/app/index.css");
assert.match(css, /"Aeonik"/, "global font stack should prefer Aeonik");
assert.match(css, /--matterhorn-blue:\s*#D1F2FF;/, "CSS should define Matterhorn blue");
assert.match(css, /--matterhorn-ink:\s*#0C0C0C;/, "CSS should define Matterhorn ink");
assert.doesNotMatch(css, /--dls-accent:\s*#7c3aed/i, "CSS should not keep the old purple accent token");

for (const path of [
  "apps/app/public/matterhorn-logo.svg",
  "apps/app/public/matterhorn-mark.svg",
  "apps/app/public/matterhorn-logo-square.svg",
  "packages/docs/logo/dark.svg",
  "packages/docs/logo/light.svg",
]) {
  assertSvgUsesMatterhornLogo(path);
}

assertPng("apps/app/public/matterhorn-logo.png", 120, 126);
assertPng("apps/app/public/favicon-16x16.png", 16, 16);
assertPng("apps/app/public/favicon-32x32.png", 32, 32);
assertPng("apps/app/public/apple-touch-icon.png", 180, 180);
assertPng("apps/desktop/resources/icons/icon.png", 512, 512);
assertPng("apps/desktop/resources/icons/dev/icon.png", 512, 512);

const ico = readBuffer("apps/app/public/favicon.ico");
assert.equal(ico.toString("hex", 0, 4), "00000100", "favicon.ico should be a Windows icon container");

const icns = readBuffer("apps/desktop/resources/icons/icon.icns");
assert.equal(icns.toString("ascii", 0, 4), "icns", "desktop icon should be a macOS icns");
assert.ok(statSync("apps/desktop/resources/icons/icon.icns").size > 1000, "desktop icon should be populated");

const walletIcon = read("apps/app/public/matterhorn-wallet.svg");
assert.match(walletIcon, /#0C0C0C/, "Matterhorn wallet icon should use Matterhorn ink");
assert.doesNotMatch(walletIcon, /#7c3aed/i, "Matterhorn wallet icon should not use the old purple accent");

const indexHtml = read("apps/app/index.html");
assert.match(indexHtml, /favicon-32x32\.png/, "app index should reference the Matterhorn favicon");
assert.match(indexHtml, /apple-touch-icon\.png/, "app index should reference the Matterhorn Apple touch icon");

console.log("Matterhorn brand asset gate passed.");
