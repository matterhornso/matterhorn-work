/** @jsxImportSource react */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { MatterhornServerError, type MatterhornServerClient, type StmSettings, type StmKey, type StmStatus } from "@/app/lib/matterhorn-server";
import { LayoutSection, LayoutSectionHeader, LayoutSectionTitle, LayoutStack } from "../settings-layout";
import { SettingsNotice } from "../settings-section";
import type { EnvironmentViewProps } from "./environment-view";

export function stmStatusLabel(status: StmStatus): string {
  if (status.state === "connected") return `Connected · ${status.backend}`;
  if (status.state === "not_connected") return "Not connected";
  if (status.code === "reconnect_required") return "Reconnect required";
  if (status.code === "keystore_locked") return "Locked — unlock subscribetome, then reconnect";
  if (["unsupported_environment", "unsupported_keystore", "incompatible_daemon"].includes(status.code ?? "")) return "Unsupported — check the supported STM version and storage backend";
  if (status.code === "disabled") return "Disabled for this runtime";
  return "Unavailable — start subscribetome locally, then reconnect";
}

const recoveryMessages: Record<string, string> = {
  credential_revision_conflict: "This secret changed elsewhere. Refresh before replacing it.",
  credential_update_uncertain: "The save may have completed. Refresh stored metadata before making another change; do not automatically retry.",
  plaintext_conflict: "This name also exists in plaintext. Use Move selected secrets, or remove an inherited shell copy and restart, before linking.",
  migration_source_changed: "The source or stored key changed during migration. Nothing else will be removed. Keep both copies and ask the local operator to reconcile the recorded migration.",
  migration_cleanup_required: "Finish the recorded migration before unlinking its binding. This prevents a return to plaintext storage.",
  environment_busy: "Another environment update is active. Wait for it to finish and refresh. After a crash, follow the operator recovery guide; do not delete an active lock.",
  registry_busy: "Another secret-storage update is active. Wait and refresh. A crash may require operator recovery.",
  migration_tool_setup_required: "Resume the reviewed tool setup before removing plaintext. No tool was started.",
  local_mcp_setup_required: "Configure an enabled project-local tool with an absolute executable and no inline environment values, then try again.",
  mcp_configuration_changed: "The tool configuration changed during approval. Review its new configuration before trying again.",
  migration_backend_changed: "The storage backend changed. Restore the reviewed backend before resuming; no plaintext was removed.",
};

// No secret values enter React Query, application stores, or persistent browser
// storage. Switching local runtime remounts this boundary and its input elements.
export function StmEnvironmentGate(props: EnvironmentViewProps & { legacy: React.ReactNode }) {
  if (!props.client || props.isRemoteWorkspace) return props.legacy;
  return <StmEnvironmentLocal key={props.runtimeKey} {...props} client={props.client} />;
}

function StmEnvironmentLocal(props: EnvironmentViewProps & { client: MatterhornServerClient; legacy: React.ReactNode }) {
  const [data, setData] = useState<StmSettings | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    void props.client.stmSettings().then(result => {
      if (!active) return;
      setLegacy(result.status.code === "disabled" && result.bindings.length === 0 && result.migrations.length === 0);
      setData(result);
    }).catch(reason => {
      if (!active) return;
      // Older servers do not implement STM. Authentication and transport errors
      // are not permission to fall back to a raw-value request.
      if (reason instanceof MatterhornServerError && reason.status === 404) setLegacy(true);
      else setError(true);
    });
    return () => { active = false; };
  }, [props.client, refresh]);
  if (legacy) return props.legacy;
  if (error) return <SettingsNotice tone="error">Secret settings could not be loaded. Check the local runtime connection. <Button variant="outline" onClick={() => setRefresh(n => n + 1)}>Retry settings</Button></SettingsNotice>;
  if (!data) return <p role="status">Checking secret storage…</p>;
  return <StmSettingsPanel {...props} data={data} onReload={() => setRefresh(n => n + 1)} />;
}

export function StmSettingsPanel(props: EnvironmentViewProps & { client: MatterhornServerClient; data: StmSettings; onReload: () => void }) {
  const { data, client } = props;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [consent, setConsent] = useState(false);
  const [migrationConsent, setMigrationConsent] = useState(false);
  const [consumer, setConsumer] = useState("voice");
  const [migrationConsumer, setMigrationConsumer] = useState("voice");
  const [migrationTool, setMigrationTool] = useState("");
  const [mode, setMode] = useState<"add" | "link" | "replace" | null>(null);
  const [key, setKey] = useState<StmKey | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [unlink, setUnlink] = useState<string | null>(null);
  const [finish, setFinish] = useState<string | null>(null);
  const [restart, setRestart] = useState(false);
  const secret = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (secret.current) secret.current.value = ""; }; }, []);
  const connected = data.status.state === "connected";
  const clearForm = () => { if (secret.current) secret.current.value = ""; setMode(null); setKey(null); setConsent(false); };
  const perform = async (operation: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const result = await operation();
      if (mounted.current) { setNotice(typeof result === "string" ? result : message); clearForm(); setFinish(null); setUnlink(null); props.onReload(); }
    } catch (reason) {
      // Never display an arbitrary daemon/provider error or reflected payload.
      if (mounted.current) setNotice((reason instanceof MatterhornServerError && recoveryMessages[reason.code]) || "The action could not be confirmed. Refresh settings before retrying. Existing secrets were not automatically restored or exported.");
    } finally {
      if (secret.current) secret.current.value = "";
      if (mounted.current) { setBusy(false); setConsent(false); }
    }
  };
  const eligible = data.legacy.filter(entry => (migrationConsumer === "mcp" ? entry.migrationEligible : ["OPENAI_REALTIME_API_KEY", "OPENAI_API_KEY"].includes(entry.key) && data.consumers.includes("voice:realtime"))
    && !data.bindings.some(b => b.envName === entry.key)
    && !data.migrations.some(m => m.state !== "complete" && m.entries.some(e => e.binding.envName === entry.key)));
  return <LayoutStack><LayoutSection>
    <LayoutSectionHeader><LayoutSectionTitle>Secret storage — subscribetome</LayoutSectionTitle></LayoutSectionHeader>
    <p role="status">{busy ? "Working…" : stmStatusLabel(data.status)}</p>
    <p className="text-sm text-muted-foreground max-w-prose">Keys stay in local storage until an approved consumer needs them. That consumer receives the selected key and can read it. This is not protection from a trusted tool itself.</p>
    {notice ? <p role="status" className="text-sm break-words">{notice}</p> : null}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => { clearForm(); setMigrationConsent(false); props.onReload(); }}>Refresh settings</Button>
      {connected ? <>
        <Button disabled={busy} onClick={() => { clearForm(); setMode("link"); }}>Link existing secret</Button>
        <Button variant="outline" disabled={busy} onClick={() => { clearForm(); setMode("add"); }}>Add secret</Button>
        <Button variant="outline" disabled={busy} onClick={() => void perform(() => client.stmRefresh(), "Secret metadata refreshed. Running tools keep their existing keys until stopped.")}>Check linked secrets</Button>
      </> : null}
    </div>
    {!connected ? <div className="space-y-3">
      <p className="text-sm">Start the supported subscribetome daemon on this Mac. Pairing uses its private local descriptor; do not paste its token into chat. Hosted and remote workspaces are not supported.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={busy} />Allow this local Matterhorn runtime to connect to subscribetome.</label>
      <Button disabled={busy || !consent || data.status.code === "disabled"} onClick={() => void perform(() => client.stmConnect(), "Connected. Choose a secret and consumer next.")}>{busy ? "Connecting…" : data.status.state === "not_connected" ? "Connect" : "Reconnect"}</Button>
    </div> : null}
    {mode ? <form className="space-y-4 max-w-xl" onChange={event => {
      if (event.target instanceof HTMLInputElement && event.target.type === "checkbox") return;
      setConsent(false);
    }} onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const text = (name: string) => String(form.get(name) ?? "");
      if (!consent) return;
      if (mode === "link") {
        const chosen = data.inventory.find(k => `${k.tool}/${k.label}` === text("existing"));
        if (!chosen) return;
        if (consumer === "mcp") {
          if (!props.workspaceId) return;
          void perform(() => client.stmLinkMcp(props.workspaceId!, text("mcpName"), [{ tool: chosen.tool, label: chosen.label, envName: text("envName") }]), "Tool binding approved. Stop active work before applying the runtime change.");
        } else void perform(() => client.stmLink({ tool: chosen.tool, label: chosen.label, envName: text("envName"), consumer: "voice:realtime", consent: true }), "Secret linked. Start a new voice session to use it.");
      } else {
        const value = secret.current?.value ?? "";
        if (secret.current) secret.current.value = "";
        void perform(async () => {
          const result = await client.stmSave({ tool: key?.tool ?? text("tool"), label: key?.label ?? text("label"), expectedRevision: key?.revision ?? null, value, consent: true });
          if (result.oldValueCleanupPending) return "The new key was saved, but STM has not confirmed cleanup of the old value. Inspect STM before replacing it again; running tools may still hold the old key.";
        }, "Secret saved. Existing tool processes keep their old key until they stop.");
      }
    }}>
      <h3 className="font-medium">{mode === "link" ? "Choose secret access" : mode === "replace" ? `Replace ${key?.tool}/${key?.label}` : "Add to subscribetome"}</h3>
      {mode === "link" ? <>
        <Field><FieldLabel htmlFor="stm-existing">Secret</FieldLabel><select id="stm-existing" name="existing" required className="w-full min-w-0 border rounded-md p-2 bg-background" disabled={busy}>{data.inventory.filter(k => k.status === "active").map(k => <option key={`${k.tool}/${k.label}`} value={`${k.tool}/${k.label}`}>{k.tool}/{k.label}</option>)}</select></Field>
        <Field><FieldLabel htmlFor="stm-consumer">Allow access for</FieldLabel><select id="stm-consumer" value={consumer} onChange={e => { setConsumer(e.target.value); setConsent(false); }} disabled={busy} className="w-full min-w-0 border rounded-md p-2 bg-background"><option value="voice">Realtime voice</option><option value="mcp" disabled={!props.workspaceId}>A local tool in this workspace</option></select></Field>
        {consumer === "voice" ? <Field><FieldLabel htmlFor="stm-env">Voice key</FieldLabel><select id="stm-env" name="envName" className="w-full min-w-0 border rounded-md p-2 bg-background" disabled={busy}><option>OPENAI_REALTIME_API_KEY</option><option>OPENAI_API_KEY</option></select></Field> : <>
          <Field><FieldLabel htmlFor="stm-mcp">Configured local tool name</FieldLabel><Input id="stm-mcp" name="mcpName" required disabled={busy} pattern="[a-z0-9][a-z0-9_-]*" /></Field>
          <Field><FieldLabel htmlFor="stm-env">Exact environment variable name</FieldLabel><Input id="stm-env" name="envName" required disabled={busy} pattern="[A-Za-z_][A-Za-z0-9_]*" /></Field>
          <p className="text-sm text-muted-foreground">Use an existing project-local tool with an absolute executable path and no inline environment values. Approval binds its current command to this secret. Model tool-call permissions still apply. No tool starts now.</p>
        </>}
      </> : <>
        {mode === "add" ? <><Field><FieldLabel htmlFor="stm-tool">Tool identifier</FieldLabel><Input id="stm-tool" name="tool" pattern="[a-z0-9][a-z0-9_-]*" maxLength={128} required disabled={busy} /></Field><Field><FieldLabel htmlFor="stm-label">Secret label</FieldLabel><Input id="stm-label" name="label" pattern="[a-z0-9][a-z0-9_-]*" maxLength={128} required disabled={busy} /></Field></> : null}
        <Field><FieldLabel htmlFor="stm-secret">New API secret</FieldLabel><Input id="stm-secret" ref={secret} name="secret" type="password" autoComplete="off" spellCheck={false} required maxLength={16384} disabled={busy} /></Field>
      </>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />{mode === "link" ? "Allow only this selected consumer to receive the selected secret." : `Save this selected API secret in ${data.status.backend}. Do not enter wallet keys or seed phrases.`}</label>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || !consent || (mode === "link" && consumer === "voice" && !data.consumers.includes("voice:realtime"))}>{mode === "link" ? "Link secret" : "Save secret"}</Button><Button type="button" variant="outline" disabled={busy} onClick={clearForm}>Cancel</Button></div>
    </form> : null}
    <h3 className="font-medium">Linked secrets</h3>
    {data.bindings.length === 0 ? <p className="text-sm text-muted-foreground">No secrets linked.</p> : <ul className="divide-y">{data.bindings.map(binding => <li key={binding.id} className="py-3 space-y-2 min-w-0">
      <p className="break-all font-medium">{binding.envName}</p><p className="text-sm break-all">{binding.tool}/{binding.label} · {binding.consumer} · {binding.storageBackend}</p>
      <p className="text-sm">{binding.restartRequired ? "Restart required — stop the approved tool before starting it again." : "Linked — availability is checked when used."}</p>
      <Button variant="outline" disabled={busy || !connected} onClick={() => setUnlink(binding.id)}>Unlink {binding.envName}</Button>
      {unlink === binding.id ? <div className="space-y-2"><p className="text-sm">Unlink only removes Matterhorn’s binding. It does not revoke the shared secret or erase keys from running tools.</p><Button variant="destructive" disabled={busy} onClick={() => void perform(() => client.stmUnlink(binding.id), "Binding removed. The shared secret was not revoked.")}>Confirm unlink</Button><Button variant="outline" disabled={busy} onClick={() => setUnlink(null)}>Cancel unlink</Button></div> : null}
    </li>)}</ul>}
    {connected && data.inventory.length ? <details><summary className="cursor-pointer font-medium">Stored secret metadata</summary><ul className="divide-y">{data.inventory.map(item => <li key={`${item.tool}/${item.label}`} className="py-3 flex flex-wrap items-center gap-3"><span className="break-all min-w-0">{item.tool}/{item.label} · {item.status}</span><Button variant="outline" disabled={busy || item.status !== "active"} onClick={() => { clearForm(); setKey(item); setMode("replace"); }}>Replace {item.label}</Button></li>)}</ul></details> : null}
    <h3 className="font-medium">Move selected secrets</h3>
    <p className="text-sm text-muted-foreground">Choose local API credentials and one consumer. Provider auth databases and wallet secrets are never imported. Tool configuration must contain no inline environment values.</p>
    <Field><FieldLabel htmlFor="stm-migration-consumer">Migration consumer</FieldLabel><select id="stm-migration-consumer" className="w-full min-w-0 border rounded-md p-2 bg-background" value={migrationConsumer} disabled={busy} onChange={e => { setMigrationConsumer(e.target.value); setSelected([]); setMigrationConsent(false); }}><option value="voice">Realtime voice</option><option value="mcp" disabled={!props.workspaceId}>A local tool in this workspace</option></select></Field>
    {migrationConsumer === "mcp" ? <Field><FieldLabel htmlFor="stm-migration-tool">Configured local tool name</FieldLabel><Input id="stm-migration-tool" value={migrationTool} onChange={e => { setMigrationTool(e.target.value); setMigrationConsent(false); }} disabled={busy} /></Field> : null}
    {eligible.map(entry => <label key={entry.key} className="flex items-start gap-2 text-sm break-all"><input type="checkbox" disabled={busy} checked={selected.includes(entry.key)} onChange={e => { setMigrationConsent(false); setSelected(current => e.target.checked ? [...current, entry.key] : current.filter(k => k !== entry.key)); }} />{entry.key}</label>)}
    {eligible.length ? <>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy} checked={migrationConsent} onChange={e => setMigrationConsent(e.target.checked)} />Copy selected keys to {data.status.backend} for {migrationConsumer === "voice" ? "realtime voice" : `the configured tool ${migrationTool || "selected above"}`}. Remove plaintext only after verification and a separate confirmation.</label>
      <Button disabled={busy || !connected || !migrationConsent || !selected.length || (migrationConsumer === "mcp" && !migrationTool.trim())} onClick={() => {
        setMigrationConsent(false);
        const id = crypto.randomUUID(), backend = data.status.backend ?? "";
        void perform(() => migrationConsumer === "mcp" && props.workspaceId
          ? client.stmMigrateMcp(props.workspaceId, migrationTool, { id, backend, envNames: selected, consent: true })
          : client.stmMigrate({ id, backend, selections: selected.map(envName => ({ envName, consumer: "voice:realtime" })), consent: true }), "Verified bindings saved. Confirm plaintext removal to finish migration.");
      }}>Move selected secrets</Button>
    </> : <p className="text-sm text-muted-foreground">No eligible plaintext keys for this consumer.</p>}
    {data.migrations.filter(m => m.state !== "complete").map(migration => <div key={migration.id} className="space-y-3 border-t pt-3">
      <p className="text-sm break-all">{migration.entries.map(e => e.binding.envName).join(", ")} · {migration.state === "prepared" ? "Interrupted — verify and resume" : "Verified — plaintext removal pending"}</p>
      {migration.mcpTarget ? <Button disabled={busy || !connected || !props.workspaceId} onClick={() => {
        const workspaceId = props.workspaceId, target = migration.mcpTarget;
        if (!workspaceId || !target) return;
        void perform(() => client.stmMigrateMcp(workspaceId, target.name, { id: migration.id, backend: migration.backend, envNames: migration.entries.map(e => e.binding.envName), consent: true }), "Tool configuration verified. Confirm removal next.");
      }}>Resume reviewed setup for {migration.mcpTarget.name}</Button> : migration.state === "prepared" ? <Button disabled={busy || !connected} onClick={() => void perform(() => client.stmMigrate({ id: migration.id, backend: migration.backend, selections: migration.entries.map(e => ({ envName: e.binding.envName, consumer: e.binding.consumer })), consent: true }), "Migration verified. Confirm removal next.")}>Resume verification</Button> : null}
      {migration.state === "published" ? <Button variant="outline" disabled={busy || !connected} onClick={() => setFinish(migration.id)}>Review plaintext removal</Button> : null}
      {finish === migration.id ? <><p className="text-sm">Remove only these verified plaintext entries? Backups and filesystem snapshots may retain old values. Secure deletion on SSDs cannot be promised; rotate keys with the provider afterward.</p><Button variant="destructive" disabled={busy} onClick={() => void perform(() => client.stmFinishMigration(migration.id), "Plaintext entries removed. Restart the local runtime after active work finishes; running processes may still hold old values.")}>Confirm removal</Button><Button variant="outline" disabled={busy} onClick={() => setFinish(null)}>Cancel removal</Button></> : null}
    </div>)}
    <details><summary className="cursor-pointer font-medium">Apply runtime changes</summary><p className="text-sm py-3">Wait for active tasks and tools to stop. Restart cannot remove secrets already copied by a tool. Unset inherited shell copies before restarting if a plaintext conflict is reported.</p>
      {props.onApplyChanges ? <><Button disabled={busy || props.applyBlocked} onClick={() => setRestart(true)}>Review runtime restart</Button>{props.applyBlocked ? <p className="text-sm">{props.applyBlockedReason ?? "Finish active work before restarting."}</p> : null}{restart ? <><p className="text-sm">Restart the local runtime now? No task will be restarted automatically by these settings.</p><Button disabled={busy || props.applyBlocked} onClick={() => void perform(async () => { await props.onApplyChanges?.(); setRestart(false); }, "Runtime restart requested. Recheck linked-secret metadata.")}>Confirm restart</Button><Button variant="outline" onClick={() => setRestart(false)}>Cancel restart</Button></> : null}</> : <p className="text-sm">Quit and restart the local Matterhorn runtime after active work finishes.</p>}
    </details>
  </LayoutSection></LayoutStack>;
}
