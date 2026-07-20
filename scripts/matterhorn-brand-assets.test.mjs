import { readFileSync, statSync } from "node:fs";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";

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
  assert.match(svg, /<title>Matterhorn Desks<\/title>/, `${path} should identify Matterhorn Desks`);
  assert.match(svg, /id="matterhorn-mark"/, `${path} should contain the Matterhorn mark path`);
  assert.match(svg, /#D1F2FF/, `${path} should use Matterhorn blue`);
  assert.match(svg, /#0C0C0C/, `${path} should use Matterhorn ink`);
  assert.doesNotMatch(svg, /data:image\/png;base64,/, `${path} should stay vector-backed, not a bitmap screenshot`);
  assert.doesNotMatch(svg, /#7c3aed|#257CE9|font-family="monospace"|>MATTERHORN</i, `${path} should not use the old OpenWork-style logo treatment`);
}

function decodedRgbaPixel(path, x, y) {
  const bytes = readBuffer(path);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  let cursor = 8;
  const chunks = [];
  while (cursor < bytes.length) {
    const length = bytes.readUInt32BE(cursor);
    const type = bytes.toString("ascii", cursor + 4, cursor + 8);
    if (type === "IDAT") chunks.push(bytes.subarray(cursor + 8, cursor + 8 + length));
    cursor += 12 + length;
  }
  const inflated = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const rows = [];
  let offset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[offset];
    const source = inflated.subarray(offset + 1, offset + 1 + stride);
    const decoded = Buffer.alloc(stride);
    const previous = rows[row - 1] ?? Buffer.alloc(stride);
    for (let index = 0; index < stride; index += 1) {
      const left = index >= 4 ? decoded[index - 4] : 0;
      const up = previous[index] ?? 0;
      const upLeft = index >= 4 ? previous[index - 4] ?? 0 : 0;
      const pa = Math.abs(up - upLeft);
      const pb = Math.abs(left - upLeft);
      const pc = Math.abs(left + up - 2 * upLeft);
      const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      const value =
        filter === 0 ? source[index] :
        filter === 1 ? source[index] + left :
        filter === 2 ? source[index] + up :
        filter === 3 ? source[index] + Math.floor((left + up) / 2) :
        filter === 4 ? source[index] + predictor :
        Number.NaN;
      assert.ok(Number.isFinite(value), `${path} uses unsupported PNG filter ${filter}`);
      decoded[index] = value & 0xff;
    }
    rows.push(decoded);
    offset += 1 + stride;
  }
  const pixelOffset = x * 4;
  const pixelRow = rows[y];
  return [pixelRow[pixelOffset], pixelRow[pixelOffset + 1], pixelRow[pixelOffset + 2], pixelRow[pixelOffset + 3]];
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

assertPng("apps/app/public/matterhorn-logo.png", 512, 512);
assertPng("apps/app/public/favicon-16x16.png", 16, 16);
assertPng("apps/app/public/favicon-32x32.png", 32, 32);
assertPng("apps/app/public/apple-touch-icon.png", 180, 180);
assertPng("apps/desktop/resources/icons/icon.png", 512, 512);
assertPng("apps/desktop/resources/icons/dev/icon.png", 512, 512);
assert.deepEqual(
  decodedRgbaPixel("apps/desktop/resources/icons/icon.png", 60, 60),
  [209, 242, 255, 255],
  "desktop icon should not have the old heavy black frame near its edge",
);

const ico = readBuffer("apps/app/public/favicon.ico");
assert.equal(ico.toString("hex", 0, 4), "00000100", "favicon.ico should be a Windows icon container");

const icns = readBuffer("apps/desktop/resources/icons/icon.icns");
assert.equal(icns.toString("ascii", 0, 4), "icns", "desktop icon should be a macOS icns");
assert.ok(statSync("apps/desktop/resources/icons/icon.icns").size > 1000, "desktop icon should be populated");

const walletIcon = read("apps/app/public/matterhorn-wallet.svg");
assert.match(walletIcon, /#0C0C0C/, "Matterhorn wallet icon should use Matterhorn ink");
assert.doesNotMatch(walletIcon, /#7c3aed/i, "Matterhorn wallet icon should not use the old purple accent");

const indexHtml = read("apps/app/index.html");
assert.match(indexHtml, /matterhorn-logo-square\.svg/, "app index should reference the Matterhorn SVG favicon");
assert.match(indexHtml, /favicon-32x32\.png/, "app index should reference the Matterhorn favicon");
assert.match(indexHtml, /apple-touch-icon\.png/, "app index should reference the Matterhorn Apple touch icon");

console.log("Matterhorn brand asset gate passed.");
