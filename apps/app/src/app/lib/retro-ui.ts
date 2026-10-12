/** Visual rollout only. Never reads or writes account/workspace preferences. */
export function resolveRetroUi(env: Record<string, unknown> | undefined): boolean {
  const value = env?.VITE_MATTERHORN_RETRO_UI;
  // Restore the PR #1027 appearance by default; retro remains an explicit preview.
  return value === "1" || value === "true";
}

export const RETRO_UI = resolveRetroUi(import.meta.env);

export function applyRetroUi(root: Pick<HTMLElement, "setAttribute" | "removeAttribute">, enabled = RETRO_UI) {
  if (enabled) root.setAttribute("data-matterhorn-ui", "retro");
  else root.removeAttribute("data-matterhorn-ui");
}
