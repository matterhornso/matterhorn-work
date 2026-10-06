/** Cancel obsolete UI work without claiming to roll back a server mutation. */
export function createPublicAuthMutationScope() {
  let active: AbortController | null = null;
  return {
    cancel() {
      active?.abort();
      active = null;
    },
    begin(isCurrent: () => boolean) {
      if (active || !isCurrent()) return null;
      const controller = new AbortController();
      active = controller;
      return {
        signal: controller.signal,
        current: () => active === controller && !controller.signal.aborted && isCurrent(),
        finish: () => { if (active === controller) active = null; },
      };
    },
  };
}
