#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const MATTERHORN_BLUE = "#D1F2FF";
const MATTERHORN_INK = "#0C0C0C";

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Matterhorn Work">
  <title>Matterhorn Work</title>
  <rect width="256" height="256" fill="${MATTERHORN_BLUE}"/>
  <path id="matterhorn-mark" fill="${MATTERHORN_INK}" d="M47.5278 142.245C55.0727 132.434 58.5819 116.854 58.5819 93.2006H98.2002V52.857C98.4331 52.8414 98.661 52.8311 98.8939 52.8155C111.229 52.0476 123.179 51.0359 135.388 53.9362C147.389 56.7845 158.458 62.8599 167.021 71.986C177.158 82.793 183.539 96.1838 189.706 109.134C196.117 122.592 202.173 135.303 211.774 144.258C225.451 157.016 242.45 157.965 256 155.329V199.995C225.957 199.995 202.573 191.803 184.506 174.951C169.168 160.647 160.742 142.95 153.303 127.339C148.103 116.418 144.133 108.63 139.986 103.276C139.565 102.737 138.715 103.037 138.715 103.727L153.612 179.247H98.2052V123.987C98.2052 123.168 97.0507 123.08 96.9191 123.884C94.0429 141.98 88.2804 156.331 79.348 167.942C71.0537 178.728 60.0554 186.9 46.672 192.228C33.5216 197.458 18.2546 200 0 200V158.494C23.5816 158.494 39.1271 153.182 47.5329 142.255L47.5278 142.245Z"/>
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
