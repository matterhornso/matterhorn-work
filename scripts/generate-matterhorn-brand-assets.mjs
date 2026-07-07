#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const MATTERHORN_BLUE = "#D1F2FF";
const MATTERHORN_INK = "#0C0C0C";

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Matterhorn Work">
  <title>Matterhorn Work</title>
  <rect width="512" height="512" rx="92" fill="${MATTERHORN_BLUE}"/>
  <path id="matterhorn-mark" fill="${MATTERHORN_INK}" d="M48 342c42-3 74-18 97-46 19-24 31-55 42-92H276c12 0 23 2 32 7 15 8 27 24 38 49l66 152h-93l-54-130c-6-15-13-23-21-25v169h-82l11-162c-14 43-35 80-64 109-18 18-38 33-61 45V342Z"/>
</svg>
`;

const svgTargets = [
  "apps/app/public/matterhorn-logo.svg",
  "apps/app/public/matterhorn-mark.svg",
  "apps/app/public/matterhorn-logo-square.svg",
  "packages/docs/logo/dark.svg",
  "packages/docs/logo/light.svg",
];

function run(command, args) {
  execFileSync(command, args, { stdio: "ignore" });
}

function renderPng(source, output, size) {
  run("/usr/bin/sips", ["-s", "format", "png", "-z", String(size), String(size), source, "--out", output]);
}

function writeIco(output, pngPaths) {
  const images = pngPaths.map((path) => readFileSync(path));
  const headerSize = 6 + images.length * 16;
  const directory = Buffer.alloc(headerSize);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);

  let imageOffset = headerSize;
  images.forEach((image, index) => {
    const entryOffset = 6 + index * 16;
    const width = image.readUInt32BE(16);
    const height = image.readUInt32BE(20);
    directory.writeUInt8(width >= 256 ? 0 : width, entryOffset);
    directory.writeUInt8(height >= 256 ? 0 : height, entryOffset + 1);
    directory.writeUInt8(0, entryOffset + 2);
    directory.writeUInt8(0, entryOffset + 3);
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(image.length, entryOffset + 8);
    directory.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += image.length;
  });

  writeFileSync(output, Buffer.concat([directory, ...images]));
}

function buildIconset(source, output) {
  const tmp = mkdtempSync(join(tmpdir(), "matterhorn-iconset-"));
  const iconset = join(tmp, "Matterhorn.iconset");
  mkdirSync(iconset, { recursive: true });
  for (const [name, size] of [
    ["icon_16x16.png", 16],
    ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32],
    ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512],
    ["icon_512x512@2x.png", 1024],
  ]) {
    renderPng(source, join(iconset, name), size);
  }
  run("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", output]);
  rmSync(tmp, { recursive: true, force: true });
}

for (const target of svgTargets) writeFileSync(target, svg);

const source = "apps/app/public/matterhorn-logo-square.svg";
renderPng(source, "apps/app/public/matterhorn-logo.png", 512);
renderPng(source, "apps/app/public/favicon-16x16.png", 16);
renderPng(source, "apps/app/public/favicon-32x32.png", 32);
renderPng(source, "apps/app/public/apple-touch-icon.png", 180);
renderPng(source, "apps/desktop/resources/icons/icon.png", 512);
renderPng(source, "apps/desktop/resources/icons/dev/icon.png", 512);
renderPng(source, "apps/desktop/resources/icons/dev/32x32.png", 32);
renderPng(source, "apps/desktop/resources/icons/dev/128x128.png", 128);
renderPng(source, "apps/desktop/resources/icons/dev/128x128@2x.png", 256);

const tmp = mkdtempSync(join(tmpdir(), "matterhorn-ico-"));
try {
  const favicon16 = join(tmp, "favicon-16.png");
  const favicon32 = join(tmp, "favicon-32.png");
  const icon16 = join(tmp, "icon-16.png");
  const icon32 = join(tmp, "icon-32.png");
  const icon256 = join(tmp, "icon-256.png");
  renderPng(source, favicon16, 16);
  renderPng(source, favicon32, 32);
  renderPng(source, icon16, 16);
  renderPng(source, icon32, 32);
  renderPng(source, icon256, 256);
  writeIco("apps/app/public/favicon.ico", [favicon16, favicon32]);
  writeIco("apps/desktop/resources/icons/icon.ico", [icon16, icon32, icon256]);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

buildIconset(source, "apps/desktop/resources/icons/icon.icns");
buildIconset(source, "apps/desktop/resources/icons/dev/icon-dev.icns");

console.log("Generated Matterhorn brand assets.");
