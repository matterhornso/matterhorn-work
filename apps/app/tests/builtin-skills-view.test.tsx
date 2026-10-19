import React from "react";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { SkillCard } from "../src/app/types";
import { SkillsView, type SkillsExtensionsStore } from "../src/react-app/domains/settings/pages/skills-view";

function renderSkills(items: SkillCard[]) {
  const noop = () => undefined;
  const unavailable = async () => ({ ok: false, message: "Not connected" });
  const extensions: SkillsExtensionsStore = {
    skills: () => items, skillsStatus: () => null,
    hubSkills: () => [], hubSkillsStatus: () => null,
    cloudOrgSkills: () => [], cloudOrgSkillsStatus: () => null,
    importedCloudSkills: () => ({}), hubRepo: () => null, hubRepos: () => [],
    ensureHubSkillsFresh: noop, ensureCloudOrgSkillsFresh: noop,
    refreshSkills: noop, refreshHubSkills: noop, refreshCloudOrgSkills: noop,
    setHubRepo: noop, addHubRepo: noop, removeHubRepo: noop,
    installSkillCreator: unavailable, installCloudOrgSkill: unavailable, installHubSkill: unavailable,
    importLocalSkill: noop, revealSkillsFolder: noop, readSkill: async () => null,
    saveSkill: noop, uninstallSkill: noop,
  };
  return renderToStaticMarkup(<SkillsView workspaceName="QA workspace" busy={false}
    canInstallSkillCreator={false} canUseDesktopTools={true} extensions={extensions}
    onOpenLink={noop} createSessionAndOpen={noop} />);
}

describe("built-in skill visibility", () => {
  const builtin: SkillCard = {
    name: "matterhorn-sui-research", description: "Supported Sui research",
    path: "matterhorn-builtin://skills/matterhorn-sui-research/SKILL.md",
    builtin: true, userInvocable: false,
  };

  test("built-ins are readable without presenting edit, removal or publication actions", () => {
    const html = renderSkills([builtin]);
    expect(html).toContain("matterhorn-sui-research");
    expect(html).toContain("Built-in");
    expect(html).toContain('title="View guidance"');
    expect(html).not.toContain('title="Edit"');
    expect(html).not.toContain('title="Uninstall"');
    expect(html).not.toContain('class="lucide lucide-users');
  });

  test("custom skills with a matching name retain their existing editing controls", () => {
    const { builtin: _builtin, ...custom } = builtin;
    const html = renderSkills([{ ...custom, userInvocable: true, path: "/qa/.opencode/skills/matterhorn-sui-research/SKILL.md" }]);
    expect(html).toContain('title="Edit"');
    expect(html).toContain('title="Uninstall"');
    expect(html).not.toContain('title="View guidance"');
  });

  test("read-only metadata survives client mapping and guards editor mutations", () => {
    const source = readFileSync(resolve(import.meta.dir, "../src/react-app/domains/settings/pages/skills-view.tsx"), "utf8");
    const store = readFileSync(resolve(import.meta.dir, "../src/react-app/domains/settings/state/extensions-store.ts"), "utf8");
    expect(store).toContain("builtin: entry.builtin");
    expect(store).toContain("userInvocable: entry.userInvocable");
    expect(source).toContain("readOnly={selectedSkill?.builtin === true}");
    expect(source).toContain("if (!selectedSkill || selectedSkill.builtin || !selectedDirty) return;");
    expect(source).toContain("if (!target || target.builtin) return;");
  });
});
