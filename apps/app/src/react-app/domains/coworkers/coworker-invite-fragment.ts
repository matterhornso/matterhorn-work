const INVITE_TOKEN_PATTERN = /^mhci_[A-Za-z0-9_-]{40,96}$/;

export type CoworkerInviteFragmentResult = {
  detected: boolean;
  token: string | null;
};

let pendingInvite: CoworkerInviteFragmentResult = { detected: false, token: null };

/**
 * Reads a one-time invite from the URL fragment, then removes it before the
 * app shell, requests, or telemetry can inspect the browser location.
 */
export function takeCoworkerInviteFromFragment(input: {
  hash: string;
  pathname: string;
  search: string;
  replaceUrl: (url: string) => void;
}): CoworkerInviteFragmentResult {
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

export function capturePendingCoworkerInvite(input: {
  hash: string;
  pathname: string;
  search: string;
  replaceUrl: (url: string) => void;
}): CoworkerInviteFragmentResult {
  const captured = takeCoworkerInviteFromFragment(input);
  if (captured.detected) pendingInvite = captured;
  return captured;
}

export function capturePendingCoworkerInviteFromBrowser(): CoworkerInviteFragmentResult {
  if (typeof window === "undefined") return { detected: false, token: null };
  if (!window.location.pathname.toLowerCase().startsWith("/coworker-access")) {
    return { detected: false, token: null };
  }
  return capturePendingCoworkerInvite({
    hash: window.location.hash,
    pathname: window.location.pathname,
    search: window.location.search,
    replaceUrl: (url) => window.history.replaceState(window.history.state, "", url),
  });
}

export function hasPendingCoworkerInvite(): boolean {
  return pendingInvite.detected;
}

export function takePendingCoworkerInvite(): CoworkerInviteFragmentResult {
  const captured = pendingInvite;
  pendingInvite = { detected: false, token: null };
  return captured;
}

export function resetPendingCoworkerInviteForTests(): void {
  pendingInvite = { detected: false, token: null };
}
