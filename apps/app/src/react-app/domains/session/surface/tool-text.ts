/** Remove trailing blank lines without backtracking on provider-controlled output. */
export function normalizeToolText(value: unknown): string {
  if (typeof value !== "string") return "";
  let end = value.length;
  for (let index = value.length - 1; index >= 0 && /\s/.test(value[index]); index -= 1) {
    if (value[index] === "\n") end = value[index - 1] === "\r" ? index - 1 : index;
  }
  return value.slice(0, end);
}
