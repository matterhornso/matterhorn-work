/** @jsxImportSource react */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "../../src/components/ui/button";
import { Input } from "../../src/components/ui/input";
import { Textarea } from "../../src/components/ui/textarea";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "../../src/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../src/components/ui/tabs";
import { applyRetroUi } from "../../src/app/lib/retro-ui";
import "../../src/app/index.css";

const params = new URLSearchParams(location.search);
applyRetroUi(document.documentElement, params.get("retro") !== "0");
document.documentElement.dataset.theme = params.get("theme") === "dark" ? "dark" : "light";

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
createRoot(root).render(<Fixture />);
