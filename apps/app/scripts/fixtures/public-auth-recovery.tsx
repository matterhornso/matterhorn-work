/** @jsxImportSource react */
import { useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { PublicWebSigninPage } from "../../src/react-app/domains/cloud/public-web-signin-page";
import "../../src/react-app/domains/cloud/public-web-signin.css";
import "../../src/styles/retro.css";

document.documentElement.dataset.matterhornUi = "retro";
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";

function Fixture() {
  const [mounted, setMounted] = useState(true);
  const [connection, setConnection] = useState("a");
  const [signIns, setSignIns] = useState(0);
  const [scenario, setScenario] = useState("error");
  const config = useMemo(() => ({ baseUrl: `${location.origin}/${connection}`, apiBaseUrl: `${location.origin}/${connection}/api/den`, requireSignin: true }), [connection]);
  const onSignedIn = useCallback(() => setSignIns(value => value + 1), []);
  const configure = async (value: string) => {
    await fetch(`/__qa/${value}`, { method: "POST" });
    setScenario(value);
  };
  return <>
    <aside aria-label="Synthetic QA controls" style={{ padding: 12 }}>
      <p>Synthetic auth responses only. No accounts, emails, credentials or providers.</p>
      <p>Scenario: {scenario}. Accepted sign-ins: {signIns}. Connection: {connection}.</p>
      <button onClick={() => void configure("ready")}>Fixture ready</button>{" "}
      <button onClick={() => void configure("error")}>Fixture config failure</button>{" "}
      <button onClick={() => void configure("pending")}>Fixture delayed config</button>{" "}
      <button onClick={() => void configure("pending-signin")}>Fixture delayed sign-in</button>{" "}
      <button onClick={() => void configure("release")}>Release old response</button>{" "}
      <button onClick={() => setConnection(value => value === "a" ? "b" : "a")}>Switch connection</button>{" "}
      <button onClick={() => setMounted(value => !value)}>{mounted ? "Unmount auth" : "Mount auth"}</button>
    </aside>
    {mounted && <PublicWebSigninPage config={config} onSignedIn={onSignedIn} />}
  </>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<Fixture />);
