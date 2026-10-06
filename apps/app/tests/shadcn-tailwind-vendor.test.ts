import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const stylesheet = read("../src/styles/shadcn-tailwind.css");

test("local shadcn stylesheet preserves the licensed upstream source byte for byte", () => {
  expect(stylesheet).toStartWith("/*!\n");
  const headerEnd = stylesheet.indexOf(" */\n") + " */\n".length;
  const header = stylesheet.slice(0, headerEnd);
  const body = stylesheet.slice(headerEnd);
  const checksum = "146941ac3ff65496fdf1cb306e697255328e4dadc7c105d66e36bb031b00f6d6";
  expect(header).toContain("shadcn@4.6.0/dist/tailwind.css");
  expect(header).toContain("https://registry.npmjs.org/shadcn/-/shadcn-4.6.0.tgz");
  expect(header).toContain(`Original SHA-256: ${checksum}`);
  expect(createHash("sha256").update(body).digest("hex")).toBe(checksum);

  const license = header.slice(header.indexOf(" * MIT License\n"), -" */\n".length)
    .replace(/^ \* ?/gm, "");
  expect(createHash("sha256").update(license).digest("hex"))
    .toBe("1564074e13439397221ffd522e2e504d56561994a23d371aa5e3ad43e4f5423f");
  // Tailwind removes source comments; Vite copies public files into every build.
  expect(header).toContain("Distributed license: /licenses/shadcn-MIT.txt");
  expect(read("../public/licenses/shadcn-MIT.txt")).toBe(license);
});

test("local shadcn stylesheet retains state variants, accordion animation, and scrollbar utility", () => {
  expect([...stylesheet.matchAll(/@custom-variant ([\w-]+)/g)].map((match) => match[1])).toEqual([
    "data-open", "data-closed", "data-checked", "data-unchecked", "data-selected",
    "data-disabled", "data-active", "data-horizontal", "data-vertical",
  ]);
  expect(stylesheet).toContain("@keyframes accordion-down");
  expect(stylesheet).toContain("@keyframes accordion-up");
  expect(stylesheet).toContain("--radix-accordion-content-height");
  expect(stylesheet).toContain("--accordion-panel-height");
  expect(stylesheet).toContain("@utility no-scrollbar");
});

test("application imports local styles without installing the shadcn CLI dependency tree", () => {
  const entry = read("../src/app/index.css");
  const manifest = JSON.parse(read("../package.json"));
  const lockfile = read("../../../pnpm-lock.yaml");
  expect(entry).toContain('@import "../styles/shadcn-tailwind.css";');
  expect(entry).not.toContain('"shadcn/tailwind.css"');
  expect(manifest.dependencies).not.toHaveProperty("shadcn");
  expect(manifest.devDependencies).not.toHaveProperty("shadcn");
  expect(/^  (?:shadcn|braces)@/m.test(lockfile)).toBe(false);
});
