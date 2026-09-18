import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("settings navigation remains available until the sidebar becomes desktop-sized", () => {
  const mobileHook = readFileSync("apps/app/src/hooks/use-mobile.ts", "utf8");
  const shell = readFileSync("apps/app/src/react-app/domains/settings/shell/settings-shell.tsx", "utf8");
  const page = readFileSync("apps/app/src/react-app/domains/settings/shell/settings-page.tsx", "utf8");
  expect(mobileHook.includes("MOBILE_BREAKPOINT = 1024")).toBe(true);
  expect(shell.includes("md:hidden")).toBe(false);
  expect(shell.includes('SidebarTrigger className="size-11 mac:titlebar-no-drag lg:hidden"')).toBe(true);
  expect(shell.includes('className="flex items-center text-gray-10 mac:titlebar-no-drag lg:hidden"')).toBe(true);
  expect(page.includes('SettingsPanelHeading className="hidden lg:flex"')).toBe(true);
});
