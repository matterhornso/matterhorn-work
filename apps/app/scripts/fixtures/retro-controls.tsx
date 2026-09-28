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
import { createMatterhornServerClient } from "../../src/app/lib/matterhorn-server";
import type { MatterhornBackendModelCatalogSnapshot, MatterhornBackendModelSelectionRecord, MatterhornProviderPrivacyPolicy } from "@matterhorn-work/types/backend-models";
import "../../src/app/index.css";

const params = new URLSearchParams(location.search);
applyRetroUi(document.documentElement, params.get("retro") !== "0");
document.documentElement.dataset.theme = params.get("theme") === "dark" ? "dark" : "light";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const client = createMatterhornServerClient({ baseUrl: location.origin });
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
createRoot(root).render(<QueryClientProvider client={queryClient}>{params.has("models") ? <ModelsFixture /> : <Fixture />}</QueryClientProvider>);
