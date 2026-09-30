/** @jsxImportSource react */

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// These are read-result contracts, not a recursive scan of arbitrary tool content.
export function readPublicReadLimitations(tool: string, output: unknown): string[] {
  const name = tool.replace(/^matterhorn-work_/, "");
  const key = name === "matterhorn_hyperliquid_get_orderbook" ? "orderbook"
    : name === "matterhorn_hyperliquid_get_funding" ? "funding" : null;
  if (!key) return [];
  let value: unknown = output;
  if (typeof value === "string") {
    if (value.length > 1_000_000) return [];
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (!record(value) || value.success !== true || !record(value[key])) return [];
  const result = value[key];
  const source = record(result.source) ? result.source : {};
  const warnings = [result.warnings, source.warnings].flatMap(items =>
    Array.isArray(items) ? items.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : []);
  return [...new Set(warnings.map(item => item.trim()))];
}

export function PublicReadLimitations(props: { tool: string; output: unknown }) {
  const warnings = readPublicReadLimitations(props.tool, props.output);
  if (!warnings.length) return null;
  return (
    <section aria-label="Tool limitations" className="ml-7 mt-2 max-w-[720px] text-sm leading-6 text-foreground">
      <p className="font-medium">Tool limitations</p>
      <ul className="list-disc space-y-1 pl-5 wrap-break-word">
        {warnings.slice(0, 8).map((warning, index) => (
          <li key={index}>{warning.length > 2_000 ? `${warning.slice(0, 2_000)}… Open Result for the full warning.` : warning}</li>
        ))}
      </ul>
      {warnings.length > 8 ? <p>Open Result for {warnings.length - 8} additional warnings.</p> : null}
    </section>
  );
}
