/** @jsxImportSource react */
import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountSecuritySection } from "../../src/react-app/domains/settings/cloud/account-security-section";
import { createDenClient } from "../../src/app/lib/den";
import { accountClientState } from "../../src/app/lib/account-client-state";
import { PublicWebSigninPage } from "../../src/react-app/domains/cloud/public-web-signin-page";
import "../../src/app/index.css";
import "../../src/react-app/domains/cloud/public-web-signin.css";

document.documentElement.dataset.matterhornUi = "retro";
const theme = new URLSearchParams(location.search).get("theme") === "light" ? "light" : "dark";
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle("dark", theme === "dark");
const queries = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const authConfig = { baseUrl: location.origin, apiBaseUrl: `${location.origin}/api/den`, requireSignin: true };
const onSignedIn = () => {};

function Fixture() {
  const [account, setAccount] = React.useState("a");
  const [mounted, setMounted] = React.useState(true);
  const [scenario, setScenario] = React.useState("checking");
  const [downloads, setDownloads] = React.useState(0);
  const ended = sessionStorage.getItem("fixture-security-callback");
  const client = React.useMemo(() => createDenClient({ baseUrl: `${location.origin}/${account}` }), [account]);
  React.useEffect(() => {
    void fetch("/__qa/state").then(response => response.json()).then((value: unknown) => {
      if (value && typeof value === "object" && "scenario" in value && typeof value.scenario === "string") setScenario(value.scenario);
    });
    const observe = (event: MouseEvent) => {
      if (event.target instanceof HTMLAnchorElement && event.target.download) setDownloads(value => value + 1);
    };
    document.addEventListener("click", observe, true);
    return () => document.removeEventListener("click", observe, true);
  }, []);
  const configure = async (value: string) => {
    await fetch(`/__qa/${value}`, { method: "POST" });
    if (value !== "release") setScenario(value);
  };
  return <div className={ended ? "" : "mx-auto max-w-3xl space-y-6 p-4"}>
    <aside aria-label="Synthetic QA controls" className="space-y-3">
      <h1>Account security fixture</h1>
      <p>No real accounts, passwords, cookies or email. All server responses are synthetic.</p>
      <p role="status">Account: {account}. Scenario: {scenario}. Download clicks: {downloads}.</p>
      <p>Last fixture callback: {ended ?? "none"}</p>
      <div className="flex flex-wrap gap-3">
        {["ready", "delayed", "malformed", "pending-deletion", "release"].map(value => <button key={value} onClick={() => void configure(value)}>Fixture {value}</button>)}
        <button onClick={() => { accountClientState.clear(); setAccount(value => value === "a" ? "b" : "a"); }}>Switch account</button>
        <button onClick={() => setMounted(value => !value)}>{mounted ? "Unmount security" : "Mount security"}</button>
        <button onClick={() => { sessionStorage.removeItem("fixture-security-callback"); location.reload(); }}>Return to fixture account</button>
      </div>
    </aside>
    {ended ? <PublicWebSigninPage config={authConfig} onSignedIn={onSignedIn} /> : mounted && <AccountSecuritySection client={client} user={{ id: account, email: `${account}@example.invalid`, name: "Synthetic account" }}
      onSessionEnded={message => { accountClientState.clear(); sessionStorage.setItem("fixture-security-callback", message ?? "No message"); }} />}
  </div>;
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<QueryClientProvider client={queries}><Fixture /></QueryClientProvider>);
