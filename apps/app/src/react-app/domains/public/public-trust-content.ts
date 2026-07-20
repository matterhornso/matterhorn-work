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

export const MATTERHORN_SUPPORT_EMAIL = "support@matterhorn.work";
export const MATTERHORN_DOCS_URL =
  "https://github.com/matterhornso/matterhorn-work/tree/dev/docs";
export const MATTERHORN_ISSUES_URL =
  "https://github.com/matterhornso/matterhorn-work/issues/new/choose";
export const MATTERHORN_SECURITY_REPORT_URL =
  "https://github.com/matterhornso/matterhorn-work/security/advisories/new";
