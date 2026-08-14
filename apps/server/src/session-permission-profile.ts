export type MatterhornPermissionAction = "allow" | "deny" | "ask";

export type MatterhornPermissionRule = {
  permission: string;
  pattern: string;
  action: MatterhornPermissionAction;
};

function isPermissionAction(value: unknown): value is MatterhornPermissionAction {
  return value === "allow" || value === "deny" || value === "ask";
}

export function normalizeMatterhornPermissionRules(value: unknown): MatterhornPermissionRule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.permission !== "string"
      || typeof record.pattern !== "string"
      || !isPermissionAction(record.action)
    ) return [];
    return [{
      permission: record.permission,
      pattern: record.pattern,
      action: record.action,
    }];
  });
}

export function buildMatterhornSessionPermissionProfile(input: {
  agentPermission: MatterhornPermissionRule[];
  requestTools?: Record<string, boolean>;
  requestToolProfiles?: readonly Record<string, boolean>[];
}): MatterhornPermissionRule[] {
  const profiles = [
    ...(input.requestToolProfiles ?? []),
    ...(input.requestTools ? [input.requestTools] : []),
  ];
  const requestRules = profiles.flatMap((profile) => Object.entries(profile).map(([permission, enabled]) => ({
    permission,
    pattern: "*",
    action: enabled ? "allow" as const : "deny" as const,
  })));
  const combined = [...input.agentPermission, ...requestRules];
  // OpenCode appends session permission updates. Only the rules at and after
  // the final wildcard can affect the resulting policy: that wildcard resets
  // every earlier tool decision, while following exact rules selectively
  // re-enable or restrict capabilities. Sending the irrelevant prefix would
  // grow long-lived sessions every time their routed capability family changes.
  let finalResetIndex = -1;
  for (let index = combined.length - 1; index >= 0; index -= 1) {
    if (combined[index]?.permission === "*") {
      finalResetIndex = index;
      break;
    }
  }
  return finalResetIndex > 0 ? combined.slice(finalResetIndex) : combined;
}

/**
 * Client prompt hints may narrow the selected agent, never broaden it. Server
 * owned execution-mode profiles are handled separately because Plan mode may
 * intentionally re-enable a small, reviewed read-only subset after `*` deny.
 */
export function restrictMatterhornClientToolHints(
  tools: Record<string, boolean> | undefined,
): Record<string, boolean> | undefined {
  if (!tools) return undefined;
  const restrictions = Object.fromEntries(
    Object.entries(tools).filter(([, enabled]) => !enabled),
  );
  return Object.keys(restrictions).length > 0 ? restrictions : undefined;
}

function permissionRulesEqual(a: MatterhornPermissionRule, b: MatterhornPermissionRule): boolean {
  return a.permission === b.permission && a.pattern === b.pattern && a.action === b.action;
}

/**
 * OpenCode's session update endpoint appends permissions rather than replacing
 * them. Avoid unbounded growth by writing a profile only when it is not
 * already the active suffix (OpenCode resolves the last matching rule).
 */
export function matterhornPermissionProfileIsActive(
  current: MatterhornPermissionRule[],
  profile: MatterhornPermissionRule[],
): boolean {
  if (profile.length === 0 || current.length < profile.length) return false;
  const offset = current.length - profile.length;
  return profile.every((rule, index) => permissionRulesEqual(current[offset + index]!, rule));
}
