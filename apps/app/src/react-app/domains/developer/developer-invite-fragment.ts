const INVITE_TOKEN_PATTERN = /^mhdi_[A-Za-z0-9_-]{40,96}$/;

export type DeveloperInviteFragmentResult = {
  detected: boolean;
  token: string | null;
};

let pendingInvite: DeveloperInviteFragmentResult = { detected: false, token: null };

/**
 * Reads a developer invite only from the URL fragment and removes the fragment
 * before returning. Fragments are not sent in HTTP requests; the token is never
 * persisted to local or session storage.
 */
export function takeDeveloperInviteFromFragment(input: {
  hash: string;
  pathname: string;
  search: string;
  replaceUrl: (url: string) => void;
}): DeveloperInviteFragmentResult {
  const raw = input.hash.startsWith("#") ? input.hash.slice(1) : input.hash;
  const values = new URLSearchParams(raw);
  if (!values.has("invite")) return { detected: false, token: null };
  input.replaceUrl(`${input.pathname}${input.search}`);
  const keys = [...values.keys()];
  const token = values.get("invite") ?? "";
  if (keys.length !== 1 || keys[0] !== "invite" || !INVITE_TOKEN_PATTERN.test(token)) {
    return { detected: true, token: null };
  }
  return { detected: true, token };
}

/**
 * Captures an invite in memory while authentication or organization setup
 * redirects the browser. The raw token is never copied into route state,
 * persistent browser storage, or a query string.
 */
export function capturePendingDeveloperInvite(input: {
  hash: string;
  pathname: string;
  search: string;
  replaceUrl: (url: string) => void;
}): DeveloperInviteFragmentResult {
  const captured = takeDeveloperInviteFromFragment(input);
  if (captured.detected) pendingInvite = captured;
  return captured;
}

export function capturePendingDeveloperInviteFromBrowser(): DeveloperInviteFragmentResult {
  if (typeof window === "undefined") return { detected: false, token: null };
  if (!window.location.pathname.toLowerCase().startsWith("/developer/crypto-apps")) {
    return { detected: false, token: null };
  }
  return capturePendingDeveloperInvite({
    hash: window.location.hash,
    pathname: window.location.pathname,
    search: window.location.search,
    replaceUrl: (url) => window.history.replaceState(window.history.state, "", url),
  });
}

export function hasPendingDeveloperInvite(): boolean {
  return pendingInvite.detected;
}

export function takePendingDeveloperInvite(): DeveloperInviteFragmentResult {
  const captured = pendingInvite;
  pendingInvite = { detected: false, token: null };
  return captured;
}

export function resetPendingDeveloperInviteForTests(): void {
  pendingInvite = { detected: false, token: null };
}
