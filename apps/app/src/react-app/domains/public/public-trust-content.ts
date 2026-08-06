export const PUBLIC_TRUST_PATHS = [
  "/privacy",
  "/terms",
  "/security",
  "/support",
  "/status",
] as const;

export type PublicTrustPath = (typeof PUBLIC_TRUST_PATHS)[number];

export function isPublicTrustPath(pathname: string): boolean {
  const normalized = pathname.trim().toLowerCase().replace(/\/+$/, "") || "/";
  return PUBLIC_TRUST_PATHS.includes(normalized as PublicTrustPath);
}

export function shouldGatePublicWebEntry(input: {
  publicBetaWeb: boolean;
  requireSignin: boolean;
  pathname: string;
}): boolean {
  // Hosted workspaces are always account-scoped. Do not make the client-side
  // auth boundary depend on an optional build flag: a missing flag must never
  // expose the workspace shell or start authenticated API requests. The flag
  // remains part of the input because desktop/public trust status surfaces use
  // the same configuration object.
  return input.publicBetaWeb && !isPublicTrustPath(input.pathname);
}

export const MATTERHORN_SUPPORT_EMAIL = "updates@matterhorn.so";
export const MATTERHORN_DOCS_URL =
  "https://github.com/matterhornso/matterhorn-work/tree/dev/docs";
export const MATTERHORN_ISSUES_URL =
  "https://github.com/matterhornso/matterhorn-work/issues/new/choose";
export const MATTERHORN_SECURITY_REPORT_URL =
  "https://github.com/matterhornso/matterhorn-work/security/advisories/new";
