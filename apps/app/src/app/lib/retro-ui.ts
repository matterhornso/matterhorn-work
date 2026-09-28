/** Visual rollout only. Never reads or writes account/workspace preferences. */
export function resolveRetroUi(env: Record<string, unknown> | undefined): boolean {
  return env?.VITE_MATTERHORN_RETRO_UI === "1" || env?.VITE_MATTERHORN_RETRO_UI === "true";
}

export const RETRO_UI = resolveRetroUi(import.meta.env);

export function applyRetroUi(root: Pick<HTMLElement, "setAttribute" | "removeAttribute">, enabled = RETRO_UI) {
  if (enabled) root.setAttribute("data-matterhorn-ui", "retro");
  else root.removeAttribute("data-matterhorn-ui");
}
