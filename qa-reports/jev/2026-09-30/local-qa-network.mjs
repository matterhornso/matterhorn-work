// Network boundary for the manual, disposable-account QA probe only.
export function requireLoopbackOrigin(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label}: canonical HTTP(S) loopback origin required`); }
  if ((url.protocol !== "http:" && url.protocol !== "https:")
    || (url.hostname !== "127.0.0.1" && url.hostname !== "[::1]" && url.hostname !== "localhost")
    || url.username || url.password || (value !== url.origin && value !== `${url.origin}/`)) {
    throw new Error(`${label}: canonical HTTP(S) loopback origin required`);
  }
  return url.origin;
}

export function createLocalQaBackend(diagnosticsBackend, expectedBackend) {
  const origin = requireLoopbackOrigin(diagnosticsBackend, "Diagnostics backend");
  const expected = requireLoopbackOrigin(expectedBackend, "MATTERHORN_JEV_QA_BACKEND_ORIGIN");
  if (origin !== expected) throw new Error("Diagnostics backend does not match the independently pinned QA backend origin");
  return (path, options = {}) => {
    if (typeof path !== "string" || !path.startsWith("/")) throw new Error("Local QA request path required");
    const url = new URL(path, origin);
    if (url.origin !== origin || url.username || url.password || url.hash) throw new Error("QA request must remain on the pinned backend origin");
    // Never forward a password or cookie to a redirect destination, including
    // another local port. Caller options cannot relax this boundary.
    return fetch(url, { ...options, redirect: "error" });
  };
}

export function signInLocalQaBrowser(request, webOrigin, credentials) {
  const origin = requireLoopbackOrigin(webOrigin, "QA browser origin");
  return request.post(new URL("/api/auth/sign-in/email", origin).href, {
    data: { email: credentials.email, password: credentials.password },
    maxRedirects: 0,
  });
}
