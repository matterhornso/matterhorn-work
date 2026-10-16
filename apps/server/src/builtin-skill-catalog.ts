import type { SkillItem } from "./types.js";
import { MATTERHORN_PRELOADED_WORKSPACE_SKILLS } from "./builtin-workspace-skills.js";

export type MatterhornWorkspaceSkillDefinition = {
  readonly name: string;
  readonly description: string;
  readonly trigger: string;
  readonly body: string;
};

export const MATTERHORN_WORKSPACE_SKILL_VERSION = "1";
export const MATTERHORN_BUILTIN_SKILL_PREFIX = "matterhorn-builtin://skills/";

/** This virtual identifier is never resolved as a filesystem path or URL. */
function builtinSkillPath(name: string): string {
  return `${MATTERHORN_BUILTIN_SKILL_PREFIX}${name}/SKILL.md`;
}

/** Immutable release text; not a downloaded package or a native slash command. */
export function renderPreloadedWorkspaceSkill(skill: MatterhornWorkspaceSkillDefinition): string {
  if (!/^matterhorn-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name)
    || !skill.description.trim() || !skill.trigger.trim() || !skill.body.trim()) {
    throw new Error("Invalid Matterhorn workspace skill definition");
  }
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description)}`,
    `trigger: ${JSON.stringify(skill.trigger)}`,
    "user-invocable: false",
    `matterhorn-preload-version: ${JSON.stringify(MATTERHORN_WORKSPACE_SKILL_VERSION)}`,
    "---",
    "",
    skill.body.trim(),
    "",
  ].join("\n");
}

/** Display-only documents. Per-desk behavior is applied by the canonical prompt. */
export function listBuiltinWorkspaceSkills(): SkillItem[] {
  return MATTERHORN_PRELOADED_WORKSPACE_SKILLS.map((skill) => ({
    name: skill.name,
    description: skill.description,
    trigger: skill.trigger,
    path: builtinSkillPath(skill.name),
    scope: "project",
    builtin: true,
    userInvocable: false,
  }));
}

export function readBuiltinWorkspaceSkill(item: Pick<SkillItem, "name" | "path" | "builtin">): string | null {
  if (item.builtin !== true) return null;
  const skill = MATTERHORN_PRELOADED_WORKSPACE_SKILLS.find((candidate) => candidate.name === item.name);
  if (!skill || item.path !== builtinSkillPath(skill.name)) return null;
  return renderPreloadedWorkspaceSkill(skill);
}
