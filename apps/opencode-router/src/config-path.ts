import type { OpenCodeRouterConfigFile } from "./config.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function setConfigPathValue(config: OpenCodeRouterConfigFile, key: string, value: unknown): OpenCodeRouterConfigFile {
  const keys = key.split(".");
  if (keys.some((segment) => segment === "__proto__" || segment === "constructor" || segment === "prototype")) {
    throw new Error("Config key contains a forbidden path segment");
  }

  const next = { ...config };
  let current: Record<string, unknown> = next;
  for (const segment of keys.slice(0, -1)) {
    const existing = Object.hasOwn(current, segment) ? current[segment] : undefined;
    const child = isObject(existing) ? existing : {};
    current[segment] = child;
    current = child;
  }
  current[keys[keys.length - 1]!] = value;
  return next;
}
