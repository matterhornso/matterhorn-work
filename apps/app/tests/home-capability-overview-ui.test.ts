import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

function homeCapabilityOverviewSource() {
  const source = readAppSource("domains/session/chat/session-page.tsx");
  const start = source.indexOf("function HomeCapabilityOverview");
  const end = source.indexOf("function WorkflowDeskHomeSurface");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Home capability overview", () => {
  test("keeps desk status and boundary details behind info buttons", () => {
    const source = homeCapabilityOverviewSource();

    expect(source).toContain('aria-label="Open a desk details"');
    expect(source).toContain("aria-label={`${item.title} details`}");
    expect(source).toContain('<Info className="size-3.5" aria-hidden="true" />');
    expect(source).toContain("style={deskToneStyle(item.id)}");
    expect(source).toContain('<p className="font-medium text-[var(--matterhorn-desk-color)]">{item.statusLabel}</p>');
    expect(source).toContain('<p className="mt-1 text-dls-secondary">{item.proof}</p>');
    expect(source).not.toContain('{item.statusLabel}\n                    </span>');
    expect(source).not.toContain('<p className="mt-2 line-clamp-2 text-[11px] leading-5 text-dls-secondary/90">{item.proof}</p>');
  });

  test("uses a text action instead of making the entire card a nested interactive target", () => {
    const source = homeCapabilityOverviewSource();

    expect(source).toContain("<article");
    expect(source).toContain('className="mt-2 inline-flex h-6 items-center gap-1 rounded-md px-0');
    expect(source).not.toContain('aria-label={`Open ${item.title}`}');
  });
});
