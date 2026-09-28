/** @jsxImportSource react */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "../../src/components/ui/button";
import { Input } from "../../src/components/ui/input";
import { Textarea } from "../../src/components/ui/textarea";
import { Checkbox } from "../../src/components/ui/checkbox";
import { Switch } from "../../src/components/ui/switch";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "../../src/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../src/components/ui/tabs";
import { applyRetroUi } from "../../src/app/lib/retro-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MinimalModels } from "../../src/react-app/domains/settings/pages/minimal-models";
import { PrivateModePrivacyNotice } from "../../src/react-app/domains/session/surface/private-mode-privacy-notice";
import { MemoryRouter } from "react-router";
import { PublicTrustRoute } from "../../src/react-app/domains/public/public-trust-route";
import { NotesPage } from "../../src/react-app/domains/notes/notes-page";
import { MemoryPanel } from "../../src/react-app/domains/memory/memory-panel";
import { TransactionBatch } from "../../src/react-app/domains/wallet/components/TransactionBatch";
import { HostedMcpSummary } from "../../src/react-app/domains/settings/pages/hosted-mcp-summary";
import { PublicWebSigninPage } from "../../src/react-app/domains/cloud/public-web-signin-page";
import { AppearanceView } from "../../src/react-app/domains/settings/pages/appearance-view";
import { PrivacySettingsView } from "../../src/react-app/domains/settings/pages/privacy-view";
import { setThemeMode } from "../../src/app/theme";
import type { Language } from "../../src/i18n";
import "../../src/react-app/domains/cloud/public-web-signin.css";
import { StatusToastsProvider, StatusToastsViewport } from "../../src/react-app/domains/shell-feedback/status-toasts";
import { createMatterhornServerClient } from "../../src/app/lib/matterhorn-server";
import type { MatterhornBackendModelCatalogSnapshot, MatterhornBackendModelSelectionRecord, MatterhornProviderPrivacyPolicy } from "@matterhorn-work/types/backend-models";
import "../../src/app/index.css";

const params = new URLSearchParams(location.search);
applyRetroUi(document.documentElement, params.get("retro") !== "0");
document.documentElement.dataset.theme = params.get("theme") === "dark" ? "dark" : "light";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const client = createMatterhornServerClient({ baseUrl: location.origin });
const authConfig = { baseUrl: location.origin, apiBaseUrl: `${location.origin}/fixture-auth`, requireSignin: true };
const onFixtureSignedIn = () => { throw new Error("This fixture must never authenticate"); };
const catalog: MatterhornBackendModelCatalogSnapshot = {
  status: "ready", label: "Synthetic catalog", source: "matterhorn_backend_registry",
  serverFetched: true, providerCount: 3, connectedProviderCount: 2, modelCount: 4,
  connectedProviderIds: ["cudos", "venice"], defaultModels: {},
  providers: [
    { id: "cudos", name: "ASI:Cloud", connected: true, modelCount: 2, modelIds: ["asi1-mini", "text-embedding-3"], sampleModels: [] },
    { id: "venice", name: "Venice", connected: true, modelCount: 1, modelIds: ["fixture-chat"], sampleModels: [] },
    { id: "unconnected", name: "Disconnected fixture", connected: false, modelCount: 1, modelIds: ["unconnected-chat"], sampleModels: [] },
  ],
};
const policy: MatterhornProviderPrivacyPolicy = {
  providerId: "cudos", providerName: "ASI:Cloud", status: "unverified", trainingUse: "unknown",
  retentionDays: null, policyUrl: null, verifiedAt: null, allowed: false,
  label: "Unverified fixture", description: "Synthetic policy: training and retention terms are not verified.",
};
function ModelsFixture() {
  const [selection, setSelection] = useState<MatterhornBackendModelSelectionRecord | null>(null);
  const [navigation, setNavigation] = useState("");
  const [action, setAction] = useState("");
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <p>Isolated model fixture. No real providers or model requests.</p>
    <MinimalModels client={client} workspaceId="fixture" catalog={params.has("empty") ? undefined : catalog}
      selection={selection} loading={params.has("loading")} failed={params.has("failed")}
      managed={!params.has("local")} policies={[policy]}
      onConnect={() => setAction("Connect requested")} onRefresh={() => setAction("Refresh requested")}
      onSelected={(first, model) => {
        setSelection({ ...model, source: "server_workspace_preference", savedAt: "2026-09-28T00:00:00Z" });
        setNavigation(first ? "Desk launcher requested" : "Return to conversation requested");
      }} />
    <p data-testid="model-navigation">{navigation}</p><p data-testid="model-action">{action}</p>
    <PrivateModePrivacyNotice providerPrivacyPolicy={policy} onOpenPrivacyDetails={() => setAction("Privacy details requested")} />
  </main>;
}

function WalletFixture() {
  const [attempts, setAttempts] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  return <main className="mx-auto max-w-3xl space-y-6 p-4">
    <p>Synthetic transaction review. No wallet, RPC or signing. Execution always fails locally.</p>
    <p data-testid="wallet-attempts">{attempts}</p>
    {dismissed ? <p>Review closed</p> : <TransactionBatch
      plan={{ chainId: 84532, from: "0x0000000000000000000000000000000000000001", totalEstimatedGas: "21000", totalEstimatedCostEth: "0.000021",
        steps: [{ id: "fixture-step", type: "transfer", description: "Review disposable testnet transfer", to: "0x0000000000000000000000000000000000000002", value: "1000000000000000" }] }}
      stepGuards={[{ stepId: "fixture-step", displayValue: "0.001 ETH", valueUSD: 0, chainName: "Base Sepolia", warnings: ["Synthetic estimate. No funds will move."], blockers: params.has("blocked") ? ["Fixture policy blocks this action."] : [] }]}
      onExecute={async () => { setAttempts(value => value + 1); throw new Error("User rejected the request."); }}
      onDismiss={() => setDismissed(true)} />}
  </main>;
}
function IntegrationsFixture() {
  const [action, setAction] = useState("");
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <p>Synthetic integration state. No real external keys or services.</p>
    <HostedMcpSummary connections={[{ name: "Fixture research tools", statusLabel: "Ready", ready: true }, { name: "Fixture chain service", statusLabel: "Needs setup", ready: false }]}
      onBrowseCryptoApps={() => setAction("Browse requested")} />
    <p role="status">{action}</p>
  </main>;
}
function SettingsFixture() {
  const [language, setLanguage] = useState<Language>("en");
  const [action, setAction] = useState("");
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <h1 className="text-xl font-semibold">Settings — isolated fixture</h1>
    {params.has("privacy") ? <PrivacySettingsView matterhornServerClient={client}
      runtimeWorkspaceId={params.has("disconnected") ? null : "fixture"}
      onOpenModels={() => setAction("Models requested")} onOpenMemory={() => setAction("Memory requested")}
      onOpenNotes={() => setAction("Notes requested")} onOpenOutputs={() => setAction("Outputs requested")} /> :
      <AppearanceView busy={params.has("busy")} themeMode="system" setThemeMode={setThemeMode}
        language={language} setLanguage={setLanguage} hideTitlebar={false} toggleHideTitlebar={() => undefined} />}
    <p role="status">{action}</p>
  </main>;
}
function Fixture() {
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <h1 className="text-xl font-bold">Matterhorn controls — isolated fixture</h1>
    <p>No accounts, model requests or wallet actions. Tests use production components.</p>
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => setSaved(true)}>Save note</Button>
      <Button variant="outline">Refresh</Button>
      <Button variant="secondary">Choose model</Button>
      <Button variant="destructive">Delete fixture</Button>
      <Button disabled>Unavailable</Button>
    </div>
    <p role="status">{saved ? "Fixture saved" : "Not saved"}</p>
    <label className="block space-y-2">Note title<Input placeholder="Name your note" /></label>
    <label className="block space-y-2">Draft<Textarea value={draft} onChange={event => setDraft(event.target.value)} /></label>
    <label className="block space-y-2">Invalid field<Input aria-invalid="true" aria-describedby="fixture-error" /></label>
    <p id="fixture-error">Enter a value to continue.</p>
    <label className="flex items-center gap-3"><Checkbox />Fixture consent</label>
    <label className="flex items-center gap-3"><Switch />Fixture preference</label>
    <Tabs defaultValue="saved">
      <TabsList><TabsTrigger value="saved">Saved</TabsTrigger><TabsTrigger value="review">Review</TabsTrigger></TabsList>
      <TabsContent value="saved">Saved fixture notes</TabsContent>
      <TabsContent value="review">Review fixture notes</TabsContent>
    </Tabs>
    <Dialog><DialogTrigger render={<Button variant="outline" />}>Open review</DialogTrigger>
      <DialogContent><DialogTitle>Review fixture</DialogTitle><DialogDescription>This is a synthetic dialog. It cannot execute a transaction.</DialogDescription>
        <Button onClick={() => setSaved(true)}>Confirm fixture</Button>
      </DialogContent>
    </Dialog>
  </main>;
}
const root = document.getElementById("root");
if (!root) throw new Error("Fixture root missing");
createRoot(root).render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[params.get("public") ?? "/"]}>
  <StatusToastsProvider>
    {params.has("settings") ? <SettingsFixture /> : params.has("auth") ? <PublicWebSigninPage config={authConfig} onSignedIn={onFixtureSignedIn} /> : params.has("wallet") ? <WalletFixture /> : params.has("integrations") ? <IntegrationsFixture /> : params.has("public") ? <PublicTrustRoute /> : params.has("notes") ?
      <div className="mx-auto h-dvh max-w-3xl"><NotesPage client={client} workspaceId="fixture" /></div> :
      params.has("memory") ? <div className="mx-auto h-dvh max-w-3xl"><MemoryPanel client={client} workspaceId="fixture" sessionId={null} onClose={() => undefined} /></div> :
      params.has("models") ? <ModelsFixture /> : <Fixture />}
    <StatusToastsViewport />
  </StatusToastsProvider>
</MemoryRouter></QueryClientProvider>);
