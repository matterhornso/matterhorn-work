import { parseArgs } from "node:util";
import { applyLegacyMemoryCleanup, planLegacyMemoryCleanup } from "../apps/server/src/legacy-memory-cleanup.js";

const usage = `Offline legacy memory cleanup (dry run by default)

pnpm exec bun scripts/matterhorn-legacy-memory-cleanup.ts \\
  --vault-root /absolute/vault --workspace-root /absolute/workspace \\
  --workspace-id ws_example --server-data-dir /absolute/server-data

Apply the reviewed plan by adding: --apply --writers-stopped --expect <fingerprint>
Stop every process writing this vault/audit data first. This acknowledgement is not a process lock.
Only explicitly soft-deleted, workspace-tagged records are selected. Never scans other vaults.
No backups, exports or previous chats are deleted. No secrets or record content are printed.
`;

try {
  const { values } = parseArgs({ options: {
    "vault-root": { type: "string" }, "workspace-root": { type: "string" },
    "workspace-id": { type: "string" }, "server-data-dir": { type: "string" },
    apply: { type: "boolean" }, "writers-stopped": { type: "boolean" }, expect: { type: "string" },
    help: { type: "boolean" },
  }, strict: true, allowPositionals: false });
  if (values.help) {
    console.log(usage);
  } else {
    const vaultRoot = values["vault-root"];
    const workspaceRoot = values["workspace-root"];
    const workspaceId = values["workspace-id"];
    const dataDir = values["server-data-dir"];
    if (!vaultRoot || !workspaceRoot || !workspaceId || !dataDir ||
      (values.apply && (!values["writers-stopped"] || !values.expect?.match(/^[a-f0-9]{64}$/))) ||
      (!values.apply && (values.expect || values["writers-stopped"]))) {
      console.error(usage);
      process.exitCode = 2;
    } else {
      process.env.OPENWORK_DATA_DIR = dataDir;
      const options = { vaultRoot, workspaceRoot, workspaceId };
      if (values.apply && values.expect) {
        console.log(JSON.stringify({ mode: "applied", ...await applyLegacyMemoryCleanup(options, values.expect) }, null, 2));
      } else {
        console.log(JSON.stringify({ mode: "dry-run", ...await planLegacyMemoryCleanup(options) }, null, 2));
      }
    }
  }
} catch {
  // Parser/JSON/filesystem errors may embed user content or paths. Do not echo them.
  console.error("Cleanup failed. No success is claimed. Check arguments, stopped writers, ownership, paths and log integrity; rerun the dry run. An interrupted apply may have made partial progress.");
  process.exitCode = 1;
}
