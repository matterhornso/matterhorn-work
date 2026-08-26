import { parse, stringify } from "yaml";

export function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { data: {}, body: content };
  }
  const raw = match[1] ?? "";
  const body = content.slice(match[0].length);
  // Invalid YAML remains actionable to callers. Valid scalar/array YAML is
  // not a metadata record and must not leak prototype or positional fields.
  const parsed: unknown = parse(raw);
  const data = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? Object.fromEntries(Object.entries(parsed))
    : {};
  return { data, body };
}

export function buildFrontmatter(data: Record<string, unknown>): string {
  const yaml = stringify(data).trimEnd();
  return `---\n${yaml}\n---\n`;
}
