export const MATTERHORN_DEPLOYMENT_ENV_VAR = "VITE_MATTERHORN_DEPLOYMENT";
export const LEGACY_MATTERHORN_DEPLOYMENT_ENV_VAR = "VITE_OPENWORK_DEPLOYMENT";
export const MATTERHORN_PUBLIC_BETA_ENV_VAR = "VITE_MATTERHORN_PUBLIC_BETA";

export type MatterhornDeployment = "desktop" | "web";

export type MatterhornDeploymentEnv = {
  VITE_MATTERHORN_DEPLOYMENT?: unknown;
  VITE_OPENWORK_DEPLOYMENT?: unknown;
  VITE_MATTERHORN_PUBLIC_BETA?: unknown;
};

function normalizeDeployment(value: string | undefined): MatterhornDeployment {
  const normalized = value?.trim().toLowerCase();
  return normalized === "web" ? "web" : "desktop";
}

function readString(env: MatterhornDeploymentEnv | undefined, key: keyof MatterhornDeploymentEnv): string {
  const value = env?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function isEnabled(value: string): boolean {
  return /^(1|true|yes|on)$/i.test(value);
}

export function resolveMatterhornDeployment(env: MatterhornDeploymentEnv | undefined): MatterhornDeployment {
  const value =
    readString(env, "VITE_MATTERHORN_DEPLOYMENT") ||
    readString(env, "VITE_OPENWORK_DEPLOYMENT");

  return normalizeDeployment(value);
}

export function isMatterhornPublicBetaWebDeployment(
  env: MatterhornDeploymentEnv | undefined,
): boolean {
  return (
    resolveMatterhornDeployment(env) === "web" &&
    isEnabled(readString(env, "VITE_MATTERHORN_PUBLIC_BETA"))
  );
}

function getBuildEnvironment(): MatterhornDeploymentEnv | undefined {
  if (typeof import.meta === "undefined") return undefined;
  const env = import.meta.env as Record<string, unknown>;
  return {
    VITE_MATTERHORN_DEPLOYMENT: env.VITE_MATTERHORN_DEPLOYMENT,
    VITE_OPENWORK_DEPLOYMENT: env.VITE_OPENWORK_DEPLOYMENT,
    VITE_MATTERHORN_PUBLIC_BETA: env.VITE_MATTERHORN_PUBLIC_BETA,
  };
}

export function getMatterhornDeployment(): MatterhornDeployment {
  return resolveMatterhornDeployment(getBuildEnvironment());
}

export function isWebDeployment(): boolean {
  return getMatterhornDeployment() === "web";
}

export function isDesktopDeployment(): boolean {
  return getMatterhornDeployment() === "desktop";
}

export function isPublicBetaWebDeployment(): boolean {
  return isMatterhornPublicBetaWebDeployment(getBuildEnvironment());
}
