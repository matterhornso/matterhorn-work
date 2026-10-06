// Browser caches are conveniences, never an authorization boundary. The server
// still checks every request. This boundary prevents old account content from
// surviving locally after the authenticated identity changes.
export const ACCOUNT_CACHE_OWNER_KEY = "matterhorn.account-cache-owner.v1";
export const ACCOUNT_CACHE_BOUNDARY_KEY = "matterhorn.account-cache-boundary.v1";

const accountKeys = new Set([
  "openwork.session-drafts.v1", "matterhorn.session-agents.v1",
  "matterhorn.session-memory-context.v1", "matterhorn.session-agent-files.v1",
  "matterhorn.session-coworker.v1", "openwork:session-scroll:v1",
  "openwork.react.activeWorkspace", "openwork.react.sessionByWorkspace", "openwork.react.workspaceOrder",
  "openwork.seenProviderIds", "openwork.acknowledgedProviders", "openwork.orgOnboardingSeen",
  "openwork.pendingModelPickerProviderIds", "matterhorn.reloadAfterOrgOnboarding",
  "openwork.hiddenModels", "openwork.hiddenModelsSeeded", "openwork.settings.environment.pendingChanges",
  "matterhorn.den.activeOrgId", "matterhorn.den.activeOrgSlug", "matterhorn.den.activeOrgName",
  "openwork.den.activeOrgId", "openwork.den.activeOrgSlug", "openwork.den.activeOrgName",
]);
const accountPrefixes = [
  "matterhorn.execution-mode.v1:", "matterhorn.response-perspective.v1:",
  "matterhorn.pending-desk-task.v1:", "matterhorn.pending-message.",
  "openwork.den.desktopConfig:", "matterhorn.jev.",
  "openwork.sessionModels.", "openwork.modelVariant.",
  "matterhorn.wallet-confirmation.v1:",
];

export class AccountStateChangedError extends Error {
  constructor() {
    super("Your account changed. Reopen the conversation before continuing.");
    this.name = "AccountStateChangedError";
  }
}

export class AccountCacheCleanupError extends Error {
  constructor() {
    super("Browser data could not be cleared safely. Close other Matterhorn tabs and clear this site's data before signing in again.");
    this.name = "AccountCacheCleanupError";
  }
}

type StorageSource = () => Storage | null;
type ResetPhase = "stop" | "clear";

function readStorage(storage: Storage | null, key: string) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function clearOwnedStorage(storage: Storage | null) {
  if (!storage) return;
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) {
    if (key && (accountKeys.has(key) || accountPrefixes.some((prefix) => key.startsWith(prefix)))) {
      storage.removeItem(key);
    }
  }
  // Keep layout/appearance preferences; remove only session-specific panels.
  const layoutKey = "openwork:ui-state:v1";
  const raw = storage.getItem(layoutKey);
  if (raw) {
    let layout: unknown;
    try { layout = JSON.parse(raw); } catch { storage.removeItem(layoutKey); return; }
    if (layout && typeof layout === "object" && !Array.isArray(layout)) {
      storage.setItem(layoutKey, JSON.stringify({ ...layout, sidePanelState: {} }));
    } else storage.removeItem(layoutKey);
  }
}

export function createAccountClientState(local: StorageSource, session: StorageSource) {
  const resets = new Map<string, { phase: ResetPhase; reset: () => void }>();
  let generation = 0;
  let resetting = false;
  let owner = readStorage(session(), ACCOUNT_CACHE_OWNER_KEY) ?? readStorage(local(), ACCOUNT_CACHE_OWNER_KEY);
  let boundary = readStorage(local(), ACCOUNT_CACHE_BOUNDARY_KEY);

  function reset(clearShared: boolean) {
    generation += 1;
    resetting = true;
    let failed = false;
    try {
      // Stop producers before emptying caches. Continue all cleanup if one fails.
      for (const phase of ["stop", "clear"]) {
        for (const entry of resets.values()) {
          if (entry.phase !== phase) continue;
          try { entry.reset(); } catch { failed = true; }
        }
      }
      if (clearShared) {
        try { clearOwnedStorage(local()); } catch { failed = true; }
      }
      try { clearOwnedStorage(session()); } catch { failed = true; }
    } finally { resetting = false; }
    if (failed) throw new AccountCacheCleanupError();
  }

  function publish(nextOwner: string | null) {
    try {
      for (const storage of [local(), session()]) {
        if (nextOwner === null) storage?.removeItem(ACCOUNT_CACHE_OWNER_KEY);
        else storage?.setItem(ACCOUNT_CACHE_OWNER_KEY, nextOwner);
      }
      // Invalidation correlation only, never an authorization token. Self-hosted
      // HTTP origins do not always expose crypto.randomUUID.
      const nextBoundary = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${generation}:${Math.random()}`;
      local()?.setItem(ACCOUNT_CACHE_BOUNDARY_KEY, nextBoundary);
      owner = nextOwner;
      boundary = nextBoundary;
    } catch {
      throw new AccountCacheCleanupError();
    }
  }

  return {
    owner: () => owner,
    generation: () => generation,
    isResetting: () => resetting,
    register(name: string, resetter: () => void, phase: ResetPhase = "clear") {
      const entry = { phase, reset: resetter };
      resets.set(name, entry);
      return () => { if (resets.get(name) === entry) resets.delete(name); };
    },
    bind(apiBaseUrl: string, userId: string) {
      const nextOwner = JSON.stringify([apiBaseUrl.replace(/\/+$/, ""), userId]);
      const shared = local();
      const changed = owner !== nextOwner || Boolean(shared && shared.getItem(ACCOUNT_CACHE_OWNER_KEY) !== nextOwner);
      if (changed) {
        reset(true);
        publish(nextOwner);
      } else session()?.setItem(ACCOUNT_CACHE_OWNER_KEY, nextOwner);
      return changed;
    },
    clear() {
      reset(true);
      // Repeated 401s after logout must not start cross-tab refresh loops.
      if (owner !== null || local()?.getItem(ACCOUNT_CACHE_OWNER_KEY) || boundary === null) publish(null);
      else session()?.removeItem(ACCOUNT_CACHE_OWNER_KEY);
    },
    receiveBoundary(key: string | null, value: string | null) {
      if (key !== ACCOUNT_CACHE_BOUNDARY_KEY || !value || value === boundary) return false;
      if (local()?.getItem(ACCOUNT_CACHE_BOUNDARY_KEY) !== value) return false;
      // Another tab already cleared shared storage. Never erase its fresh data.
      reset(false);
      owner = local()?.getItem(ACCOUNT_CACHE_OWNER_KEY) ?? null;
      if (owner === null) session()?.removeItem(ACCOUNT_CACHE_OWNER_KEY);
      else session()?.setItem(ACCOUNT_CACHE_OWNER_KEY, owner);
      boundary = value;
      return true;
    },
  };
}

function browserStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window[kind]; } catch { return null; }
}

export const accountClientState = createAccountClientState(
  () => browserStorage("localStorage"), () => browserStorage("sessionStorage"),
);

export function captureAccountGeneration() {
  const generation = accountClientState.generation();
  return () => generation === accountClientState.generation();
}

/** Discard obsolete results; this does not undo a mutation already sent. */
export async function runAccountScopedRequest<T>(
  request: () => Promise<T>,
  isCurrent: () => boolean = captureAccountGeneration(),
): Promise<T> {
  const assertCurrent = () => { if (!isCurrent()) throw new AccountStateChangedError(); };
  assertCurrent();
  try {
    const result = await request();
    assertCurrent();
    return result;
  } catch (error) {
    assertCurrent();
    throw error;
  }
}
