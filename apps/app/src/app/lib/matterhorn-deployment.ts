export const MATTERHORN_DEPLOYMENT_ENV_VAR = "VITE_OPENWORK_DEPLOYMENT";

export type MatterhornDeployment = "desktop" | "web";

function normalizeDeployment(value: string | undefined): MatterhornDeployment {
  const normalized = value?.trim().toLowerCase();
  return normalized === "web" ? "web" : "desktop";
}

export function getMatterhornDeployment(): MatterhornDeployment {
  const envValue =
    typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_OPENWORK_DEPLOYMENT === "string"
      ? import.meta.env.VITE_OPENWORK_DEPLOYMENT
      : undefined;

  return normalizeDeployment(envValue);
}

export function isWebDeployment(): boolean {
  return getMatterhornDeployment() === "web";
}

export function isDesktopDeployment(): boolean {
  return getMatterhornDeployment() === "desktop";
}
