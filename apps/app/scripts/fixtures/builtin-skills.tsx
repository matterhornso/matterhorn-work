/** @jsxImportSource react */
// Isolated production-component fixture: no accounts, provider calls or workspace writes.
import { createRoot } from "react-dom/client";
import { SkillsView, type SkillsExtensionsStore } from "../../src/react-app/domains/settings/pages/skills-view";
import { listBuiltinWorkspaceSkills, readBuiltinWorkspaceSkill } from "../../../server/src/builtin-skill-catalog";
import "../../src/app/index.css";

document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
const items = listBuiltinWorkspaceSkills();
const noop = () => undefined;
const unavailable = async () => ({ ok: false, message: "Synthetic fixture: not connected" });
const forbid = () => { throw new Error("This fixture does not allow mutations"); };
const extensions: SkillsExtensionsStore = {
  skills: () => items, skillsStatus: () => null,
  hubSkills: () => [], hubSkillsStatus: () => null,
  cloudOrgSkills: () => [], cloudOrgSkillsStatus: () => null,
  importedCloudSkills: () => ({}), hubRepo: () => null, hubRepos: () => [],
  ensureHubSkillsFresh: noop, ensureCloudOrgSkillsFresh: noop,
  refreshSkills: noop, refreshHubSkills: noop, refreshCloudOrgSkills: noop,
  setHubRepo: noop, addHubRepo: noop, removeHubRepo: noop,
  installSkillCreator: unavailable, installCloudOrgSkill: unavailable, installHubSkill: unavailable,
  importLocalSkill: noop, revealSkillsFolder: noop,
  readSkill: async (name) => {
    const item = items.find((candidate) => candidate.name === name);
    const content = item ? readBuiltinWorkspaceSkill(item) : null;
    return content === null ? null : { content };
  },
  saveSkill: forbid, uninstallSkill: forbid,
};
createRoot(document.getElementById("root")!).render(<main className="p-4 sm:p-8">
  <p className="mb-4 text-sm text-dls-secondary">Synthetic skills QA. No accounts are connected and no workspace data is changed.</p>
  <SkillsView workspaceName="Synthetic QA workspace" busy={false} canInstallSkillCreator={false}
    canUseDesktopTools={false} extensions={extensions} onOpenLink={noop} createSessionAndOpen={noop} />
</main>);
